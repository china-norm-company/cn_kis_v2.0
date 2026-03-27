"""
回执 PDF：将 icf_checkbox_answers 按正文出现顺序内联到 HTML（与联调页「已选：是/否」语义一致），
避免单独追加「正文勾选结果」段落。
"""
from __future__ import annotations

import re
from typing import Any, List


def _answer_is_yes(a: Any) -> bool:
    if isinstance(a, dict):
        v = a.get('value', a.get('answer', a.get('selected')))
        s = str(v or '').strip().lower()
    else:
        s = str(a or '').strip().lower()
    return s in ('yes', 'y', 'true', '1', '是')


def apply_checkbox_answers_inline_to_html(html: str, answers: List[Any]) -> str:
    """
    按「正文首次出现」顺序，将每一处勾选句式替换为内联 HTML（已选：是/否（✓））。
    与 workstations/execution icfCheckboxDetect 中常见句式对齐。
    """
    if not html or not answers:
        return html
    box = r'[\u25a1\u2610\u25a2\u25a3]'
    # 与配置页预览、icfCheckboxDetect 常见导出句式对齐（含 span 包裹的红色「请勾选」）
    patterns = [
        re.compile(rf'<span[^>]*>\s*请勾选\s*</span>\s*{box}\s*是\s*{box}\s*否'),
        re.compile(r'请勾选\s*\[\s*\]\s*是\s*\[\s*\]\s*否'),
        re.compile(r'请勾选\s*\[\s*\]是\s*\[\s*\]否'),
        re.compile(r'请勾选\s*［\s*］\s*是\s*［\s*］\s*否'),
        re.compile(r'_{2,8}\s*Yes\s*是\s*_{2,8}\s*No\s*否', re.IGNORECASE),
        re.compile(r'_{2,8}\s*Yes是\s*_{2,8}\s*No否', re.IGNORECASE),
        re.compile(rf'请勾选\s*{box}\s*是\s*{box}\s*否'),
        re.compile(rf'{box}\s*是\s*{box}\s*否'),
        re.compile(rf'{box}是{box}否'),
    ]
    out = html
    for a in answers:
        yes = _answer_is_yes(a)
        repl = (
            '<span style="color:#15803d;font-weight:700;font-size:inherit;">已选：是（✓）</span>'
            if yes
            else '<span style="color:#b91c1c;font-weight:700;font-size:inherit;">已选：否（✓）</span>'
        )
        replaced = False
        for pat in patterns:
            m = pat.search(out)
            if m:
                out = out[: m.start()] + repl + out[m.end() :]
                replaced = True
                break
        if not replaced:
            break
    return out
