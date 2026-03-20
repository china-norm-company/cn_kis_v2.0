"""
API 单例与路由注册防护

避免 urlconf 被 Django 重复加载（如 500 错误处理时）导致同一 Router 重复挂载到 API，
从而触发 ninja.errors.ConfigError: Router has already been attached to API。
"""
from typing import Optional

from ninja import NinjaAPI

_api: Optional[NinjaAPI] = None
_registration_done: bool = False


def get_api() -> NinjaAPI:
    global _api
    if _api is None:
        _api = NinjaAPI(
            title='CN KIS V1.0 API',
            version='1.0.0',
            description='基于飞书的多工作台临床研究知识信息系统',
            urls_namespace='api',
        )
        _register_exception_handlers(_api)
    return _api


def _register_exception_handlers(api: NinjaAPI) -> None:
    """注册全局异常处理器，解决多处路由函数返回元组 (status, body) 但未在装饰器上声明
    response schema 导致的 Ninja ConfigError。

    根因：当路由函数通过 `return 404, {...}` 返回非默认状态码时，Ninja 要求在
    @router.get/post(..., response={200:..., 404:...}) 中预先声明，否则抛出
    ConfigError('Schema for status 404 is not set ...')。

    修复策略：在 NinjaAPI 层注册 ConfigError 处理器，将其转为标准 JSON 响应，
    同时逐步为受影响路由补充 response 声明（长期目标）。
    """
    from ninja.errors import ConfigError
    from django.http import JsonResponse

    @api.exception_handler(ConfigError)
    def handle_config_error(request, exc):
        import re
        msg = str(exc)
        match = re.search(r'status (\d+)', msg)
        status_code = int(match.group(1)) if match else 500
        return JsonResponse(
            {'code': status_code, 'msg': '操作失败', 'data': None},
            status=status_code,
        )


def is_registration_done() -> bool:
    return _registration_done


def set_registration_done() -> None:
    global _registration_done
    _registration_done = True
