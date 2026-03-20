"""
签到/签出动态二维码服务

每日生成唯一二维码内容，防止受试者未到场远程扫码签到。
格式：CN-KIS-CHECKIN-{YYYYMMDD}-{hash}
"""
import hashlib
from datetime import date
from django.conf import settings


def generate_daily_checkin_qrcode(target_date: date = None) -> str:
    """
    生成当日动态签到二维码内容。
    格式：CN-KIS-CHECKIN-20260301-{hash}
    """
    from django.utils import timezone
    d = target_date or timezone.now().date()
    date_str = d.strftime('%Y%m%d')
    secret = getattr(settings, 'CHECKIN_QR_SECRET', 'cn-kis-checkin-default-secret')
    raw = f"{date_str}:{secret}"
    h = hashlib.sha256(raw.encode('utf-8')).hexdigest()[:12]
    return f"CN-KIS-CHECKIN-{date_str}-{h}"


def validate_daily_checkin_qrcode(qr_content: str):
    """
    校验二维码是否为当日有效。
    返回 (is_valid, error_message)。
    兼容旧版静态码 CN-KIS-CHECKIN（仅用于过渡，建议逐步弃用）。
    """
    from django.utils import timezone
    if not qr_content or not isinstance(qr_content, str):
        return False, '无效的二维码'

    qr = qr_content.strip()
    # 旧版静态码：CN-KIS-CHECKIN，兼容保留
    if qr == 'CN-KIS-CHECKIN':
        return True, ''

    # 新版动态码：CN-KIS-CHECKIN-YYYYMMDD-xxx
    if qr.startswith('CN-KIS-CHECKIN-'):
        parts = qr.split('-')
        if len(parts) >= 4:
            try:
                date_part = parts[3]  # YYYYMMDD
                if len(date_part) == 8:
                    from datetime import datetime
                    qr_date = datetime.strptime(date_part, '%Y%m%d').date()
                    today = timezone.now().date()
                    if qr_date == today:
                        return True, ''
                    return False, '二维码已过期，请扫描现场当日二维码'
            except (ValueError, IndexError):
                pass
        return False, '无效的二维码格式'

    return False, '无效的二维码'
