"""知情签署测试扫码：CONSENT_TEST_SCAN_PUBLIC_BASE 等 URL 规范化。

http://私网IPv4 未写端口时，客户端默认连 80；本地 Django 多为 8001，微信内常见 net::ERR_CONNECTION_REFUSED。
对 RFC1918 私网 IPv4 的 http 且端口为空或 80 时，自动补 :8001。
公网 IP 或未识别主机名不修改（可能走 80 上反向代理）。
"""

from __future__ import annotations

import ipaddress
import re
from urllib.parse import urlparse, urlunparse

_IPV4_RE = re.compile(
    r'\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b'
)


def extract_ipv4_addresses_from_text(text: str, *, max_count: int = 8) -> list[str]:
    """从微信错误文案等文本中提取 IPv4，用于白名单提示（去重、限条数）。"""
    out: list[str] = []
    for m in _IPV4_RE.finditer(text or ''):
        ip = m.group(0)
        if ip not in out:
            out.append(ip)
        if len(out) >= max_count:
            break
    return out


def normalize_consent_test_scan_public_base(base: str) -> str:
    base = (base or '').strip().rstrip('/')
    if not base:
        return base
    try:
        p = urlparse(base)
        if p.scheme != 'http':
            return base
        host = (p.hostname or '').strip()
        if not host:
            return base
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            return base
        if ip.version != 4 or not ip.is_private:
            return base
        if p.port not in (None, 80):
            return base
        netloc = f'{host}:8001'
        return urlunparse((p.scheme, netloc, '', '', '', ''))
    except Exception:
        return base
