"""
手机号无状态 JWT 会话管理

不使用数据库持久化，完全基于 JWT Token
"""

import jwt
import time
from django.conf import settings


def create_phone_session(
    phone_number: str, device_info: str = '', ip_address: str = ''
) -> str:
    """创建仅包含手机号的 JWT Token（无状态，不持久化）"""
    payload = {
        'phone': phone_number,
        'type': 'phone_auth',
        'exp': int(time.time()) + settings.JWT_EXPIRATION_HOURS * 3600,
        'iat': int(time.time()),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm='HS256')


def verify_phone_token(token: str) -> str | None:
    """验证 JWT Token 并提取手机号"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=['HS256'])
        if payload.get('type') != 'phone_auth':
            return None
        return payload.get('phone')
    except jwt.InvalidTokenError:
        return None


def revoke_phone_session(token: str) -> bool:
    """登出（无状态实现，实际不执行任何操作）"""
    # 无状态 JWT，服务器端不保存会话
    # Token 过期由 exp 字段控制
    # 如需强制登出，需要实现黑名单（Redis 等）
    return True


def get_phone_from_request(request) -> str | None:
    """从请求中提取手机号（从 Authorization Header 的 JWT 中解析）"""
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return None
    token = auth_header[7:]
    return verify_phone_token(token)
