"""
field_encryption.py — 敏感字段加密工具

使用 Fernet（AES-128-CBC + HMAC-SHA256）对银行卡号、身份证等敏感字段进行
对称加密，密钥通过环境变量 FIELD_ENCRYPTION_KEY 注入（32 字节 base64 编码）。

生成密钥（一次性，保存到 .env）：
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

用法：
    from libs.field_encryption import encrypt_field, decrypt_field, mask_field

    enc = encrypt_field('6217001210043994100')   # 加密
    raw = decrypt_field(enc)                     # 解密
    masked = mask_field('6217001210043994100')   # 脱敏显示 ****3994100
"""
import base64
import os
import hashlib

_fernet = None


def _get_fernet():
    global _fernet
    if _fernet is not None:
        return _fernet

    try:
        from cryptography.fernet import Fernet
    except ImportError as exc:
        raise RuntimeError('缺少 cryptography 依赖: pip install cryptography') from exc

    key_str = os.environ.get('FIELD_ENCRYPTION_KEY', '')
    if not key_str:
        # 开发环境：用固定派生密钥（不安全，仅供本地测试）
        import hashlib
        key_str = base64.urlsafe_b64encode(
            hashlib.sha256(b'cn-kis-dev-only-not-for-prod').digest()
        ).decode()

    key_bytes = key_str.encode() if isinstance(key_str, str) else key_str
    # Fernet key 必须是 32 字节 base64url 编码 → 如果传入原始32字节则需先编码
    if len(key_bytes) == 32:
        key_bytes = base64.urlsafe_b64encode(key_bytes)

    _fernet = Fernet(key_bytes)
    return _fernet


def encrypt_field(value: str) -> str:
    """加密字符串，返回 Fernet token（base64 字符串）"""
    if not value:
        return ''
    f = _get_fernet()
    return f.encrypt(value.encode('utf-8')).decode('utf-8')


def decrypt_field(token: str) -> str:
    """解密 Fernet token，返回明文字符串"""
    if not token:
        return ''
    try:
        f = _get_fernet()
        return f.decrypt(token.encode('utf-8')).decode('utf-8')
    except Exception:
        return ''


def mask_field(value: str, keep_last: int = 4) -> str:
    """脱敏：保留最后 N 位，其余替换为 *"""
    if not value:
        return ''
    if len(value) <= keep_last:
        return '*' * len(value)
    return '*' * (len(value) - keep_last) + value[-keep_last:]


def hash_field(value: str) -> str:
    """SHA-256 哈希（用于索引匹配，不可逆）"""
    if not value:
        return ''
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def reset_fernet():
    """测试用：重置缓存的 Fernet 实例"""
    global _fernet
    _fernet = None
