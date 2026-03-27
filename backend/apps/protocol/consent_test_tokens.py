"""知情签署测试扫码：带时效的协议级令牌（用于 H5 落地页与小程序 face-sign）。"""
from __future__ import annotations

from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

_SALT = 'consent-test-scan-v1'
_signer = TimestampSigner(salt=_SALT)


def sign_consent_test_scan_token(protocol_id: int) -> str:
    return _signer.sign(str(int(protocol_id)))


def unsign_consent_test_scan_token(token: str, max_age: int = 60 * 60 * 24 * 30) -> int | None:
    """解析令牌；默认最长 30 天。"""
    try:
        raw = _signer.unsign(token, max_age=max_age)
        return int(raw)
    except (BadSignature, SignatureExpired, ValueError, TypeError):
        return None
