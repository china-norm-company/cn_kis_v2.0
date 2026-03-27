"""
双签工作人员档案与邮件身份验证

名单主要与鹿鸣·治理台（3008）账号关联（全局角色 qa：QA质量管理）；
亦支持**无治理台账号**建档（account 为空，手工维护姓名/联系方式）。
"""
import html
import logging
import re
import secrets
from urllib.parse import quote
from collections import defaultdict
from datetime import date as date_type
from datetime import datetime, time
from email.utils import formataddr, parseaddr
from typing import Optional

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Exists, Max, OuterRef, Q
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
WITNESS_STAFF_ROLE_NAMES = ('qa',)


def _eligible_account_ids() -> set[int]:
    from apps.identity.models import AccountRole, Role

    rids = Role.objects.filter(name__in=WITNESS_STAFF_ROLE_NAMES, is_active=True).values_list('id', flat=True)
    return set(
        AccountRole.objects.filter(project_id__isnull=True, role_id__in=rids).values_list('account_id', flat=True).distinct()
    )


def witness_staff_allowed_name_set() -> set[str]:
    """治理台「双签工作人员」档案（t_witness_staff）全部非删除姓名，供知情签署人员校验。

    与 list_witness_staff 列表一致：凡已在双签档案中的人员均可作为知情签署工作人员，
    不再仅限 QA 等单一角色子集（避免大量人员无法被选）。
    """
    return {
        (n or '').strip()
        for n in WitnessStaff.objects.filter(is_deleted=False).values_list('name', flat=True)
        if (n or '').strip()
    }


def _account_has_witness_eligible_role(account_id: int) -> bool:
    return account_id in _eligible_account_ids()


def is_witness_staff_row_eligible(ws: WitnessStaff) -> bool:
    """双签发信等操作前校验：须关联治理台账号且具备 qa（QA质量管理）全局角色。"""
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


def _witness_has_execution_signature(ws: WitnessStaff) -> bool:
    """执行台已保存手写签名文件且有时间（仅人脸通过不算「认证签名」已完成）。"""
    return bool((ws.signature_file or '').strip()) and ws.signature_at is not None


def _witness_auth_signature_status(
    ws: WitnessStaff,
    has_profile_mail: bool,
    latest_profile_token_id: Optional[int] = None,
    max_registered_profile_token_id: Optional[int] = None,
) -> str:
    """
    认证签名列（与列表筛选一致）：
    - completed：身份已核验、已登记手写签名，且未处于重新认证流程（或重认证链路已闭环）
    - pending_reauth：已认证用户再次发起核验邮件，待对方完成签名登记
    - pending_mail：尚未发送档案核验邮件，且无人脸/签名进度
    - pending_sign：已发邮件或已有进度，或人脸已通过但尚未登记手写签名

    latest_profile_token_id：档案核验邮件（protocol_id 空）中 id 最大的一条。
    max_registered_profile_token_id：同上链路中 staff_signature_registered_at 非空的 id 最大的一条。
    二者相等表示「当前最新一封邮件对应的令牌已完成手写签名登记」，不依赖 ORM 字段是否被延迟加载。
    """
    if getattr(ws, 'identity_reverify_pending', False) and ws.identity_verified:
        if latest_profile_token_id and max_registered_profile_token_id:
            if latest_profile_token_id == max_registered_profile_token_id:
                return 'completed'
            if latest_profile_token_id > max_registered_profile_token_id:
                return 'pending_reauth'
        # 若清除未落库，用「真实人脸核身 + 已有签名，且签名时间不早于档案 update_time」近似视为已重新登记完成。
        if (
            witness_face_verification_effective(ws)
            and _witness_has_execution_signature(ws)
            and ws.update_time
            and ws.signature_at >= ws.update_time
        ):
            return 'completed'
        return 'pending_reauth'
    if ws.identity_verified:
        if _witness_has_execution_signature(ws):
            return 'completed'
        return 'pending_sign'
    has_progress = bool(ws.face_verified_at) or bool((ws.face_order_id or '').strip()) or bool(
        (ws.signature_file or '').strip()
    )
    if not has_profile_mail and not has_progress:
        return 'pending_mail'
    return 'pending_sign'


def list_witness_staff(
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    focus_witness_staff_id: Optional[int] = None,
    auth_signature_filter: Optional[str] = None,
) -> dict:
    """列出全部非删除双签档案（与治理台维护范围一致）；知情签署等场景依赖完整名单。

    focus_witness_staff_id：深链定位某条档案所在分页时传入，与 order_by('-priority','id') 一致计算所在页。
    auth_signature_filter：all | completed | pending_mail | pending_sign | pending_reauth（认证签名快捷筛选）
    """
    qs = WitnessStaff.objects.filter(is_deleted=False).select_related('account')
    profile_mail_exists = WitnessDualSignAuthToken.objects.filter(
        witness_staff_id=OuterRef('pk'),
        protocol_id__isnull=True,
    )
    qs = qs.annotate(_has_profile_mail=Exists(profile_mail_exists))

    af = (auth_signature_filter or '').strip().lower()
    if af and af not in ('all', '全部'):
        if af == 'completed':
            qs = qs.filter(
                identity_verified=True,
                identity_reverify_pending=False,
            ).exclude(signature_file='').filter(signature_at__isnull=False)
        elif af == 'pending_reauth':
            qs = qs.filter(identity_reverify_pending=True)
        elif af == 'pending_mail':
            qs = qs.filter(identity_verified=False).filter(_has_profile_mail=False).filter(
                face_verified_at__isnull=True,
                face_order_id='',
                signature_file='',
            )
        elif af == 'pending_sign':
            qs = qs.filter(
                Q(
                    Q(identity_verified=False)
                    & (
                        Q(_has_profile_mail=True)
                        | Q(face_verified_at__isnull=False)
                        | ~Q(face_order_id='')
                        | ~Q(signature_file='')
                    )
                )
                | (
                    Q(identity_verified=True)
                    & Q(identity_reverify_pending=False)
                    & (Q(signature_file='') | Q(signature_at__isnull=True))
                )
            )

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
    staff_ids = [w.id for w in items]
    max_any_by_staff: dict[int, int] = {}
    max_reg_by_staff: dict[int, int] = {}
    if staff_ids:
        max_any_rows = (
            WitnessDualSignAuthToken.objects.filter(
                witness_staff_id__in=staff_ids,
                protocol_id__isnull=True,
            )
            .values('witness_staff_id')
            .annotate(mid=Max('id'))
        )
        max_any_by_staff = {r['witness_staff_id']: r['mid'] for r in max_any_rows if r.get('mid')}
        max_reg_rows = (
            WitnessDualSignAuthToken.objects.filter(
                witness_staff_id__in=staff_ids,
                protocol_id__isnull=True,
                staff_signature_registered_at__isnull=False,
            )
            .values('witness_staff_id')
            .annotate(mid=Max('id'))
        )
        max_reg_by_staff = {r['witness_staff_id']: r['mid'] for r in max_reg_rows if r.get('mid')}
    acc_ids = [w.account_id for w in items if w.account_id]
    label_map = _batch_role_labels(acc_ids)
    out_items = []
    for w in items:
        has_pm = bool(getattr(w, '_has_profile_mail', False))
        status = _witness_auth_signature_status(
            w,
            has_pm,
            latest_profile_token_id=max_any_by_staff.get(w.id),
            max_registered_profile_token_id=max_reg_by_staff.get(w.id),
        )
        if getattr(w, 'identity_reverify_pending', False) and status == 'completed':
            WitnessStaff.objects.filter(pk=w.id, identity_reverify_pending=True).update(
                identity_reverify_pending=False,
                update_time=timezone.now(),
            )
            w.identity_reverify_pending = False
        row = witness_staff_to_dict(w, role_labels=label_map.get(w.account_id))
        row['auth_signature_status'] = status
        out_items.append(row)
    return {
        'items': out_items,
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
        'identity_reverify_pending': bool(getattr(ws, 'identity_reverify_pending', False)),
        'update_time': ws.update_time.isoformat() if ws.update_time else None,
        'create_time': ws.create_time.isoformat() if ws.create_time else None,
    }
    return out


def sync_witness_staff_from_accounts() -> dict:
    """为具备 QA质量管理（qa）全局角色的治理台账号 upsert 双签档案（姓名、邮箱与治理台账号一致；手机号不在治理台维护，不同步）。"""
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
        raise ValueError('该账号不具备 QA质量管理 全局角色，无法加入双签名单')
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
    # 已认证档案再次发信：进入「待重新认证」，直至对方完成手写签名登记
    WitnessStaff.objects.filter(pk=witness.id, is_deleted=False, identity_verified=True).update(
        identity_reverify_pending=True,
        update_time=timezone.now(),
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


def witness_staff_snapshot_for_consent_signing(protocol_id: int, signed_at_dt: Optional[datetime]) -> dict:
    """
    知情测试签署：在签署时刻 signed_at 之前，取「项目邮件授权」中最近一次同意使用签名的工作人员
    （WitnessDualSignAuthToken.signature_auth_at 最大且 <= signed_at）；
    witness_staff_signature_order_ids 仅含该人 id（与知情配置 staff_signature_times=2 无关：占位符/PDF
    中多次工作人员签名为**同一人同一签名图重复**，不从双签名单各取一人）。
    """
    if not protocol_id or not signed_at_dt:
        return {}
    sat = signed_at_dt
    if timezone.is_naive(sat):
        sat = timezone.make_aware(sat, timezone.get_current_timezone())

    protocol = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
    if not protocol:
        return {}

    from apps.protocol.api import _get_consent_settings

    settings_json = _get_consent_settings(protocol)
    rows = list(settings_json.get('dual_sign_staffs') or [])
    ordered_ids: list[int] = []
    for row in rows:
        sid = row.get('staff_id')
        if not sid:
            continue
        try:
            ordered_ids.append(int(sid))
        except (TypeError, ValueError):
            continue

    latest = (
        WitnessDualSignAuthToken.objects.filter(
            protocol_id=protocol_id,
            signature_auth_decision='agreed',
            signature_auth_at__isnull=False,
            signature_auth_at__lte=sat,
        )
        .select_related('witness_staff')
        .order_by('-signature_auth_at')
        .first()
    )

    out: dict = {}
    if latest and latest.witness_staff:
        out['witness_staff_name'] = (latest.witness_staff.name or '').strip()
        out['witness_staff_id'] = latest.witness_staff_id
        if latest.signature_auth_at:
            out['witness_staff_auth_at'] = latest.signature_auth_at.isoformat()

    if latest and latest.witness_staff_id:
        out['witness_staff_signature_order_ids'] = [int(latest.witness_staff_id)]

    return out


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
            raise ValueError('请先完成手写签名登记后再同意授权（可在本页或执行台双签名单中登记）')
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
    """档案核验或项目授权邮件：人脸有效后提交手写签名图片，写入 t_witness_staff 并标记本令牌已完成登记。"""
    row = resolve_auth_token(token)
    if not row:
        raise ValueError('链接无效或已过期')
    ws = row.witness_staff
    if not witness_face_verification_effective(ws):
        raise ValueError('请先完成人脸核验')
    if row.staff_signature_registered_at:
        WitnessStaff.objects.filter(pk=ws.id, is_deleted=False).update(
            identity_reverify_pending=False,
            update_time=timezone.now(),
        )
        ws.refresh_from_db(fields=['signature_file', 'signature_at'])
        if row.protocol_id:
            _sync_witness_dual_sign_snapshot(row.protocol_id, ws)
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
        identity_reverify_pending=False,
        update_time=now,
    )
    WitnessDualSignAuthToken.objects.filter(pk=row.pk).update(staff_signature_registered_at=now)
    ws.refresh_from_db()
    if row.protocol_id:
        _sync_witness_dual_sign_snapshot(row.protocol_id, ws)
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
        identity_reverify_pending=False,
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


def _resolve_witness_staff_for_consent_verify_test_name(settings: dict) -> Optional[WitnessStaff]:
    """从协议知情配置中的 consent_verify_test_staff_name 解析 WitnessStaff（优先 dual_sign_staffs.staff_id）。"""
    name = (settings.get('consent_verify_test_staff_name') or '').strip()
    if not name:
        return None
    for s in settings.get('dual_sign_staffs') or []:
        if (s.get('name') or '').strip() != name:
            continue
        sid = str(s.get('staff_id') or '').strip()
        if sid.isdigit():
            ws = WitnessStaff.objects.filter(id=int(sid), is_deleted=False).first()
            if ws:
                return ws
    return WitnessStaff.objects.filter(name=name, is_deleted=False).first()


def consent_verify_test_staff_fully_ready(protocol_id: int, settings: dict) -> bool:
    """
    「授权签名测试」当前所选工作人员是否已完成全流程：
    项目双签链路下有效人脸核身 + 档案手写签名登记 + 本项目授权邮件内同意使用签名。

    未设置 consent_verify_test_staff_name 时返回 True（列表不因「未选人」而锁死在「待认证核验」）。
    项目节点以该人员对本协议**最近一次**项目授权邮件（WitnessDualSignAuthToken）绑定的 icf_version_id 为准，避免多节点双签与发信节点不一致。
    """
    if not (settings.get('consent_verify_test_staff_name') or '').strip():
        return True
    ws = _resolve_witness_staff_for_consent_verify_test_name(settings)
    if not ws:
        return False
    tok = (
        WitnessDualSignAuthToken.objects.filter(
            protocol_id=protocol_id,
            witness_staff_id=ws.id,
            icf_version_id__isnull=False,
        )
        .order_by('-create_time')
        .first()
    )
    if not tok or not tok.icf_version_id:
        return False
    icf_id = int(tok.icf_version_id)
    face_st = compute_dual_sign_staff_status(protocol_id, icf_id, ws.id)
    sig_st = compute_signature_auth_status(protocol_id, icf_id, ws)
    if face_st != 'verified':
        return False
    if not _witness_has_execution_signature(ws):
        return False
    if sig_st != 'agreed':
        return False
    return True


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
    pinyin_initials: str | None = None,
    icf_version_signatures: list | None = None,
) -> dict:
    """
    执行台「知情测试」H5：凭 consent_test_scan_token 将阅读结果写入 SubjectConsent（签署类型「测试」）。
    与小程序 face-sign + consent_test_scan_token 的校验规则一致；每次提交新建一名测试受试者。
    """
    from apps.protocol.consent_test_tokens import unsign_consent_test_scan_token

    # 延迟导入，避免 apps.protocol.api ↔ witness_staff_service 循环依赖
    from apps.protocol.api import _get_consent_settings, get_consent_config_status_for_protocol

    tid = unsign_consent_test_scan_token(scan_token)
    if tid is None or int(tid) != int(protocol_id):
        raise ValueError('知情测试口令无效或已过期')

    protocol = Protocol.objects.filter(id=protocol_id, is_deleted=False).first()
    if not protocol:
        raise ValueError('协议不存在')
    if get_consent_config_status_for_protocol(protocol) not in (
        '已授权待测试',
        '已测试待开始',
        '授权测试中',
        '待测试',
        '进行中',
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

    display_name = (subject_name or '').strip() or '知情测试受试者'
    phone_digits = normalize_phone_digits(phone or '')
    phone_display = (phone or '').strip()[:20] if phone else ''
    if phone_digits and len(phone_digits) >= 11:
        phone_store = phone_digits[-11:] if len(phone_digits) > 11 else phone_digits
    else:
        phone_store = phone_display[:20] if phone_display else ''

    # 主表 phone 不写入真实号码：t_subject 对「未删除且 phone 非空」有全局唯一索引，重复扫码测试会撞库；
    # 填报手机号仅写入各节点 signature_data.consent_test_scan_identity（及下方 identity_meta），回执/列表展示仍可用。
    subj = Subject.objects.create(
        name=display_name[:100],
        subject_no=subject_no,
        phone='',
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
    pin = (pinyin_initials or '').strip()
    if pin:
        identity_meta['declared_pinyin_initials'] = pin[:50].upper()
    if phone_store:
        identity_meta['declared_phone'] = phone_store

    base_sig = {
        'signing_kind': 'test',
        'consent_test_scan_h5': True,
        'consent_test_scan_batch_id': batch_id,
        'consent_test_scan_identity': identity_meta,
    }
    base_sig.update(witness_staff_snapshot_for_consent_signing(protocol.id, timezone.now()))
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


def _witness_auth_token_decision(t: WitnessDualSignAuthToken) -> str:
    return (t.signature_auth_decision or '').strip().lower()


def _consent_counts_by_witness_auth_key(protocol_id: int) -> dict[tuple[str, int], int]:
    """
    统计与「项目邮件授权时刻」对应的**签署人数**（subject_id 去重）：键为
    (signature_data.witness_staff_auth_at ISO 字符串, witness_staff_id)。
    同一受试者多节点签署多条 SubjectConsent 只计 1 人。
    """
    from collections import defaultdict

    from apps.subject.models import SubjectConsent

    buckets: dict[tuple[str, int], set[int]] = defaultdict(set)
    for subj_id, sd in SubjectConsent.objects.filter(
        icf_version__protocol_id=protocol_id,
        is_deleted=False,
        is_signed=True,
    ).values_list('subject_id', 'signature_data'):
        if not isinstance(sd, dict):
            continue
        auth = (sd.get('witness_staff_auth_at') or '').strip()
        if not auth:
            continue
        try:
            sid_int = int(subj_id)
        except (TypeError, ValueError):
            continue
        sids = sd.get('witness_staff_signature_order_ids')
        wid = sd.get('witness_staff_id')
        if isinstance(sids, list) and sids:
            for x in sids:
                try:
                    buckets[(auth, int(x))].add(sid_int)
                except (TypeError, ValueError):
                    pass
        elif wid is not None:
            try:
                buckets[(auth, int(wid))].add(sid_int)
            except (TypeError, ValueError):
                pass
    return {k: len(v) for k, v in buckets.items()}


def _local_date_in_range(dt, df: Optional[date_type], dt_to: Optional[date_type], tz) -> bool:
    if not dt:
        return True
    d = timezone.localtime(dt, tz).date()
    if df is not None and d < df:
        return False
    if dt_to is not None and d > dt_to:
        return False
    return True


def list_witness_signature_auth_daily_summary_for_protocol(
    protocol_id: int,
    *,
    date_from: Optional[date_type] = None,
    date_to: Optional[date_type] = None,
    status_filter: str = 'all',
    page: int = 1,
    page_size: int = 20,
) -> tuple[int, list[dict]]:
    """
    知情管理 · 授权记录：按授权令牌合并展示，新到旧。

    - 同一工作人员连续多次「同意授权」且尚未产生任何关联知情签署时，合并为一条（取最近一条同意记录代表）。
    - 一旦该次授权已有关联签署记录（签署记录中 witness_staff_auth_at 与该次 signature_auth_at 一致），
      之后再授权则新增一行。
    - 待决策：同一工作人员仅保留最新一封未决策邮件。
    """
    sf = (status_filter or 'all').strip().lower()
    if sf not in ('all', 'complete', 'pending'):
        sf = 'all'
    tz = timezone.get_current_timezone()
    qs = WitnessDualSignAuthToken.objects.filter(protocol_id=protocol_id).select_related('witness_staff').order_by('id')
    rows = list(qs)
    counts_map = _consent_counts_by_witness_auth_key(protocol_id)

    def _auth_iso(t: WitnessDualSignAuthToken) -> str:
        return t.signature_auth_at.isoformat() if t.signature_auth_at else ''

    def _consent_n(t: WitnessDualSignAuthToken) -> int:
        if not t.signature_auth_at:
            return 0
        return int(counts_map.get((_auth_iso(t), t.witness_staff_id), 0))

    agreed_chrono = [
        t
        for t in rows
        if _witness_auth_token_decision(t) == 'agreed' and t.signature_auth_at is not None
    ]
    agreed_chrono.sort(key=lambda t: (t.signature_auth_at, t.pk))

    pending_by_staff: dict[int, WitnessDualSignAuthToken] = {}
    merged_agreed: list[WitnessDualSignAuthToken] = []

    for t in agreed_chrono:
        sid = t.witness_staff_id
        if sid not in pending_by_staff:
            pending_by_staff[sid] = t
            continue
        p = pending_by_staff[sid]
        if _consent_n(p) == 0:
            pending_by_staff[sid] = t
        else:
            merged_agreed.append(p)
            pending_by_staff[sid] = t

    merged_agreed.extend(pending_by_staff.values())

    refused_rows = [t for t in rows if _witness_auth_token_decision(t) == 'refused']

    undecided = [t for t in rows if _witness_auth_token_decision(t) not in ('agreed', 'refused')]
    undecided.sort(key=lambda t: (t.create_time or timezone.now(), t.pk))
    pending_latest_by_staff: dict[int, WitnessDualSignAuthToken] = {}
    for t in undecided:
        pending_latest_by_staff[t.witness_staff_id] = t

    items_full: list[dict] = []

    for t in merged_agreed:
        if not _local_date_in_range(t.signature_auth_at, date_from, date_to, tz):
            continue
        ws = t.witness_staff
        name = (ws.name or '').strip() if ws else ''
        items_full.append(
            {
                'id': t.pk,
                'witness_staff_id': t.witness_staff_id,
                'witness_staff_name': name or None,
                'signature_auth_status': 'agreed',
                'signature_auth_at': _auth_iso(t),
                'mail_sent_at': t.create_time.isoformat() if t.create_time else None,
                'consent_sign_count': _consent_n(t),
            }
        )

    for t in refused_rows:
        sort_anchor = t.signature_auth_at or t.create_time
        if not _local_date_in_range(sort_anchor, date_from, date_to, tz):
            continue
        ws = t.witness_staff
        name = (ws.name or '').strip() if ws else ''
        items_full.append(
            {
                'id': t.pk,
                'witness_staff_id': t.witness_staff_id,
                'witness_staff_name': name or None,
                'signature_auth_status': 'refused',
                'signature_auth_at': _auth_iso(t) if t.signature_auth_at else None,
                'mail_sent_at': t.create_time.isoformat() if t.create_time else None,
                'consent_sign_count': 0,
            }
        )

    for t in pending_latest_by_staff.values():
        if not _local_date_in_range(t.create_time, date_from, date_to, tz):
            continue
        ws = t.witness_staff
        name = (ws.name or '').strip() if ws else ''
        items_full.append(
            {
                'id': t.pk,
                'witness_staff_id': t.witness_staff_id,
                'witness_staff_name': name or None,
                'signature_auth_status': 'pending',
                'signature_auth_at': None,
                'mail_sent_at': t.create_time.isoformat() if t.create_time else None,
                'consent_sign_count': 0,
            }
        )

    def _passes_status(row: dict) -> bool:
        st = (row.get('signature_auth_status') or '').strip().lower()
        if sf == 'all':
            return True
        if sf == 'complete':
            return st == 'agreed'
        if sf == 'pending':
            return st == 'pending'
        return True

    filtered = [r for r in items_full if _passes_status(r)]

    def _sort_key(r: dict) -> tuple:
        iso = r.get('signature_auth_at') or r.get('mail_sent_at') or ''
        try:
            dtp = datetime.fromisoformat(iso.replace('Z', '+00:00'))
            if timezone.is_naive(dtp):
                dtp = timezone.make_aware(dtp, tz)
            ts = -dtp.timestamp()
        except (ValueError, TypeError):
            ts = 0.0
        return (ts, -int(r.get('id') or 0))

    filtered.sort(key=_sort_key)

    total = len(filtered)
    p = max(1, int(page))
    ps = max(1, min(100, int(page_size)))
    start = (p - 1) * ps
    page_items = filtered[start : start + ps]
    return total, page_items
