"""
认证授权 API

端点：
- POST /auth/feishu/callback    飞书OAuth回调
- POST /auth/dev-login          开发模式登录（仅 DEBUG，本地免飞书）
- POST /auth/wechat/login       微信小程序登录
- POST /auth/sms/send           发送短信验证码
- POST /auth/sms/verify         校验短信验证码并登录
- GET  /auth/me                 当前用户信息（含角色、权限、可见工作台）
- GET  /auth/profile            完整用户画像
- POST /auth/logout             登出
"""

from ninja import Router, Schema
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from django.utils import timezone
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.db.utils import OperationalError
import logging
import httpx
import time

from .decorators import require_permission, require_any_permission

# WeChat Phone Number API Configuration
WECHAT_ACCESS_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token'
WECHAT_GET_USER_PHONE_NUMBER_URL = (
    'https://api.weixin.qq.com/wxa/business/getuserphonenumber'
)

# Token cache for WeChat access_token
_wechat_token_cache: dict = {
    'access_token': None,
    'expires_at': None,
}


def _ensure_wechat_access_token():
    """Get cached access_token or fetch a new one from WeChat API."""
    global _wechat_token_cache

    now = datetime.now()
    cached_token = _wechat_token_cache.get('access_token')
    expires_at = _wechat_token_cache.get('expires_at')

    # Check if cache is valid (with 120s buffer)
    if cached_token and expires_at and now < expires_at - timedelta(seconds=120):
        return cached_token, True

    # Fetch new token
    appid = getattr(settings, 'WECHAT_APPID', '')
    secret = getattr(settings, 'WECHAT_SECRET', '')

    if not appid or not secret:
        raise ValueError('WECHAT_APPID or WECHAT_SECRET not configured')

    resp = httpx.get(
        WECHAT_ACCESS_TOKEN_URL,
        params={'grant_type': 'client_credential', 'appid': appid, 'secret': secret},
        timeout=10.0,
    )
    resp.raise_for_status()
    data = resp.json()

    errcode = data.get('errcode', 0)
    if errcode:
        raise ValueError(f"WeChat API error: {data.get('errmsg', 'Unknown error')}")

    access_token = data.get('access_token')
    expires_in = data.get('expires_in', 7200)

    # Update cache
    _wechat_token_cache['access_token'] = access_token
    _wechat_token_cache['expires_at'] = now + timedelta(seconds=expires_in)

    return access_token, False


def _invalidate_wechat_token_cache():
    """Clear the access_token cache."""
    global _wechat_token_cache
    _wechat_token_cache['access_token'] = None
    _wechat_token_cache['expires_at'] = None


def _call_wechat_getuserphonenumber(access_token: str, code: str):
    """Call WeChat getuserphonenumber API."""
    resp = httpx.post(
        WECHAT_GET_USER_PHONE_NUMBER_URL,
        params={'access_token': access_token},
        json={'code': code},
        timeout=10.0,
    )
    resp.raise_for_status()
    return resp.json()


router = Router()
auth_logger = logging.getLogger('cn_kis.auth')


def _trace_enabled() -> bool:
    return getattr(settings, 'AUTH_TRACE_ENABLED', False)


def _auth_trace(request, event: str, **fields) -> None:
    if not _trace_enabled():
        return
    request_id = getattr(request, 'request_id', '-')
    common = {
        'method': getattr(request, 'method', '-') or '-',
        'path': getattr(request, 'path', '-') or '-',
        'user_id': getattr(request, 'user_id', '-') or '-',
        'username': getattr(request, 'username', '-') or '-',
        'ip': (
            (
                request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
                if request.META.get('HTTP_X_FORWARDED_FOR')
                else ''
            )
            or request.META.get('REMOTE_ADDR', '-')
            or '-'
        ),
        'ua': request.META.get('HTTP_USER_AGENT', '-')[:120] or '-',
    }
    merged = {**common, **fields}
    kv = ' '.join([f'{k}={merged[k]}' for k in sorted(merged.keys())])
    auth_logger.info(f'auth_trace event={event} request_id={request_id} {kv}')


# ============================================================================
# Schema
# ============================================================================
class FeishuCallbackIn(Schema):
    code: str
    app_id: Optional[str] = None
    redirect_uri: Optional[str] = None
    state: Optional[str] = None
    workstation: Optional[str] = None
    trace_id: Optional[str] = None


class WechatLoginIn(Schema):
    code: str


class WechatBindPhoneIn(Schema):
    phone: str


class SmsSendIn(Schema):
    phone: str
    scene: Optional[str] = 'cn_kis_login'


class SmsVerifyIn(Schema):
    phone: str
    code: str
    scene: Optional[str] = 'cn_kis_login'


class TokenOut(Schema):
    access_token: str
    user: dict
    roles: List[str] = []
    visible_workbenches: List[str] = []


class UserOut(Schema):
    id: int
    username: str
    display_name: str
    email: str
    avatar: str
    account_type: str
    roles: List[str] = []


class UserProfileOut(Schema):
    """完整用户画像：含角色、权限、可见工作台、可见菜单"""

    id: int
    username: str
    display_name: str
    email: str
    avatar: str
    account_type: str
    roles: List[dict] = []
    permissions: List[str] = []
    data_scope: str = 'personal'
    visible_workbenches: List[str] = []
    visible_menu_items: Dict[str, List[str]] = {}


# ============================================================================
# 内部工具
# ============================================================================
def _get_account_from_request(request):
    """从请求中获取当前账号"""
    from django.conf import settings
    from .models import Account
    from .services import verify_jwt_token

    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return None
    token = auth_header[7:]
    if getattr(settings, 'DEBUG', False) and token == 'dev-bypass-token':
        bypass_id = getattr(settings, 'DEV_BYPASS_ACCOUNT_ID', None)
        if bypass_id is not None:
            account = Account.objects.filter(id=bypass_id, is_deleted=False).first()
            if account:
                return account
        return Account.objects.filter(is_deleted=False).first()
    payload = verify_jwt_token(token)
    if not payload:
        return None
    return Account.objects.filter(id=payload['user_id'], is_deleted=False).first()


def _build_user_profile(account) -> dict:
    """
    构建完整用户画像（角色、权限、可见工作台、可见菜单）

    v2 新增：应用 AccountWorkstationConfig 覆盖。
    - blank 模式：对应工作台的 visible_menu_items 被强制清空
    - pilot 模式：对应工作台的 visible_menu_items 取配置与权限计算结果的交集
    - full / 无记录：不覆盖
    返回数据新增 workstation_modes 字段：{workstation: mode, ...}
    """
    from .authz import get_authz_service
    from .role_workbench import ROLE_WORKBENCH_MAP

    authz = get_authz_service()

    # 角色
    roles = authz.get_account_roles(account.id)
    role_names = [r.name for r in roles]
    role_details = [
        {
            'name': r.name,
            'display_name': r.display_name,
            'level': r.level,
            'category': r.category,
        }
        for r in roles
    ]

    # 权限
    perm_dict = authz.get_account_permissions(account.id)
    perm_codes = sorted(perm_dict.keys())

    # 数据作用域
    from .filters import get_data_scope

    data_scope = get_data_scope(account)

    # 可见工作台（取所有角色的并集）
    visible_wb = set()
    for rn in role_names:
        visible_wb.update(ROLE_WORKBENCH_MAP.get(rn, []))
    # 统一平台入口策略：凡可访问秘书台的账号，默认可在秘书台门户看到天工入口
    if 'secretary' in visible_wb:
        visible_wb.add('control-plane')
    visible_wb_list = sorted(visible_wb)

    # 可见菜单项（按工作台分组，从权限推断）
    visible_menus = _compute_visible_menus(perm_codes, visible_wb_list)

    # 应用用户工作台配置覆盖（渐进上线支持）
    workstation_modes = {}
    try:
        from .models import AccountWorkstationConfig

        configs = AccountWorkstationConfig.objects.filter(account=account)
        for cfg in configs:
            ws = cfg.workstation
            mode = cfg.mode
            workstation_modes[ws] = mode

            if mode == 'blank':
                # 完全清空该工作台的菜单
                visible_menus[ws] = []
            elif mode == 'pilot':
                # 只保留 enabled_menus 与权限计算结果的交集
                allowed = set(cfg.enabled_menus or [])
                current = set(visible_menus.get(ws, []))
                visible_menus[ws] = sorted(allowed & current)
                # 管理员在 pilot 下也始终保留系统管理菜单，避免前端闪退
                if ws == 'secretary' and (
                    'admin' in role_names or 'superadmin' in role_names
                ):
                    for key in ('admin/roles', 'admin/accounts'):
                        if key not in visible_menus[ws]:
                            visible_menus[ws] = sorted(visible_menus[ws] + [key])
            # mode == 'full': 不覆盖
    except Exception as e:
        auth_logger.warning('Failed to apply workstation config overrides: %s', e)

    profile = {
        'id': account.id,
        'username': account.username,
        'display_name': account.display_name,
        'email': account.email or '',
        'avatar': account.avatar or '',
        'account_type': account.account_type,
        'roles': role_details,
        'permissions': perm_codes,
        'data_scope': data_scope,
        'visible_workbenches': visible_wb_list,
        'visible_menu_items': visible_menus,
    }

    # 只在有配置时才附加 workstation_modes（不影响无配置用户的响应结构）
    if workstation_modes:
        profile['workstation_modes'] = workstation_modes

    return profile


def _compute_visible_menus(perm_codes: list, workbenches: list) -> dict:
    """根据权限代码和可见工作台推断可见菜单项"""
    # 权限模块 → 工作台菜单映射
    MODULE_MENU_MAP = {
        'secretary': {
            'portal': [],
            'dashboard': ['dashboard.overview.read', 'dashboard.stats.read'],
            'todo': [],
            'notifications': [],
            'alerts': ['dashboard.stats.read'],
            'manager': ['dashboard.overview.read'],
        },
        'research': {
            'workbench': [],
            'weekly': [],  # 周报：研究台用户均可见，无单独权限
            'clients': [],
            'changes': [],
            'tasks': [],
            'knowledge': [],
            'ai-assistant': [],
            'manager': ['dashboard.overview.read'],
            'portfolio': ['dashboard.overview.read'],
            'business': ['dashboard.overview.read'],
            'team': ['dashboard.overview.read'],
            'protocols': ['protocol.protocol.read'],
            'project-full-link': [
                'protocol.protocol.read'
            ],  # 项目全链路：与「我的协议」同权限
            'visits': ['visit.plan.read', 'visit.node.read'],
            'subjects': ['subject.subject.read'],
            'overview': ['protocol.protocol.read'],
            'feasibility': ['feasibility.assessment.read'],
            'proposals': ['proposal.proposal.read'],
            'closeout': ['closeout.closeout.read'],
        },
        'execution': {
            'dashboard': ['dashboard.stats.read'],
            'scheduling': ['visit.plan.read', 'scheduling.plan.read'],
            'visits': ['visit.plan.read'],
            'workorders': ['workorder.workorder.read'],
            'subjects': ['subject.subject.read'],
            'edc': ['edc.crf.read'],
            'changes': ['protocol.protocol.read'],
            'lims': ['edc.crf.read'],
            'analytics': ['workorder.workorder.read'],
        },
        'reception': {
            'queue': ['subject.subject.read'],
            'checkin': ['visit.plan.read', 'visit.node.read'],
            'checkout': ['visit.plan.read', 'visit.node.read'],
            'kiosk': ['subject.subject.read'],
            'schedule': ['workorder.workorder.read'],
        },
        'quality': {
            'dashboard': ['quality.deviation.read'],
            'deviations': ['quality.deviation.read'],
            'capa': ['quality.capa.read'],
            'changes': ['quality.change.read'],
            'queries': ['edc.record.read', 'edc.query.read'],
            'audit-management': ['quality.audit.read'],
            'report': ['quality.deviation.read'],
            'analytics': ['quality.deviation.read'],
            'sop': ['quality.sop.read'],
            'audit-logs': ['system.audit.read'],
        },
        'hr': {
            'dashboard': ['hr.staff.read'],
            'qualifications': ['hr.staff.read'],
            'competency': ['hr.competency.read'],
            'assessment': ['hr.assessment.read'],
            'training': ['hr.training.read'],
            'workload': ['hr.staff.read'],
        },
        'finance': {
            'dashboard': ['finance.quote.read', 'finance.report.read'],
            'quotes': ['finance.quote.read'],
            'contracts': ['finance.contract.read'],
            'invoices': ['finance.invoice.read'],
            'payments': ['finance.payment.read'],
            'collection': ['finance.payment.read'],
            'payables': ['finance.payable.read'],
            'expenses': ['finance.expense.read'],
            'budgets': ['finance.budget.read'],
            'costs': ['finance.cost.read'],
            'profit-analysis': ['finance.report.read'],
            'revenue-analysis': ['finance.report.read'],
            'cost-analysis': ['finance.report.read'],
            'cashflow': ['finance.report.read'],
            'ar-aging': ['finance.report.read'],
            'risk-dashboard': ['finance.report.read'],
            'efficiency': ['finance.report.read'],
            'settlement': ['finance.report.read'],
            'reports': ['finance.report.read'],
        },
        'crm': {
            'dashboard': ['crm.client.read'],
            'clients': ['crm.client.read'],
            'product-lines': ['crm.client.read'],
            'opportunities': ['crm.opportunity.read'],
            'opportunities/kanban': ['crm.opportunity.read'],
            'insights': ['crm.client.read'],
            'briefs': ['crm.client.read'],
            'market-trends': ['crm.client.read'],
            'alerts': ['crm.client.read'],
            'surveys': ['crm.client.read'],
            'milestones': ['crm.client.read'],
            'claim-trends': ['crm.client.read'],
            'sales-report': ['crm.opportunity.read'],
        },
        'recruitment': {
            'dashboard': ['subject.recruitment.read'],
            'plans': ['subject.recruitment.read'],
            'registrations': ['subject.recruitment.read'],
            'pre-screening': ['subject.recruitment.read'],
            'screening': ['subject.recruitment.read'],
            'enrollment': ['subject.recruitment.read'],
            'subjects': ['subject.subject.read'],
            'checkin': ['subject.subject.read'],
            'compliance': ['subject.subject.read'],
            'payments': ['subject.subject.read'],
            'support': ['subject.recruitment.read'],
            'questionnaires': ['subject.recruitment.read'],
            'loyalty': ['subject.subject.read'],
            'channel-analytics': ['subject.recruitment.read'],
        },
        'equipment': {
            'dashboard': ['resource.equipment.read'],
            'ledger': ['resource.equipment.read'],
            'calibration': ['resource.calibration.read'],
            'maintenance': ['resource.maintenance.read'],
            'usage': ['resource.equipment.read'],
            'detection-methods': ['resource.method.read'],
        },
        'material': {
            'dashboard': ['resource.material.read'],
            'products': ['resource.material.read'],
            'consumables': ['resource.material.read'],
            'inventory': ['resource.inventory.read'],
            'transactions': ['resource.inventory.write'],
            'expiry-alerts': ['resource.material.read'],
            'samples': ['resource.sample.read'],
            'receipts': ['resource.material.read'],
            'batches': ['resource.material.read'],
            'kits': ['resource.material.read'],
            'destructions': ['resource.material.write'],
            'retention': ['resource.sample.read'],
            'inventory-execution': ['resource.inventory.write'],
            'storage-hierarchy': ['resource.material.read'],
            'temperature': ['resource.material.read'],
            'compliance': ['resource.material.read'],
        },
        'facility': {
            'dashboard': ['resource.venue.read'],
            'venues': ['resource.venue.read'],
            'reservations': ['resource.venue.read'],
            'environment': ['resource.environment.read'],
            'incidents': ['resource.environment.write'],
            'cleaning': ['resource.venue.write'],
        },
        'evaluator': {
            'dashboard': ['workorder.workorder.read'],
            'scan': ['workorder.workorder.read'],
            'schedule': ['workorder.workorder.read'],
            'knowledge': [],
            'growth': [],
        },
        'lab-personnel': {
            'dashboard': ['lab_personnel.dashboard.read'],
            'staff': ['lab_personnel.staff.read'],
            'qualifications': ['lab_personnel.qualification.read'],
            'schedules': ['lab_personnel.schedule.read'],
            'worktime': ['lab_personnel.worktime.read'],
            'risks': ['lab_personnel.risk.read'],
            'dispatch': ['lab_personnel.dispatch.read'],
        },
        'ethics': {
            'dashboard': [],
            'applications': [],
            'approvals': [],
            'review-opinions': [],
            'supervisions': [],
            'regulations': [],
            'compliance': [],
            'correspondences': [],
            'trainings': [],
        },
        'admin': {
            'dashboard': ['system.role.manage'],
            'accounts': ['system.account.manage'],
            'roles': ['system.role.manage'],
            'permissions': ['system.role.manage'],
            'sessions': ['system.account.manage'],
            'workstations': ['system.role.manage'],
            'pilot-config': ['system.role.manage'],
            'agents': ['system.role.manage'],
            'audit': ['system.role.manage'],
            'feishu': ['system.role.manage'],
            'config': ['system.role.manage'],
        },
        'control-plane': {
            'dashboard': ['control.dashboard.read'],
            'today-ops': ['control.dashboard.read'],
            'scenarios': ['control.dashboard.read'],
            'resource-health': ['control.dashboard.read'],
            'objects': ['control.object.read'],
            'events': ['control.event.read'],
            'tickets': ['control.ticket.read'],
            'dependencies': ['control.dashboard.read'],
            'audit': ['control.dashboard.read'],
            'agents': ['control.dashboard.read'],
            'standards': ['control.dashboard.read'],
            'blueprint': ['control.dashboard.read'],
            'network': ['control.network.read'],
        },
        'digital-workforce': {
            'chat': [],
            'actions': ['assistant.context.read'],
            'replay': ['assistant.context.read'],
            'policies': ['assistant.policy.manage'],
            'preferences': ['assistant.preference.manage'],
        },
    }

    perm_set = set(perm_codes)
    has_all = '*' in perm_set  # superadmin

    result = {}
    for wb in workbenches:
        menus = MODULE_MENU_MAP.get(wb, {})
        visible = []
        for menu_key, required_perms in menus.items():
            if has_all or not required_perms:
                visible.append(menu_key)
            elif any(p in perm_set for p in required_perms):
                visible.append(menu_key)
            else:
                # 通配符检查
                for p in required_perms:
                    module = p.split('.')[0]
                    if f'{module}.*' in perm_set:
                        visible.append(menu_key)
                        break
        result[wb] = visible
    return result


# ============================================================================
# 端点
# ============================================================================
@router.post(
    '/feishu/callback',
    summary='飞书OAuth回调',
    response={200: dict, 400: dict, 401: dict, 500: dict, 503: dict},
)
def feishu_callback(request, data: FeishuCallbackIn):
    """飞书 OAuth 授权码换取 Token（18 个工作台统一使用子衿 App ID 授权）"""
    logger = auth_logger

    from .services import (
        feishu_oauth_login,
        create_session,
        parse_and_verify_auth_state,
        map_auth_exception_to_error_code,
    )
    from django.conf import settings

    trace_id = data.trace_id or ''
    state_payload = None
    app_id = data.app_id or settings.FEISHU_APP_ID
    _auth_trace(
        request,
        'oauth_callback_start',
        app_id=app_id or '-',
        workstation=data.workstation or '-',
        trace_id=trace_id or '-',
    )
    if data.state:
        try:
            state_payload = parse_and_verify_auth_state(data.state, data.workstation)
            app_id = state_payload.get('app_id', app_id)
            trace_id = state_payload.get('trace_id', trace_id)
            _auth_trace(
                request,
                'oauth_state_verified',
                app_id=app_id or '-',
                workstation=(
                    state_payload.get('ws') if state_payload else data.workstation
                )
                or '-',
                trace_id=trace_id or '-',
            )
        except Exception as e:
            err_code = map_auth_exception_to_error_code(e)
            _auth_trace(
                request,
                'oauth_state_invalid',
                app_id=app_id or '-',
                error_code=err_code,
                trace_id=trace_id or '-',
            )
            return 401, {
                'code': 401,
                'msg': '认证状态无效，请重新登录',
                'data': {'error_code': err_code, 'trace_id': trace_id or ''},
            }

    workstation = (state_payload.get('ws') if state_payload else data.workstation) or ''
    # 兑换授权码必须使用签发该 code 的飞书应用凭证，否则飞书返回 20024。
    # 仅当请求的 app_id 在后端未配置凭证时，才用主应用兜底（如前端误用主应用 ID 的工作台）。
    force_primary = getattr(settings, 'FEISHU_PRIMARY_AUTH_FORCE', True)
    primary_app_id = getattr(settings, 'FEISHU_PRIMARY_APP_ID', None)
    if (
        force_primary
        and primary_app_id
        and (app_id or '') not in getattr(settings, 'FEISHU_APP_CREDENTIALS', {})
    ):
        app_id = primary_app_id
    expected_app_id = settings.FEISHU_WORKSTATION_APP_IDS.get(workstation)
    # force_primary 开启时，app_id 已被替换为主应用，跳过工作台匹配校验
    if (
        workstation
        and expected_app_id
        and app_id != expected_app_id
        and not force_primary
    ):
        logger.warning(
            f'OAuth 回调 app/workstation 不一致: ws={workstation} expected={expected_app_id} got={app_id}'
        )
        _auth_trace(
            request,
            'oauth_app_workstation_mismatch',
            workstation=workstation,
            expected_app_id=expected_app_id,
            app_id=app_id or '-',
            trace_id=trace_id or '-',
        )
        return 400, {
            'code': 400,
            'msg': '飞书应用与工作台不匹配，请从对应工作台入口登录',
            'data': {
                'error_code': 'AUTH_APP_WORKSTATION_MISMATCH',
                'trace_id': trace_id or '',
            },
        }

    app_secret = settings.FEISHU_APP_CREDENTIALS.get(app_id)
    if not app_secret:
        registered = list(settings.FEISHU_APP_CREDENTIALS.keys())
        logger.warning(
            'OAuth 回调: 未识别的 app_id=%s，后端已配置的飞书应用: %s',
            app_id,
            registered,
        )
        _auth_trace(
            request, 'oauth_unknown_app', app_id=app_id or '-', trace_id=trace_id or '-'
        )
        return 400, {
            'code': 400,
            'msg': f'未识别的飞书应用: {app_id}',
            'data': {'error_code': 'AUTH_APP_MISMATCH', 'trace_id': trace_id or ''},
        }

    # 空串会触发 feishu_oauth_login 回退推导；须 strip，避免误用 /login 旧逻辑残留
    callback_redirect_uri = (data.redirect_uri or '').strip() or None
    try:
        account = feishu_oauth_login(
            data.code,
            app_id,
            app_secret,
            state_payload,
            redirect_uri=callback_redirect_uri,
        )
    except ValueError as e:
        logger.error(f'OAuth 回调失败 (app_id={app_id}): {e}')
        _auth_trace(
            request,
            'oauth_callback_error',
            app_id=app_id or '-',
            error_type='value_error',
            trace_id=trace_id or '-',
        )
        return 400, {
            'code': 400,
            'msg': str(e),
            'data': {
                'error_code': map_auth_exception_to_error_code(e),
                'trace_id': trace_id or '',
            },
        }
    except OperationalError as e:
        logger.exception('OAuth 回调: 数据库不可用 (feishu_oauth): %s', e)
        _auth_trace(
            request,
            'oauth_callback_error',
            app_id=app_id or '-',
            error_type='db_unavailable',
            trace_id=trace_id or '-',
        )
        return 503, {
            'code': 503,
            'msg': (
                '数据库暂时不可用。本地开发请确认 PostgreSQL 已启动或已建立 SSH 隧道'
                '（仓库 scripts/ssh_tunnel_postgres.sh），并核对 backend/.env 的 DB_HOST、DB_PORT。'
            ),
            'data': {'error_code': 'AUTH_DB_UNAVAILABLE', 'trace_id': trace_id or ''},
        }
    except Exception as e:
        logger.exception(f"OAuth 回调异常 (app_id={app_id}): {e}")
        _auth_trace(request, 'oauth_callback_error', app_id=app_id or '-', error_type='internal_error', trace_id=trace_id or '-')
        return 500, {
            'code': 500,
            'msg': '认证服务暂时不可用，请稍后重试',
            'data': {'error_code': 'AUTH_INTERNAL_ERROR', 'trace_id': trace_id or ''},
        }

    try:
        token = create_session(
            account,
            device_info=request.META.get('HTTP_USER_AGENT', ''),
            ip_address=request.META.get('REMOTE_ADDR', ''),
        )
    except OperationalError as e:
        logger.exception('OAuth 回调: 数据库不可用 (create_session): %s', e)
        _auth_trace(
            request,
            'oauth_callback_error',
            app_id=app_id or '-',
            error_type='db_unavailable',
            trace_id=trace_id or '-',
        )
        return 503, {
            'code': 503,
            'msg': (
                '数据库暂时不可用。本地开发请确认 PostgreSQL 已启动或已建立 SSH 隧道'
                '（仓库 scripts/ssh_tunnel_postgres.sh），并核对 backend/.env 的 DB_HOST、DB_PORT。'
            ),
            'data': {'error_code': 'AUTH_DB_UNAVAILABLE', 'trace_id': trace_id or ''},
        }

    try:
        profile = _build_user_profile(account)
    except OperationalError as e:
        logger.exception('OAuth 回调: 数据库不可用 (profile): %s', e)
        _auth_trace(
            request,
            'oauth_callback_error',
            app_id=app_id or '-',
            error_type='db_unavailable',
            trace_id=trace_id or '-',
        )
        return 503, {
            'code': 503,
            'msg': (
                '数据库暂时不可用。本地开发请确认 PostgreSQL 已启动或已建立 SSH 隧道'
                '（仓库 scripts/ssh_tunnel_postgres.sh），并核对 backend/.env 的 DB_HOST、DB_PORT。'
            ),
            'data': {'error_code': 'AUTH_DB_UNAVAILABLE', 'trace_id': trace_id or ''},
        }
    except Exception as e:
        logger.exception('OAuth 回调: _build_user_profile 异常 (account_id=%s): %s', account.id, e)
        return 500, {
            'code': 500,
            'msg': '获取用户权限失败，请稍后重试或联系管理员',
            'data': {'error_code': 'AUTH_PROFILE_ERROR', 'trace_id': trace_id or ''},
        }
    role_names = [role.get('name', '') for role in profile.get('roles', [])]
    visible_workbenches = profile.get('visible_workbenches', [])
    visible_menu_items = profile.get('visible_menu_items', {})
    menu_total = sum(len(items) for items in visible_menu_items.values())

    logger.info(f'OAuth 登录成功: account={account.id} app_id={app_id}')
    _auth_trace(
        request,
        'oauth_callback_success',
        account_id=account.id,
        app_id=app_id or '-',
        workstation=workstation or '-',
        roles_count=len(role_names),
        permissions_count=len(profile.get('permissions', [])),
        workbenches_count=len(visible_workbenches),
        menu_items_count=menu_total,
        trace_id=trace_id or '-',
    )
    return {
        'access_token': token,
        'user': {
            'id': account.id,
            'username': account.username,
            'display_name': account.display_name,
            'email': account.email,
            'avatar': account.avatar,
            'account_type': account.account_type,
        },
        'roles': role_names,
        'visible_workbenches': visible_workbenches,
        'session_meta': {
            'workstation': workstation,
            'login_source': 'feishu_oauth',
            'feishu_app_id': app_id,
            'auth_trace_id': trace_id or '',
            'issued_at': timezone.now().isoformat(),
            'expires_at': (
                timezone.now() + timedelta(hours=settings.JWT_EXPIRATION_HOURS)
            ).isoformat(),
            'auth_ver': state_payload.get('ver', 'legacy')
            if state_payload
            else 'legacy',
        },
    }


@router.post(
    '/dev-login',
    summary='开发模式登录（仅 DEBUG）',
    response={200: dict, 403: dict, 500: dict},
)
def dev_login(request):
    """本地开发时免飞书登录，返回 JWT 与用户信息。仅当 DEBUG=True 时可用。"""
    from .services import create_session
    from .models import Account

    if not getattr(settings, 'DEBUG', False):
        return 403, {
            'code': 403,
            'msg': '开发登录仅允许在 DEBUG 模式下使用',
            'data': {'error_code': 'DEV_LOGIN_DISABLED'},
        }
    account = Account.objects.filter(is_deleted=False).first()
    if not account:
        try:
            account = Account.objects.create(
                username='dev-bypass',
                display_name='开发测试用户',
                account_type='internal',
                is_deleted=False,
            )
        except Exception as e:
            auth_logger.exception('dev_login create account failed: %s', e)
            return 500, {'code': 500, 'msg': '创建开发账号失败', 'data': None}
    token = create_session(
        account,
        device_info=request.META.get('HTTP_USER_AGENT', ''),
        ip_address=request.META.get('REMOTE_ADDR', ''),
    )
    try:
        profile = _build_user_profile(account)
        role_names = [r.get('name', '') for r in profile.get('roles', [])]
        visible_workbenches = profile.get('visible_workbenches', [])
        visible_menu_items = profile.get('visible_menu_items', {})
        workstation_modes = profile.get('workstation_modes', {})
    except Exception:
        role_names = []
        visible_workbenches = ['evaluator', 'secretary']
        visible_menu_items = {
            'evaluator': [
                'dashboard',
                'workorders',
                'scan',
                'schedule',
                'detections',
                'exceptions',
                'history',
                'knowledge',
                'growth',
                'profile',
                'settings',
            ]
        }
        workstation_modes = {'evaluator': 'full'}
    return {
        'access_token': token,
        'user': {
            'id': account.id,
            'username': account.username,
            'display_name': account.display_name or account.username,
            'email': account.email or '',
            'avatar': account.avatar or '',
            'account_type': account.account_type,
        },
        'roles': role_names,
        'visible_workbenches': visible_workbenches,
        'visible_menu_items': visible_menu_items,
        'workstation_modes': workstation_modes,
    }


@router.post(
    '/wechat/login',
    summary='微信小程序手机号一键登录',
    response={200: dict, 400: dict, 500: dict},
)
def wechat_login(request, data: WechatLoginIn):
    """
    微信小程序手机号一键登录（无状态版）

    Flow:
    - 前端通过 getPhoneNumber 获取 code
    - 后端用 code 调用微信 getuserphonenumber API 换取手机号
    - 创建仅包含手机号的 JWT Token（不持久化到数据库）
    """
    from .phone_session import create_phone_session

    trace_id = request.META.get('HTTP_X_CLIENT_TRACE_ID', '')[:80]
    code = data.code
    code_len = len(code or '')
    started = time.monotonic()

    _auth_trace(
        request,
        'wechat_phone_login_start',
        trace_id=trace_id or '-',
        code_len=code_len,
    )

    try:
        # Step 1: Get access_token from cache or WeChat API
        access_token, from_cache = _ensure_wechat_access_token()
        auth_logger.info(
            f"wechat_access_token_ready trace_id={trace_id or '-'} from_cache={from_cache}"
        )

        # Step 2: Call getuserphonenumber API
        phone_result = _call_wechat_getuserphonenumber(access_token, code)

        auth_logger.info(
            f"wechat_getuserphonenumber_result trace_id={trace_id or '-'} "
            f"errcode={phone_result.get('errcode')} has_phone_info={'phone_info' in phone_result}"
        )

        # Step 3: Handle token expired (40001) with retry
        if phone_result.get('errcode') == 40001:
            auth_logger.warning(
                f"wechat_access_token_expired trace_id={trace_id or '-'}, retrying..."
            )
            _invalidate_wechat_token_cache()
            access_token, _ = _ensure_wechat_access_token()
            phone_result = _call_wechat_getuserphonenumber(access_token, code)

            auth_logger.info(
                f"wechat_getuserphonenumber_retry_result trace_id={trace_id or '-'} "
                f"errcode={phone_result.get('errcode')} has_phone_info={'phone_info' in phone_result}"
            )

        # Step 4: Check for errors
        errcode = phone_result.get('errcode', 0)
        if errcode != 0:
            errmsg = phone_result.get('errmsg', '微信接口错误')
            auth_logger.error(
                f"wechat_getuserphonenumber_error trace_id={trace_id or '-'} "
                f'errcode={errcode} errmsg={errmsg}'
            )
            return 400, {
                'code': 400,
                'msg': f'获取手机号失败: {errmsg}',
                'data': {'error_code': 'WECHAT_PHONE_API_ERROR'},
            }

        # Step 5: Extract phone number
        phone_info = phone_result.get('phone_info', {})
        phone_number = phone_info.get('phoneNumber') or phone_info.get(
            'purePhoneNumber'
        )

        if not phone_number:
            auth_logger.error(f"wechat_phone_number_missing trace_id={trace_id or '-'}")
            return 400, {
                'code': 400,
                'msg': '未能获取到手机号',
                'data': {'error_code': 'WECHAT_PHONE_NOT_FOUND'},
            }

        elapsed_ms = int((time.monotonic() - started) * 1000)
        auth_logger.info(
            f"wechat_phone_login_success trace_id={trace_id or '-'} "
            f'phone={phone_number[:3]}****{phone_number[-4:]} elapsed_ms={elapsed_ms}'
        )

    except ValueError as e:
        elapsed_ms = int((time.monotonic() - started) * 1000)
        _auth_trace(
            request,
            'wechat_phone_login_fail',
            trace_id=trace_id or '-',
            elapsed_ms=elapsed_ms,
            error=str(e)[:220],
        )
        return 400, {
            'code': 400,
            'msg': str(e),
            'data': {'error_code': 'WECHAT_PHONE_API_ERROR'},
        }
    except Exception as exc:
        import traceback

        elapsed_ms = int((time.monotonic() - started) * 1000)
        tb = traceback.format_exc()[-500:]
        _auth_trace(
            request,
            'wechat_phone_login_error',
            trace_id=trace_id or '-',
            elapsed_ms=elapsed_ms,
            error=f'{exc.__class__.__name__}: {exc}',
        )
        return 500, {
            'code': 500,
            'msg': f'{exc.__class__.__name__}: {str(exc)[:200]}',
            'data': {'error_code': 'WECHAT_LOGIN_INTERNAL_ERROR', 'traceback': tb},
        }

    # Step 6: Create or update Subject record in t_subject (no account link)
    from apps.subject.models import Subject, AuthLevel, SubjectSourceChannel, SubjectStatus
    from apps.subject.services.subject_service import generate_subject_no

    try:
        subject = Subject.objects.filter(phone=phone_number, is_deleted=False).first()
        if not subject:
            subject = Subject.objects.create(
                subject_no=generate_subject_no(),
                name='微信用户',
                phone=phone_number,
                source_channel=SubjectSourceChannel.WECHAT,
                auth_level=AuthLevel.PHONE_VERIFIED,
                status=SubjectStatus.SCREENING,
            )
            auth_logger.info(f"wechat_subject_created trace_id={trace_id or '-'} subject_no={subject.subject_no}")
        else:
            # Update auth_level if needed
            if subject.auth_level != AuthLevel.PHONE_VERIFIED:
                subject.auth_level = AuthLevel.PHONE_VERIFIED
                subject.save(update_fields=['auth_level', 'update_time'])
            auth_logger.info(f"wechat_subject_exists trace_id={trace_id or '-'} subject_no={subject.subject_no}")
    except Exception as e:
        auth_logger.exception('wechat_login subject create/update failed: %s', e)
        # Don't fail the login, just log the error
        subject = None

    # Create phone-only session (no database persistence)
    token = create_phone_session(
        phone_number,
        device_info=request.META.get('HTTP_USER_AGENT', ''),
        ip_address=request.META.get('REMOTE_ADDR', ''),
    )

    elapsed_ms = int((time.monotonic() - started) * 1000)
    _auth_trace(
        request,
        'wechat_phone_login_complete',
        trace_id=trace_id or '-',
        phone=f'{phone_number[:3]}****{phone_number[-4:]}',
        subject_no=subject.subject_no if subject else None,
        elapsed_ms=elapsed_ms,
    )

    return {
        'access_token': token,
        'subject': {
            'id': subject.id if subject else None,
            'subject_no': subject.subject_no if subject else None,
            'name': subject.name if subject else None,
            'phone': phone_number,
        },
    }


@router.post('/wechat/logout', summary='微信登出')
def wechat_logout(request):
    """
    微信登出：将 Token 加入 Redis 黑名单实现失效
    """
    from .phone_session import revoke_phone_session

    _auth_trace(request, 'wechat_logout')
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        revoke_phone_session(token)
        _auth_trace(request, 'wechat_logout_revoked')
    return {'code': 200, 'msg': 'OK'}


def _ensure_subject_account_by_phone(phone: str):
    from .models import Account, AccountType
    from .services import _ensure_subject_self_role
    from apps.subject.models import Subject, AuthLevel
    from apps.subject.services.subject_service import (
        generate_subject_no,
        find_subjects_by_mobile_normalized,
        normalize_subject_phone,
        resolve_subject_for_mobile_session,
    )

    account = Account.objects.filter(
        phone=phone, account_type=AccountType.SUBJECT, is_deleted=False
    ).first()
    if not account:
        account = Account.objects.filter(
            username=f'sms_{phone}', is_deleted=False
        ).first()
    if not account:
        account = Account.objects.create(
            username=f'sms_{phone}',
            display_name='受试者',
            account_type=AccountType.SUBJECT,
            phone=phone,
        )
    elif account.phone != phone:
        account.phone = phone
        account.save(update_fields=['phone', 'update_time'])

    n = normalize_subject_phone(phone)
    subject = None
    if n and find_subjects_by_mobile_normalized(n).exists():
        subject = resolve_subject_for_mobile_session(phone, timezone.localdate())
    if subject is None:
        subject = Subject.objects.filter(phone=phone, is_deleted=False).first()
    if not subject:
        subject = Subject.objects.create(
            subject_no=generate_subject_no(),
            account=account,
            name='受试者',
            phone=n if n else phone,
            auth_level=AuthLevel.PHONE_VERIFIED,
        )
    else:
        update_fields = []
        if not subject.account_id:
            subject.account = account
            update_fields.append('account')
        if (subject.phone or '').strip() != phone:
            subject.phone = phone
            update_fields.append('phone')
        if (
            subject.auth_level != AuthLevel.PHONE_VERIFIED
            and not subject.identity_verified_at
        ):
            subject.auth_level = AuthLevel.PHONE_VERIFIED
            update_fields.append('auth_level')
        if update_fields:
            update_fields.append('update_time')
            subject.save(update_fields=update_fields)

    # 短信等渠道创建的受试者账号须具备 subject_self（含 my.*），否则 /my/* 报缺少 my.profile.read
    _ensure_subject_self_role(account)

    return account, subject


@router.post(
    '/sms/send', summary='发送短信验证码', response={200: dict, 400: dict, 500: dict}
)
def sms_send(request, data: SmsSendIn):
    from .services_sms import send_sms_verify_code

    try:
        result = send_sms_verify_code(
            phone=data.phone,
            scene=data.scene,
            ip_address=request.META.get('REMOTE_ADDR', ''),
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    except Exception as e:
        auth_logger.exception('sms_send failed: %s', e)
        return 500, {'code': 500, 'msg': '短信服务暂不可用', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post(
    '/sms/verify',
    summary='校验短信验证码并登录',
    response={200: dict, 400: dict, 500: dict},
)
def sms_verify(request, data: SmsVerifyIn):
    from .services import create_session
    from .services_sms import verify_sms_code

    try:
        result = verify_sms_code(
            phone=data.phone,
            code=data.code,
            scene=data.scene,
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    except Exception as e:
        auth_logger.exception('sms_verify failed: %s', e)
        return 500, {'code': 500, 'msg': '验证码校验失败', 'data': None}

    try:
        with transaction.atomic():
            account, _subject = _ensure_subject_account_by_phone(result['phone'])
            token = create_session(
                account,
                device_info=request.META.get('HTTP_USER_AGENT', ''),
                ip_address=request.META.get('REMOTE_ADDR', ''),
            )
    except Exception as e:
        auth_logger.exception('sms_verify login failed: %s', e)
        return 500, {'code': 500, 'msg': '登录失败，请稍后重试', 'data': None}

    # 获取角色信息，与飞书 OAuth 登录保持一致
    try:
        profile = _build_user_profile(account)
        role_names = [r['name'] for r in profile.get('roles', [])]
        visible_workbenches = profile.get('visible_workbenches', [])
    except Exception:
        role_names = []
        visible_workbenches = []

    return {
        'access_token': token,
        'user': {
            'id': account.id,
            'username': account.username,
            'display_name': account.display_name,
            'email': account.email or '',
            'avatar': account.avatar or '',
            'account_type': account.account_type,
        },
        'roles': role_names,
        'visible_workbenches': visible_workbenches,
    }


@router.post('/wechat/bind-phone', summary='绑定受试者手机号')
def wechat_bind_phone(request, data: WechatBindPhoneIn):
    """微信小程序首次登录后，按手机号绑定 Subject"""
    from .services import verify_jwt_token
    from .models import Account
    from apps.subject.models import Subject

    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    phone = (data.phone or '').strip()
    if not phone:
        return 400, {'code': 400, 'msg': '请输入手机号', 'data': None}

    subject = Subject.objects.filter(phone=phone, is_deleted=False).first()
    if not subject:
        return 400, {
            'code': 400,
            'msg': '未找到该手机号对应的预约信息，请确认后重试',
            'data': {'needs_bind': True},
        }

    subject.account = account
    subject.save(update_fields=['account', 'update_time'])

    return {
        'code': 200,
        'msg': '绑定成功',
        'data': {
            'subject_id': subject.id,
            'subject_no': subject.subject_no,
            'name': subject.name,
        },
    }


@router.get('/me', summary='当前用户信息', response={200: dict, 401: dict})
def get_me(request):
    """获取当前登录用户基本信息 + 角色列表"""
    try:
        account = _get_account_from_request(request)
    except Exception as e:
        auth_logger.exception('get_me: _get_account_from_request 异常: %s', e)
        return 401, {'code': 401, 'msg': '认证服务异常', 'data': None}
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    try:
        from .authz import get_authz_service
        authz = get_authz_service()
        role_names = list(authz.get_account_role_names(account.id))
    except Exception as e:
        auth_logger.exception('get_me: authz 异常 (account_id=%s): %s', account.id, e)
        return 500, {'code': 500, 'msg': '获取角色失败', 'data': None}

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': account.id,
            'username': account.username,
            'display_name': account.display_name,
            'email': account.email or '',
            'avatar': account.avatar or '',
            'account_type': account.account_type,
            'roles': role_names,
        },
    }


def _default_dev_profile():
    """DEBUG + dev-bypass 且库中无账号时返回的默认画像，便于本地只开前端时也能进接待台。"""
    return {
        'id': 0,
        'username': 'dev-bypass',
        'display_name': '开发测试用户',
        'email': 'dev@cnkis.local',
        'avatar': '',
        'account_type': 'dev',
        'roles': [
            {'name': 'admin', 'display_name': '管理员', 'level': 0, 'category': ''}
        ],
        'permissions': ['*'],
        'data_scope': 'global',
        'visible_workbenches': ['reception', 'secretary'],
        'visible_menu_items': {
            'reception': [
                'dashboard',
                'appointments',
                'schedule',
                'scan',
                'station-qr',
                'journey',
                'analytics',
                'display',
            ],
        },
    }


@router.get(
    '/profile', summary='完整用户画像', response={200: dict, 401: dict, 500: dict}
)
def get_profile(request):
    """
    获取完整用户画像：角色、权限、数据作用域、可见工作台、可见菜单

    前端在登录后调用此接口获取权限信息，用于动态渲染菜单和功能。
    """
    from django.conf import settings

    try:
        account = _get_account_from_request(request)
    except Exception as e:
        auth_logger.exception('get_profile _get_account_from_request failed: %s', e)
        return 500, {'code': 500, 'msg': f'获取账号失败: {e!s}', 'data': None}

    # DEBUG + dev-bypass-token 且库中无账号时返回默认 profile，避免本地只开前端时 401/500
    if not account:
        if getattr(settings, 'DEBUG', False):
            auth_header = request.META.get('HTTP_AUTHORIZATION', '')
            if auth_header == 'Bearer dev-bypass-token':
                _auth_trace(request, 'profile_dev_bypass_fallback')
                return {'code': 200, 'msg': 'OK', 'data': _default_dev_profile()}
        _auth_trace(request, 'profile_unauthorized')
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    try:
        profile = _build_user_profile(account)
    except Exception as e:
        auth_logger.exception('get_profile _build_user_profile failed: %s', e)
        return 500, {'code': 500, 'msg': f'构建用户画像失败: {e!s}', 'data': None}

    try:
        visible_menu_items = profile.get('visible_menu_items', {})
        menu_total = sum(len(items) for items in visible_menu_items.values())
        _auth_trace(
            request,
            'profile_returned',
            account_id=account.id,
            username=account.username,
            roles_count=len(profile.get('roles', [])),
            permissions_count=len(profile.get('permissions', [])),
            workbenches_count=len(profile.get('visible_workbenches', [])),
            menu_items_count=menu_total,
        )
    except Exception:
        pass
    return {'code': 200, 'msg': 'OK', 'data': profile}


@router.post('/logout', summary='登出')
def logout(request):
    """撤销当前会话"""
    import hashlib
    from .models import SessionToken

    _auth_trace(request, 'logout_start')
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:]
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        revoked = SessionToken.objects.filter(token_hash=token_hash).update(
            is_revoked=True
        )
        _auth_trace(request, 'logout_success', revoked_sessions=revoked)
    else:
        _auth_trace(request, 'logout_no_token')

    return {'code': 200, 'msg': 'OK'}


# ============================================================================
# 角色管理 API（需要 system.role.manage 权限）
# ============================================================================
class AssignRoleIn(Schema):
    account_id: int
    role_name: str
    project_id: Optional[int] = None


class RemoveRoleIn(Schema):
    account_id: int
    role_name: str
    project_id: Optional[int] = None


class RoleListOut(Schema):
    name: str
    display_name: str
    level: int
    category: str
    description: str
    is_system: bool


@router.get(
    '/roles/list', summary='角色列表', response={200: dict, 401: dict, 403: dict}
)
@require_any_permission(['system.role.read', 'system.role.manage'])
def list_roles(request):
    """获取所有可用角色（需 system.role.read 或 system.role.manage 权限）"""
    from .decorators import _get_account_from_request as get_acct

    account = get_acct(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .models import Role

    roles = Role.objects.filter(is_active=True).order_by('-level', 'name')
    data = [
        {
            'name': r.name,
            'display_name': r.display_name,
            'level': r.level,
            'category': r.category,
            'description': r.description,
            'is_system': r.is_system,
        }
        for r in roles
    ]
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get(
    '/roles/account/{account_id}',
    summary='用户角色列表',
    response={200: dict, 401: dict, 403: dict},
)
@require_any_permission(['system.role.read', 'system.role.manage'])
def list_account_roles(request, account_id: int):
    """获取指定用户的角色（需 system.role.read 或 system.role.manage 权限）"""
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .authz import get_authz_service

    authz = get_authz_service()
    roles = authz.get_account_roles(account_id)
    data = [
        {
            'name': r.name,
            'display_name': r.display_name,
            'level': r.level,
            'category': r.category,
        }
        for r in roles
    ]
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post(
    '/roles/assign', summary='分配角色', response={200: dict, 401: dict, 403: dict}
)
def assign_role(request, data: AssignRoleIn):
    """
    为用户分配角色

    需要 system.role.manage 权限（admin/superadmin）。
    可选指定 project_id 用于项目级角色分配。
    """
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .authz import get_authz_service

    authz = get_authz_service()
    if not authz.has_permission(account, 'system.role.manage'):
        return 403, {
            'code': 403,
            'msg': '无角色管理权限',
            'data': {'required_permission': 'system.role.manage'},
        }

    created = authz.assign_role(data.account_id, data.role_name, data.project_id)
    return {
        'code': 200,
        'msg': '角色已分配' if created else '角色已存在',
        'data': {'created': created},
    }


@router.post(
    '/roles/remove', summary='移除角色', response={200: dict, 401: dict, 403: dict}
)
def remove_role(request, data: RemoveRoleIn):
    """
    移除用户角色

    需要 system.role.manage 权限（admin/superadmin）。
    """
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .authz import get_authz_service

    authz = get_authz_service()
    if not authz.has_permission(account, 'system.role.manage'):
        return 403, {
            'code': 403,
            'msg': '无角色管理权限',
            'data': {'required_permission': 'system.role.manage'},
        }

    removed = authz.remove_role(data.account_id, data.role_name, data.project_id)
    return {
        'code': 200,
        'msg': '角色已移除' if removed else '角色不存在',
        'data': {'removed': removed},
    }


@router.get(
    '/accounts/list', summary='账号列表', response={200: dict, 401: dict, 403: dict}
)
def list_accounts(
    request, page: int = 1, page_size: int = 50, keyword: Optional[str] = None
):
    """
    获取系统账号列表（含角色信息）

    需要 system.account.manage 权限。
    """
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}

    from .authz import get_authz_service

    authz = get_authz_service()
    if not authz.has_permission(account, 'system.account.manage'):
        return 403, {
            'code': 403,
            'msg': '无账号管理权限',
            'data': {'required_permission': 'system.account.manage'},
        }

    from .models import Account, AccountRole

    qs = Account.objects.filter(is_deleted=False)
    if keyword:
        from django.db.models import Q

        qs = qs.filter(
            Q(display_name__icontains=keyword)
            | Q(username__icontains=keyword)
            | Q(email__icontains=keyword)
        )
    qs = qs.order_by('-last_login_time', '-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset : offset + page_size])

    # 批量获取角色（与前端约定：{ name, display_name }[]；按 role.name 去重，避免项目级多行重复）
    account_ids = [a.id for a in items]
    role_map = {}  # account_id -> { role_name: { name, display_name } }
    for ar in AccountRole.objects.filter(account_id__in=account_ids).select_related('role'):
        r = ar.role
        bucket = role_map.setdefault(ar.account_id, {})
        bucket[r.name] = {
            'name': r.name,
            'display_name': (r.display_name or '').strip() or r.name,
        }

    data = [
        {
            'id': a.id,
            'username': a.username,
            'display_name': a.display_name,
            'email': a.email,
            'avatar': a.avatar,
            'account_type': a.account_type,
            'status': a.status,
            'roles': list(role_map.get(a.id, {}).values()),
            'last_login_time': a.last_login_time.isoformat() if a.last_login_time else None,
            'create_time': a.create_time.isoformat(),
        }
        for a in items
    ]
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'items': data, 'total': total, 'page': page, 'page_size': page_size},
    }


# ============================================================================
# 工作台配置管理 API（渐进上线支持）
# ============================================================================

# 18 个工作台的合法标识（来自 workstation-independence.mdc）
VALID_WORKSTATION_KEYS = {
    'secretary',
    'finance',
    'research',
    'execution',
    'quality',
    'hr',
    'crm',
    'recruitment',
    'equipment',
    'material',
    'facility',
    'evaluator',
    'lab-personnel',
    'ethics',
    'reception',
    'control-plane',
    'admin',
    'digital-workforce',
}

VALID_MODES = {'blank', 'pilot', 'full'}


class WorkstationConfigIn(Schema):
    workstation: str
    mode: str  # blank / pilot / full
    enabled_menus: List[str] = []
    note: str = ''


class WorkstationConfigBatchIn(Schema):
    configs: List[WorkstationConfigIn]


@router.get('/workstation-config/{account_id}', summary='查看用户工作台配置')
@require_permission('system.account.manage')
def get_workstation_config(request, account_id: int):
    """
    查看指定用户的工作台配置列表。
    需要 system.account.manage 权限。
    """
    from .models import Account, AccountWorkstationConfig

    target = Account.objects.filter(id=account_id, is_deleted=False).first()
    if not target:
        return {'code': 404, 'msg': f'账号不存在: {account_id}', 'data': None}

    configs = AccountWorkstationConfig.objects.filter(account_id=account_id)
    data = [
        {
            'workstation': c.workstation,
            'mode': c.mode,
            'enabled_menus': c.enabled_menus or [],
            'note': c.note,
            'update_time': c.update_time.isoformat(),
        }
        for c in configs
    ]
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'account_id': account_id,
            'username': target.username,
            'configs': data,
        },
    }


@router.get('/users', summary='已登录用户列表（绩效台权限管理用）')
@require_permission('system.role.manage')
def list_users_for_perf(request, page: int = 1, page_size: int = 200, q: str = ''):
    """
    供绩效台「权限管理」下拉框使用：返回所有有效账号的基本信息。
    需要 system.role.manage 权限（管理员级别）。
    返回格式兼容绩效台前端所需的 { openId, name, avatar, username } 结构。
    """
    from .models import Account

    qs = Account.objects.filter(is_deleted=False, status='active').order_by(
        'display_name'
    )
    if q:
        qs = qs.filter(
            Q(display_name__icontains=q)
            | Q(username__icontains=q)
            | Q(feishu_open_id__icontains=q)
        )
    total = qs.count()
    offset = (page - 1) * page_size
    accounts = qs[offset : offset + page_size]
    items = [
        {
            'openId': a.feishu_open_id or a.username,
            'name': a.display_name or a.username,
            'username': a.username,
            'avatar': a.avatar or '',
            'lastLogin': a.last_login_time.isoformat() if a.last_login_time else '',
        }
        for a in accounts
    ]
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'items': items, 'total': total, 'page': page, 'page_size': page_size},
    }


@router.put('/workstation-config/{account_id}', summary='批量设置用户工作台配置')
@require_permission('system.account.manage')
def set_workstation_config(request, account_id: int, data: WorkstationConfigBatchIn):
    """
    批量设置指定用户的工作台配置（覆盖式更新）。
    需要 system.account.manage 权限。

    规则：
    - mode=full：删除对应记录（减少冗余）
    - 同一用户同一工作台唯一约束：upsert 操作
    - workstation 必须在 15 个合法工作台标识中
    - mode 必须是 blank/pilot/full 之一
    """
    from .models import Account, AccountWorkstationConfig
    from .authz import get_authz_service

    target = Account.objects.filter(id=account_id, is_deleted=False).first()
    if not target:
        return {'code': 404, 'msg': f'账号不存在: {account_id}', 'data': None}

    errors = []
    for cfg_in in data.configs:
        if cfg_in.workstation not in VALID_WORKSTATION_KEYS:
            errors.append(f'非法工作台标识: {cfg_in.workstation}')
        if cfg_in.mode not in VALID_MODES:
            errors.append(f'非法模式: {cfg_in.mode}（必须是 blank/pilot/full 之一）')

    if errors:
        return {'code': 400, 'msg': '参数校验失败', 'data': {'errors': errors}}

    updated = []
    deleted = []

    for cfg_in in data.configs:
        if cfg_in.mode == 'full':
            # mode=full 自动删除记录（等价于默认行为）
            count, _ = AccountWorkstationConfig.objects.filter(
                account_id=account_id, workstation=cfg_in.workstation
            ).delete()
            if count:
                deleted.append(cfg_in.workstation)
        else:
            obj, created = AccountWorkstationConfig.objects.update_or_create(
                account_id=account_id,
                workstation=cfg_in.workstation,
                defaults={
                    'mode': cfg_in.mode,
                    'enabled_menus': cfg_in.enabled_menus,
                    'note': cfg_in.note,
                },
            )
            updated.append(
                {
                    'workstation': cfg_in.workstation,
                    'mode': cfg_in.mode,
                    'created': created,
                }
            )

    # 清除权限缓存（profile 中会重新计算）
    authz = get_authz_service()
    authz.clear_cache(account_id)

    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'account_id': account_id,
            'updated': updated,
            'deleted_workstations': deleted,
        },
    }
