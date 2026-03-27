"""
研究台菜单配置 API — 研究台侧栏与「权限管理」页

与 v1 对齐：GET /api/v1/menu-config/ping 等；数据来自 Account + AccountWorkstationConfig + _build_user_profile。
"""
from ninja import Router, Schema
from typing import List, Optional
from django.http import HttpRequest

from .api import _get_account_from_request, _build_user_profile

router = Router()

# 与 research 台 AppLayout MENU_KEY_TO_PATH 键一致（缺省全量菜单）
RESEARCH_MENU_KEYS = [
    'workbench', 'weekly', 'manager', 'portfolio', 'clients', 'business',
    'proposal-design', 'protocols', 'trial-initiation', 'feasibility', 'proposals', 'proposals/quality-check',
    'image-analysis/face', 'image-analysis/lip', 'image-analysis/lip/scaliness', 'image-analysis/hand', 'image-analysis/other',
    'data-statistics', 'data-report-preparation', 'trial-report-preparation',
    'closeout', 'closeout/settlement', 'changes', 'tasks', 'visits', 'subjects', 'diary', 'data-collection-monitor',
    'team', 'knowledge', 'ai-assistant', 'overview', 'admin/permissions',
]


def _is_admin(request: HttpRequest) -> bool:
    account = _get_account_from_request(request)
    if not account:
        return False
    profile = _build_user_profile(account)
    roles = profile.get('roles') or []
    role_names = [r.get('name') for r in roles if isinstance(r, dict)]
    return 'admin' in role_names or 'superadmin' in role_names


@router.get('/ping')
def menu_config_ping(request: HttpRequest):
    """当前用户可见的研究台菜单 key 列表（query: username, display_name, avatar 可附带，供上报）。"""
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未授权', 'data': None}
    profile = _build_user_profile(account)
    roles = profile.get('roles') or []
    role_names = [r.get('name') for r in roles if isinstance(r, dict)]
    if 'researcher' in role_names:
        menus = list(RESEARCH_MENU_KEYS)
    else:
        visible = (profile.get('visible_menu_items') or {}).get('research')
        if visible is not None:
            menus = visible
        else:
            menus = list(RESEARCH_MENU_KEYS)
    return {'code': 200, 'msg': 'OK', 'menus': menus}


@router.get('/users')
def menu_config_users(request: HttpRequest):
    """管理员：用户列表及每人研究台菜单。"""
    if not _is_admin(request):
        return 403, {'code': 403, 'msg': '仅管理员可访问', 'data': None}
    from .models import Account, AccountWorkstationConfig

    users_out = []
    for acc in Account.objects.filter(is_deleted=False).order_by('-last_login_time', '-create_time')[:200]:
        cfg = AccountWorkstationConfig.objects.filter(
            account=acc, workstation='research'
        ).first()
        if cfg and cfg.mode == 'pilot':
            menus = list(cfg.enabled_menus or [])
        else:
            menus = list(RESEARCH_MENU_KEYS)
        last_seen = acc.last_login_time or acc.create_time
        users_out.append({
            'username': acc.username,
            'display_name': acc.display_name or acc.username,
            'avatar': acc.avatar or '',
            'last_seen': last_seen.isoformat() if last_seen else '',
            'menus': menus,
        })
    return {
        'code': 200,
        'msg': 'OK',
        'users': users_out,
        'all_menu_keys': RESEARCH_MENU_KEYS,
        'defaults': RESEARCH_MENU_KEYS,
        'feishu_connected': False,
    }


class MenuConfigUserIn(Schema):
    username: str
    menus: Optional[List[str]] = None


@router.put('/user')
def menu_config_save_user(request: HttpRequest, payload: MenuConfigUserIn):
    """管理员：保存指定用户的研究台菜单。"""
    if not _is_admin(request):
        return 403, {'code': 403, 'msg': '仅管理员可访问', 'data': None}
    from .models import Account, AccountWorkstationConfig

    account = Account.objects.filter(username=payload.username, is_deleted=False).first()
    if not account:
        return 404, {'code': 404, 'msg': '用户不存在', 'data': None}

    menu_list = list(payload.menus) if payload.menus is not None else list(RESEARCH_MENU_KEYS)
    menu_list = [k for k in menu_list if k in RESEARCH_MENU_KEYS]

    cfg, _ = AccountWorkstationConfig.objects.update_or_create(
        account=account,
        workstation='research',
        defaults={
            'mode': 'pilot',
            'enabled_menus': menu_list,
        },
    )
    return {'code': 200, 'msg': 'OK', 'data': {'menus': cfg.enabled_menus}}


class MenuConfigDefaultsIn(Schema):
    menus: Optional[List[str]] = None


@router.put('/defaults')
def menu_config_defaults(request: HttpRequest, payload: MenuConfigDefaultsIn):
    if not _is_admin(request):
        return 403, {'code': 403, 'msg': '仅管理员可访问', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': {}}


@router.post('/sync-feishu')
def menu_config_sync_feishu(request: HttpRequest):
    if not _is_admin(request):
        return 403, {'code': 403, 'msg': '仅管理员可访问', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': {'ok': True, 'count': 0}}
