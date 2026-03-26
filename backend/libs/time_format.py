"""时区感知时间格式化为本地展示（与 settings.TIME_ZONE 一致）。"""
from __future__ import annotations

from django.utils import timezone as dj_tz


def format_local_hhmm(dt) -> str:
    """将 aware datetime 转为本地时区后取 HH:MM；naive 则按原值格式化。"""
    if not dt:
        return ''
    if dj_tz.is_aware(dt):
        dt = dj_tz.localtime(dt)
    return dt.strftime('%H:%M')
