"""项目级「知情签署工作人员」：支持多人，顿号存储与解析。"""
from __future__ import annotations

import re
from typing import List, Optional

# 与 JSON 内 consent_settings 字段长度匹配，支持多名工作人员
FIELD_MAX = 512


def split_consent_signing_staff_names(raw: Optional[str]) -> List[str]:
    """按顿号/中英文逗号/空白分隔，去重保序。"""
    s = (raw or '').strip()
    if not s:
        return []
    out: List[str] = []
    seen = set()
    for part in re.split(r'[、,，;；\s]+', s):
        t = part.strip()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def normalize_consent_signing_staff_storage(raw: Optional[str]) -> str:
    """统一为「姓名1、姓名2」并截断。"""
    return '、'.join(split_consent_signing_staff_names(raw))[:FIELD_MAX]
