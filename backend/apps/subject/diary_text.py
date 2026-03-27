"""
日记文本字段：与小程序 / 研究台约定为纯文本。

若客户端误传 JSON 对象/数组，序列化为字符串再入库，避免前端出现 [object Object]。
"""
from __future__ import annotations

import json
import re
from typing import Any


def normalize_diary_text_field(value: Any) -> str:
    """
    统一为 str 供 TextField 与 JSON 响应使用。
    - None -> ''
    - str -> strip
    - dict/list -> JSON 字符串
    - 其他 -> str(v).strip()
    """
    if value is None:
        return ''
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(value)
    return str(value).strip()


# 旧版小程序将程度/开始时间/持续时长拼入 notes；兼容中文/英文分号与冒号
_LEGACY_SEP_PATTERN = re.compile(r'[；;]')


def _legacy_starts(p: str, *prefixes: str) -> str | None:
    for pref in prefixes:
        if p.startswith(pref):
            return p[len(pref) :].strip()
    return None


def split_legacy_concatenated_notes(notes: str) -> dict[str, str]:
    """
    解析旧版拼接 notes：「程度：…；开始时间：…；持续时长：…」及可选其它片段。
    """
    raw = normalize_diary_text_field(notes)
    if not raw:
        return {'severity': '', 'onset': '', 'duration': '', 'other': ''}
    severity, onset, duration = '', '', ''
    other_parts: list[str] = []
    for part in _LEGACY_SEP_PATTERN.split(raw):
        p = part.strip()
        if not p:
            continue
        v = _legacy_starts(p, '程度：', '程度:')
        if v is not None:
            severity = v
            continue
        v = _legacy_starts(p, '开始时间：', '开始时间:')
        if v is not None:
            onset = v
            continue
        v = _legacy_starts(p, '持续时长：', '持续时长:')
        if v is not None:
            duration = v
            continue
        other_parts.append(p)
    joiner = '；'
    return {
        'severity': severity,
        'onset': onset,
        'duration': duration,
        'other': joiner.join(other_parts) if other_parts else '',
    }


def diary_symptom_fields_for_api(d) -> dict[str, str]:
    """
    返回 symptom_severity / symptom_onset / symptom_duration / notes（notes 仅为「其它备注」）。
    独立列优先；未填的从旧版拼接 notes 补全；若 notes 中解析出结构化段，则「其它备注」仅保留剩余段。
    """
    sev = normalize_diary_text_field(getattr(d, 'symptom_severity', None) or '')
    onset = normalize_diary_text_field(getattr(d, 'symptom_onset', None) or '')
    dur = normalize_diary_text_field(getattr(d, 'symptom_duration', None) or '')
    raw_notes = normalize_diary_text_field(getattr(d, 'notes', None) or '')
    leg = split_legacy_concatenated_notes(raw_notes)
    structured_in_notes = bool(leg['severity'] or leg['onset'] or leg['duration'])
    sev_out = sev or leg['severity']
    onset_out = onset or leg['onset']
    dur_out = dur or leg['duration']
    if structured_in_notes:
        notes_out = leg['other']
    else:
        notes_out = raw_notes
    return {
        'symptom_severity': sev_out,
        'symptom_onset': onset_out,
        'symptom_duration': dur_out,
        'notes': notes_out,
    }
