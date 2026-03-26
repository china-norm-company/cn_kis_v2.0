"""
双签工作人员档案与邮件身份验证

名单主要与鹿鸣·治理台（3008）账号关联（admin / crc / crc_supervisor）；
亦支持**无治理台账号**建档（account 为空，手工维护姓名/联系方式）。
"""
import html
import logging
import re
import secrets
from urllib.parse import quote
from collections import defaultdict
from datetime import datetime, time
from email.utils import formataddr, parseaddr
from typing import Optional

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.protocol.models import WitnessStaff, WitnessDualSignAuthToken, Protocol

logger = logging.getLogger(__name__)


def gender_from_chinese_id_card(id_card_no: str) -> str:
    """中国居民身份证：18 位取第 17 位（索引 16）、15 位取第 15 位（索引 14），奇数为男，偶数为女。"""
    s = (id_card_no or '').strip()
    if len(s) == 18:
        head, tail = s[:17], s[17:]
        if not head.isdigit():
            return ''
        if tail not in ('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'X', 'x'):
            return ''
        try:
            return '男' if int(s[16]) % 2 == 1 else '女'
        except (ValueError, IndexError):
            return ''
    if len(s) == 15 and s.isdigit():
        try:
            return '男' if int(s[14]) % 2 == 1 else '女'
        except (ValueError, IndexError):
            return ''
    return ''


def witness_auth_token_expires_at():
    """双签邮件授权链接过期时间：发信当日 23:59:59.999999（与 settings 时区一致的「本地日」）。"""
    now = timezone.now()
    local = timezone.localtime(now)
    end_naive = datetime.combine(local.date(), time(23, 59, 59, 999999))
    return timezone.make_aware(end_naive, timezone.get_current_timezone())


def build_witness_mail_from_address() -> str:
    """
    双签授权邮件 From 显示名固定为「知情同意」；发信地址取自 DEFAULT_FROM_EMAIL 或 EMAIL_HOST_USER。
    使用 formataddr，避免部分邮箱客户端只显示本地邮箱前缀（如 cursor-wmd）而忽略未编码的显示名。
    """
    raw = (getattr(settings, 'DEFAULT_FROM_EMAIL', None) or '').strip()
    _, addr = parseaddr(raw) if raw else ('', '')
    if not (addr or '').strip():
        addr = (getattr(settings, 'EMAIL_HOST_USER', None) or '').strip() or 'cursor-wmd@china-norm.com'
    return formataddr(('知情同意', addr.strip()))


# 可出现在双签名单中的治理台全局角色（与 seed_roles 中 name 一致）
WITNESS_STAFF_ROLE_NAMES = ('admin', 'crc', 'crc_supervisor')


def _eligible_account_ids() -> set[int]:
    from apps.identity.models import AccountRole, Role

    rids = Role.objects.filter(name__in=WITNESS_STAFF_ROLE_NAMES, is_active=True).values_list('id', flat=True)
    return set(
        AccountRole.objects.filter(project_id__isnull=True, role_id__in=rids).values_list('account_id', flat=True).distinct()
    )


def witness_staff_allowed_name_set() -> set[str]:
    """治理台「双签工作人员」档案（t_witness_staff）全部非删除姓名，供知情签署人员校验。

    与 list_witness_staff 列表一致：凡已在治理台建档的人员均可作为知情签署工作人员，
    不再仅限 admin/CRC/CRC主管 角色子集（避免大量治理台人员无法被选）。
    """
    return {
        (n or '').strip()
        for n in WitnessStaff.objects.filter(is_deleted=False).values_list('name', flat=True)
        if (n or '').strip()
    }


def _account_has_witness_eligible_role(account_id: int) -> bool:
    return account_id in _eligible_account_ids()


def is_witness_staff_row_eligible(ws: WitnessStaff) -> bool:
    """双签发信等操作前校验：须关联治理台账号且具备 admin/CRC/CRC主管 全局角色。"""
    if not ws.account_id:
        return False
    return _account_has_witness_eligible_role(ws.account_id)


def witness_staff_can_receive_auth_emails(ws: WitnessStaff) -> bool:
    """可发送档案核验邮件 / 项目双签授权邮件：治理台合规角色，或无账号但已维护姓名与工作邮箱的兼职档案。"""
    if is_witness_staff_row_eligible(ws):
        return True
    if ws.account_id:
        return False
    return bool((ws.name or '').strip() and (ws.email or '').strip())


def _normalize_cn_id_card(id_card_no: str) -> str:
    return (id_card_no or '').strip()


def _validate_cn_id_card_for_staff(id_card_no: str) -> None:
    s = _normalize_cn_id_card(id_card_no)
    if not s:
        raise ValueError('请填写身份证号')
    if len(s) == 18:
        if not re.match(r'^[1-9]\d{16}[\dXx]$', s):
            raise ValueError('身份证号格式不正确（18 位）')
        return
    if len(s) == 15 and s.isdigit():
        return
    raise ValueError('身份证号须为 18 位或 15 位合法格式')


def create_witness_staff_part_time(
    *,
    name: str,
    email: str,
    phone: Optional[str] = None,
    id_card_no: Optional[str] = None,
    gender: Optional[str] = None,
) -> WitnessStaff:
    """无治理台账号的双签档案：先录姓名与工作邮箱；手机号可在人脸核验链路中由本人填写并回写。"""
    n = (name or '').strip()
    em = (email or '').strip()
    ph = (phone or '').strip()
    cid = _normalize_cn_id_card(id_card_no or '')
    if not n:
        raise ValueError('请填写姓名')
    if not em:
        raise ValueError('请填写工作邮箱')
    if WitnessStaff.objects.filter(is_deleted=False, email__iexact=em).exists():
        raise ValueError('该工作邮箱已在双签名单中')
    if cid:
        _validate_cn_id_card_for_staff(cid)
        if WitnessStaff.objects.filter(is_deleted=False, id_card_no=cid).exists():
            raise ValueError('该身份证号已在双签名单中')
    g = (gender or '').strip()
    if not g and cid:
        g = gender_from_chinese_id_card(cid)
    return WitnessStaff.objects.create(
        account_id=None,
        name=n,
        email=em,
        phone=ph,
        id_card_no=cid,
        gender=g,
        priority=0,
    )


def _batch_role_labels(account_ids: list[int]) -> dict[int, list[str]]:
    if not account_ids:
        return {}
    from apps.identity.models import AccountRole

    d: dict[int, list[str]] = defaultdict(list)
    q = AccountRole.objects.filter(
        account_id__in=account_ids,
        project_id__isnull=True,
        role__name__in=WITNESS_STAFF_ROLE_NAMES,
    ).select_related('role')
    for ar in q:
        d[ar.account_id].append(ar.role.display_name)
    return dict(d)


def _role_labels_for_account(account_id: int) -> list[str]:
    return _batch_role_labels([account_id]).get(account_id, [])


def list_witness_staff(
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    focus_witness_staff_id: Optional[int] = None,
) -> dict:
    """列出全部非删除双签档案（与治理台维护范围一致）；知情签署等场景依赖完整名单。

    focus_witness_staff_id：深链定位某条档案所在分页时传入，与 order_by('-priority','id') 一致计算所在页。
    """
    qs = WitnessStaff.objects.filter(is_deleted=False).select_related('account')
    if search and search.strip():
        q = search.strip()
        qs = qs.filter(
            Q(name__icontains=q)
            | Q(email__icontains=q)
            | Q(phone__icontains=q)
            | Q(id_card_no__icontains=q)
            | Q(account__username__icontains=q)
            | Q(account__display_name__icontains=q)
        )
    total = qs.count()
    ordered = qs.order_by('-priority', 'id')
    effective_page = page
    if focus_witness_staff_id is not None:
        try:
            fid = int(focus_witness_staff_id)
        except (TypeError, ValueError):
            fid = 0
        if fid > 0:
            # 不可在已 select_related('account') 的 qs 上再 only()，否则会触发
            # FieldError: account cannot be both deferred and traversed using select_related
            ws = WitnessStaff.objects.filter(id=fid, is_deleted=False).only('id', 'priority').first()
            if ws:
                before = qs.filter(
                    Q(priority__gt=ws.priority) | Q(priority=ws.priority, id__lt=ws.id)
                ).count()
                effective_page = before // page_size + 1
    max_page = max(1, (total + page_size - 1) // page_size) if total else 1
    if effective_page < 1:
        effective_page = 1
    if effective_page > max_page:
        effective_page = max_page
    offset = (effective_page - 1) * page_size
    items = list(ordered[offset : offset + page_size])
    acc_ids = [w.account_id for w in items if w.account_id]
    label_map = _batch_role_labels(acc_ids)
    return {
        'items': [witness_staff_to_dict(w, role_labels=label_map.get(w.account_id)) for w in items],
        'total': total,
        'page': effective_page,
        'page_size': page_size,
    }


def witness_staff_to_dict(ws: WitnessStaff, role_labels: Optional[list[str]] = None) -> dict:
    if role_labels is None:
        role_labels = _role_labels_for_account(ws.account_id) if ws.account_id else []
    stored_gender = (ws.gender or '').strip()
    display_gender = stored_gender or gender_from_chinese_id_card(ws.id_card_no or '')
    out = {
        'id': ws.id,
        'account_id': ws.account_id,
        'name': ws.name,
        'gender': display_gender,
        'id_card_no': ws.id_card_no or '',
        'phone': ws.phone or '',
        'email': ws.email or '',
        'priority': ws.priority,
        'role_labels': role_labels,
        'face_order_id': ws.face_order_id or '',
        'face_verified_at': ws.face_verified_at.isoformat() if ws.face_verified_at else None,
        'signature_file': ws.signature_file or '',
        'signature_at': ws.signature_at.isoformat() if ws.signature_at else None,
        'identity_verified': bool(ws.identity_verified),
        'update_time': ws.update_time.isoformat() if ws.update_time else None,
        'create_time': ws.create_time.isoformat() if ws.create_time else None,
    }
    return out


def sync_witness_staff_from_accounts() -> dict:
    """为具备可见证角色的治理台账号 upsert 双签档案（姓名、邮箱与治理台账号一致；手机号不在治理台维护，不同步）。"""
    from apps.identity.models import Account

    eligible = _eligible_account_ids()
    synced = 0
    skipped_no_email = 0
    for aid in sorted(eligible):
        acc = Account.objects.filter(id=aid, is_deleted=False).first()
        if not acc:
            continue
        email = (acc.email or '').strip()
        if not email:
            skipped_no_email += 1
            logger.warning('witness_staff sync skip account_id=%s: empty email', aid)
            continue
        ws = WitnessStaff.objects.filter(account_id=aid).first()
        if ws:
            if ws.is_deleted:
                ws.is_deleted = False
            ws.name = (acc.display_name or acc.username or '').strip() or ws.name
            ws.email = email
            ws.save()
        else:
            WitnessStaff.objects.create(
                account_id=aid,
                name=(acc.display_name or acc.username or '').strip() or acc.username,
                email=email,
                gender='',
                id_card_no='',
                phone='',
                priority=0,
            )
        synced += 1
    return {'synced': synced, 'skipped_no_email': skipped_no_email}


def create_witness_staff_from_account(account_id: int) -> WitnessStaff:
    from apps.identity.models import Account

    acc = Account.objects.filter(id=account_id, is_deleted=False).first()
    if not acc:
        raise ValueError('账号不存在')
    if not _account_has_witness_eligible_role(account_id):
        raise ValueError('该账号不具备管理员 / CRC / CRC主管 全局角色，无法加入双签名单')
    email = (acc.email or '').strip()
    if not email:
        raise ValueError('请先在鹿鸣·治理台为该账号填写工作邮箱')
    existing = WitnessStaff.objects.filter(account_id=account_id).first()
    if existing:
        if existing.is_deleted:
            existing.is_deleted = False
            existing.name = (acc.display_name or acc.username or '').strip() or existing.name
            existing.email = email
            existing.save()
            return existing
        raise ValueError('该账号已在双签名单中')
    return WitnessStaff.objects.create(
        account_id=account_id,
        name=(acc.display_name or acc.username or '').strip() or acc.username,
        email=email,
        gender='',
        id_card_no='',
        phone='',
        priority=0,
    )


def update_witness_staff(
    pk: int,
    *,
    name: Optional[str] = None,
    email: Optional[str] = None,
    gender: Optional[str] = None,
    id_card_no: Optional[str] = None,
    phone: Optional[str] = None,
    priority: Optional[int] = None,
) -> Optional[WitnessStaff]:
    ws = WitnessStaff.objects.filter(id=pk, is_deleted=False).first()
    if not ws:
        return None
    if ws.account_id:
        from apps.identity.models import Account

        acc = Account.objects.filter(id=ws.account_id, is_deleted=False).first()
        if acc:
            ws.name = (acc.display_name or acc.username or '').strip() or ws.name
            ws.email = (acc.email or '').strip() or ws.email
    else:
        if name is not None:
            ws.name = name.strip()
        if email is not None:
            ws.email = email.strip()
        if phone is not None:
            ws.phone = (phone or '').strip()
    if gender is not None:
        ws.gender = (gender or '').strip()
    if id_card_no is not None:
        ws.id_card_no = (id_card_no or '').strip()
    if priority is not None:
        ws.priority = int(priority or 0)
    ws.save()
    return ws


def soft_delete_witness_staff(pk: int) -> bool:
    n = WitnessStaff.objects.filter(id=pk, is_deleted=False).update(is_deleted=True)
    return n > 0


def list_eligible_accounts_for_picker(
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    only_without_profile: bool = False,
) -> dict:
    """供执行台选择尚未建档的治理台账号。"""
    from apps.identity.models import Account

    eligible = _eligible_account_ids()
    qs = Account.objects.filter(is_deleted=False, id__in=eligible).exclude(email__exact='')
    if only_without_profile:
        linked = WitnessStaff.objects.filter(is_deleted=False).exclude(account_id__isnull=True).values_list(
            'account_id', flat=True
        )
        qs = qs.exclude(id__in=linked)
    if search and search.strip():
        q = search.strip()
        qs = qs.filter(
            Q(username__icontains=q)
            | Q(display_name__icontains=q)
            | Q(email__icontains=q)
            | Q(phone__icontains=q)
        )
    total = qs.count()
    offset = (page - 1) * page_size
    rows = list(qs.order_by('id')[offset : offset + page_size])
    ids = [a.id for a in rows]
    label_map = _batch_role_labels(ids)
    items = []
    for a in rows:
        items.append(
            {
                'id': a.id,
                'username': a.username,
                'display_name': a.display_name or '',
                'email': a.email or '',
                'phone': a.phone or '',
                'role_labels': label_map.get(a.id, []),
            }
        )
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def _public_execution_base_url() -> str:
    raw = getattr(settings, 'EXECUTION_PUBLIC_BASE_URL', None) or getattr(settings, 'FRONTEND_EXECUTION_URL', None)
    if raw:
        return raw.rstrip('/')
    return 'http://127.0.0.1:3007'


def send_witness_authorization_email(
    *,
    protocol: Protocol,
    witness: WitnessStaff,
    icf_version_id: int,
    notify_email: str,
) -> WitnessDualSignAuthToken:
    token_plain = secrets.token_urlsafe(32)
    exp = witness_auth_token_expires_at()
    row = WitnessDualSignAuthToken.objects.create(
        token=token_plain,
        witness_staff=witness,
        protocol_id=protocol.id,
        icf_version_id=icf_version_id,
        notify_email=notify_email.strip(),
        expires_at=exp,
    )
    base = _public_execution_base_url()
    link = f'{base}/#/witness-verify?token={token_plain}'
    code = (getattr(protocol, 'code', None) or '').strip()
    title = (protocol.title or '').strip()
    # 主题含项目编号、避免过于笼统（笼统主题更易进垃圾箱）；总长度限制在常见上限内
    subj_core = f'知情双签·{code or "项目"}·授权验证'
    if title:
        short_title = title if len(title) <= 24 else title[:21] + '…'
        subj_core = f'知情双签·{code or "项目"}·{short_title}'
    subject = f'【KIS】{subj_core}（当日有效，请于 23:59 前完成验证）'
    if len(subject) > 200:
        subject = subject[:197] + '…'
    ts = timezone.localtime().strftime('%Y-%m-%d %H:%M:%S')
    body_text = (
        f'您好，\n\n'
        f'有知情同意流程需要您作为见证工作人员完成身份授权（双签）。\n\n'
        f'项目编号：{code or "-"}\n'
        f'项目名称：{title or "-"}\n'
        f'申请时间：{ts}\n\n'
        f'请于当日 23:59 前访问以下链接完成验证：\n{link}\n\n'
        f'本邮件由临床研究系统（KIS）根据业务规则自动发送。\n'
        f'若您未参与相关项目，请忽略本邮件或联系项目管理员。\n'
    )
    from_email = build_witness_mail_from_address()
    safe_link = html.escape(link)
    html_body = f"""<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;">
<p>您好，</p>
<p>有知情同意流程需要您作为<strong>见证工作人员</strong>完成身份授权（双签）。</p>
<ul style="margin:8px 0;padding-left:20px;">
  <li><strong>项目编号</strong>：{html.escape(code or '-')}</li>
  <li><strong>项目名称</strong>：{html.escape(title or '-')}</li>
  <li><strong>申请时间</strong>：{html.escape(ts)}</li>
</ul>
<p>请于<strong>当日 23:59 前</strong>点击下方链接完成验证：</p>
<p><a href="{safe_link}" style="color:#2563eb;">打开授权验证链接</a></p>
<p style="color:#64748b;font-size:12px;margin-top:16px;">本邮件由临床研究系统（KIS）自动发送。若您未参与相关项目，请忽略或联系项目管理员。</p>
</body></html>
"""
    # 事务性邮件：RFC 3834 建议头，便于收件方归类为系统自动通知（降低误判营销/钓鱼的概率）；
    # 彻底避免进垃圾箱仍依赖发信域名的 SPF/DKIM/DMARC（需在飞书/企业邮箱管理后台配置）。
    mail_headers = {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
    }
    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=body_text,
            from_email=from_email,
            to=[notify_email.strip()],
            headers=mail_headers,
        )
        msg.attach_alternative(html_body, 'text/html')
        sent = msg.send(fail_silently=False)
    except Exception as e:
        logger.exception('send_witness_authorization_email failed: %s', e)
        raise ValueError(f'邮件发送失败：{e}') from e
    if not sent:
        logger.error(
            'send_witness_authorization_email: SMTP returned 0 sent, protocol_id=%s witness_id=%s',
            protocol.id,
            witness.id,
        )
        raise ValueError('邮件服务未确认投递，请稍后重试或联系管理员')
    logger.info(
        'send_witness_authorization_email: SMTP accepted, protocol_id=%s witness_id=%s notify=%s',
        protocol.id,
        witness.id,
        notify_email.strip(),
    )
    return row


def send_witness_profile_verification_email(*, witness: WitnessStaff, notify_email: str) -> WitnessDualSignAuthToken:
    """
    执行台「双签工作人员名单」操作「核验」：发邮件，链接进入人脸核验 → 手写签名登记，回写档案 signature_file / signature_at。
    不绑定具体协议（protocol_id / icf_version_id 为空）。
    """
    token_plain = secrets.token_urlsafe(32)
    exp = witness_auth_token_expires_at()
    row = WitnessDualSignAuthToken.objects.create(
        token=token_plain,
        witness_staff=witness,
        protocol_id=None,
        icf_version_id=None,
        notify_email=notify_email.strip(),
        expires_at=exp,
    )
    base = _public_execution_base_url()
    link = f'{base}/#/witness-verify?token={token_plain}'
    name = (witness.name or '').strip() or '工作人员'
    ts = timezone.localtime().strftime('%Y-%m-%d %H:%M:%S')
    subject = '【KIS】双签工作人员·身份与签名登记（当日有效，请于 23:59 前完成）'
    if len(subject) > 200:
        subject = subject[:197] + '…'
    body_text = (
        f'您好 {name}，\n\n'
        f'请完成在线人脸核验与手写签名登记，用于双签工作人员档案。\n\n'
        f'申请时间：{ts}\n\n'
        f'请于当日 23:59 前访问以下链接按页面提示操作：\n{link}\n\n'
        f'本邮件由临床研究系统（KIS）根据业务规则自动发送。\n'
        f'若您未申请此项登记，请忽略或联系管理员。\n'
    )
    from_email = build_witness_mail_from_address()
    safe_link = html.escape(link)
    html_body = f"""<!DOCTYPE html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.5;">
<p>您好 <strong>{html.escape(name)}</strong>，</p>
<p>请完成<strong>在线人脸核验</strong>与<strong>手写签名登记</strong>，用于双签工作人员档案。</p>
<ul style="margin:8px 0;padding-left:20px;">
  <li><strong>申请时间</strong>：{html.escape(ts)}</li>
</ul>
<p>请于<strong>当日 23:59 前</strong>点击下方链接，按页面顺序完成核验与签名：</p>
<p><a href="{safe_link}" style="color:#2563eb;">打开核验与签名链接</a></p>
<p style="color:#64748b;font-size:12px;margin-top:16px;">本邮件由临床研究系统（KIS）自动发送。</p>
</body></html>
"""
    mail_headers = {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
    }
    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=body_text,
            from_email=from_email,
            to=[notify_email.strip()],
            headers=mail_headers,
        )
        msg.attach_alternative(html_body, 'text/html')
        sent = msg.send(fail_silently=False)
    except Exception as e:
        logger.exception('send_witness_profile_verification_email failed: %s', e)
        row.delete()
        raise ValueError(f'邮件发送失败：{e}') from e
    if not sent:
        logger.error(
            'send_witness_profile_verification_email: SMTP returned 0 sent, witness_id=%s',
            witness.id,
        )
        row.delete()
        raise ValueError('邮件服务未确认投递，请稍后重试或联系管理员')
    logger.info(
        'send_witness_profile_verification_email: SMTP accepted, witness_id=%s notify=%s',
        witness.id,
        notify_email.strip(),
    )
    return row


def _validate_id_card_no_for_witness(val: Optional[str]) -> str:
    """中国大陆身份证 15 或 18 位，校验通过后大写末位 X。"""
    if not val or not str(val).strip():
        raise ValueError('请填写身份证号')
    v = str(val).strip().upper()
    if len(v) == 18 and re.match(r'^[0-9]{17}[0-9X]$', v):
        return v
    if len(v) == 15 and re.match(r'^[0-9]{15}$', v):
        return v
    raise ValueError('身份证号格式不正确')


def _validate_phone_for_witness(val: Optional[str]) -> str:
    """中国大陆手机号 11 位。"""
    if not val or not str(val).strip():
        raise ValueError('请填写手机号')
    digits = re.sub(r'\D', '', str(val).strip())
    if len(digits) == 11 and digits.startswith('1'):
        return digits
    raise ValueError('手机号格式不正确')


# 旧版「占位提交」生成的假订单号：未走真实人脸，不应视为已完成核身
_LEGACY_WITNESS_FACE_ORDER_PLACEHOLDER = re.compile(r'^FACE-[0-9a-f]{16}$', re.I)


def witness_face_verification_effective(ws: WitnessStaff) -> bool:
    """
    是否已完成**真实**在线人脸核身（火山 query 回写或可信订单号）。
    旧占位接口仅写入 identity_verified + FACE-{16位hex}，视为未完成。
    """
    if not ws.identity_verified or not ws.face_verified_at:
        return False
    fid = (ws.face_order_id or '').strip()
    if not fid:
        return False
    if _LEGACY_WITNESS_FACE_ORDER_PLACEHOLDER.match(fid):
        return False
    return True


def witness_has_legacy_placeholder_face_record(ws: WitnessStaff) -> bool:
    """是否仅为旧占位流程写入的「假核验」记录（用于邮件页提示用户重新核身）。"""
    fid = (ws.face_order_id or '').strip()
    if not fid or not ws.identity_verified:
        return False
    return bool(_LEGACY_WITNESS_FACE_ORDER_PLACEHOLDER.match(fid))


def resolve_auth_token(token: str) -> Optional[WitnessDualSignAuthToken]:
    if not token or not str(token).strip():
        return None
    return (
        WitnessDualSignAuthToken.objects.filter(
            token=str(token).strip(),
            expires_at__gte=timezone.now(),
        )
        .select_related('witness_staff')
        .first()
    )


def _apply_protocol_consent_verify_signature_authorized(protocol_id: int) -> None:
    """邮件页同意签名授权后：协议知情配置标记，列表「已授权待测试」供扫码核验。"""
    from apps.protocol.models import Protocol
    from apps.protocol.api import _get_consent_settings, _save_consent_settings

    protocol = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
    if not protocol:
        return
    settings_data = dict(_get_consent_settings(protocol))
    settings_data['consent_verify_signature_authorized'] = True
    _save_consent_settings(protocol, settings_data)


def record_witness_signature_authorization(token: str, decision: str) -> dict:
    """
    邮件公开页：在人脸核验有效的前提下，记录是否同意本项目使用工作人员签名信息。
    decision: agree | refuse → 存为 agreed | refused。
    """
    row = resolve_auth_token(token)
    if not row:
        raise ValueError('链接无效或已过期')
    if row.protocol_id is None:
        raise ValueError('当前为档案核验链接，请在手写签名步骤完成登记，无需进行项目授权')
    ws = row.witness_staff
    if not witness_face_verification_effective(ws):
        raise ValueError('请先完成人脸核验')
    d = (decision or '').strip().lower()
    if d not in ('agree', 'refuse'):
        raise ValueError('无效的授权选择')
    val = 'agreed' if d == 'agree' else 'refused'
    if val == 'agreed':
        w = WitnessStaff.objects.filter(pk=ws.id, is_deleted=False).first()
        if not w or not (str(w.signature_file or '').strip()):
            raise ValueError('请先在执行台「双签工作人员名单」中完成签名登记后再同意授权')
    existing = (row.signature_auth_decision or '').strip()
    if existing:
        if existing == val:
            if val == 'agreed' and row.protocol_id is not None:
                _apply_protocol_consent_verify_signature_authorized(row.protocol_id)
            return {'signature_auth_decision': val, 'already_recorded': True}
        raise ValueError('已作出授权选择，无法更改')
    WitnessDualSignAuthToken.objects.filter(pk=row.pk).update(
        signature_auth_decision=val,
        signature_auth_at=timezone.now(),
    )
    if val == 'agreed' and row.protocol_id is not None:
        _apply_protocol_consent_verify_signature_authorized(row.protocol_id)
    return {'signature_auth_decision': val, 'already_recorded': False}


def register_witness_staff_signature_from_token(token: str, image_base64: str) -> dict:
    """档案核验邮件：人脸有效后提交手写签名图片，写入 t_witness_staff 并标记本令牌已完成登记。"""
    row = resolve_auth_token(token)
    if not row:
        raise ValueError('链接无效或已过期')
    if row.protocol_id is not None:
        raise ValueError('请使用「档案核验」邮件链接完成签名登记；项目授权请使用知情流程中的邮件')
    ws = row.witness_staff
    if not witness_face_verification_effective(ws):
        raise ValueError('请先完成人脸核验')
    if row.staff_signature_registered_at:
        ws.refresh_from_db(fields=['signature_file', 'signature_at'])
        return {
            'already_registered': True,
            'witness_staff_id': ws.id,
            'storage_key': (ws.signature_file or '').strip(),
            'signature_at': ws.signature_at.isoformat() if ws.signature_at else None,
        }
    from apps.signature.services import persist_signature_image

    out = persist_signature_image(image_base64)
    key = out['storage_key']
    now = timezone.now()
    WitnessStaff.objects.filter(pk=ws.id, is_deleted=False).update(
        signature_file=key,
        signature_at=now,
        update_time=now,
    )
    WitnessDualSignAuthToken.objects.filter(pk=row.pk).update(staff_signature_registered_at=now)
    return {
        'already_registered': False,
        'witness_staff_id': ws.id,
        'storage_key': key,
        'signature_at': now.isoformat(),
    }


def _sync_witness_dual_sign_snapshot(protocol_id: Optional[int], ws: WitnessStaff) -> None:
    if protocol_id is None:
        return
    try:
        from apps.protocol.api import _upsert_dual_sign_staff_row

        protocol = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
        if protocol:
            _upsert_dual_sign_staff_row(protocol, ws)
    except Exception:
        logger.exception(
            'sync witness dual-sign snapshot failed protocol_id=%s witness_id=%s',
            protocol_id,
            ws.id,
        )


def merge_witness_id_phone_for_face_auth(
    row: WitnessDualSignAuthToken,
    id_card_no: Optional[str],
    phone: Optional[str],
) -> WitnessStaff:
    """公开链路上补全身份证与手机号（与占位提交逻辑一致），并同步知情配置双签快照。"""
    ws = row.witness_staff
    had_both = bool((ws.id_card_no or '').strip() and (ws.phone or '').strip())
    if had_both:
        return ws
    ws.id_card_no = _validate_id_card_no_for_witness(id_card_no)
    ws.phone = _validate_phone_for_witness(phone)
    ws.save(update_fields=['id_card_no', 'phone', 'update_time'])
    _sync_witness_dual_sign_snapshot(row.protocol_id, ws)
    return ws


def _start_volcengine_h5_witness_face(row: WitnessDualSignAuthToken, ws0: WitnessStaff) -> dict:
    """火山引擎 H5：写入 byted_token，返回 verify.volcengine.com 参数（与受试者 L2 同配置）。"""
    from apps.subject.services.identity_provider_service import (
        get_identity_provider_config_state,
        get_identity_provider_payload,
    )

    st = get_identity_provider_config_state()
    if not st.get('sdk_ready'):
        raise RuntimeError('IDENTITY_PROVIDER_UNAVAILABLE')

    payload = get_identity_provider_payload(
        idcard_name=str(ws0.name or '').strip(),
        idcard_no=str(ws0.id_card_no or '').strip(),
    )
    if not (payload.byted_token or '').strip():
        raise RuntimeError('IDENTITY_PROVIDER_UNAVAILABLE')

    WitnessDualSignAuthToken.objects.filter(pk=row.pk).update(face_byted_token=payload.byted_token)
    verify_id = f'w{row.id}'
    tok_q = quote(payload.byted_token, safe='')
    vid_q = quote(verify_id, safe='')
    verify_url = f'https://verify.volcengine.com/verify?token={tok_q}&verify_id={vid_q}'
    return {
        'already_verified': False,
        'identity_provider': 'volcengine',
        'byted_token': payload.byted_token,
        'h5_config_id': payload.h5_config_id,
        'verify_id': verify_id,
        'verify_url': verify_url,
    }


def witness_face_dev_bypass_enabled() -> bool:
    """联调：跳过火山人脸，直接写入有效核身标记（需 settings.WITNESS_FACE_DEV_BYPASS）。"""
    return bool(getattr(settings, 'WITNESS_FACE_DEV_BYPASS', False))


def _complete_witness_face_dev_bypass(row: WitnessDualSignAuthToken, ws: WitnessStaff) -> dict:
    """联调专用：写入非占位 face_order_id，使 witness_face_verification_effective 为真。"""
    oid = f'DEV-BYPASS-{int(timezone.now().timestamp())}'
    ws.face_order_id = oid[:128]
    ws.face_verified_at = timezone.now()
    ws.identity_verified = True
    ws.save(update_fields=['face_order_id', 'face_verified_at', 'identity_verified', 'update_time'])
    WitnessDualSignAuthToken.objects.filter(pk=row.pk).update(face_byted_token='')
    _sync_witness_dual_sign_snapshot(row.protocol_id, ws)
    return {
        'already_verified': False,
        'dev_bypass': True,
        'witness_staff_id': ws.id,
        'identity_verified': True,
        'identity_provider': 'volcengine',
        'verify_url': None,
    }


def start_witness_face_verification(
    token: str,
    id_card_no: Optional[str] = None,
    phone: Optional[str] = None,
) -> dict:
    """
    发起人脸核身 H5：默认火山引擎；可选策略见 settings.WITNESS_FACE_IDENTITY_PROVIDER。
    腾讯云备选见 docs/WITNESS_FACE_IDENTITY_PROVIDERS.md（未实现时显式报错）。
    """
    row = resolve_auth_token(token)
    if not row:
        raise ValueError('链接无效或已过期')
    ws0 = merge_witness_id_phone_for_face_auth(row, id_card_no, phone)
    ws0.refresh_from_db()
    if witness_face_verification_effective(ws0):
        return {
            'already_verified': True,
            'witness_staff_id': ws0.id,
            'identity_verified': True,
        }
    if not ((ws0.id_card_no or '').strip() and (ws0.phone or '').strip()):
        raise ValueError('请填写身份证号与手机号')

    if witness_face_dev_bypass_enabled():
        return _complete_witness_face_dev_bypass(row, ws0)

    prov = (getattr(settings, 'WITNESS_FACE_IDENTITY_PROVIDER', None) or 'volcengine').strip().lower()
    fallback = bool(getattr(settings, 'WITNESS_FACE_TRY_TENCENT_FALLBACK', False))

    if prov == 'tencent':
        raise RuntimeError('WITNESS_FACE_TENCENT_NOT_IMPLEMENTED')

    if prov not in ('volcengine', 'auto'):
        raise ValueError(f'不支持的 WITNESS_FACE_IDENTITY_PROVIDER: {prov}')

    try:
        return _start_volcengine_h5_witness_face(row, ws0)
    except RuntimeError as e:
        if str(e) == 'IDENTITY_PROVIDER_UNAVAILABLE' and prov == 'auto' and fallback:
            raise RuntimeError('WITNESS_FACE_TENCENT_NOT_IMPLEMENTED') from e
        raise


def poll_witness_face_verification(token: str) -> dict:
    """
    轮询火山 cert_verify_query；成功则回写 t_witness_staff 人脸字段与 identity_verified。
    """
    row = resolve_auth_token(token)
    if not row:
        return {'status': 'failed', 'msg': '链接无效或已过期'}
    ws = row.witness_staff
    if witness_face_verification_effective(ws):
        return {
            'status': 'verified',
            'msg': '已完成人脸核验',
            'witness_staff_id': ws.id,
            'identity_verified': True,
        }
    if not (row.face_byted_token or '').strip():
        return {'status': 'pending', 'msg': '请先点击「开始人脸核验」发起认证'}

    from apps.subject.services.identity_provider_service import query_verify_result

    qr = query_verify_result(row.face_byted_token)
    if qr.get('result') is True:
        req_id = (qr.get('request_id') or '').strip() or f'VOLC-{secrets.token_hex(8)}'
        ws.face_order_id = req_id[:128]
        ws.face_verified_at = timezone.now()
        ws.identity_verified = True
        ws.save(update_fields=['face_order_id', 'face_verified_at', 'identity_verified', 'update_time'])
        _sync_witness_dual_sign_snapshot(row.protocol_id, ws)
        WitnessDualSignAuthToken.objects.filter(pk=row.pk).update(face_byted_token='')
        return {
            'status': 'verified',
            'msg': '核验通过',
            'witness_staff_id': ws.id,
            'identity_verified': True,
        }

    if timezone.now() > row.expires_at:
        return {'status': 'failed', 'msg': '授权链接已过期，请项目方重新发送验证邮件'}

    err = (qr.get('error') or '').strip()
    return {
        'status': 'pending',
        'msg': err or '核验处理中，请在火山认证页完成人脸核验后返回本页',
    }


def clear_witness_staff_face_verification(staff_ids: list[int]) -> int:
    """
    清空档案中的人脸核验结果（identity_verified / face_order_id / face_verified_at），
    便于重新走火山引擎 H5 + cert_verify_query 真实核身（与旧版占位 FACE-xx 无关）。
    """
    if not staff_ids:
        return 0
    return WitnessStaff.objects.filter(id__in=staff_ids, is_deleted=False).update(
        identity_verified=False,
        face_order_id='',
        face_verified_at=None,
        update_time=timezone.now(),
    )


def complete_face_verification(
    token: str,
    face_order_id: str = '',
    *,
    id_card_no: Optional[str] = None,
    phone: Optional[str] = None,
) -> Optional[WitnessStaff]:
    """
    完成见证人人脸核验占位流程。
    若档案中已有身份证与手机号则沿用；否则须由用户提交，并写入 t_witness_staff 且同步协议知情配置中的双签快照。
    """
    row = resolve_auth_token(token)
    if not row:
        return None
    ws = row.witness_staff
    had_both = bool((ws.id_card_no or '').strip() and (ws.phone or '').strip())
    update_fields: list[str] = []
    if not had_both:
        ws.id_card_no = _validate_id_card_no_for_witness(id_card_no)
        ws.phone = _validate_phone_for_witness(phone)
        update_fields.extend(['id_card_no', 'phone'])
    ws.face_order_id = (face_order_id or '').strip() or f'FACE-{secrets.token_hex(8)}'
    ws.face_verified_at = timezone.now()
    ws.identity_verified = True
    update_fields.extend(['face_order_id', 'face_verified_at', 'identity_verified', 'update_time'])
    ws.save(update_fields=update_fields)
    _sync_witness_dual_sign_snapshot(row.protocol_id, ws)
    return ws


def protocol_has_test_signing(protocol_id: int) -> bool:
    """协议下是否存在「测试」类型（signing_kind=test）且已签署的知情记录。"""
    from apps.subject.models import SubjectConsent

    qs = SubjectConsent.objects.filter(
        icf_version__protocol_id=protocol_id,
        is_signed=True,
        is_deleted=False,
    ).only('signature_data')[:1000]
    for c in qs:
        sd = c.signature_data if isinstance(c.signature_data, dict) else {}
        if (sd.get('signing_kind') or '').strip().lower() == 'test':
            return True
    return False


def compute_signature_auth_status(
    protocol_id: int, icf_version_id: int, ws: Optional[WitnessStaff],
) -> str:
    """
    本项目 + 当前签署节点下，最新项目授权邮件令牌上的「签名授权」进度。
    none | pending_face | pending_decision | agreed | refused
    """
    if not ws:
        return 'none'
    tok = (
        WitnessDualSignAuthToken.objects.filter(
            protocol_id=protocol_id,
            icf_version_id=icf_version_id,
            witness_staff_id=ws.id,
        )
        .order_by('-create_time')
        .first()
    )
    if not tok:
        return 'none'
    now = timezone.now()
    if tok.expires_at and tok.expires_at < now:
        return 'none'
    d = (tok.signature_auth_decision or '').strip().lower()
    if d == 'agreed':
        return 'agreed'
    if d == 'refused':
        return 'refused'
    if witness_face_verification_effective(ws):
        return 'pending_decision'
    if (tok.face_byted_token or '').strip():
        return 'pending_face'
    return 'pending_face'


def compute_dual_sign_staff_status(protocol_id: int, icf_version_id: int, staff_id: int) -> str:
    """
    单人在「本协议 + 当前签署节点」下的双签核验阶段，供执行台列表展示。

    - verified: 档案已完成有效火山人脸核身（witness_face_verification_effective）
    - verifying: 已发邮件且链接未过期，且已发起火山 H5（face_byted_token 非空），尚未完成回写
    - pending_verify: 已发邮件、链接有效，尚未打开/未完成人脸
    - pending_email: 尚未对本节点发信，或授权链接已过期（需重发）
    """
    ws = WitnessStaff.objects.filter(id=staff_id, is_deleted=False).first()
    if not ws:
        return 'pending_email'
    if witness_face_verification_effective(ws):
        return 'verified'
    tok = (
        WitnessDualSignAuthToken.objects.filter(
            protocol_id=protocol_id,
            icf_version_id=icf_version_id,
            witness_staff_id=staff_id,
        )
        .order_by('-create_time')
        .first()
    )
    if not tok:
        return 'pending_email'
    now = timezone.now()
    if tok.expires_at and tok.expires_at < now:
        return 'pending_email'
    if (tok.face_byted_token or '').strip():
        return 'verifying'
    return 'pending_verify'


def dual_sign_staff_status_batch(protocol_id: int, icf_version_id: int, staff_ids: list[int]) -> list[dict]:
    """批量返回 witness_staff_id、status、signature_auth_status、test_signing_completed。"""
    out: list[dict] = []
    seen = set()
    test_done = protocol_has_test_signing(protocol_id)
    for sid in staff_ids:
        try:
            pk = int(sid)
        except (TypeError, ValueError):
            continue
        if pk in seen:
            continue
        seen.add(pk)
        ws = WitnessStaff.objects.filter(id=pk, is_deleted=False).first()
        sig_st = compute_signature_auth_status(protocol_id, icf_version_id, ws) if ws else 'none'
        out.append(
            {
                'witness_staff_id': pk,
                'status': compute_dual_sign_staff_status(protocol_id, icf_version_id, pk),
                'signature_auth_status': sig_st,
                'test_signing_completed': test_done,
            }
        )
    return out


@transaction.atomic
def submit_witness_dev_consent_records(
    token: str,
    icf_version_ids: list[int],
    icf_version_answers: list | None = None,
) -> dict:
    """
    联调：将邮件授权链路上的知情阅读结果写入 SubjectConsent（签署类型「测试」），供执行台签署记录展示。
    仅当 WITNESS_FACE_DEV_BYPASS 且 token 有效时可用；每次提交新建一名「知情联调受试者」及对应节点签署行。
    """
    if not witness_face_dev_bypass_enabled():
        raise ValueError('未启用联调模式（环境变量 WITNESS_FACE_DEV_BYPASS=true）')

    row = resolve_auth_token(token)
    if not row:
        raise ValueError('链接无效或已过期')
    if row.protocol_id is None:
        raise ValueError('当前链接为档案签名登记，请使用项目授权邮件进行知情联调')

    ws = row.witness_staff
    protocol_id = row.protocol_id

    protocol = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
    if not protocol:
        raise ValueError('协议不存在')

    raw_ids = [int(x) for x in (icf_version_ids or []) if x is not None]
    if not raw_ids:
        raise ValueError('请至少提交一个 ICF 节点')

    from apps.subject.models import ICFVersion, Subject
    from apps.subject.services.consent_service import sign_consent

    seen: set[int] = set()
    ordered_ids: list[int] = []
    for i in raw_ids:
        if i not in seen:
            seen.add(i)
            ordered_ids.append(i)

    icf_qs = ICFVersion.objects.filter(protocol_id=protocol_id, id__in=ordered_ids, is_active=True)
    by_id = {icf.id: icf for icf in icf_qs}
    if len(by_id) != len(ordered_ids):
        raise ValueError('存在无效或不属于本协议的 ICF 节点')
    ordered_icfs = [by_id[i] for i in ordered_ids]

    for icf in ordered_icfs:
        if not getattr(icf, 'mini_sign_rules_saved', False):
            raise ValueError('存在未保存小程序签署规则的签署节点，请在知情配置中保存规则后再试')

    for _attempt in range(40):
        subject_no = f'W{protocol_id:04d}{secrets.token_hex(4)}'[:20]
        if not Subject.objects.filter(subject_no=subject_no).exists():
            break
    else:
        raise RuntimeError('无法生成唯一受试者编号')

    subj = Subject.objects.create(
        name='知情联调受试者',
        subject_no=subject_no,
        phone='',
        source_channel='',
    )

    import uuid

    batch_id = uuid.uuid4().hex
    base_sig = {
        'signing_kind': 'test',
        'witness_dev_flow': True,
        'witness_staff_id': ws.id,
        'witness_staff_name': (ws.name or '').strip(),
        'witness_dev_batch_id': batch_id,
    }

    answers_by_icf: dict[int, list] = {}
    if icf_version_answers:
        for row in icf_version_answers:
            if isinstance(row, dict):
                try:
                    iv = int(row.get('icf_version_id'))
                except (TypeError, ValueError):
                    continue
                ans = row.get('answers')
            else:
                try:
                    iv = int(getattr(row, 'icf_version_id', None))
                except (TypeError, ValueError):
                    continue
                ans = getattr(row, 'answers', None)
            if isinstance(ans, list) and len(ans) > 0:
                answers_by_icf[iv] = list(ans)

    consent_ids: list[int] = []
    for icf in ordered_icfs:
        sig = dict(base_sig)
        if icf.id in answers_by_icf:
            sig['icf_checkbox_answers'] = answers_by_icf[icf.id]
        c = sign_consent(subj.id, icf.id, sig)
        consent_ids.append(c.id)

    return {
        'protocol_id': protocol_id,
        'subject_id': subj.id,
        'subject_no': subject_no,
        'witness_staff_id': ws.id,
        'consent_ids': consent_ids,
    }


def _normalize_consent_test_scan_signature_images(raw_rows: list | None) -> dict[int, list[str]]:
    """将提交中的 data URL / base64 规范为纯 base64 字符串列表；过大或非法则跳过。"""
    import base64
    import re

    out: dict[int, list[str]] = {}
    for row in raw_rows or []:
        iid = getattr(row, 'icf_version_id', None)
        if iid is None and isinstance(row, dict):
            iid = row.get('icf_version_id')
        try:
            iv = int(iid)
        except (TypeError, ValueError):
            continue
        imgs = getattr(row, 'signature_images', None) if not isinstance(row, dict) else row.get('signature_images')
        if not isinstance(imgs, list):
            continue
        cleaned: list[str] = []
        for im in imgs[:8]:
            s = (im or '').strip()
            if not s:
                continue
            if 'base64,' in s:
                s = s.split('base64,', 1)[1]
            s = re.sub(r'\s+', '', s)
            if len(s) > 3_000_000:
                continue
            try:
                raw = base64.b64decode(s, validate=True)
            except Exception:
                continue
            if len(raw) > 2_500_000:
                continue
            cleaned.append(base64.b64encode(raw).decode('ascii'))
        if cleaned:
            out[iv] = cleaned
    return out


@transaction.atomic
def submit_consent_test_scan_records(
    protocol_id: int,
    scan_token: str,
    icf_version_ids: list[int],
    icf_version_answers: list | None = None,
    *,
    subject_name: str | None = None,
    id_card_no: str | None = None,
    phone: str | None = None,
    screening_number: str | None = None,
    icf_version_signatures: list | None = None,
) -> dict:
    """
    执行台「核验测试」H5：凭 consent_test_scan_token 将阅读结果写入 SubjectConsent（签署类型「测试」）。
    与小程序 face-sign + consent_test_scan_token 的校验规则一致；每次提交新建一名测试受试者。
    """
    from apps.protocol.consent_test_tokens import unsign_consent_test_scan_token

    # 延迟导入，避免 apps.protocol.api ↔ witness_staff_service 循环依赖
    from apps.protocol.api import _get_consent_settings, _is_consent_launched, get_consent_config_status_for_protocol

    tid = unsign_consent_test_scan_token(scan_token)
    if tid is None or int(tid) != int(protocol_id):
        raise ValueError('核验测试口令无效或已过期')

    protocol = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
    if not protocol:
        raise ValueError('协议不存在')
    if _is_consent_launched(protocol):
        raise ValueError('知情已发布，不能使用核验测试口令签署')
    if get_consent_config_status_for_protocol(protocol) not in (
        '已授权待测试',
        '已测试待开始',
        '核验测试中',
        '待测试',
    ):
        raise ValueError('请先完成配置与工作人员授权核验')

    raw_ids = [int(x) for x in (icf_version_ids or []) if x is not None]
    if not raw_ids:
        raise ValueError('请至少提交一个 ICF 节点')

    from apps.subject.models import ICFVersion, Subject
    from apps.subject.services.consent_service import normalize_phone_digits, sign_consent

    seen: set[int] = set()
    ordered_ids: list[int] = []
    for i in raw_ids:
        if i not in seen:
            seen.add(i)
            ordered_ids.append(i)

    icf_qs = ICFVersion.objects.filter(protocol_id=protocol_id, id__in=ordered_ids, is_active=True)
    by_id = {icf.id: icf for icf in icf_qs}
    if len(by_id) != len(ordered_ids):
        raise ValueError('存在无效或不属于本协议的 ICF 节点')
    ordered_icfs = [by_id[i] for i in ordered_ids]

    for icf in ordered_icfs:
        if not getattr(icf, 'mini_sign_rules_saved', False):
            raise ValueError('存在未保存小程序签署规则的签署节点，请在知情配置中保存规则后再试')

    for _attempt in range(40):
        subject_no = f'T{protocol_id:04d}{secrets.token_hex(4)}'[:20]
        if not Subject.objects.filter(subject_no=subject_no).exists():
            break
    else:
        raise RuntimeError('无法生成唯一受试者编号')

    display_name = (subject_name or '').strip() or '知情核验测试受试者'
    phone_digits = normalize_phone_digits(phone or '')
    phone_display = (phone or '').strip()[:20] if phone else ''
    if phone_digits and len(phone_digits) >= 11:
        phone_store = phone_digits[-11:] if len(phone_digits) > 11 else phone_digits
    else:
        phone_store = phone_display[:20] if phone_display else ''

    subj = Subject.objects.create(
        name=display_name[:100],
        subject_no=subject_no,
        phone=phone_store,
        source_channel='consent_test_scan_h5',
    )

    import uuid

    batch_id = uuid.uuid4().hex
    identity_meta: dict = {}
    if (subject_name or '').strip():
        identity_meta['declared_name'] = (subject_name or '').strip()[:100]
    if (id_card_no or '').strip():
        identity_meta['declared_id_card'] = (id_card_no or '').strip()[:32]
    if (screening_number or '').strip():
        identity_meta['declared_screening_number'] = (screening_number or '').strip()[:64]
    if phone_store:
        identity_meta['declared_phone'] = phone_store

    base_sig = {
        'signing_kind': 'test',
        'consent_test_scan_h5': True,
        'consent_test_scan_batch_id': batch_id,
        'consent_test_scan_identity': identity_meta,
    }
    enable_auto_sign = bool(_get_consent_settings(protocol).get('enable_auto_sign_date', False))

    answers_by_icf: dict[int, list] = {}
    if icf_version_answers:
        for row in icf_version_answers:
            if isinstance(row, dict):
                try:
                    iv = int(row.get('icf_version_id'))
                except (TypeError, ValueError):
                    continue
                ans = row.get('answers')
            else:
                try:
                    iv = int(getattr(row, 'icf_version_id', None))
                except (TypeError, ValueError):
                    continue
                ans = getattr(row, 'answers', None)
            if isinstance(ans, list) and len(ans) > 0:
                answers_by_icf[iv] = list(ans)

    sig_images_by_icf = _normalize_consent_test_scan_signature_images(icf_version_signatures)

    consent_ids: list[int] = []
    receipt_items: list[dict] = []
    for icf in ordered_icfs:
        sig = dict(base_sig)
        if enable_auto_sign:
            sig['signed_at'] = timezone.localdate().isoformat()
        if icf.id in answers_by_icf:
            sig['icf_checkbox_answers'] = answers_by_icf[icf.id]
        if icf.id in sig_images_by_icf:
            sig['consent_test_scan_signature_images'] = sig_images_by_icf[icf.id]
        c = sign_consent(subj.id, icf.id, sig)
        consent_ids.append(c.id)
        receipt_items.append(
            {
                'consent_id': c.id,
                'icf_version_id': icf.id,
                'node_title': (getattr(icf, 'node_title', None) or '').strip(),
                'version': (getattr(icf, 'version', None) or '').strip(),
                'receipt_no': (c.receipt_no or '').strip(),
            }
        )

    return {
        'protocol_id': protocol_id,
        'subject_id': subj.id,
        'subject_no': subject_no,
        'consent_ids': consent_ids,
        'consent_test_scan_batch_id': batch_id,
        'receipt_items': receipt_items,
    }
