"""请求日志中间件"""
import time
import uuid
import logging
from typing import Optional
import jwt
from django.http import HttpRequest, HttpResponse
from django.conf import settings

logger = logging.getLogger('cn_kis.api')


class RequestLoggingMiddleware:
    """为每个请求添加唯一 ID 并记录响应时间"""

    def __init__(self, get_response):
        self.get_response = get_response

    @staticmethod
    def _extract_auth_context(request: HttpRequest) -> dict:
        """从 Bearer Token 提取最小用户上下文，用于日志追踪。"""
        context = {
            'user_id': '-',
            'username': '-',
            'roles': '-',
            'token_fingerprint': '-',
            'token_valid': 'false',
        }
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith('Bearer '):
            return context

        token = auth_header[7:].strip()
        if not token:
            return context

        context['token_fingerprint'] = token[:8]
        # 开发旁路：DEBUG 且 token 为 dev-bypass-token 时，使用 DEV_BYPASS_ACCOUNT_ID 作为 user_id，与 decorators._get_account_from_request 一致
        if getattr(settings, 'DEBUG', False) and token == 'dev-bypass-token':
            bypass_id = getattr(settings, 'DEV_BYPASS_ACCOUNT_ID', None)
            if bypass_id is not None:
                context['user_id'] = str(bypass_id)
                context['token_valid'] = 'true'
        if context['user_id'] == '-':
            try:
                payload = jwt.decode(token, settings.JWT_SECRET, algorithms=['HS256'])
                user_id = payload.get('user_id')
                username = payload.get('username')
                roles = payload.get('roles') or []
                context['user_id'] = str(user_id) if user_id else '-'
                context['username'] = str(username) if username else '-'
                context['roles'] = ','.join(str(r) for r in roles[:8]) if isinstance(roles, list) else str(roles)
                context['token_valid'] = 'true'
            except Exception:
                # 仅用于日志上下文，不影响业务鉴权流程
                pass
        return context

    @staticmethod
    def _extract_workstation(path: str) -> str:
        if not path:
            return '-'
        parts = [p for p in path.split('/') if p]
        if not parts:
            return '-'
        first = parts[0]
        if first == 'api':
            return parts[2] if len(parts) >= 3 else 'api'
        return first

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request.request_id = str(uuid.uuid4())[:12]
        start = time.monotonic()
        auth_ctx = self._extract_auth_context(request)
        request.user_id = auth_ctx['user_id'] if auth_ctx['user_id'] != '-' else None
        request.username = auth_ctx['username'] if auth_ctx['username'] != '-' else None
        response: HttpResponse
        error: Optional[Exception] = None
        try:
            response = self.get_response(request)
        except Exception as exc:
            error = exc
            response = HttpResponse(status=500)
            raise
        finally:
            duration_ms = (time.monotonic() - start) * 1000
            is_enabled = getattr(settings, 'API_ACCESS_LOG_ENABLED', True)
            if is_enabled:
                workstation = self._extract_workstation(request.path)
                logger.info(
                    'api_access '
                    f'request_id={request.request_id} '
                    f'method={request.method} '
                    f'path={request.path} '
                    f'workstation={workstation} '
                    f'query_len={len(request.META.get("QUERY_STRING", ""))} '
                    f'status={getattr(response, "status_code", 500)} '
                    f'duration_ms={duration_ms:.1f} '
                    f'user_id={auth_ctx["user_id"]} '
                    f'username={auth_ctx["username"]} '
                    f'roles={auth_ctx["roles"]} '
                    f'token_valid={auth_ctx["token_valid"]} '
                    f'token_fp={auth_ctx["token_fingerprint"]} '
                    f'ip={request.META.get("REMOTE_ADDR", "-")} '
                    f'ua="{request.META.get("HTTP_USER_AGENT", "-")[:120]}" '
                    f'error={type(error).__name__ if error else "-"}'
                )

            response['X-Request-ID'] = request.request_id
            response['X-Response-Time'] = f'{duration_ms:.1f}ms'

        return response
