"""
手机号无状态 JWT 会话管理

基于 JWT Token + Redis 黑名单实现登出失效
"""

import hashlib
import time
import uuid

import jwt
from django.conf import settings
from django.core.cache import cache


BLACKLIST_PREFIX = 'blacklist:phone_token:'


def create_phone_session(
    phone_number: str, device_info: str = '', ip_address: str = ''
) -> str:
    """创建仅包含手机号的 JWT Token"""
    now = int(time.time())
    jti = uuid.uuid4().hex

    payload = {
        'phone': phone_number,
        'type': 'phone_auth',
        'jti': jti,
        'exp': now + settings.JWT_EXPIRATION_HOURS * 3600,
        'iat': now,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm='HS256')


def verify_phone_token(token: str) -> str | None:
    """验证 JWT Token 并提取手机号，同时检查黑名单"""
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    if cache.get(f'{BLACKLIST_PREFIX}{token_hash}'):
        return None

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=['HS256'])
        if payload.get('type') != 'phone_auth':
            return None
        return payload.get('phone')
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def revoke_phone_session(token: str) -> bool:
    """将 token 加入黑名单，实现登出失效"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=['HS256'], options={'verify_exp': False})
    except jwt.InvalidTokenError:
        return False

    if payload.get('type') != 'phone_auth':
        return False

    token_hash = hashlib.sha256(token.encode()).hexdigest()
    exp = payload.get('exp', 0)
    ttl = max(int(exp - time.time()), 0)

    if ttl > 0:
        cache.set(f'{BLACKLIST_PREFIX}{token_hash}', '1', ttl)
    return True


def get_phone_from_request(request) -> str | None:
    """从请求中提取手机号（从 Authorization Header 的 JWT 中解析）"""
    auth_header = request.META.get('HTTP_AUTHORIZATION', '')
    if not auth_header.startswith('Bearer '):
        return None
    token = auth_header[7:]
    return verify_phone_token(token)
