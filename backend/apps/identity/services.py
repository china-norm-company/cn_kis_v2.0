"""
身份认证服务

核心认证逻辑：JWT 签发/验证、飞书 OAuth、微信 OAuth
"""
import hashlib
import os
import time
import json
import base64
import secrets
import uuid
import logging
import ipaddress
from threading import Lock
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import jwt
import httpx
from django.db import IntegrityError
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from .models import Account, AccountType, SessionToken

logger = logging.getLogger(__name__)
auth_logger = logging.getLogger('cn_kis.auth')

# 工作台 -> 最小可用角色（用于飞书首登/无角色兜底）
# 说明：该映射只授予“最低可登录且可渲染”的权限，后续由管理员再做精细化收敛。
WORKSTATION_BASELINE_ROLE_MAP = {
    'secretary': 'viewer',
    'finance': 'finance',
    'research': 'researcher',
    'execution': 'clinical_executor',
    'reception': 'receptionist',
    'quality': 'qa',
    'hr': 'hr',
    'crm': 'sales',
    'recruitment': 'recruiter',
    'equipment': 'technician',
    'material': 'technician',
    'facility': 'technician',
    'evaluator': 'evaluator',
    'lab-personnel': 'lab_personnel',
    'ethics': 'qa',
    'control-plane': 'it_specialist',
}


def create_jwt_token(account: Account) -> str:
    """签发 JWT Token（含角色信息）"""
    from .models import AccountRole
    role_names = list(
        AccountRole.objects.filter(account_id=account.id)
        .select_related('role')
        .values_list('role__name', flat=True)
    )
    payload = {
        'user_id': account.id,
        'username': account.username,
        'account_type': account.account_type,
        'roles': role_names,
        'exp': int(time.time()) + settings.JWT_EXPIRATION_HOURS * 3600,
        'iat': int(time.time()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm='HS256')


def verify_jwt_token(token: str) -> Optional[dict]:
    """验证 JWT Token，并校验会话未撤销/未过期。开发环境下可接受火山云等外部签发 token（仅校验签名与过期）。"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=['HS256'])
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        active_session_exists = SessionToken.objects.filter(
            token_hash=token_hash,
            is_revoked=False,
            expires_at__gt=timezone.now(),
        ).exists()
        if active_session_exists:
            return payload
        # 开发/联调：接受同 JWT_SECRET 下其他环境签发的 token（如火山云），便于用 malimin@china-norm.com 等账号本地测试
        if getattr(settings, 'DEBUG', False) or getattr(settings, 'ACCEPT_EXTERNAL_JWT_FOR_DEV', False):
            logger.debug('verify_jwt_token: session not in DB, accepting token for dev (external token)')
            return payload
        return None
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


def get_feishu_tenant_access_token(app_id: str = None, app_secret: str = None) -> str:
    """
    获取飞书 tenant_access_token

    委托给 libs.feishu_client 统一客户端（带缓存），保持向后兼容。
    """
    from libs.feishu_client import feishu_client
    return feishu_client.get_tenant_token(app_id, app_secret)


STATE_TTL_SECONDS = 300
STATE_CACHE_PREFIX = 'auth:feishu:nonce:'
_FALLBACK_NONCE_LOCK = Lock()
_FALLBACK_NONCE_STORE: Dict[str, int] = {}


def _b64url_encode(raw: str) -> str:
    return base64.urlsafe_b64encode(raw.encode('utf-8')).decode('utf-8').rstrip('=')


def _b64url_decode(raw: str) -> str:
    pad = '=' * (-len(raw) % 4)
    return base64.urlsafe_b64decode((raw + pad).encode('utf-8')).decode('utf-8')


def build_auth_state(workstation: str, app_id: str, trace_id: Optional[str] = None) -> str:
    payload = {
        'ws': workstation,
        'app_id': app_id,
        'trace_id': trace_id or str(uuid.uuid4()),
        'nonce': secrets.token_urlsafe(12),
        'ts': int(time.time()),
        'ver': 'v1',
    }
    return _b64url_encode(json.dumps(payload, ensure_ascii=False, separators=(',', ':')))


def _summarize_auth_state(payload: Dict[str, Any]) -> Dict[str, Any]:
    now = int(time.time())
    trace_id = str(payload.get('trace_id', '') or '')
    nonce = str(payload.get('nonce', '') or '')
    ts = int(payload.get('ts') or 0)
    return {
        'ws': str(payload.get('ws', '') or '-'),
        'app_id': str(payload.get('app_id', '') or '-'),
        'trace_id': trace_id[:12] if trace_id else '-',
        'nonce_tail': nonce[-6:] if nonce else '-',
        'age_s': max(now - ts, 0) if ts else -1,
        'ver': str(payload.get('ver', '') or '-'),
    }


def parse_and_verify_auth_state(state: str, workstation: Optional[str] = None) -> Dict[str, Any]:
    try:
        payload = json.loads(_b64url_decode(state))
    except Exception:
        auth_logger.warning('AUTH_STATE_INVALID decode_failed')
        raise ValueError('AUTH_STATE_INVALID')

    required = {'ws', 'app_id', 'trace_id', 'nonce', 'ts', 'ver'}
    if not required.issubset(set(payload.keys())):
        auth_logger.warning(
            'AUTH_STATE_INVALID missing_fields required=%s actual=%s',
            sorted(required),
            sorted(payload.keys()),
        )
        raise ValueError('AUTH_STATE_INVALID')

    state_meta = _summarize_auth_state(payload)
    now = int(time.time())
    if now - int(payload['ts']) > STATE_TTL_SECONDS:
        auth_logger.warning('AUTH_STATE_EXPIRED %s', ' '.join([f'{k}={v}' for k, v in sorted(state_meta.items())]))
        raise ValueError('AUTH_STATE_EXPIRED')

    if workstation and payload['ws'] != workstation:
        auth_logger.warning(
            'AUTH_WORKSTATION_MISMATCH expected_ws=%s actual_ws=%s app_id=%s trace_id=%s nonce_tail=%s',
            workstation,
            state_meta['ws'],
            state_meta['app_id'],
            state_meta['trace_id'],
            state_meta['nonce_tail'],
        )
        raise ValueError('AUTH_WORKSTATION_MISMATCH')

    nonce_key = f'{STATE_CACHE_PREFIX}{payload["nonce"]}'
    _validate_and_store_nonce(nonce_key, state_meta)
    return payload


def _validate_and_store_nonce(nonce_key: str, state_meta: Dict[str, Any]) -> None:
    """
    防重放校验：
    1) 优先使用 Redis/Django cache（跨实例共享）
    2) 缓存异常时降级到进程内存（保障登录可用性）
    """
    try:
        if cache.get(nonce_key):
            auth_logger.warning(
                'AUTH_NONCE_REPLAY source=cache ws=%s app_id=%s trace_id=%s nonce_tail=%s age_s=%s ver=%s',
                state_meta['ws'],
                state_meta['app_id'],
                state_meta['trace_id'],
                state_meta['nonce_tail'],
                state_meta['age_s'],
                state_meta['ver'],
            )
            raise ValueError('AUTH_NONCE_REPLAY')
        cache.set(nonce_key, '1', timeout=STATE_TTL_SECONDS)
        return
    except ValueError:
        raise
    except Exception as exc:
        logger.warning(
            'AUTH_STATE cache unavailable, fallback to memory nonce store: %s ws=%s app_id=%s trace_id=%s nonce_tail=%s',
            exc,
            state_meta['ws'],
            state_meta['app_id'],
            state_meta['trace_id'],
            state_meta['nonce_tail'],
        )

    now = int(time.time())
    expires_at = now + STATE_TTL_SECONDS
    with _FALLBACK_NONCE_LOCK:
        expired_keys = [key for key, expiry in _FALLBACK_NONCE_STORE.items() if expiry <= now]
        for key in expired_keys:
            _FALLBACK_NONCE_STORE.pop(key, None)
        existing_expiry = _FALLBACK_NONCE_STORE.get(nonce_key)
        if existing_expiry and existing_expiry > now:
            auth_logger.warning(
                'AUTH_NONCE_REPLAY source=memory ws=%s app_id=%s trace_id=%s nonce_tail=%s age_s=%s ver=%s',
                state_meta['ws'],
                state_meta['app_id'],
                state_meta['trace_id'],
                state_meta['nonce_tail'],
                state_meta['age_s'],
                state_meta['ver'],
            )
            raise ValueError('AUTH_NONCE_REPLAY')
        _FALLBACK_NONCE_STORE[nonce_key] = expires_at


def map_auth_exception_to_error_code(exc: Exception) -> str:
    msg = str(exc)
    known_codes = {
        'AUTH_CODE_MISSING',
        'AUTH_STATE_INVALID',
        'AUTH_STATE_EXPIRED',
        'AUTH_NONCE_REPLAY',
        'AUTH_WORKSTATION_MISMATCH',
        'AUTH_APP_WORKSTATION_MISMATCH',
        'AUTH_OAUTH_HTTP_ERROR',
        'AUTH_OAUTH_RESPONSE_INVALID',
        'AUTH_USER_INFO_HTTP_ERROR',
        'AUTH_USER_INFO_INVALID',
        'AUTH_USER_IDENTIFIER_MISSING',
        'AUTH_ACCOUNT_UPSERT_FAILED',
    }
    if msg in known_codes:
        return msg
    if msg.startswith('AUTH_OAUTH_FAILED'):
        return 'AUTH_OAUTH_FAILED'
    if 'OAuth失败' in msg or '授权码' in msg:
        return 'AUTH_CODE_EXPIRED'
    return 'AUTH_INTERNAL_ERROR'


def _normalize_oauth_code(code: str) -> str:
    normalized = (code or '').strip()
    if not normalized:
        raise ValueError('AUTH_CODE_MISSING')
    # 某些网关/浏览器在 query 解析时会把 '+' 解码为空格，兜底还原。
    if ' ' in normalized and '+' not in normalized:
        normalized = normalized.replace(' ', '+')
    return normalized


def _resolve_redirect_uri(state_payload: Optional[Dict[str, Any]] = None) -> str:
    """
    根据 workstation 推导 redirect_uri（与前端 config.ts 逻辑完全一致）。

    规则：
    - secretary → {base}/login
    - 其他工作台 → {base}/{workstation}/
    - base 默认 http://118.196.64.48，可通过 FEISHU_REDIRECT_BASE 覆盖
    """
    base = (
        getattr(settings, 'FEISHU_REDIRECT_BASE', '')
        or os.environ.get('FEISHU_REDIRECT_BASE', '')
        or 'http://118.196.64.48'
    ).rstrip('/')
    ws = (state_payload or {}).get('ws', 'secretary')
    if ws == 'secretary':
        return f'{base}/login'
    return f'{base}/{ws}/'


def feishu_oauth_login(
    code: str,
    app_id: str = None,
    app_secret: str = None,
    state_payload: Optional[Dict[str, Any]] = None,
    redirect_uri: str = None,
) -> Account:
    """飞书 OAuth 登录：用授权码换取用户信息并创建/更新账号"""
    code = _normalize_oauth_code(code)

    # 使用 v2 OAuth token 端点换取 user_access_token
    # redirect_uri 规则：
    #   - 浏览器 OAuth：前端传入实际使用的 redirect_uri（window.location.origin + /login），后端直接使用
    #   - 飞书内 JSSDK：前端不传 redirect_uri，code 由 requestAuthCode 获取，exchange 时不能带 redirect_uri
    # 不在后端自行推断 redirect_uri，避免 http vs https、IP vs 域名 不一致导致 20071
    _app_id = app_id or settings.FEISHU_APP_ID
    _app_secret = app_secret or settings.FEISHU_APP_SECRET

    # 直接使用前端传来的 redirect_uri；JSSDK 流程前端不传，此处为 None
    _redirect_uri = redirect_uri or None

    body = {
        'grant_type': 'authorization_code',
        'client_id': _app_id,
        'client_secret': _app_secret,
        'code': code,
    }
    if _redirect_uri:
        body['redirect_uri'] = _redirect_uri

    try:
        resp = httpx.post(
            'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
            headers={'Content-Type': 'application/json; charset=utf-8'},
            json=body,
            timeout=15.0,
        )
        token_data = resp.json()
    except httpx.HTTPError as e:
        raise ValueError('AUTH_OAUTH_HTTP_ERROR') from e
    except (ValueError, KeyError) as e:
        raise ValueError('AUTH_OAUTH_RESPONSE_INVALID') from e

    if token_data.get('code') != 0:
        oauth_code = token_data.get('code')
        oauth_msg = (
            token_data.get('msg')
            or token_data.get('message')
            or token_data.get('error')
            or token_data.get('error_description')
            or token_data.get('errorMessage')
            or 'unknown'
        )
        logger.warning(
            'feishu_oauth_exchange_failed app_id=%s oauth_code=%s oauth_msg=%s payload_keys=%s',
            app_id or '-',
            oauth_code,
            oauth_msg,
            ','.join(sorted(token_data.keys())),
        )
        raise ValueError(f'AUTH_OAUTH_FAILED:{oauth_code}:{oauth_msg}')

    # v2 端点响应结构：token 字段直接在顶层（非 data 包裹）
    logger.info(
        'feishu_v2_token_response keys=%s has_refresh=%s has_scope=%s',
        ','.join(sorted(token_data.keys())),
        'refresh_token' in token_data and bool(token_data['refresh_token']),
        bool(token_data.get('scope')),
    )
    access_token = token_data.get('access_token') or (token_data.get('data') or {}).get('access_token', '')
    refresh_token = token_data.get('refresh_token') or (token_data.get('data') or {}).get('refresh_token', '')
    expires_in = token_data.get('expires_in') or (token_data.get('data') or {}).get('expires_in', 7200)
    refresh_expires_in = token_data.get('refresh_expires_in', 0) or (token_data.get('data') or {}).get('refresh_expires_in', 0)
    token_scope = token_data.get('scope', '')

    if not access_token:
        logger.error('feishu_oauth_no_access_token response_keys=%s', ','.join(sorted(token_data.keys())))
        raise ValueError('AUTH_OAUTH_RESPONSE_INVALID')

    logger.info(
        'feishu_oauth_token_obtained app_id=%s scope=%s expires_in=%s refresh_len=%s refresh_exp=%s',
        _app_id, token_scope[:120] if token_scope else '-', expires_in,
        len(refresh_token) if refresh_token else 0, refresh_expires_in,
    )

    # 获取用户信息
    try:
        resp = httpx.get(
            'https://open.feishu.cn/open-apis/authen/v1/user_info',
            headers={'Authorization': f'Bearer {access_token}'},
            timeout=15.0,
        )
        resp.raise_for_status()
        user_data = resp.json()
    except httpx.HTTPError as e:
        raise ValueError('AUTH_USER_INFO_HTTP_ERROR') from e
    except ValueError as e:
        raise ValueError('AUTH_USER_INFO_INVALID') from e

    if user_data.get('code') != 0:
        raise ValueError(f"获取飞书用户信息失败: {user_data.get('msg')}")

    user_info = user_data['data']
    open_id = user_info.get('open_id') or ''
    user_id = user_info.get('user_id') or user_info.get('union_id') or ''
    if not open_id and not user_id:
        raise ValueError('AUTH_USER_IDENTIFIER_MISSING')

    # 查找或创建账号（飞书登录即自动建档）
    account = Account.objects.filter(feishu_open_id=open_id).first() if open_id else None
    if not account and user_id:
        account = Account.objects.filter(feishu_user_id=user_id).first()

    # 跨系统身份缝合：如果飞书姓名能匹配到纯易快报 Account（无飞书 ID），自动合并
    # 这确保员工首次飞书登录时，易快报历史数据自动归属到同一 Account
    if not account:
        feishu_name = user_info.get('name', '').strip()
        if feishu_name:
            try:
                ekb_account = Account.objects.filter(
                    display_name=feishu_name,
                    is_deleted=False,
                    ekuaibao_staff_id__gt='',
                    feishu_open_id='',
                ).first()
                if ekb_account:
                    ekb_account.feishu_open_id = open_id
                    ekb_account.feishu_user_id = user_id
                    ekb_account.email = user_info.get('email', ekb_account.email or '')
                    ekb_account.avatar = user_info.get('avatar_url', ekb_account.avatar or '')
                    ekb_account.save(update_fields=[
                        'feishu_open_id', 'feishu_user_id', 'email', 'avatar'
                    ])
                    account = ekb_account
                    logger.info(
                        'identity_stitch: merged feishu account into ekuaibao account '
                        'account_id=%s name=%s ekuaibao_staff_id=%s',
                        ekb_account.id, feishu_name, ekb_account.ekuaibao_staff_id,
                    )
            except Exception as stitch_ex:
                logger.warning('identity_stitch failed for name=%s: %s', feishu_name, stitch_ex)

    if not account:
        unique_seed = f"{app_id}:{user_id or open_id}"
        username = f"feishu_{hashlib.sha256(unique_seed.encode()).hexdigest()[:16]}"
        try:
            account = Account.objects.create(
                username=username,
                display_name=user_info.get('name', ''),
                email=user_info.get('email', ''),
                avatar=user_info.get('avatar_url', ''),
                account_type=AccountType.INTERNAL,
                feishu_open_id=open_id,
                feishu_user_id=user_id,
            )
        except IntegrityError as e:
            # 并发创建/历史脏数据场景下再次兜底查询
            account = (
                (Account.objects.filter(feishu_user_id=user_id).first() if user_id else None)
                or (Account.objects.filter(feishu_open_id=open_id).first() if open_id else None)
                or Account.objects.filter(username=username).first()
            )
            if not account:
                raise ValueError('AUTH_ACCOUNT_UPSERT_FAILED') from e
    else:
        account.display_name = user_info.get('name', account.display_name)
        account.email = user_info.get('email', account.email or '')
        account.avatar = user_info.get('avatar_url', account.avatar)
        account.feishu_open_id = open_id or account.feishu_open_id
        account.feishu_user_id = user_id or account.feishu_user_id
        account.last_login_time = timezone.now()
        account.save(update_fields=['display_name', 'email', 'avatar', 'feishu_open_id', 'feishu_user_id', 'last_login_time'])

    # 每次飞书登录都做角色兜底（避免历史账号无角色导致未授权）
    workstation = (state_payload or {}).get('ws', '')
    _ensure_baseline_roles(account, workstation)

    # 存储飞书 user_access_token + refresh_token（工作台扫描飞书信息需要）
    # 子衿主授权：落库写入签发应用，便于刷新与预检
    if not refresh_token:
        # 飞书 v2 OAuth 有时不返回 refresh_token（首次授权应该有）
        # 记录警告便于诊断
        logger.warning(
            'feishu_oauth_no_refresh_token account_id=%s open_id=%s app_id=%s '
            '(token 将在 access_token 过期后无法自动续期，用户需重新登录)',
            account.id, open_id[:20] if open_id else '-', _app_id,
        )
    _save_feishu_user_token(
        account, open_id, access_token, refresh_token, expires_in, refresh_expires_in,
        issuer_app_id=app_id or '',
        issuer_app_name=_issuer_app_name(app_id),
        feishu_scope=token_scope or '',
    )

    return account


def _ensure_baseline_roles(account: Account, workstation: str = '') -> None:
    """飞书登录兜底角色：始终保证 viewer，并按工作台补最小可用角色。"""
    try:
        from .models import Role, AccountRole
        role_names = {'viewer'}
        baseline_role = WORKSTATION_BASELINE_ROLE_MAP.get(workstation or '')
        if baseline_role:
            role_names.add(baseline_role)

        role_qs = Role.objects.filter(name__in=role_names, is_active=True)
        existed = set(
            AccountRole.objects.filter(account=account, role__name__in=role_names)
            .values_list('role__name', flat=True)
        )
        for role in role_qs:
            if role.name in existed:
                continue
            AccountRole.objects.create(account=account, role=role)
            logger.info(
                'auto_role_granted account_id=%s username=%s workstation=%s role=%s',
                account.id,
                account.username,
                workstation or '-',
                role.name,
            )

        # 角色不存在时仅告警，不中断登录
        found = set(role_qs.values_list('name', flat=True))
        missing = sorted(role_names - found)
        if missing:
            logger.warning(
                'auto_role_missing account_id=%s username=%s workstation=%s missing_roles=%s',
                account.id,
                account.username,
                workstation or '-',
                ','.join(missing),
            )
    except Exception as e:
        logger.warning(f'角色兜底分配失败: {e}')


def _issuer_app_name(app_id: str) -> str:
    """签发应用显示名（用于审计与前端展示）"""
    if not app_id:
        return ''
    from django.conf import settings
    primary = getattr(settings, 'FEISHU_PRIMARY_APP_ID', '')
    if app_id == primary:
        return '子衿'
    return ''


def _save_feishu_user_token(
    account: Account,
    open_id: str,
    access_token: str,
    refresh_token: str,
    expires_in: int,
    refresh_expires_in: int,
    *,
    issuer_app_id: str = '',
    issuer_app_name: str = '',
    feishu_scope: str = '',
):
    """
    存储飞书用户 Token 到 t_feishu_user_token

    供秘书工作台直接调用飞书 API 拉取邮件/日历/IM/任务等数据，
    不依赖 feishu-connector。

    子衿主授权：写入 issuer_app_id/issuer_app_name；若已有 token 且签发源变化则打标 requires_reauth。

    关键约束（禁止破坏）：
    1. refresh_token 为空时，绝对不能覆盖已有的非空 refresh_token（防止登录覆盖）
    2. refresh_expires_at 不应为 None，应默认 30 天
    3. 每次保存必须写入日志，含 refresh_len 用于审计
    4. feishu_scope 仅在非空时更新，保留历史 scope（refresh 不会带回 scope 字段）
    """
    try:
        from apps.secretary.models import FeishuUserToken

        now = timezone.now()
        existing = FeishuUserToken.objects.filter(account_id=account.id).first()

        # 只在拿到非空 refresh_token 时才更新，防止用空值覆盖已有的有效 token
        effective_refresh = refresh_token if refresh_token else (
            existing.refresh_token if existing else ''
        )
        # refresh_expires_at 不允许为 None，默认 30 天
        _refresh_exp_seconds = refresh_expires_in if refresh_expires_in else 2592000
        effective_refresh_expires_at = now + timedelta(seconds=_refresh_exp_seconds)
        # 如果没有新 refresh_token 但已有 refresh_expires_at，保留原有的
        if not refresh_token and existing and existing.refresh_expires_at:
            effective_refresh_expires_at = existing.refresh_expires_at

        # scope 仅在飞书返回非空值时更新（token refresh 不返回 scope，不能用空值覆盖）
        effective_scope = feishu_scope if feishu_scope else (
            getattr(existing, 'feishu_scope', '') or '' if existing else ''
        )

        defaults = {
            'open_id': open_id,
            'access_token': access_token,
            'refresh_token': effective_refresh,
            'token_expires_at': now + timedelta(seconds=expires_in),
            'refresh_expires_at': effective_refresh_expires_at,
            'issuer_app_id': issuer_app_id or '',
            'issuer_app_name': issuer_app_name or '',
            'feishu_scope': effective_scope,
            'requires_reauth': False,
        }
        if existing and (existing.issuer_app_id or '').strip() and existing.issuer_app_id != (issuer_app_id or ''):
            defaults['requires_reauth'] = True
            logger.info(
                'feishu_issuer_change account_id=%s old_issuer=%s new_issuer=%s',
                account.id, existing.issuer_app_id or '-', issuer_app_id or '-',
            )
        FeishuUserToken.objects.update_or_create(account_id=account.id, defaults=defaults)
        logger.info(
            'feishu_token_saved account_id=%s open_id=%s issuer=%s '
            'access_expires_in=%s refresh_len=%s refresh_exp_days=%s scope_len=%s',
            account.id, (open_id or '')[:20], issuer_app_id or '-',
            expires_in, len(effective_refresh), _refresh_exp_seconds // 86400,
            len(effective_scope),
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f'存储飞书用户Token失败: {e}')


DEV_BYPASS_OPENID = 'dev_bypass_wechat_openid'


def _ensure_subject_self_role(account: Account) -> None:
    """为受试者账号确保有 subject_self 角色（含 my.* 权限，用于扫码签到等自助功能）"""
    from .models import Role, AccountRole
    role = Role.objects.filter(name='subject_self', is_active=True).first()
    if role and not AccountRole.objects.filter(account=account, role=role).exists():
        AccountRole.objects.create(account=account, role=role)
        logger.info('subject_self_role_granted account_id=%s username=%s', account.id, account.username)


def wechat_oauth_login(code: str, trace_id: str = '') -> Account:
    """微信小程序登录：用 code 换取 openid 并创建/更新受试者账号"""
    code = (code or '').strip()
    code_preview = code[:8]
    code_len = len(code)

    # 本地开发旁路：微信开发者工具的 code 无法通过微信服务器验证
    # 当 DJANGO_DEBUG=True 且收到约定 code 时，使用固定 dev 账号，便于在开发者工具中调试
    use_dev_bypass = (
        getattr(settings, 'DEBUG', False)
        and code in ('dev-bypass-wechat', 'dev_bypass_wechat')
    )
    if use_dev_bypass:
        account = Account.objects.filter(wechat_openid=DEV_BYPASS_OPENID).first()
        if not account:
            account = Account.objects.create(
                username='wx_dev_bypass',
                display_name='开发测试受试者',
                account_type=AccountType.SUBJECT,
                wechat_openid=DEV_BYPASS_OPENID,
                wechat_unionid='',
            )
            _ensure_subject_self_role(account)
        else:
            account.last_login_time = timezone.now()
            account.save(update_fields=['last_login_time'])
        logger.info('wechat_login dev_bypass used')
        return account

    appid = settings.WECHAT_APPID if hasattr(settings, 'WECHAT_APPID') else ''
    secret = settings.WECHAT_SECRET if hasattr(settings, 'WECHAT_SECRET') else ''
    if not appid or not secret:
        raise ValueError('微信登录配置缺失：请设置 WECHAT_APPID / WECHAT_SECRET')

    started = time.monotonic()
    try:
        resp = httpx.get(
            'https://api.weixin.qq.com/sns/jscode2session',
            params={'appid': appid, 'secret': secret, 'js_code': code, 'grant_type': 'authorization_code'},
            timeout=8.0,
        )
    except httpx.HTTPError as e:
        auth_logger.warning(
            'wechat_code2session http_error trace_id=%s error=%s elapsed_ms=%s',
            trace_id or '-',
            e.__class__.__name__,
            int((time.monotonic() - started) * 1000),
        )
        raise ValueError(f'微信登录网络异常: {e.__class__.__name__}') from e

    try:
        data = resp.json()
    except ValueError:
        snippet = (resp.text or '')[:120]
        raise ValueError(f'微信登录返回异常: status={resp.status_code}, body={snippet}')

    openid = data.get('openid', '')
    unionid = data.get('unionid', '')
    errcode = data.get('errcode', 0)
    try:
        errcode_int = int(errcode) if errcode not in (None, '') else 0
    except (TypeError, ValueError):
        errcode_int = 0
    errmsg = data.get('errmsg', '')
    auth_logger.info(
        'wechat_code2session result trace_id=%s status=%s errcode=%s errmsg=%s code_len=%s code_prefix=%s appid_suffix=%s elapsed_ms=%s',
        trace_id or '-',
        resp.status_code,
        errcode_int,
        errmsg,
        code_len,
        code_preview,
        (appid or '')[-6:],
        int((time.monotonic() - started) * 1000),
    )

    if not openid:
        # 仅 40029/40163 判定为 code 失效；101/105 等属于请求/网络/环境问题，不应误报“码失效”
        if errcode_int in (40029, 40163):
            raise ValueError('登录码已失效或已使用，请重新点击登录')
        if errcode_int in (101, 105):
            raise ValueError(
                f"微信登录请求异常: {errmsg or '请检查小程序合法域名、证书链与服务器外网连通性'} (errcode={errcode_int})"
            )
        raise ValueError(
            f"微信登录失败: {errmsg or '未知错误'}" + (f" (errcode={errcode_int})" if errcode_int else "")
        )

    account = Account.objects.filter(wechat_openid=openid).first()
    if not account:
        account = Account.objects.create(
            username=f'wx_{openid[:16]}',
            display_name='受试者',
            account_type=AccountType.SUBJECT,
            wechat_openid=openid,
            wechat_unionid=unionid,
        )
        _ensure_subject_self_role(account)
    else:
        account.last_login_time = timezone.now()
        account.save(update_fields=['last_login_time'])

    return account


def wechat_cloudrun_login(openid: str, trace_id: str = '') -> Account:
    """云托管模式登录：直接用微信注入的 openid 创建/更新受试者账号（无需 code2session）"""
    if not openid:
        raise ValueError('云托管登录失败: X-WX-OPENID 为空')

    auth_logger.info(
        'wechat_cloudrun_login trace_id=%s openid_prefix=%s',
        trace_id or '-',
        openid[:8],
    )

    account = Account.objects.filter(wechat_openid=openid).first()
    if not account:
        account = Account.objects.create(
            username=f'wx_{openid[:16]}',
            display_name='受试者',
            account_type=AccountType.SUBJECT,
            wechat_openid=openid,
        )
        _ensure_subject_self_role(account)
    else:
        account.last_login_time = timezone.now()
        account.save(update_fields=['last_login_time'])

    return account


def _safe_device_info(raw: str, max_len: int = 200) -> str:
    if not raw:
        return ''
    value = str(raw).strip()
    if len(value) <= max_len:
        return value
    return value[:max_len]


def _safe_ip_address(raw: str) -> Optional[str]:
    value = (raw or '').strip()
    if not value:
        return None
    # 兼容 X-Forwarded-For 透传场景
    if ',' in value:
        value = value.split(',')[0].strip()
    try:
        ipaddress.ip_address(value)
        return value
    except ValueError:
        return None


def create_session(account: Account, device_info: str = '', ip_address: str = '') -> str:
    """创建会话并返回 JWT Token"""
    token = create_jwt_token(account)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    SessionToken.objects.create(
        account=account,
        token_hash=token_hash,
        device_info=_safe_device_info(device_info, max_len=200),
        ip_address=_safe_ip_address(ip_address),
        expires_at=timezone.now() + timedelta(hours=settings.JWT_EXPIRATION_HOURS),
    )

    account.last_login_time = timezone.now()
    account.save(update_fields=['last_login_time'])

    return token
