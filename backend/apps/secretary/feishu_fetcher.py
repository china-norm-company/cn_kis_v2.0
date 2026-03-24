"""
飞书数据直接拉取器

当 feishu-connector 不可用或 personal_context 为空时，
使用存储的 user_access_token 直接调用飞书开放平台 API 拉取数据，
结果写入 t_personal_context，供工作台总览大模型分析使用。

数据来源：
- 邮件（mail/v1）
- 日历事件（calendar/v4）
- IM 聊天消息（im/v1）
- 任务（task/v2）
- 审批（approval/v4）

拉取量可通过环境变量配置：
- FEISHU_MAIL_FETCH_LIMIT（默认 20，飞书邮件接口 page_size 上限 20）
- FEISHU_CALENDAR_FETCH_DAYS（默认 30）
- FEISHU_IM_MAX_CHATS（默认 20）
- FEISHU_IM_MSG_PER_CHAT（默认 20）
"""
import json
import logging
import os
import time
from datetime import datetime, timedelta
from typing import Any, Optional, Dict, List

from django.conf import settings
from django.utils import timezone
from libs.feishu_client import feishu_client, FeishuAPIError
from .models import FeishuUserToken, PersonalContext

logger = logging.getLogger(__name__)


# ============================================================================
# Token 管理：获取并自动刷新 user_access_token
# ============================================================================


# 飞书刷新错误码：用于分类记录，避免静默失败
REFRESH_ERROR_INVALID_TOKEN = 20024
REFRESH_ERROR_SCOPE_OR_AUTH = 99991672


def _refresh_with_candidate_apps(
    refresh_token: str,
    token_record: Optional[FeishuUserToken] = None,
) -> tuple[Optional[Dict], Optional[str]]:
    """
    子衿主授权：优先按 issuer_app_id 刷新，失败再按 FEISHU_REFRESH_FALLBACK_APP_IDS 顺序尝试。
    仅使用白名单应用；对 20024/99991672 分类记录。
    返回 (token_data, used_app_id) 或 (None, None)。
    """
    fallback_ids = getattr(settings, 'FEISHU_REFRESH_FALLBACK_APP_IDS', None) or []
    fallback_ids = [str(x).strip() for x in fallback_ids if x]
    primary_id = getattr(settings, 'FEISHU_PRIMARY_APP_ID', '')
    credentials = getattr(settings, 'FEISHU_APP_CREDENTIALS', {}) or {}
    allowed = set(fallback_ids) if fallback_ids else None

    # 候选顺序：当前签发应用优先，再按兜底白名单；仅允许白名单应用参与刷新
    ordered_app_ids = []
    if token_record and (token_record.issuer_app_id or '').strip():
        ordered_app_ids.append(token_record.issuer_app_id.strip())
    if primary_id and primary_id not in ordered_app_ids:
        ordered_app_ids.append(primary_id)
    for aid in fallback_ids:
        if aid and aid not in ordered_app_ids:
            ordered_app_ids.append(aid)

    for app_id in ordered_app_ids:
        if allowed is not None and app_id not in allowed:
            continue
        app_secret = credentials.get(app_id)
        if not app_id or not app_secret:
            continue
        try:
            data = feishu_client.refresh_user_access_token(
                refresh_token,
                app_id=app_id,
                app_secret=app_secret,
            )
            logger.info(
                'refresh_token 刷新成功 account_id=%s issuer=%s used_app_id=%s',
                token_record.account_id if token_record else '-',
                (token_record.issuer_app_id or '-') if token_record else '-',
                app_id[:16] + '...' if len(app_id) > 16 else app_id,
            )
            return data, app_id
        except FeishuAPIError as e:
            kind = 'invalid_refresh_token' if e.code == REFRESH_ERROR_INVALID_TOKEN else (
                'scope_or_auth' if e.code == REFRESH_ERROR_SCOPE_OR_AUTH else 'other'
            )
            logger.info(
                'refresh_token 刷新失败 account_id=%s app_id=%s code=%s kind=%s msg=%s',
                token_record.account_id if token_record else '-',
                app_id[:16] + '...' if len(app_id) > 16 else app_id,
                e.code,
                kind,
                (e.msg or '')[:80],
            )
            if token_record:
                token_record.last_error_code = str(e.code)
                token_record.save(update_fields=['last_error_code'])
            continue
        except Exception as e:
            logger.info('refresh_token 刷新异常 account_id=%s app_id=%s: %s', token_record.account_id if token_record else '-', app_id[:16] if app_id else '-', e)
            continue
    return None, None

def get_valid_user_token(account_id: int) -> Optional[str]:
    """
    获取有效的 user_access_token

    策略（最大化 token 可用性）：
    - 提前 1 小时主动刷新（pre-expiry refresh），不等过期后才刷
    - refresh_token 剩余有效期 < 7 天时主动刷新以续期（refresh_token 每次刷新都会更新）
    - 刷新失败或无 refresh_token 时返回 None（调用方降级到 tenant_token）
    """
    try:
        token_record = FeishuUserToken.objects.filter(account_id=account_id).first()
    except Exception:
        return None

    if not token_record:
        return None

    now = timezone.now()

    # 有 refresh_token 时，提前 1 小时主动刷新（避免在采集中途 token 过期）
    pre_expiry_buffer = timedelta(hours=1)
    refresh_soon = timedelta(days=7)  # refresh_token 剩余 < 7 天时主动续期

    needs_refresh = False
    if token_record.token_expires_at:
        if now >= (token_record.token_expires_at - pre_expiry_buffer):
            needs_refresh = True  # access_token 已过期或 1 小时内即将过期
    else:
        needs_refresh = True  # 没有过期时间记录，主动刷新

    if not needs_refresh:
        # refresh_token 接近过期时也主动刷新（续期）
        if (token_record.refresh_token
                and token_record.refresh_expires_at
                and now >= (token_record.refresh_expires_at - refresh_soon)):
            needs_refresh = True
            logger.info('账号 %s refresh_token 将在 7 天内过期，主动续期', account_id)

    if not needs_refresh:
        return token_record.access_token

    # 需要刷新
    if not token_record.refresh_token:
        if token_record.token_expires_at and now < token_record.token_expires_at:
            # access_token 实际上还未过期（只是快过期了），仍可使用
            return token_record.access_token
        logger.info('账号 %s 的飞书 token 已过期且无 refresh_token', account_id)
        return None

    # 检查 refresh_token 是否也过期
    if token_record.refresh_expires_at and now >= token_record.refresh_expires_at:
        logger.info('账号 %s 的飞书 refresh_token 已过期，需重新登录', account_id)
        return None

    try:
        new_data, used_app_id = _refresh_with_candidate_apps(token_record.refresh_token, token_record)
        if not new_data:
            logger.warning('账号 %s refresh_token 刷新失败（所有候选应用均不可用）', account_id)
            # 刷新失败但 access_token 还未过期，继续使用
            if token_record.token_expires_at and now < token_record.token_expires_at:
                return token_record.access_token
            return None
        token_record.access_token = new_data['access_token']
        # 强制保存新 refresh_token（飞书每次刷新都会签发新 refresh_token，必须更新以实现滚动续期）
        new_refresh = new_data.get('refresh_token', '')
        if new_refresh:
            token_record.refresh_token = new_refresh
        expires_in = new_data.get('expires_in', 7200)
        refresh_expires_in = new_data.get('refresh_expires_in', 0)
        token_record.token_expires_at = now + timedelta(seconds=expires_in)
        if refresh_expires_in:
            token_record.refresh_expires_at = now + timedelta(seconds=refresh_expires_in)
        elif new_refresh:
            # 没有明确 refresh_expires_in 时，保守估计 30 天
            token_record.refresh_expires_at = now + timedelta(days=30)
        primary_id = getattr(settings, 'FEISHU_PRIMARY_APP_ID', '')
        if used_app_id == primary_id:
            token_record.issuer_app_id = used_app_id
            token_record.issuer_app_name = '子衿'
        token_record.last_error_code = ''
        token_record.save()
        logger.info('账号 %s 飞书 user_access_token 已刷新（pre-expiry refresh）', account_id)
        return token_record.access_token
    except FeishuAPIError as e:
        logger.warning('刷新飞书 user token 失败: %s', e)
        if token_record.token_expires_at and now < token_record.token_expires_at:
            return token_record.access_token
        return None
    except Exception as e:
        logger.warning('刷新飞书 user token 异常: %s', e)
        if token_record.token_expires_at and now < token_record.token_expires_at:
            return token_record.access_token
        return None


# ============================================================================
# 数据拉取与写入
# ============================================================================

def _save_context_items(user_id: str, source_type: str, items: List[Dict]):
    """批量写入 personal_context"""
    from .mail_signal_ingest import upsert_mail_signal_event_from_context

    for item in items:
        try:
            row = PersonalContext.objects.create(
                user_id=user_id,
                source_type=source_type,
                source_id=item.get('source_id', ''),
                summary=item.get('summary', ''),
                raw_content=item.get('raw_content', ''),
                metadata=item.get('metadata', {}),
            )
            if source_type == 'mail':
                upsert_mail_signal_event_from_context(
                    user_id=user_id,
                    source_id=row.source_id,
                    summary=row.summary,
                    raw_content=row.raw_content,
                    metadata=row.metadata,
                    context_id=row.id,
                )
        except Exception as e:
            logger.warning(f'写入 personal_context 失败: {e}')


DEFAULT_MAIL_LIMIT = int(os.environ.get('FEISHU_MAIL_FETCH_LIMIT', '20'))
DEFAULT_CALENDAR_DAYS = int(os.environ.get('FEISHU_CALENDAR_FETCH_DAYS', '30'))
DEFAULT_IM_MAX_CHATS = int(os.environ.get('FEISHU_IM_MAX_CHATS', '20'))
DEFAULT_IM_MSG_PER_CHAT = int(os.environ.get('FEISHU_IM_MSG_PER_CHAT', '20'))

ACCESS_DENIED_CODE = 99991672
INVALID_TOKEN_CODE = 99991668


# ============================================================================
# Tenant Token 回退：当 user_access_token scope 不足时自动切换到应用身份
# ============================================================================

def _get_primary_app_creds() -> tuple[str, str]:
    """获取子衿主授权应用的 app_id 和 app_secret。"""
    primary_id = getattr(settings, 'FEISHU_PRIMARY_APP_ID', '')
    creds = getattr(settings, 'FEISHU_APP_CREDENTIALS', {}) or {}
    primary_secret = creds.get(primary_id, '')
    return primary_id, primary_secret


def _resolve_user_email(open_id: str) -> str:
    """
    获取用户企业邮箱地址，结果缓存到 Account.email。

    路径：user_access_token → /authen/v1/user_info → union_id
         → primary app tenant_token → contact/v3/users/{union_id} → email

    飞书 open_id 是应用级的（cross app 查不到），所以先用 user token 拿 union_id，
    再用 union_id（跨应用通用）查通讯录获取邮箱。
    """
    import httpx
    from apps.identity.models import Account

    account = Account.objects.filter(feishu_open_id=open_id).first()
    if account and account.email:
        return account.email

    # Step 1: 用 user_access_token 获取 union_id
    account_obj = account or Account.objects.filter(feishu_open_id=open_id).first()
    if not account_obj:
        return ''

    token_record = FeishuUserToken.objects.filter(account_id=account_obj.id).first()
    if not token_record:
        return ''

    user_token = get_valid_user_token(account_obj.id)
    if not user_token:
        return ''

    try:
        resp = httpx.get(
            'https://open.feishu.cn/open-apis/authen/v1/user_info',
            headers={'Authorization': f'Bearer {user_token}'},
            timeout=10,
        )
        info = resp.json()
        if info.get('code') != 0:
            logger.warning('获取 user_info 失败: code=%s', info.get('code'))
            return ''
        union_id = info.get('data', {}).get('union_id', '')
        if not union_id:
            logger.warning('user_info 中无 union_id')
            return ''
    except Exception as e:
        logger.warning('获取 user_info 异常: %s', e)
        return ''

    # Step 2: 用 union_id + primary app 的 tenant token 查通讯录
    app_id, app_secret = _get_primary_app_creds()
    if not app_id or not app_secret:
        return ''

    try:
        data = feishu_client._request(
            'GET',
            f'contact/v3/users/{union_id}',
            params={'user_id_type': 'union_id'},
            app_id=app_id,
            app_secret=app_secret,
        )
        user_info = data.get('user', {})
        email = user_info.get('enterprise_email') or user_info.get('email') or ''
        if email and account_obj:
            account_obj.email = email
            account_obj.save(update_fields=['email'])
            logger.info('已获取用户邮箱: %s -> %s (via union_id)', open_id[:20], email)
        return email
    except FeishuAPIError as e:
        logger.warning('通过 union_id 查通讯录失败: %s', e)
        return ''


def _is_scope_denied(e: FeishuAPIError) -> bool:
    """判断错误是否为 scope 不足或 token 无效（需要回退到 tenant token）。

    飞书 API 返回 HTTP 400 时，_user_request 把 HTTP status code (400) 存入 e.code，
    飞书业务码（如 99991672）嵌在 e.msg 的 JSON 中。两者都要检查。
    """
    if e.code in (ACCESS_DENIED_CODE, INVALID_TOKEN_CODE):
        return True
    msg = str(e.msg or '')
    return str(ACCESS_DENIED_CODE) in msg or str(INVALID_TOKEN_CODE) in msg


def _decode_feishu_body(body_html: str) -> str:
    """
    解码飞书邮件正文。

    飞书 mail API 的 body_html 字段使用 URL-safe base64 编码
    （RFC 4648 §5：`-` 代替 `+`，`_` 代替 `/`），而非标准 base64。
    评测（2026-03-15）发现此前使用标准 base64.b64decode 解码失败，
    导致生产环境中所有邮件正文为空/乱码，分类层仅靠 subject 工作。

    改进（2026-03-15 v2）：
    - 新增对多部分 MIME 数据的处理（飞书有时返回原始 MIME 流）
    - 失败时保留可读 ASCII 片段，避免完全丢失内容
    """
    import base64
    import re

    if not body_html:
        return ''

    def _strip_html(text: str) -> str:
        text = re.sub(r'<style[^>]*>.*?</style>', ' ', text, flags=re.S | re.I)
        text = re.sub(r'<script[^>]*>.*?</script>', ' ', text, flags=re.S | re.I)
        text = re.sub(r'<[^>]+>', ' ', text)
        text = re.sub(r'&(?:nbsp|ensp|emsp);', ' ', text)
        text = re.sub(r'&amp;', '&', text)
        text = re.sub(r'&lt;', '<', text)
        text = re.sub(r'&gt;', '>', text)
        text = re.sub(r'&quot;', '"', text)
        text = re.sub(r'&#\d+;', '', text)
        text = re.sub(r'&[a-z]+;', ' ', text)
        return re.sub(r'\s+', ' ', text).strip()

    try:
        # 方法1：URL-safe base64（飞书实际使用的格式）
        fixed = body_html.replace('-', '+').replace('_', '/')
        padding = 4 - len(fixed) % 4
        if padding != 4:
            fixed += '=' * padding
        decoded = base64.b64decode(fixed).decode('utf-8', errors='replace')
        if decoded and len(decoded) > 5:
            text = _strip_html(decoded)
            if text and len(text) > 5:
                return text
    except Exception:
        pass

    try:
        # 方法2：标准 base64（兜底）
        decoded = base64.b64decode(body_html).decode('utf-8', errors='replace')
        if decoded and len(decoded) > 5:
            text = _strip_html(decoded)
            if text and len(text) > 5:
                return text
    except Exception:
        pass

    try:
        # 方法3：已是可读文本（HTML 或纯文本，无需 base64 解码）
        if re.search(r'<[a-zA-Z]', body_html) or len(body_html) > 10:
            # 检查是否含有可打印中文/英文字符
            printable = re.sub(r'[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', '', body_html)
            if len(printable) > 20:
                return _strip_html(printable[:3000])
    except Exception:
        pass

    # 方法4：从乱码中提取可读 ASCII 片段（至少保留 subject 相关内容）
    try:
        ascii_parts = re.findall(r'[\x20-\x7E\u4e00-\u9fff]{8,}', body_html)
        readable = ' '.join(p.strip() for p in ascii_parts if p.strip())[:500]
        if readable:
            return _strip_html(readable)
    except Exception:
        pass

    return ''


def _extract_email_from_text(text: str) -> str:
    """从任意文本中提取首个邮箱地址。"""
    import re
    m = re.search(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', text or '')
    return m.group(0).lower() if m else ''


# 邮件正文存储上限（全量积淀，仅防单封邮件过大）
MAIL_BODY_MAX_LENGTH = 100000


def _parse_address_list(val: Any) -> List[str]:
    """
    从 To/Cc/Bcc 字符串或列表中解析出邮箱地址列表。
    飞书 API 实际字段名为 mail_address（非 address），同时兼容 address/mail_addr。
    """
    import re as _re
    if not val:
        return []
    if isinstance(val, list):
        out = []
        for x in val:
            if isinstance(x, dict):
                addr = (x.get('mail_address') or x.get('address') or x.get('mail_addr') or '').strip()
                if addr:
                    out.append(addr)
            elif isinstance(x, str):
                out.append(x.strip())
        return out
    s = str(val).strip()
    if not s:
        return []
    addrs = _re.findall(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', s)
    return list(dict.fromkeys(addrs))


def _parse_mail_detail(detail: dict, mid: str) -> Optional[dict]:
    """
    从邮件详情中提取标准化数据项。全量积淀：完整正文、to/cc/bcc、附件列表。

    飞书邮件 API 在租户模式下 from.address/from.name 可能为空，
    此时从以下字段按优先级依次尝试提取发件人：
      1. message.from.address / message.from.name
      2. message.sender （某些版本字段名不同）
      3. message.headers 中的 From 行
      4. 解码后正文中的 From: 行（HTML 引用链）
    """
    import re as _re

    msg = detail.get('message', {})
    subject = msg.get('subject', '') or '(无主题)'
    date_str = msg.get('date', '') or msg.get('sent_time', '') or msg.get('internal_date', '') or ''

    # ── 发件人提取（多路 fallback）─────────────────────────────────────────
    sender_email = ''
    sender_name = ''

    # 路径 1：message.head_from（飞书实际字段名）
    from_info = msg.get('head_from') or msg.get('from', {}) or {}
    if isinstance(from_info, dict):
        sender_email = (from_info.get('mail_address') or from_info.get('address') or from_info.get('mail_addr') or '').strip()
        sender_name = (from_info.get('name') or '').strip()
    elif isinstance(from_info, str):
        sender_email = _extract_email_from_text(from_info)
        sender_name = from_info.split('<')[0].strip().strip('"\'')

    # 路径 2：message.sender（兼容）
    if not sender_email:
        sender_info = msg.get('sender', {}) or {}
        if isinstance(sender_info, dict):
            sender_email = (sender_info.get('mail_address') or sender_info.get('address') or sender_info.get('mail_addr') or '').strip()
            sender_name = sender_name or (sender_info.get('name') or '').strip()
        elif isinstance(sender_info, str):
            sender_email = _extract_email_from_text(sender_info)

    # 路径 3：message.headers 列表 [{"name":"From","value":"..."}, ...]
    if not sender_email:
        headers = msg.get('headers', []) or []
        for h in headers:
            if isinstance(h, dict) and h.get('name', '').lower() == 'from':
                val = h.get('value', '')
                m = _re.match(r'["\']?([^<"\']+)["\']?\s*<([^>]+)>', val)
                if m:
                    sender_name = sender_name or m.group(1).strip()
                    sender_email = m.group(2).strip()
                else:
                    sender_email = _extract_email_from_text(val)
                break

    # 路径 4：正文解码后的 From: 引用行（转发/回复链中出现）
    body_html = msg.get('body_html', '') or ''
    body_plain = msg.get('body_plain_text', '') or ''
    body_text = _decode_feishu_body(body_html) or _decode_feishu_body(body_plain)
    if not sender_email and body_text:
        m = _re.search(
            r'From:\s*["\']?([^<"\'\n\r]*?)["\']?\s*<([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>',
            body_text, _re.I
        )
        if m:
            sender_name = sender_name or m.group(1).strip()
            sender_email = m.group(2).strip()
        elif not sender_email:
            # 最后兜底：正文中任意首个邮箱
            sender_email = _extract_email_from_text(body_text)

    sender_name = sender_name or (sender_email.split('@')[0] if sender_email else '')
    # 全量正文积淀，仅设上限防单封过大
    body_full = (body_text or subject).strip()
    if len(body_full) > MAIL_BODY_MAX_LENGTH:
        body_full = body_full[:MAIL_BODY_MAX_LENGTH] + '\n[... 正文过长已截断 ...]'

    # ── To/Cc/Bcc（建立邮件↔联系人关系）────────────────────────────────────
    to_list = _parse_address_list(msg.get('to') or msg.get('to_list'))
    cc_list = _parse_address_list(msg.get('cc') or msg.get('cc_list'))
    bcc_list = _parse_address_list(msg.get('bcc') or msg.get('bcc_list'))
    if not to_list and (msg.get('headers') or []):
        for h in msg.get('headers', []):
            if not isinstance(h, dict):
                continue
            name = (h.get('name') or '').lower()
            val = h.get('value', '')
            if name == 'to':
                to_list = _parse_address_list(val)
            elif name == 'cc':
                cc_list = _parse_address_list(val)
            elif name == 'bcc':
                bcc_list = _parse_address_list(val)

    # ── 附件列表（飞书字段名：filename/id/attachment_type/is_inline/cid）────────
    attachments_raw = msg.get('attachments') or msg.get('attachment_list') or []
    attachment_list = []
    for a in (attachments_raw if isinstance(attachments_raw, list) else []):
        if isinstance(a, dict):
            attachment_list.append({
                'id': a.get('id') or a.get('attachment_id') or a.get('guid', ''),
                'name': a.get('filename') or a.get('name') or a.get('file_name', ''),
                'attachment_type': a.get('attachment_type', 1),
                'is_inline': a.get('is_inline', False),
                'cid': a.get('cid', ''),
            })
        elif isinstance(a, str):
            attachment_list.append({'id': a, 'name': '', 'attachment_type': 1, 'is_inline': False, 'cid': ''})

    if not sender_email and not date_str and subject == '(无主题)' and not body_text:
        return None

    metadata = {
        'sender': f'{sender_name} <{sender_email}>' if sender_name and sender_email else sender_email,
        'sender_name': sender_name,
        'sender_email': sender_email,
        'subject': subject,
        'date': date_str,
        'to': to_list,
        'cc': cc_list,
        'bcc': bcc_list,
        'attachments': attachment_list,
    }
    return {
        'source_id': mid,
        'summary': f'[{sender_name or sender_email}] {subject}',
        'raw_content': body_full or subject,
        'metadata': metadata,
    }


def fetch_mails(user_token: str, user_id: str, limit: int = 0) -> int:
    """
    拉取用户收件箱邮件并写入 personal_context。

    优先使用 user_access_token；如果 scope 不足（99991672）或 token 无效（99991668），
    自动回退到子衿主授权应用的 tenant_access_token + 用户邮箱地址。
    """
    limit = limit or DEFAULT_MAIL_LIMIT
    use_tenant = False

    try:
        data = feishu_client.list_user_mails(user_token, page_size=min(limit, 20))
    except FeishuAPIError as e:
        if _is_scope_denied(e):
            logger.info('邮件 user_token scope 不足，回退到 tenant_access_token: %s', e.code)
            use_tenant = True
        else:
            logger.warning('拉取飞书邮件失败: %s', e)
            return 0
    except Exception as e:
        logger.warning('拉取飞书邮件异常: %s', e)
        return 0

    if use_tenant:
        return _fetch_mails_via_tenant(user_id, limit)

    try:
        mail_ids = data.get('items', [])
        if not mail_ids:
            return 0

        items = []
        for mid in mail_ids[:limit]:
            if not isinstance(mid, str) or not mid.strip():
                continue
            try:
                detail = feishu_client.get_user_mail(user_token, mid)
                item = _parse_mail_detail(detail, mid)
                if item:
                    items.append(item)
            except FeishuAPIError as e:
                logger.warning('获取邮件详情失败 %s: %s', mid[:20], e)
                continue

        _save_context_items(user_id, 'mail', items)
        return len(items)
    except Exception as e:
        logger.warning('拉取飞书邮件异常: %s', e)
        return 0


def _fetch_mails_via_tenant(user_id: str, limit: int) -> int:
    """使用 tenant_access_token 拉取邮件（回退路径）。"""
    email = _resolve_user_email(user_id)
    if not email:
        logger.warning('无法获取用户邮箱，tenant 回退失败 user_id=%s', user_id[:20])
        return 0

    app_id, app_secret = _get_primary_app_creds()
    if not app_id or not app_secret:
        logger.warning('子衿主授权应用凭证不完整，tenant 回退失败')
        return 0

    try:
        data = feishu_client.list_mails_by_address(
            email, page_size=min(limit, 20), app_id=app_id, app_secret=app_secret,
        )
        mail_ids = data.get('items', [])
        if not mail_ids:
            return 0

        items = []
        for mid in mail_ids[:limit]:
            if not isinstance(mid, str) or not mid.strip():
                continue
            try:
                detail = feishu_client.get_mail_by_address(
                    email, mid, app_id=app_id, app_secret=app_secret,
                )
                item = _parse_mail_detail(detail, mid)
                if item:
                    items.append(item)
            except FeishuAPIError as e:
                logger.warning('tenant 获取邮件详情失败 %s: %s', mid[:20], e)
                continue

        _save_context_items(user_id, 'mail', items)
        logger.info('tenant 模式拉取邮件成功: user=%s count=%d', user_id[:20], len(items))
        return len(items)
    except FeishuAPIError as e:
        logger.warning('tenant 拉取邮件失败: %s', e)
        return 0
    except Exception as e:
        logger.warning('tenant 拉取邮件异常: %s', e)
        return 0


def _parse_calendar_event(event: dict) -> dict:
    """从日历事件中提取标准化数据项。全量积淀：完整 description、attendees、recurrence。"""
    summary = event.get('summary', '(无标题)')
    description = event.get('description', '')
    location = event.get('location', {}).get('name', '') if isinstance(event.get('location'), dict) else ''
    start_ts = event.get('start_time', {}).get('timestamp', '')
    end_ts = event.get('end_time', {}).get('timestamp', '')

    start_str = ''
    if start_ts:
        try:
            start_str = datetime.fromtimestamp(int(start_ts)).strftime('%m-%d %H:%M')
        except (ValueError, TypeError):
            start_str = start_ts

    # 参与者列表
    attendees = []
    for a in (event.get('attendees') or []):
        if isinstance(a, dict):
            attendees.append({
                'display_name': a.get('display_name', ''),
                'email': a.get('email', ''),
                'status': a.get('rsvp_status', a.get('status', '')),
                'is_optional': a.get('is_optional', False),
            })

    recurrence = event.get('recurrence', '') or ''
    organizer = event.get('organizer', {})
    organizer_name = organizer.get('display_name', '') if isinstance(organizer, dict) else ''
    visibility = event.get('visibility', '')
    video_meeting = event.get('vchat', {}) or event.get('video_meeting', {}) or {}
    meeting_url = video_meeting.get('meeting_url', '') if isinstance(video_meeting, dict) else ''

    return {
        'source_id': event.get('event_id', ''),
        'summary': f'{start_str} {summary}' + (f' @{location}' if location else ''),
        'raw_content': description or summary,
        'metadata': {
            'summary': summary,
            'start_time': start_ts,
            'end_time': end_ts,
            'location': location,
            'attendees': attendees,
            'recurrence': recurrence,
            'organizer': organizer_name,
            'visibility': visibility,
            'meeting_url': meeting_url,
        },
    }


def fetch_calendar_events(user_token: str, user_id: str, days: int = 0) -> int:
    """
    拉取用户日历事件并写入 personal_context。

    优先 user_access_token；scope 不足时回退 tenant_access_token。
    """
    days = days or DEFAULT_CALENDAR_DAYS
    use_tenant = False

    try:
        now_ts = int(time.time())
        start_time = now_ts - days * 86400
        end_time = now_ts + 7 * 86400

        data = feishu_client.list_user_calendar_events(
            user_token, start_time=start_time, end_time=end_time, page_size=50
        )
        events = data.get('items', [])
        if not events:
            return 0

        items = [_parse_calendar_event(e) for e in events]
        _save_context_items(user_id, 'calendar', items)
        return len(items)
    except FeishuAPIError as e:
        if _is_scope_denied(e):
            logger.info('日历 user_token scope 不足，回退到 tenant: %s', e.code)
            use_tenant = True
        else:
            logger.warning('拉取飞书日历失败: %s', e)
            return 0
    except Exception as e:
        logger.warning('拉取飞书日历异常: %s', e)
        return 0

    if use_tenant:
        return _fetch_calendar_via_tenant(user_id, days)
    return 0


def _fetch_calendar_via_tenant(user_id: str, days: int) -> int:
    """使用 tenant_access_token 拉取日历（回退路径）。"""
    app_id, app_secret = _get_primary_app_creds()
    if not app_id or not app_secret:
        return 0

    try:
        data = feishu_client.list_calendars_by_tenant(app_id=app_id, app_secret=app_secret)
        calendar_list = data.get('calendar_list', [])

        if not calendar_list:
            logger.info('tenant 日历回退：无可用日历')
            return 0

        now_ts = int(time.time())
        start_time = now_ts - days * 86400
        end_time = now_ts + 7 * 86400

        total = 0
        for cal in calendar_list[:3]:
            cal_id = cal.get('calendar_id', '')
            if not cal_id:
                continue
            try:
                events_data = feishu_client._request(
                    'GET',
                    f'calendar/v4/calendars/{cal_id}/events',
                    params={
                        'start_time': str(start_time),
                        'end_time': str(end_time),
                        'page_size': 50,
                    },
                    app_id=app_id,
                    app_secret=app_secret,
                )
                events = events_data.get('items', [])
                items = [_parse_calendar_event(e) for e in events]
                if items:
                    _save_context_items(user_id, 'calendar', items)
                    total += len(items)
            except FeishuAPIError:
                continue
        return total
    except Exception as e:
        logger.warning('tenant 拉取日历异常: %s', e)
        return 0


def fetch_im_messages(user_token: str, user_id: str, max_chats: int = 0, messages_per_chat: int = 0) -> int:
    """
    拉取用户最近聊天消息并写入 personal_context。

    scope 不足时降级为0（IM 不支持 tenant token 按用户拉取）。
    """
    max_chats = max_chats or DEFAULT_IM_MAX_CHATS
    messages_per_chat = messages_per_chat or DEFAULT_IM_MSG_PER_CHAT
    try:
        chats_data = feishu_client.list_user_chats(user_token, page_size=max_chats)
        chat_list = chats_data.get('items', [])
        if not chat_list:
            return 0

        total = 0
        permission_denied = False

        for chat in chat_list[:max_chats]:
            chat_id = chat.get('chat_id', '')
            chat_name = chat.get('name', '') or chat.get('description', '') or '私聊'
            if not chat_id:
                continue

            if permission_denied:
                items = [{
                    'source_id': chat_id,
                    'summary': f'[{chat_name}] (活跃群聊)',
                    'raw_content': f'群聊名称: {chat_name}',
                    'metadata': {
                        'chat_id': chat_id,
                        'chat_name': chat_name,
                        'degraded': True,
                    },
                }]
                _save_context_items(user_id, 'im', items)
                total += 1
                continue

            try:
                msg_data = feishu_client.list_chat_messages(
                    user_token,
                    container_id=chat_id,
                    page_size=messages_per_chat,
                )
                messages = msg_data.get('items', [])
            except FeishuAPIError as e:
                if '230027' in str(e) or 'permission' in str(e).lower():
                    logger.info('IM 消息读取权限不足，降级为聊天列表摘要: %s', e)
                    permission_denied = True
                    items = [{
                        'source_id': chat_id,
                        'summary': f'[{chat_name}] (活跃群聊，消息读取权限待申请)',
                        'raw_content': f'群聊名称: {chat_name}',
                        'metadata': {
                            'chat_id': chat_id,
                            'chat_name': chat_name,
                            'degraded': True,
                            'reason': 'permission_denied',
                        },
                    }]
                    _save_context_items(user_id, 'im', items)
                    total += 1
                    continue
                logger.warning('拉取聊天 %s 消息失败: %s', chat_id[:20], e)
                continue

            items = []
            for msg in messages:
                msg_type = msg.get('msg_type', '')
                sender_info = msg.get('sender', {})
                sender_id = sender_info.get('id', '') if isinstance(sender_info, dict) else ''

                body = msg.get('body', {})
                content = ''
                if isinstance(body, dict):
                    content = body.get('content', '')
                    if content and isinstance(content, str):
                        try:
                            parsed = json.loads(content)
                            if isinstance(parsed, dict):
                                content = parsed.get('text', '') or str(parsed)
                        except (json.JSONDecodeError, TypeError):
                            pass

                if not content and msg_type != 'text':
                    content = f'[{msg_type}消息]'

                items.append({
                    'source_id': msg.get('message_id', ''),
                    'summary': f'[{chat_name}] {content[:100]}',
                    'raw_content': content[:500],
                    'metadata': {
                        'chat_id': chat_id,
                        'chat_name': chat_name,
                        'sender_id': sender_id,
                        'msg_type': msg_type,
                    },
                })

            _save_context_items(user_id, 'im', items)
            total += len(items)

        return total
    except FeishuAPIError as e:
        if _is_scope_denied(e):
            logger.info('IM user_token scope 不足，IM 数据跳过: %s', e.code)
        else:
            logger.warning('拉取飞书IM消息失败: %s', e)
        return 0
    except Exception as e:
        logger.warning('拉取飞书IM消息异常: %s', e)
        return 0


def fetch_tasks(user_token: str, user_id: str) -> int:
    """
    拉取用户任务并写入 personal_context。

    scope 不足时回退到 tenant_access_token。
    """
    try:
        data = feishu_client.list_user_tasks(user_token, page_size=50)
    except FeishuAPIError as e:
        if _is_scope_denied(e):
            logger.info('任务 user_token scope 不足，回退到 tenant: %s', e.code)
            return _fetch_tasks_via_tenant(user_id)
        logger.warning('拉取飞书任务失败: %s', e)
        return 0
    except Exception as e:
        logger.warning('拉取飞书任务异常: %s', e)
        return 0

    return _process_task_data(data, user_id)


def _fetch_tasks_via_tenant(user_id: str) -> int:
    """使用 tenant_access_token 拉取任务（回退路径）。"""
    app_id, app_secret = _get_primary_app_creds()
    if not app_id or not app_secret:
        return 0

    try:
        data = feishu_client._request(
            'GET',
            'task/v2/tasks',
            params={'page_size': 50, 'user_id_type': 'open_id'},
            app_id=app_id,
            app_secret=app_secret,
        )
        return _process_task_data(data, user_id)
    except FeishuAPIError as e:
        logger.warning('tenant 拉取任务失败: %s', e)
        return 0


def _process_task_data(data: dict, user_id: str) -> int:
    """处理任务数据并写入 personal_context。"""
    task_list = data.get('items', [])
    if not task_list:
        return 0

    items = []
    for task in task_list:
        summary = task.get('summary', '') or task.get('title', '')
        due = task.get('due', {})
        due_str = ''
        if due and isinstance(due, dict):
            ts = due.get('timestamp', '')
            if ts:
                try:
                    due_str = datetime.fromtimestamp(int(ts)).strftime('%m-%d %H:%M')
                except (ValueError, TypeError):
                    due_str = ts

        completed = task.get('completed_at', '') or ''
        status_label = '已完成' if completed else '进行中'

        items.append({
            'source_id': task.get('task_id', '') or task.get('guid', ''),
            'summary': f'[{status_label}] {summary}' + (f' 截止{due_str}' if due_str else ''),
            'raw_content': task.get('description', '') or summary,
            'metadata': {
                'summary': summary,
                'due': due_str,
                'status': status_label,
            },
        })

    _save_context_items(user_id, 'task', items)
    return len(items)


def fetch_approvals(user_token: str, user_id: str, limit: int = 50) -> int:
    """
    拉取用户审批实例并写入 personal_context。

    优先 user_access_token；如果不支持（99991668）或 scope 不足，
    回退到 tenant_access_token 查询。
    """
    try:
        data = feishu_client._user_request(
            'GET',
            'approval/v4/instances',
            user_token,
            params={'page_size': min(limit, 50)},
        )
    except FeishuAPIError as e:
        if _is_scope_denied(e) or 'not support' in str(e).lower():
            logger.info('审批 user_token 不支持，回退到 tenant: %s', e.code)
            return _fetch_approvals_via_tenant(user_id, limit)
        logger.warning('拉取飞书审批失败: %s', e)
        return 0
    except Exception as e:
        logger.warning('拉取飞书审批异常: %s', e)
        return 0

    return _process_approval_data(data, user_id, limit)


def _fetch_approvals_via_tenant(user_id: str, limit: int) -> int:
    """使用 tenant_access_token 拉取审批（回退路径）。"""
    app_id, app_secret = _get_primary_app_creds()
    if not app_id or not app_secret:
        return 0

    try:
        data = feishu_client._request(
            'GET',
            'approval/v4/instances',
            params={'page_size': min(limit, 50)},
            app_id=app_id,
            app_secret=app_secret,
        )
        return _process_approval_data(data, user_id, limit)
    except FeishuAPIError as e:
        logger.warning('tenant 拉取审批失败: %s', e)
        return 0


def _process_approval_data(data: dict, user_id: str, limit: int) -> int:
    """处理审批数据并写入 personal_context。"""
    instances = data.get('items') or data.get('instance_list') or []
    if not instances:
        return 0

    items = []
    for inst in instances[:limit]:
        if not isinstance(inst, dict):
            continue
        inst_code = inst.get('instance_code') or inst.get('approval_code') or ''
        status = inst.get('status') or ''
        title = inst.get('title') or inst.get('approval_name') or f'审批 {inst_code}'
        items.append({
            'source_id': inst_code,
            'summary': f'[{status}] {title}',
            'raw_content': json.dumps(inst, ensure_ascii=False, default=str)[:500],
            'metadata': {
                'instance_code': inst_code,
                'status': status,
                'title': title,
            },
        })

    _save_context_items(user_id, 'approval', items)
    return len(items)


# ============================================================================
# 全量历史采集（彻底修复所有数据源的分页穷举问题）
# ============================================================================

# 所有邮件文件夹（采集全部，不只是 INBOX）
# UNREAD 文件夹在 tenant_token 模式（list_mails_by_address）下不支持，
# 但用 user_token 的 list_user_mails 是支持的。
# 通过两套列表分别控制，避免 tenant 模式报 500。
MAIL_FOLDERS_ALL = ['INBOX', 'SENT', 'TRASH', 'UNREAD']
MAIL_FOLDERS_TENANT = ['INBOX', 'SENT', 'TRASH']  # tenant_token 不支持 UNREAD


def _safe_attachment_filename(name: str, attachment_id: str, index: int) -> str:
    """生成安全文件名，避免路径注入与重复（去除 ..、/、\\ 等）。"""
    import re
    if not name or not name.strip():
        name = f'attachment_{index}'
    name = name.replace('..', '').replace('/', '_').replace('\\', '_')
    name = re.sub(r'[^\w\u4e00-\u9fff.\- ]', '_', name)[:200].strip() or f'attachment_{index}'
    if not name:
        name = f'attachment_{index}'
    return name


def _download_and_save_mail_attachments(
    user_id: str,
    message_id: str,
    attachment_list: List[Dict],
    mail_meta: Dict,
    user_token: str = '',
    use_tenant: bool = False,
    email: str = '',
    app_id: str = '',
    app_secret: str = '',
) -> List[Dict]:
    """
    尝试下载邮件附件并落盘，建立附件与邮件/主题/联系人的关系。
    返回带 local_path 的附件列表；并写入 PersonalContext（source_type=mail_attachment）便于关联查询。
    """
    from pathlib import Path
    updated = []
    for i, att in enumerate(attachment_list):
        att_id = (att.get('id') or att.get('attachment_id') or '').strip()
        if not att_id:
            updated.append(att)
            continue
        att_name = att.get('name') or att.get('file_name', '') or ''
        try:
            if use_tenant and email and app_id and app_secret:
                raw = feishu_client.download_mail_attachment_by_address(
                    email, message_id, att_id, app_id=app_id, app_secret=app_secret,
                )
            elif user_token:
                raw = feishu_client.download_user_mail_attachment(user_token, message_id, att_id)
            else:
                raw = None
        except Exception as e:
            logger.debug('邮件附件下载失败 %s/%s: %s', message_id[:20], att_id[:20], e)
            raw = None
        out = dict(att)
        rel_path = ''
        if raw:
            try:
                media_root = getattr(settings, 'MEDIA_ROOT', None) or ''
                if not media_root or not Path(media_root).exists():
                    logger.debug('MEDIA_ROOT 未配置或目录不存在，跳过附件落盘')
                else:
                    base = Path(media_root) / 'feishu_files' / 'mail_attachments' / user_id / message_id
                    base.mkdir(parents=True, exist_ok=True)
                    fname = _safe_attachment_filename(att_name, att_id, i)
                    fpath = base / fname
                    fpath.write_bytes(raw)
                    rel_path = f'feishu_files/mail_attachments/{user_id}/{message_id}/{fname}'
                    out['local_path'] = rel_path
            except OSError as e:
                logger.warning('邮件附件落盘失败(路径/权限): %s', e)
            except Exception as e:
                logger.warning('邮件附件落盘失败 %s: %s', att_id[:20] if att_id else '?', e)
        updated.append(out)
        # 每条附件一条 PersonalContext，建立与邮件/主题/联系人的关系
        try:
            source_id_attach = f'{message_id}|{att_id}'
            if PersonalContext.objects.filter(
                user_id=user_id, source_type='mail_attachment', source_id=source_id_attach,
            ).exists():
                continue
            # raw_content 填充附件摘要信息（让 process_pending_contexts 不过滤掉此条）
            attach_raw_content = (
                f'邮件附件: {att_name or att_id}\n'
                f'邮件主题: {mail_meta.get("subject", "")}\n'
                f'发件人: {mail_meta.get("sender", "")}\n'
                f'文件大小: {att.get("size", 0)} bytes\n'
                f'本地路径: {out.get("local_path", "（未落盘）")}'
            )
            PersonalContext.objects.create(
                user_id=user_id,
                source_type='mail_attachment',
                source_id=source_id_attach,
                summary=f"[附件] {mail_meta.get('subject', '')} — {att_name or att_id}",
                raw_content=attach_raw_content,
                metadata={
                    'mail_source_id': message_id,
                    'subject': mail_meta.get('subject', ''),
                    'sender': mail_meta.get('sender', ''),
                    'sender_email': mail_meta.get('sender_email', ''),
                    'to': mail_meta.get('to', []),
                    'cc': mail_meta.get('cc', []),
                    'attachment_id': att_id,
                    'attachment_name': att_name,
                    'file_size': att.get('size', 0),
                    'local_path': out.get('local_path', ''),
                },
            )
        except Exception as e:
            logger.debug('邮件附件关系写入失败: %s', e)
    return updated


def _save_context_items_idempotent(user_id: str, source_type: str, items: List[Dict]) -> int:
    """
    幂等版写入：按 (user_id, source_type, source_id) 去重。
    写入前过滤明显个人/噪音（广告、对账单、验证码/注册/账户类），其余全部积淀。
    已存在则跳过，不存在才写入。同时触发 mail_signal_ingest（邮件）。
    返回实际新写入数量。
    """
    from .mail_signal_ingest import upsert_mail_signal_event_from_context
    from .feishu_collection_filters import filter_personal_noise

    items = filter_personal_noise(source_type, items)
    written = 0
    for item in items:
        source_id = item.get('source_id', '')
        if not source_id:
            continue
        try:
            existing = PersonalContext.objects.filter(
                user_id=user_id,
                source_type=source_type,
                source_id=source_id,
            ).first()
            if existing:
                is_shell = (
                    not existing.metadata.get('date')
                    and not existing.metadata.get('sender_email')
                    and existing.metadata.get('subject') in ('(无主题)', '', None)
                )
                if is_shell and item.get('metadata', {}).get('date'):
                    existing.summary = item.get('summary', '')
                    existing.raw_content = item.get('raw_content', '')
                    existing.metadata = item.get('metadata', {})
                    existing.save(update_fields=['summary', 'raw_content', 'metadata', 'updated_at'])
                    written += 1
                continue
            row = PersonalContext.objects.create(
                user_id=user_id,
                source_type=source_type,
                source_id=source_id,
                summary=item.get('summary', ''),
                raw_content=item.get('raw_content', ''),
                metadata=item.get('metadata', {}),
            )
            written += 1
            if source_type == 'mail':
                try:
                    upsert_mail_signal_event_from_context(
                        user_id=user_id,
                        source_id=row.source_id,
                        summary=row.summary,
                        raw_content=row.raw_content,
                        metadata=row.metadata,
                        context_id=row.id,
                    )
                except Exception:
                    pass
        except Exception as e:
            logger.warning('幂等写入失败 %s/%s: %s', source_type, source_id[:20], e)
    return written


def _paginate_mail_folder(
    user_id: str,
    folder_id: str,
    user_token: str = '',
    email: str = '',
    app_id: str = '',
    app_secret: str = '',
    checkpoint=None,
    page_delay: float = 0.3,
    lookback_cutoff_ts: float = 0,
) -> int:
    """
    对单个邮件文件夹进行分页穷举，返回新写入数量。
    lookback_cutoff_ts: Unix 时间戳（秒），若邮件 date < cutoff 则提前停止翻页（增量模式优化）。
    """
    use_tenant = bool(email and not user_token)
    page_token = None
    if checkpoint and folder_id == 'INBOX':
        page_token = checkpoint.page_token or None

    total = 0
    while True:
        try:
            if use_tenant:
                data = feishu_client.list_mails_by_address(
                    email, page_size=20, page_token=page_token, folder_id=folder_id,
                    app_id=app_id, app_secret=app_secret,
                )
            else:
                data = feishu_client.list_user_mails(
                    user_token, page_size=20, page_token=page_token, folder_id=folder_id,
                )
        except FeishuAPIError as e:
            logger.warning('邮件文件夹 %s 获取失败: %s', folder_id, e)
            break
        except Exception as e:
            logger.warning('邮件文件夹 %s 异常: %s', folder_id, e)
            break

        mail_ids = data.get('items', [])
        items = []
        page_all_old = bool(lookback_cutoff_ts)  # 先假设整页都是旧邮件，有一封新的就翻转
        for mid in mail_ids:
            if not isinstance(mid, str) or not mid.strip():
                continue
            try:
                if use_tenant:
                    detail = feishu_client.get_mail_by_address(email, mid, app_id=app_id, app_secret=app_secret)
                else:
                    detail = feishu_client.get_user_mail(user_token, mid)
                item = _parse_mail_detail(detail, mid)
                if item:
                    # 标记文件夹来源
                    item['metadata']['folder'] = folder_id
                    # 增量模式：检查邮件日期，若早于截止时间则跳过但继续判断（API 按时间倒序）
                    if lookback_cutoff_ts:
                        mail_date = item['metadata'].get('date', '') or ''
                        if mail_date:
                            try:
                                import email.utils as _eu
                                mail_ts = _eu.parsedate_to_datetime(mail_date).timestamp()
                                if mail_ts >= lookback_cutoff_ts:
                                    page_all_old = False  # 有新邮件，不能提前停止
                            except Exception:
                                page_all_old = False  # 解析失败，保守处理不停止
                        else:
                            page_all_old = False
                    # 附件列表来自详情 API 的 attachments 字段（需 mail:user_mailbox.message.body:read 权限）
                    attach_list = (item.get('metadata') or {}).get('attachments') or []
                    if attach_list:
                        item['metadata']['attachments'] = _download_and_save_mail_attachments(
                            user_id=user_id,
                            message_id=mid,
                            attachment_list=attach_list,
                            mail_meta=item['metadata'],
                            user_token=user_token,
                            use_tenant=use_tenant,
                            email=email,
                            app_id=app_id,
                            app_secret=app_secret,
                        )
                    items.append(item)
            except FeishuAPIError as e:
                logger.debug('获取邮件详情失败 %s: %s', mid[:20], e)
                page_all_old = False
            except Exception as e:
                logger.debug('获取邮件详情异常 %s: %s', mid[:20], e)
                page_all_old = False

        written = _save_context_items_idempotent(user_id, 'mail', items)
        total += written

        new_page_token = data.get('page_token', '')
        if checkpoint and folder_id == 'INBOX':
            checkpoint.page_token = new_page_token or ''
            checkpoint.total_fetched = (checkpoint.total_fetched or 0) + len(mail_ids)
            checkpoint.total_deposited = (checkpoint.total_deposited or 0) + written
            checkpoint.save(update_fields=['page_token', 'total_fetched', 'total_deposited', 'updated_at'])

        # 增量模式早退：整页邮件都早于截止时间，不再翻下一页
        if lookback_cutoff_ts and page_all_old and mail_ids:
            logger.info('邮件文件夹 %s 增量早退：当前页全部早于截止时间，停止翻页', folder_id)
            break

        if not data.get('has_more', False) or not new_page_token:
            break
        page_token = new_page_token
        time.sleep(page_delay)

    return total


def fetch_mails_full_history(
    user_token: str,
    user_id: str,
    checkpoint=None,
    page_delay: float = 0.3,
    folders: List[str] = None,
    lookback_days: int = 3650,
) -> int:
    """
    全量/增量历史邮件采集：
    - 遍历所有文件夹（INBOX、SENT、TRASH、UNREAD）
    - 每个文件夹分页穷举直到 has_more=False
    - lookback_days < 3650 时，遇到整页旧邮件提前停止翻页（增量优化）
    - 幂等写入，不产生重复记录
    """
    if folders is None:
        folders = MAIL_FOLDERS_ALL

    # 增量模式截止时间戳
    import time as _time
    lookback_cutoff_ts = (
        _time.time() - lookback_days * 86400
        if lookback_days < 3650 else 0
    )

    use_tenant = False
    email = ''
    app_id = app_secret = ''

    # 检测认证方式
    if user_token and user_token.strip():
        try:
            feishu_client.list_user_mails(user_token, page_size=1)
        except FeishuAPIError as e:
            if _is_scope_denied(e):
                use_tenant = True
                logger.info('邮件采集降级到 tenant_token: %s', user_id[:20])
            else:
                use_tenant = True
                logger.info('邮件采集 user_token 失败，降级 tenant: %s %s', user_id[:20], e.code)
    else:
        use_tenant = True

    if use_tenant:
        # tenant_token 模式不支持 UNREAD 文件夹，自动降级到支持列表
        folders = [f for f in folders if f in MAIL_FOLDERS_TENANT]
        email = _resolve_user_email(user_id)
        if not email:
            logger.warning('邮件采集：无可用 token 且无邮箱地址，跳过 %s', user_id[:20])
            return 0
        app_id, app_secret = _get_primary_app_creds()
        if not app_id:
            logger.warning('邮件采集：tenant 凭证不完整，跳过 %s', user_id[:20])
            return 0
        user_token = ''  # 确保走 tenant 路径

    total = 0
    for folder in folders:
        logger.info('采集邮件文件夹 %s: user=%s lookback=%s天',
                    folder, user_id[:20], lookback_days if lookback_days < 3650 else '全量')
        count = _paginate_mail_folder(
            user_id=user_id,
            folder_id=folder,
            user_token=user_token,
            email=email,
            app_id=app_id,
            app_secret=app_secret,
            checkpoint=checkpoint if folder == 'INBOX' else None,
            page_delay=page_delay,
            lookback_cutoff_ts=lookback_cutoff_ts,
        )
        total += count
        if count > 0:
            logger.info('  [%s] 新写入 %d 封', folder, count)

    return total


def fetch_im_full_history(
    user_token: str,
    user_id: str,
    checkpoint=None,
    page_delay: float = 0.3,
    lookback_days: int = 3650,
    account_id: int = 0,
) -> int:
    """
    全量/增量 IM 消息采集：
    - 翻页枚举所有群聊（list_user_chats 支持 page_token）
    - 每个群聊用 get_group_messages 拉取消息
    - lookback_days < 3650 时为增量模式：只拉取最近 N 天消息（大幅提速）
    - lookback_days = 3650（默认）时为全量模式：不设时间限制
    - 每处理 50 个群聊自动刷新 token（防止 2h 采集中途 401）
    """
    if not user_token:
        return 0

    # 计算 start_time：增量模式用时间窗口，全量模式不限制
    import time as _time
    if lookback_days < 3650:
        start_ts: Optional[int] = int(_time.time() - lookback_days * 86400)
    else:
        start_ts = None  # 全量模式：不设时间限制（飞书 API 默认从最新往前）

    # Step 1: 枚举所有群聊（翻页）
    all_chats = []
    page_token = checkpoint.page_token if checkpoint else None
    while True:
        try:
            data = feishu_client.list_user_chats(
                user_token, page_size=100, page_token=page_token or None,
            )
        except FeishuAPIError as e:
            logger.warning('获取群聊列表失败: %s', e)
            break
        except Exception as e:
            logger.warning('获取群聊列表异常: %s', e)
            break

        chats = data.get('items', [])
        all_chats.extend(chats)

        new_page_token = data.get('page_token', '')
        if not data.get('has_more', False) or not new_page_token:
            break
        page_token = new_page_token
        time.sleep(0.3)

    logger.info('IM 采集：%s 共 %d 个群聊 lookback=%s天', user_id[:20], len(all_chats),
                lookback_days if lookback_days < 3650 else '全量')

    # Step 2: 对每个群聊拉取消息（增量：只拉 lookback_days 内；全量：拉全部）
    total = 0
    for idx, chat in enumerate(all_chats):
        chat_id = chat.get('chat_id', '')
        chat_name = chat.get('name', '') or chat.get('description', '') or chat_id[:10]
        if not chat_id:
            continue

        # 每 50 个群聊刷新一次 token，防止长时间采集中途 401
        if idx > 0 and idx % 50 == 0 and account_id:
            fresh_token = get_valid_user_token(account_id)
            if fresh_token:
                user_token = fresh_token
                logger.info('IM 采集：已刷新 token（第 %d 个群聊）', idx)
            else:
                logger.warning('IM 采集：token 刷新失败，继续使用旧 token（第 %d 个群聊）', idx)

        try:
            messages = feishu_client.get_group_messages(
                group_id=chat_id,
                start_time=start_ts,  # None=全量历史；int=只拉 lookback_days 内
                page_size=50,
                user_access_token=user_token,
            )
        except FeishuAPIError as e:
            if '230027' in str(e) or 'permission' in str(e).lower():
                # 无权限，至少记录群聊元数据
                _save_context_items_idempotent(user_id, 'im', [{
                    'source_id': chat_id,
                    'summary': f'[{chat_name}] 群聊元数据（无消息权限）',
                    'raw_content': f'群聊: {chat_name}',
                    'metadata': {'chat_id': chat_id, 'chat_name': chat_name, 'no_msg_permission': True},
                }])
            else:
                logger.warning('群聊 %s 消息获取失败: %s', chat_name, e)
            continue
        except Exception as e:
            logger.warning('群聊 %s 消息获取异常: %s', chat_name, e)
            continue

        items = []
        for msg in messages:
            msg_id = msg.get('message_id', '')
            if not msg_id:
                continue
            msg_type = msg.get('msg_type', 'text')
            body = msg.get('body', {})
            content = ''
            file_info = {}
            if isinstance(body, dict):
                raw_content_str = body.get('content', '')
                if raw_content_str:
                    try:
                        import json as _json
                        parsed = _json.loads(raw_content_str)
                        if msg_type == 'text':
                            content = parsed.get('text', '') or str(parsed)
                        elif msg_type == 'post':
                            # 富文本：提取所有文本段落
                            title = parsed.get('title', '')
                            lines = []
                            if title:
                                lines.append(title)
                            for lang_content in (parsed.get('content') or parsed.values()):
                                if isinstance(lang_content, list):
                                    for paragraph in lang_content:
                                        if isinstance(paragraph, list):
                                            for seg in paragraph:
                                                if isinstance(seg, dict):
                                                    tag = seg.get('tag', '')
                                                    if tag == 'text':
                                                        lines.append(seg.get('text', ''))
                                                    elif tag == 'a':
                                                        lines.append(f"{seg.get('text', '')} ({seg.get('href', '')})")
                                                    elif tag == 'at':
                                                        lines.append(f"@{seg.get('user_name', seg.get('user_id', ''))}")
                                                    elif tag == 'img':
                                                        file_info['image_key'] = seg.get('image_key', '')
                                                        lines.append('[图片]')
                                    break
                            content = '\n'.join(lines) if lines else str(parsed)
                        elif msg_type in ('image', 'sticker'):
                            content = f'[{msg_type}]'
                            file_info['image_key'] = parsed.get('image_key', '')
                        elif msg_type == 'file':
                            content = f"[文件] {parsed.get('file_name', '')}"
                            file_info = {'file_key': parsed.get('file_key', ''), 'file_name': parsed.get('file_name', '')}
                        elif msg_type == 'audio':
                            content = '[语音]'
                            file_info['file_key'] = parsed.get('file_key', '')
                        elif msg_type == 'media':
                            content = f"[视频] {parsed.get('file_name', '')}"
                            file_info = {'file_key': parsed.get('file_key', ''), 'image_key': parsed.get('image_key', '')}
                        elif msg_type == 'share_chat':
                            content = f"[分享群聊] {parsed.get('chat_id', '')}"
                        elif msg_type == 'share_user':
                            content = f"[分享用户] {parsed.get('user_id', '')}"
                        elif msg_type in ('merge_forward', 'system'):
                            content = str(parsed)[:2000]
                        elif msg_type == 'interactive':
                            content = str(parsed)[:2000]
                        else:
                            content = parsed.get('text', '') or str(parsed)
                    except Exception:
                        content = raw_content_str
            if not content:
                content = f'[{msg_type}]'

            sender = msg.get('sender', {})
            sender_id = sender.get('id', '') if isinstance(sender, dict) else ''
            sender_type = sender.get('sender_type', '') if isinstance(sender, dict) else ''
            create_time = msg.get('create_time', '')
            parent_id = msg.get('parent_id', '') or msg.get('root_id', '')
            mentions = msg.get('mentions') or []
            mention_ids = [m.get('id', '') for m in mentions if isinstance(m, dict)] if mentions else []

            meta = {
                'chat_id': chat_id,
                'chat_name': chat_name,
                'sender_id': sender_id,
                'sender_type': sender_type,
                'msg_type': msg_type,
                'create_time': create_time,
            }
            if parent_id:
                meta['parent_id'] = parent_id
            if mention_ids:
                meta['mentions'] = mention_ids
            if file_info:
                meta['file_info'] = file_info

            items.append({
                'source_id': msg_id,
                'summary': f'[{chat_name}] {content[:80]}',
                'raw_content': content[:50000],
                'metadata': meta,
            })

        written = _save_context_items_idempotent(user_id, 'im', items)
        total += written
        if written > 0:
            logger.info('  IM [%s]: 新写入 %d 条', chat_name[:20], written)
        time.sleep(page_delay)

    return total


def fetch_calendar_full_history(
    user_token: str,
    user_id: str,
    lookback_days: int = 3650,
    checkpoint=None,
    page_delay: float = 0.3,
) -> int:
    """
    全量历史日历采集：
    - 枚举所有日历（含共享日历），不只是主日历
    - 每个日历翻页穷举
    - start_time 设为 3650 天前
    """
    if not user_token:
        return 0

    now_ts = int(time.time())
    start_time = now_ts - lookback_days * 86400
    end_time = now_ts + 365 * 86400  # 未来 1 年

    # 获取所有日历
    all_calendars = []
    try:
        data = feishu_client._user_request(
            'GET', 'calendar/v4/calendars', user_token,
            params={'page_size': 50},
        )
        all_calendars = data.get('calendar_list', [])
    except Exception as e:
        logger.warning('获取日历列表失败: %s', e)
        return 0

    logger.info('日历采集：%s 共 %d 个日历', user_id[:20], len(all_calendars))

    total = 0
    for cal in all_calendars:
        cal_id = cal.get('calendar', {}).get('calendar_id', '') if 'calendar' in cal else cal.get('calendar_id', '')
        cal_type = cal.get('calendar', {}).get('type', '') if 'calendar' in cal else cal.get('type', '')
        cal_summary = cal.get('calendar', {}).get('summary', '') if 'calendar' in cal else cal.get('summary', cal_id)

        if not cal_id:
            continue

        # 跳过节假日等只读系统日历（减少无用数据）
        if cal_type in ('birthday', 'holiday'):
            continue

        page_token = None
        while True:
            try:
                params = {
                    'start_time': str(start_time),
                    'end_time': str(end_time),
                    'page_size': 50,
                }
                if page_token:
                    params['page_token'] = page_token
                events_data = feishu_client._user_request(
                    'GET', f'calendar/v4/calendars/{cal_id}/events',
                    user_token, params=params,
                )
            except Exception as e:
                logger.warning('日历 %s 事件获取失败: %s', cal_summary, e)
                break

            events = events_data.get('items', [])
            items = [_parse_calendar_event(e) for e in events]
            written = _save_context_items_idempotent(user_id, 'calendar', items)
            total += written

            new_pt = events_data.get('page_token', '')
            if not events_data.get('has_more', False) or not new_pt:
                break
            page_token = new_pt
            time.sleep(page_delay)

    return total


def fetch_tasks_full_history(
    user_token: str,
    user_id: str,
    checkpoint=None,
    page_delay: float = 0.3,
) -> int:
    """
    全量历史任务采集：利用 list_user_tasks 的 page_token 翻页能力穷举全部任务。
    """
    if not user_token:
        return 0

    page_token = checkpoint.page_token if checkpoint else None
    total = 0

    while True:
        try:
            data = feishu_client.list_user_tasks(
                user_token, page_size=50, page_token=page_token or None,
            )
        except FeishuAPIError as e:
            if _is_scope_denied(e):
                logger.info('任务采集 scope 不足，跳过 %s', user_id[:20])
            else:
                logger.warning('任务采集失败 %s: %s', user_id[:20], e)
            break
        except Exception as e:
            logger.warning('任务采集异常 %s: %s', user_id[:20], e)
            break

        tasks = data.get('items', [])
        items = []
        for task in tasks:
            task_id = task.get('guid', task.get('id', ''))
            if not task_id:
                continue
            summary = task.get('summary', '(无标题)')
            desc = task.get('description', '')
            due = task.get('due', {})
            due_ts = due.get('timestamp', '') if isinstance(due, dict) else ''
            # 执行人/协作者
            members = []
            for m in (task.get('members') or task.get('collaborators') or []):
                if isinstance(m, dict):
                    members.append({'id': m.get('id', ''), 'role': m.get('role', '')})
            creator = task.get('creator', {})
            creator_id = creator.get('id', '') if isinstance(creator, dict) else ''
            completed_at = task.get('completed_at', '') or ''
            items.append({
                'source_id': task_id,
                'summary': f'[任务] {summary}',
                'raw_content': f'{summary}\n{desc}'.strip(),
                'metadata': {
                    'task_id': task_id,
                    'due': due_ts,
                    'status': task.get('status', ''),
                    'creator_id': creator_id,
                    'members': members,
                    'completed_at': completed_at,
                },
            })

        written = _save_context_items_idempotent(user_id, 'task', items)
        total += written

        new_pt = data.get('page_token', '')
        if checkpoint:
            checkpoint.page_token = new_pt or ''
            checkpoint.total_fetched = (checkpoint.total_fetched or 0) + len(tasks)
            checkpoint.total_deposited = (checkpoint.total_deposited or 0) + written
            checkpoint.save(update_fields=['page_token', 'total_fetched', 'total_deposited', 'updated_at'])

        if not data.get('has_more', False) or not new_pt:
            break
        page_token = new_pt
        time.sleep(page_delay)

    return total


def fetch_approvals_full_history(
    user_token: str,
    user_id: str,
    checkpoint=None,
    page_delay: float = 0.3,
) -> int:
    """
    全量历史审批采集：翻页穷举全部审批实例。
    优先 user_token，失败时用 tenant_token。
    """
    page_token = checkpoint.page_token if checkpoint else None
    total = 0
    use_tenant = not user_token

    def _do_request(pt):
        params = {'page_size': 50}
        if pt:
            params['page_token'] = pt
        if use_tenant:
            # tenant 模式：approval/v4/instances 必须至少指定 approval_code
            # 或 user_id，但无 approval_code 时 user_id 也可能因字段校验失败。
            # 实际上 approval/v4/instances 是"查询指定审批定义下的实例"，
            # 不传 approval_code 会报 99992402（field validation failed）。
            # 这里改为：只传 user_id + user_id_type 并捕获 99992402 后降级为空。
            if user_id and user_id != '__TENANT__':
                params['user_id'] = user_id
                params['user_id_type'] = 'open_id'
            return feishu_client._request('GET', 'approval/v4/instances', params=params)
        return feishu_client._user_request(
            'GET', 'approval/v4/instances', user_token, params=params,
        )

    # 检测 user_token 是否可用
    if user_token:
        try:
            _do_request(None)
        except FeishuAPIError as e:
            if _is_scope_denied(e):
                use_tenant = True
            elif getattr(e, 'code', 0) == 99992402:
                logger.warning(
                    '审批采集：%s user_token 权限不足（99992402），'
                    'tenant 模式也无法按用户查询（需 approval_code），跳过', user_id[:20]
                )
                return 0
            else:
                logger.warning('审批采集失败 %s: %s', user_id[:20], e)
                return 0
        except Exception:
            use_tenant = True

    # tenant 模式下，approval/v4/instances 必须传 approval_code 才能返回数据
    # 无 approval_code 时必然报 99992402，此时只能跳过，记录 warning
    if use_tenant and not user_token:
        logger.warning(
            '审批采集：%s 无 user_token，tenant 模式下 approval/v4/instances '
            '无 approval_code 不支持按用户查询，跳过（建议确保该用户完成飞书授权）',
            user_id[:20]
        )
        return 0

    while True:
        try:
            data = _do_request(page_token)
        except FeishuAPIError as e:
            if getattr(e, 'code', 0) == 99992402:
                logger.info('审批采集：%s 无 approval_code 不支持按 user 查询，跳过', user_id[:20])
            else:
                logger.warning('审批分页失败: %s', e)
            break
        except Exception as e:
            logger.warning('审批分页失败: %s', e)
            break

        instances = data.get('items', data.get('instance_list', []))
        items = []
        for inst in instances:
            if not isinstance(inst, dict):
                continue
            inst_code = inst.get('instance_code', inst.get('approval_code', ''))
            if not inst_code:
                continue
            status = inst.get('status', '')
            title = inst.get('title', inst.get('approval_name', f'审批 {inst_code}'))
            import json as _json
            # 拉取完整审批详情（form 表单 + 审批流）
            full_detail = inst
            try:
                detail_data = feishu_client.get_approval_instance(inst_code)
                if detail_data:
                    full_detail = detail_data
                    title = detail_data.get('title', title) or title
                    status = detail_data.get('status', status) or status
            except Exception:
                pass
            raw = _json.dumps(full_detail, ensure_ascii=False, default=str)
            items.append({
                'source_id': inst_code,
                'summary': f'[审批][{status}] {title}',
                'raw_content': raw,
                'metadata': {
                    'instance_code': inst_code,
                    'status': status,
                    'title': title,
                    'form': full_detail.get('form', []),
                    'approval_code': full_detail.get('approval_code', ''),
                    'user_id': full_detail.get('user_id', ''),
                    'start_time': full_detail.get('start_time', ''),
                    'end_time': full_detail.get('end_time', ''),
                },
            })
            time.sleep(0.2)

        written = _save_context_items_idempotent(user_id, 'approval', items)
        total += written

        new_pt = data.get('page_token', '')
        if checkpoint:
            checkpoint.page_token = new_pt or ''
            checkpoint.total_fetched = (checkpoint.total_fetched or 0) + len(instances)
            checkpoint.total_deposited = (checkpoint.total_deposited or 0) + written
            checkpoint.save(update_fields=['page_token', 'total_fetched', 'total_deposited', 'updated_at'])

        if not data.get('has_more', False) or not new_pt:
            break
        page_token = new_pt
        time.sleep(page_delay)

    return total


def fetch_docs_full_history(
    user_token: str,
    user_id: str,
    checkpoint=None,
    page_delay: float = 0.5,
) -> int:
    """
    全量历史云文档采集：
    - 翻页穷举根目录文件
    - 递归遍历子文件夹（folder_token）
    - 对 docx/doc 提取正文，其他类型记录元数据
    """
    if not user_token:
        return 0

    total = 0
    visited_folders = set()

    def _collect_folder(folder_token: str = '', depth: int = 0) -> int:
        if depth > 50 or folder_token in visited_folders:
            return 0
        visited_folders.add(folder_token)
        folder_total = 0
        page_token = None

        while True:
            try:
                params = {'page_size': 50, 'order_by': 'EditedTime', 'direction': 'DESC'}
                if folder_token:
                    params['folder_token'] = folder_token
                if page_token:
                    params['page_token'] = page_token
                data = feishu_client._user_request(
                    'GET', 'drive/v1/files', user_token, params=params,
                )
            except Exception as e:
                logger.warning('云文档目录获取失败 folder=%s: %s', folder_token[:20] if folder_token else 'root', e)
                break

            files = data.get('files', data.get('items', []))
            items = []
            for f in files:
                file_token = f.get('token', '')
                file_name = f.get('name', '')
                file_type = f.get('type', '')
                edit_time = f.get('edited_time', f.get('edit_time', ''))

                if not file_token:
                    continue

                # 递归进入子文件夹
                if file_type == 'folder':
                    sub_count = _collect_folder(file_token, depth + 1)
                    folder_total += sub_count
                    continue

                content_text = f'文件名: {file_name}\n类型: {file_type}'

                # 提取 docx/doc 正文（用 user_token，访问私有文档）
                if file_type in ('docx', 'doc'):
                    try:
                        doc_data = feishu_client._user_request(
                            'GET', f'docx/v1/documents/{file_token}/raw_content',
                            user_token,
                        )
                        raw_text = (doc_data.get('content', '') or '')
                        if raw_text:
                            content_text = raw_text
                    except Exception as e:
                        # 降级尝试 tenant_token（共享文档）
                        try:
                            doc_data = feishu_client._request(
                                'GET', f'docx/v1/documents/{file_token}/raw_content',
                            )
                            raw_text = (doc_data.get('content', '') or '')
                            if raw_text:
                                content_text = raw_text
                        except Exception:
                            content_text += f'\n(正文获取失败: {e})'
                # 提取 sheet 内容（元数据 + 尝试读取值）
                elif file_type in ('sheet', 'bitable'):
                    try:
                        meta = feishu_client._request(
                            'GET', f'sheets/v3/spreadsheets/{file_token}',
                        )
                        content_text = json.dumps(meta, ensure_ascii=False, default=str)
                    except Exception:
                        pass
                # 提取 slide 文本
                elif file_type in ('slide', 'mindnote'):
                    content_text = f'文件名: {file_name}\n类型: {file_type}\n(幻灯片/思维导图，已记录元数据)'

                items.append({
                    'source_id': file_token,
                    'summary': f'[{file_type}] {file_name}',
                    'raw_content': content_text,
                    'metadata': {
                        'file_token': file_token,
                        'file_name': file_name,
                        'file_type': file_type,
                        'edited_time': edit_time,
                        'folder_token': folder_token or 'root',
                    },
                })
                time.sleep(0.1)  # 每个文件间隔避免 429

            written = _save_context_items_idempotent(user_id, 'doc', items)
            folder_total += written

            new_pt = data.get('page_token', data.get('next_page_token', ''))
            if not data.get('has_more', False) or not new_pt:
                break
            page_token = new_pt
            time.sleep(page_delay)

        return folder_total

    total = _collect_folder('')  # 从根目录开始
    return total


def fetch_wiki_full_history(
    user_id: str,
    checkpoint=None,
    page_delay: float = 0.5,
) -> int:
    """
    全量知识库采集（tenant token）：枚举所有 wiki space → 递归遍历所有节点 → 提取正文。
    修复：加入翻页支持（has_more/page_token）和多级节点递归遍历。
    """
    total = 0
    try:
        spaces = feishu_client.list_wiki_spaces(page_size=50)
    except Exception as e:
        logger.warning('获取知识库空间列表失败: %s', e)
        return 0

    if isinstance(spaces, list):
        space_list = spaces
    else:
        space_list = spaces.get('items', []) if isinstance(spaces, dict) else []

    logger.info('Wiki 采集：共 %d 个空间', len(space_list))

    for space in space_list:
        space_id = space.get('space_id', '')
        space_name = space.get('name', space_id)
        if not space_id:
            continue

        # 递归遍历所有层级节点
        written = _collect_wiki_nodes(user_id, space_id, space_name, page_delay=page_delay)
        total += written
        if written > 0:
            logger.info('  Wiki [%s]: 共写入 %d 条', space_name[:20], written)
        time.sleep(page_delay)

    return total


def _collect_wiki_nodes(
    user_id: str,
    space_id: str,
    space_name: str,
    parent_node_token: str = '',
    depth: int = 0,
    page_delay: float = 0.5,
    visited_tokens: set = None,
) -> int:
    """递归采集 wiki 空间某节点下的所有子节点（带翻页）。"""
    if depth > 10:
        return 0
    if visited_tokens is None:
        visited_tokens = set()

    total = 0
    page_token = None

    while True:
        try:
            params = {'page_size': 50}
            if parent_node_token:
                params['parent_node_token'] = parent_node_token
            if page_token:
                params['page_token'] = page_token
            nodes_data = feishu_client._request(
                'GET', f'wiki/v2/spaces/{space_id}/nodes', params=params,
            )
        except Exception as e:
            logger.warning('Wiki 空间 %s 节点获取失败 depth=%d: %s', space_name, depth, e)
            break

        nodes = nodes_data.get('items', nodes_data.get('nodes', []))
        items = []
        for node in nodes:
            node_token = node.get('node_token', '')
            node_title = node.get('title', '')
            obj_token = node.get('obj_token', '')
            obj_type = node.get('obj_type', '')
            has_child = node.get('has_child', False)

            if not node_token or node_token in visited_tokens:
                continue
            visited_tokens.add(node_token)

            content_text = f'知识库: {space_name}\n标题: {node_title}\n类型: {obj_type}'
            if obj_type in ('docx', 'doc') and obj_token:
                try:
                    doc_data = feishu_client._request(
                        'GET', f'docx/v1/documents/{obj_token}/raw_content',
                    )
                    raw_text = (doc_data.get('content', '') or '')
                    if raw_text:
                        content_text = raw_text
                except Exception:
                    pass

            items.append({
                'source_id': node_token,
                'summary': f'[Wiki][{space_name}] {node_title}',
                'raw_content': content_text,
                'metadata': {
                    'space_id': space_id,
                    'space_name': space_name,
                    'node_token': node_token,
                    'obj_token': obj_token,
                    'obj_type': obj_type,
                    'title': node_title,
                    'depth': depth,
                },
            })
            time.sleep(0.1)

            # 递归进入有子节点的节点
            if has_child:
                sub = _collect_wiki_nodes(
                    user_id, space_id, space_name,
                    parent_node_token=node_token,
                    depth=depth + 1,
                    page_delay=page_delay,
                    visited_tokens=visited_tokens,
                )
                total += sub

        written = _save_context_items_idempotent(user_id, 'wiki', items)
        total += written

        new_pt = nodes_data.get('page_token', '')
        if not nodes_data.get('has_more', False) or not new_pt:
            break
        page_token = new_pt
        time.sleep(page_delay)

    return total


def fetch_all_sources_full_history(
    account_id: int,
    open_id: str,
    sources: List[str] = None,
    checkpoint_map: dict = None,
    lookback_days: int = 3650,
    page_delay: float = 0.3,
) -> Dict[str, int]:
    """
    全量历史采集主入口（供 sweep_feishu_full_history 调用）。

    所有数据源均做到：
    - 翻页穷举（不限条数）
    - 覆盖全部子资源（所有邮件文件夹、所有群聊、所有日历、所有云文档目录）
    - 幂等写入（不删除、不重复）
    - 断点续传（通过 checkpoint_map）
    - 每个数据源开始前刷新 token（防止长时间采集 token 过期）
    """
    if sources is None:
        sources = ['mail', 'im', 'calendar', 'task', 'approval', 'doc', 'wiki']

    checkpoint_map = checkpoint_map or {}
    counts: Dict[str, int] = {s: 0 for s in sources}

    for source in sources:
        cp = checkpoint_map.get(source)
        user_token = (get_valid_user_token(account_id) or '').strip()
        try:
            if source == 'mail':
                counts['mail'] = fetch_mails_full_history(
                    user_token, open_id, checkpoint=cp, page_delay=page_delay,
                    lookback_days=lookback_days,
                )

            elif source == 'im':
                if user_token:
                    counts['im'] = fetch_im_full_history(
                        user_token, open_id, checkpoint=cp, page_delay=page_delay,
                        lookback_days=lookback_days, account_id=account_id,
                    )
                else:
                    logger.info('IM 采集：%s 无 user_token，跳过（IM 不支持 tenant 降级）', open_id[:20])

            elif source == 'calendar':
                if user_token:
                    counts['calendar'] = fetch_calendar_full_history(
                        user_token, open_id,
                        lookback_days=lookback_days,
                        checkpoint=cp,
                        page_delay=page_delay,
                    )
                else:
                    logger.info('日历采集：%s 无 user_token，跳过（日历不支持 tenant 降级）', open_id[:20])

            elif source == 'task':
                if user_token:
                    counts['task'] = fetch_tasks_full_history(
                        user_token, open_id, checkpoint=cp, page_delay=page_delay,
                    )
                else:
                    logger.info('任务采集：%s 无 user_token，跳过（任务不支持 tenant 降级）', open_id[:20])

            elif source == 'approval':
                counts['approval'] = fetch_approvals_full_history(
                    user_token or '', open_id, checkpoint=cp, page_delay=page_delay,
                )

            elif source == 'doc':
                if user_token:
                    counts['doc'] = fetch_docs_full_history(
                        user_token, open_id, checkpoint=cp, page_delay=page_delay,
                    )
                else:
                    logger.info('文档采集：%s 无 user_token，跳过', open_id[:20])

            elif source == 'wiki':
                counts['wiki'] = fetch_wiki_full_history(
                    open_id, checkpoint=cp, page_delay=page_delay,
                )

            fetched = counts.get(source, 0)
            if cp and fetched > 0:
                cp.mark_completed()
            elif cp and fetched == 0 and cp.status == 'running':
                no_token = not user_token and source in ('im', 'calendar', 'task', 'doc')
                if no_token:
                    cp.status = 'skipped'
                    cp.auth_mode = 'skipped'
                    cp.error_log = 'no_user_token'
                    cp.save(update_fields=['status', 'auth_mode', 'error_log', 'updated_at'])
                else:
                    cp.status = 'pending'
                    cp.save(update_fields=['status', 'updated_at'])

        except Exception as e:
            logger.error('全量采集 source=%s account_id=%s 失败: %s', source, account_id, e)
            if cp:
                cp.mark_failed(str(e)[:500])

    return counts


# ============================================================================
# 主入口
# ============================================================================

def sync_feishu_data_direct(account_id: int, open_id: str) -> Dict[str, int]:
    """
    直接从飞书 API 拉取用户数据，写入 personal_context。

    拉取量通过环境变量控制，默认值已从早期"抽样式"提升到"近全量"。
    五个数据源：mail / calendar / im / task / approval。
    """
    user_token = get_valid_user_token(account_id)
    if not user_token:
        logger.info(f'账号 {account_id} 无有效飞书 user token，跳过直接拉取')
        return {'mail': 0, 'calendar': 0, 'im': 0, 'task': 0, 'approval': 0, 'error': 'no_valid_token'}

    logger.info(f'开始直接从飞书 API 拉取数据: account={account_id}, open_id={open_id}')

    seven_days_ago = timezone.now() - timedelta(days=7)
    PersonalContext.objects.filter(
        user_id=open_id,
        created_at__lt=seven_days_ago,
    ).delete()

    counts = {
        'mail': fetch_mails(user_token, open_id),
        'calendar': fetch_calendar_events(user_token, open_id),
        'im': fetch_im_messages(user_token, open_id),
        'task': fetch_tasks(user_token, open_id),
        'approval': fetch_approvals(user_token, open_id),
    }

    total = sum(counts.values())
    logger.info(f'飞书直接拉取完成: account={account_id}, total={total}, detail={counts}')
    return counts
