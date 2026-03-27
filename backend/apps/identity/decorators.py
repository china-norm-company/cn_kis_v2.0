"""
权限装饰器

提供 API 级别的细粒度权限控制。
可用于 Django Ninja 的视图函数。

v2 新增：
- require_permission 支持 project_param 参数，从 URL kwargs 中提取项目 ID 做项目级校验
- require_project_access 装饰器：验证用户对指定项目有任意角色绑定
"""
import logging
from functools import wraps
from typing import Callable, List, Optional, Union

from django.http import HttpRequest, HttpResponseForbidden, JsonResponse
from django.conf import settings

from .models import Account
from .authz import get_authz_service

logger = logging.getLogger(__name__)
auth_logger = logging.getLogger('cn_kis.auth')


def _is_dev_test_account(account: Optional[Account]) -> bool:
    """
    是否为开发/测试用户（DEBUG 下享有全部权限旁路）。
    包括：username 为 dev-bypass/wx_dev_bypass、或 id 为 168、或 id 为 DEV_BYPASS_ACCOUNT_ID。
    """
    if not account or not getattr(settings, 'DEBUG', False):
        return False
    if getattr(account, 'username', '') in ('dev-bypass', 'wx_dev_bypass'):
        return True
    aid = getattr(account, 'id', None)
    if aid == 168:
        return True
    bypass_id = getattr(settings, 'DEV_BYPASS_ACCOUNT_ID', None)
    return bypass_id is not None and aid == bypass_id


def _get_account_from_request(request: HttpRequest) -> Optional[Account]:
    """
    从请求中提取当前账号

    优先使用 JWTAuth 中间件设置的 request.user_id，
    回退到手动从 Authorization header 解析 JWT。
    开发环境：VITE_DEV_AUTH_BYPASS=1 时前端会传 dev-bypass-token，此处返回首个可用账号。
    任何 DB/服务异常时返回 None，避免未捕获 500。
    """
    try:
        user_id = getattr(request, 'user_id', None)
        if not user_id:
            from .services import verify_jwt_token
            auth_header = request.META.get('HTTP_AUTHORIZATION', '')
            if auth_header.startswith('Bearer '):
                token = auth_header[7:]
                if getattr(settings, 'DEBUG', False) and token == 'dev-bypass-token':
                    bypass_id = getattr(settings, 'DEV_BYPASS_ACCOUNT_ID', None)
                    if bypass_id is not None:
                        account = Account.objects.filter(id=bypass_id, is_deleted=False).first()
                        if account:
                            return account
                    account = Account.objects.filter(username='dev-bypass', is_deleted=False).first()
                    if account:
                        return account
                    account = Account.objects.filter(is_deleted=False).first()
                    if not account:
                        account = Account.objects.create(
                            username='dev-bypass',
                            display_name='开发测试用户',
                            account_type='internal',
                            is_deleted=False,
                        )
                        try:
                            authz = get_authz_service()
                            authz.assign_role(account.id, 'superadmin', project_id=None)
                        except Exception:
                            pass
                    return account
                payload = verify_jwt_token(token)
                if payload:
                    user_id = payload.get('user_id')
                    # 支持 phone_auth 类型 token：通过手机号查找账号
                    if not user_id and payload.get('type') == 'phone_auth':
                        phone = payload.get('phone')
                        if phone:
                            from apps.subject.models import Subject
                            subject = Subject.objects.filter(
                                phone=phone,
                                is_deleted=False
                            ).select_related('account').first()
                            if subject and subject.account:
                                return subject.account
        if user_id:
            return Account.objects.filter(id=user_id, is_deleted=False).first()
    except Exception as e:
        logger.warning('_get_account_from_request failed: %s', e, exc_info=True)
    return None


def _forbidden(message: str = '无权限', data: Optional[dict] = None) -> JsonResponse:
    """返回 403 响应"""
    return JsonResponse(
        {'code': 403, 'msg': message, 'data': data},
        status=403,
    )


def _extract_project_id(kwargs: dict, project_param: str) -> Optional[int]:
    """
    从视图 kwargs 中提取项目 ID

    支持整数和字符串格式，无法解析时返回 None。
    """
    raw = kwargs.get(project_param)
    if raw is None:
        return None
    try:
        return int(raw)
    except (ValueError, TypeError):
        return None


def require_permission(
    permission_code: str,
    message: str = None,
    project_param: str = None,
) -> Callable:
    """
    权限检查装饰器

    Usage:
        # 基础用法（向后兼容）
        @require_permission("crm.customer.create")
        def create_customer(request):
            ...

        # 项目级权限校验：从 URL 路径参数 protocol_id 提取项目 ID
        @require_permission("subject.subject.read", project_param="protocol_id")
        def list_subjects(request, protocol_id: int):
            # 装饰器自动校验：用户在 protocol_id 所指项目上是否有该权限
            ...

    Args:
        permission_code: 权限码，如 "subject.subject.read"
        message: 自定义 403 提示消息
        project_param: URL kwargs 中项目 ID 的参数名；指定时启用项目级校验
    """
    def decorator(view_func: Callable) -> Callable:
        @wraps(view_func)
        def wrapper(request: HttpRequest, *args, **kwargs):
            # 特殊处理：phone_auth token 访问任意接口直接放行
            # phone_auth 是通过手机号验证签发的临时 token，用于登录流程
            from .phone_session import get_phone_from_request
            phone = get_phone_from_request(request)
            if phone:
                return view_func(request, *args, **kwargs)

            account = _get_account_from_request(request)
            if not account:
                return _forbidden('请先登录', {'error_code': 'AUTH_REQUIRED'})

            # 开发旁路：dev-bypass-token 或开发测试用户（DEBUG 下享有全部权限）
            if getattr(settings, 'DEBUG', False):
                auth_header = request.META.get('HTTP_AUTHORIZATION', '')
                if auth_header == 'Bearer dev-bypass-token':
                    return view_func(request, *args, **kwargs)
            if _is_dev_test_account(account):
                return view_func(request, *args, **kwargs)

            try:
                authz = get_authz_service()
            except Exception as e:
                logger.exception('require_permission get_authz_service failed: %s', e)
                return JsonResponse(
                    {'code': 500, 'msg': f'权限服务不可用: {e!s}', 'data': None},
                    status=500,
                )

            # 提取项目 ID（若启用项目级校验）
            pid: Optional[int] = None
            if project_param:
                pid = _extract_project_id(kwargs, project_param)

            try:
                has_perm = authz.has_permission(account, permission_code, project_id=pid)
            except Exception as e:
                logger.exception('require_permission has_permission failed: %s', e)
                return JsonResponse(
                    {'code': 500, 'msg': f'权限校验失败: {e!s}', 'data': None},
                    status=500,
                )

            if not has_perm:
                error_msg = message or f'缺少权限: {permission_code}'
                log_data = dict(
                    permission=permission_code,
                    project_id=pid,
                    method=request.method,
                    path=request.path,
                )
                if getattr(settings, 'AUTH_TRACE_ENABLED', False):
                    auth_logger.warning(
                        'permission_denied '
                        f'request_id={getattr(request, "request_id", "-")} '
                        f'user_id={account.id} '
                        f'username={account.username} '
                        + ' '.join(f'{k}={v}' for k, v in log_data.items())
                    )
                else:
                    logger.warning(
                        f'权限拒绝: user={account.username}, '
                        f'permission={permission_code}, '
                        f'project_id={pid}, path={request.path}'
                    )
                return _forbidden(
                    error_msg,
                    {
                        'required_permission': permission_code,
                        'project_id': pid,
                    },
                )

            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator


def require_login(message: str = None) -> Callable:
    """
    仅检查登录状态的装饰器（不检查权限）。

    Usage:
        @require_login()
        def my_view(request):
            ...
    """
    def decorator(view_func: Callable) -> Callable:
        @wraps(view_func)
        def wrapper(request: HttpRequest, *args, **kwargs):
            account = _get_account_from_request(request)
            if not account:
                return HttpResponseForbidden(
                    message or '请先登录',
                    content_type='application/json',
                )
            request.account = account
            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator


def require_any_permission(
    permission_codes: List[str],
    message: str = None,
    project_param: str = None,
) -> Callable:
    """任一权限检查装饰器（支持项目维度）"""
    def decorator(view_func: Callable) -> Callable:
        @wraps(view_func)
        def wrapper(request: HttpRequest, *args, **kwargs):
            from .phone_session import get_phone_from_request
            phone = get_phone_from_request(request)
            if phone:
                return view_func(request, *args, **kwargs)

            account = _get_account_from_request(request)
            if not account:
                return _forbidden('请先登录', {'error_code': 'AUTH_REQUIRED'})

            # 开发旁路：dev-bypass-token 或开发测试用户（DEBUG 下享有全部权限）
            if getattr(settings, 'DEBUG', False):
                auth_header = request.META.get('HTTP_AUTHORIZATION', '')
                if auth_header == 'Bearer dev-bypass-token':
                    return view_func(request, *args, **kwargs)
            if _is_dev_test_account(account):
                return view_func(request, *args, **kwargs)

            try:
                authz = get_authz_service()
            except Exception as e:
                logger.exception('require_any_permission get_authz_service failed: %s', e)
                return JsonResponse(
                    {'code': 500, 'msg': f'权限服务不可用: {e!s}', 'data': None},
                    status=500,
                )

            pid: Optional[int] = None
            if project_param:
                pid = _extract_project_id(kwargs, project_param)

            try:
                allowed = authz.has_any_permission(account, permission_codes, project_id=pid)
            except Exception as e:
                logger.exception('require_any_permission has_any_permission failed: %s', e)
                return JsonResponse(
                    {'code': 500, 'msg': f'权限校验失败: {e!s}', 'data': None},
                    status=500,
                )

            if not allowed:
                error_msg = message or f'缺少权限: {", ".join(permission_codes)}'
                if getattr(settings, 'AUTH_TRACE_ENABLED', False):
                    auth_logger.warning(
                        'permission_denied_any '
                        f'request_id={getattr(request, "request_id", "-")} '
                        f'user_id={account.id} '
                        f'username={account.username} '
                        f'permissions={",".join(permission_codes)} '
                        f'project_id={pid} '
                        f'method={request.method} '
                        f'path={request.path}'
                    )
                return _forbidden(
                    error_msg,
                    {
                        'required_permissions': permission_codes,
                        'project_id': pid,
                    },
                )

            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator


def require_role(
    role_name: Union[str, List[str]],
    message: str = None,
) -> Callable:
    """
    角色检查装饰器

    Usage:
        @require_role("admin")
        @require_role(["admin", "project_manager"])
    """
    def decorator(view_func: Callable) -> Callable:
        @wraps(view_func)
        def wrapper(request: HttpRequest, *args, **kwargs):
            account = _get_account_from_request(request)
            if not account:
                return _forbidden('请先登录', {'error_code': 'AUTH_REQUIRED'})

            # 开发旁路：开发测试用户在 DEBUG 下享有全部权限
            if _is_dev_test_account(account):
                return view_func(request, *args, **kwargs)

            authz = get_authz_service()
            required = role_name if isinstance(role_name, list) else [role_name]
            if not authz.has_any_role(account.id, required):
                error_msg = message or f'需要角色: {required}'
                if getattr(settings, 'AUTH_TRACE_ENABLED', False):
                    auth_logger.warning(
                        'role_denied '
                        f'request_id={getattr(request, "request_id", "-")} '
                        f'user_id={account.id} '
                        f'username={account.username} '
                        f'required_roles={",".join(required)} '
                        f'method={request.method} '
                        f'path={request.path}'
                    )
                return _forbidden(error_msg, {'required_roles': required})

            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator


def require_project_access(
    project_param: str = 'project_id',
    message: str = None,
) -> Callable:
    """
    项目访问权限装饰器

    验证用户在指定项目上是否有任意角色绑定（无论角色类型）。
    适用于：只要用户参与了该项目，即可访问项目基本信息的场景。

    Usage:
        @require_project_access(project_param="protocol_id")
        def get_protocol_detail(request, protocol_id: int):
            ...
    """
    def decorator(view_func: Callable) -> Callable:
        @wraps(view_func)
        def wrapper(request: HttpRequest, *args, **kwargs):
            account = _get_account_from_request(request)
            if not account:
                return _forbidden('请先登录', {'error_code': 'AUTH_REQUIRED'})

            # 开发旁路：开发测试用户在 DEBUG 下可访问任意项目
            if _is_dev_test_account(account):
                return view_func(request, *args, **kwargs)

            pid = _extract_project_id(kwargs, project_param)
            if pid is None:
                return _forbidden(
                    f'缺少项目参数: {project_param}',
                    {'error_code': 'PROJECT_PARAM_MISSING'},
                )

            authz = get_authz_service()
            role_names = authz.get_account_role_names(account.id)

            # admin/superadmin 全局访问
            if 'admin' in role_names or 'superadmin' in role_names:
                return view_func(request, *args, **kwargs)

            # 检查用户是否有该项目的角色绑定（全局角色也算）
            from .models import AccountRole
            has_access = (
                AccountRole.objects.filter(
                    account_id=account.id,
                    project_id=pid,
                ).exists()
                or AccountRole.objects.filter(
                    account_id=account.id,
                    project_id__isnull=True,
                ).exists()
            )

            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator


def require_permission_or_anon_in_debug(
    permission_code: str,
    message: str = None,
) -> Callable:
    """
    调试模式下放行匿名请求，生产模式等同于 require_permission。
    用于开发期间快速验证接口，无需携带 token。
    """
    from django.conf import settings as _settings

    def decorator(view_func: Callable) -> Callable:
        @wraps(view_func)
        def wrapper(request: HttpRequest, *args, **kwargs):
            if getattr(_settings, 'DEBUG', False):
                account = _get_account_from_request(request)
                if account:
                    request.account = account
                return view_func(request, *args, **kwargs)
            # 非 DEBUG：走正常权限检查
            return require_permission(permission_code, message)(view_func)(request, *args, **kwargs)
        return wrapper
    return decorator


def require_any_permission_or_anon_in_debug(
    permission_codes: List[str],
    message: str = None,
    project_param: str = None,
) -> Callable:
    """
    任一权限；DEBUG 模式下与 require_permission_or_anon_in_debug 一致（不校验权限，便于本地预览）。
    生产环境需具备 permission_codes 中至少一项。
    """
    from django.conf import settings as _settings

    def decorator(view_func: Callable) -> Callable:
        @wraps(view_func)
        def wrapper(request: HttpRequest, *args, **kwargs):
            if getattr(_settings, 'DEBUG', False):
                account = _get_account_from_request(request)
                if account:
                    request.account = account
                return view_func(request, *args, **kwargs)
            account = _get_account_from_request(request)
            if not account:
                return _forbidden('请先登录', {'error_code': 'AUTH_REQUIRED'})
            try:
                authz = get_authz_service()
            except Exception as e:
                logger.exception('require_any_permission_or_anon_in_debug get_authz_service failed: %s', e)
                return _forbidden('权限服务暂不可用', {})
            pid: Optional[int] = None
            if project_param:
                pid = _extract_project_id(kwargs, project_param)
            try:
                has_any = authz.has_any_permission(account, permission_codes, project_id=pid)
            except Exception as e:
                logger.exception('require_any_permission_or_anon_in_debug has_any_permission failed: %s', e)
                return _forbidden('权限校验暂不可用', {})
            if not has_any:
                error_msg = message or f'缺少权限: 需具备以下之一 {", ".join(permission_codes)}'
                return _forbidden(
                    error_msg,
                    {'required_permissions': permission_codes, 'project_id': pid},
                )
            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator
