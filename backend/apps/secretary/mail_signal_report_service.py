"""
邮件信号报告输出服务（Phase 4）

把专项分析草稿升级为"可感知价值"的输出物：
- 内部简报（InternalBrief）：研究经理内部使用，含证据来源和审核留痕
- 专项报告（SpecialistReport）：更完整的结构化分析报告
- 建议书提纲（ProposalOutline）：对客提案大纲，需通过审核才能使用

治理原则（OUTPUT_GOVERNANCE 文档摘要）：
- 所有输出物默认 governance_level=internal_draft
- review_state=draft 为初稿
- review_state=under_review 为审核中
- review_state=revision_required 为退回修改
- review_state=approved_internal 为内部审核通过
- review_state=approved_external 为允许对客发送
- review_state=sent 为已发送
- review_state=archived 为已归档
- auto_send_to_client 始终为 False
- 不允许绕过审核直接输出正式版对客文件
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


REPORT_TYPE_LABELS = {
    'internal_brief': '内部简报',
    'specialist_report': '专项分析报告',
    'proposal_outline': '建议书提纲',
}

GOVERNANCE_LEVELS = {
    'internal_draft': '内部草稿',
    'draft': '初稿',
    'under_review': '审核中',
    'revision_required': '退回修改',
    'approved_internal': '内部审核通过',
    'approved_external': '可对客发送',
    'sent': '已发送',
    'archived': '已归档',
}


def _now_str() -> str:
    return datetime.now(tz=timezone.utc).strftime('%Y-%m-%d')


def generate_internal_brief(
    task_key: str,
    draft_detail: dict[str, Any],
    referenced_evidence: list[dict[str, Any]],
    subject: str = '',
    client_label: str = '',
) -> dict[str, Any]:
    """
    生成内部简报模板（研究经理 / 客户经理内部决策使用）。

    输出结构：
    - header：基础信息（生成时间、客户、来源邮件）
    - executive_summary：一句话结论
    - key_findings：核心发现列表
    - evidence_chain：证据链摘要
    - recommended_next_steps：建议的下一步行动
    - governance_note：治理说明
    """
    summary = str(draft_detail.get('summary') or '待生成')
    ai_sections = draft_detail.get('ai_enhanced_sections') or {}
    inferred = (
        draft_detail.get('inferred_category')
        or draft_detail.get('primary_threat')
        or draft_detail.get('primary_focus')
        or ''
    )

    key_findings: list[str] = []
    for field in ['trend_signals', 'competitive_signals', 'evidence_paths']:
        items = ai_sections.get(field)
        if isinstance(items, list):
            key_findings.extend([str(i) for i in items[:3]])
    if not key_findings and inferred:
        key_findings = [inferred]

    next_steps: list[str] = []
    for field in ['recommended_actions', 'response_actions', 'test_plan_hints']:
        items = ai_sections.get(field)
        if isinstance(items, list):
            next_steps.extend([str(i) for i in items[:2]])

    evidence_chain = [
        f"[{ev.get('source_type', '-')}] {ev.get('title', ev.get('evidence_title', '-'))}"
        for ev in (referenced_evidence or [])
        if ev.get('validated') == 'true'
    ]

    return {
        'report_type': 'internal_brief',
        'report_label': REPORT_TYPE_LABELS['internal_brief'],
        'task_key': task_key,
        'generated_at': _now_str(),
        'governance_level': 'internal_draft',
        'review_state': 'draft',
        'auto_send_to_client': False,
        'header': {
            'client': client_label or '未知客户',
            'source_email_subject': subject,
            'generated_at': _now_str(),
        },
        'executive_summary': summary,
        'inferred_direction': inferred,
        'key_findings': key_findings,
        'evidence_chain': evidence_chain,
        'recommended_next_steps': next_steps if next_steps else ['请研究经理结合项目实际补充建议行动'],
        'governance_note': '本简报为内部草稿，需审核后才可作为正式文件使用，禁止直接发送客户。',
    }


def generate_specialist_report(
    task_key: str,
    draft_detail: dict[str, Any],
    referenced_evidence: list[dict[str, Any]],
    external_evidence_results: list[dict[str, Any]],
    subject: str = '',
    client_label: str = '',
) -> dict[str, Any]:
    """
    生成专项分析报告模板（更完整的结构化分析，含外部证据分节）。
    """
    summary = str(draft_detail.get('summary') or '待生成')
    ai_sections = draft_detail.get('ai_enhanced_sections') or {}
    inferred = (
        draft_detail.get('inferred_category')
        or draft_detail.get('primary_threat')
        or draft_detail.get('primary_focus')
        or ''
    )

    sections: list[dict[str, Any]] = []

    sections.append({
        'title': '背景与信号',
        'content': f'客户邮件主题：{subject}\n推断方向：{inferred}\n基础摘要：{summary}',
    })

    finding_sections = {
        'trend_signals': '市场趋势信号',
        'competitive_signals': '竞品情报信号',
        'evidence_paths': '证据路径建议',
        'opportunity_hints': '市场机会',
        'differentiation_hints': '差异化方向',
    }
    for field, label in finding_sections.items():
        items = ai_sections.get(field)
        if isinstance(items, list) and items:
            sections.append({
                'title': label,
                'content': '\n'.join(f'- {str(item)}' for item in items),
            })

    evidence_section_lines: list[str] = []
    for ev_group in (external_evidence_results or []):
        source = ev_group.get('source_type', '-')
        query = ev_group.get('query', '')
        hits = ev_group.get('hits') or []
        evidence_section_lines.append(f'[{source}] 查询词：{query}')
        for hit in hits[:3]:
            if isinstance(hit, dict):
                evidence_section_lines.append(f'  · {hit.get("title", "-")}：{hit.get("summary", "-")}')
    if evidence_section_lines:
        sections.append({
            'title': '外部证据支撑',
            'content': '\n'.join(evidence_section_lines),
        })

    gaps = ai_sections.get('evidence_gaps')
    if isinstance(gaps, list) and gaps:
        sections.append({
            'title': '证据缺口与待补充项',
            'content': '\n'.join(f'- {str(g)}' for g in gaps),
        })

    confidence = str(ai_sections.get('confidence') or '低')
    sections.append({
        'title': '分析置信度说明',
        'content': (
            f'当前分析置信度：{confidence}。\n'
            '本报告基于邮件正文关键词和内置证据目录，'
            '尚未纳入实时外部数据，建议研究经理结合项目实际补充并审核后使用。'
        ),
    })

    return {
        'report_type': 'specialist_report',
        'report_label': REPORT_TYPE_LABELS['specialist_report'],
        'task_key': task_key,
        'generated_at': _now_str(),
        'governance_level': 'internal_draft',
        'review_state': 'draft',
        'auto_send_to_client': False,
        'header': {
            'client': client_label or '未知客户',
            'source_email_subject': subject,
            'generated_at': _now_str(),
        },
        'executive_summary': summary,
        'inferred_direction': inferred,
        'sections': sections,
        'referenced_evidence_count': len([e for e in (referenced_evidence or []) if e.get('validated') == 'true']),
        'governance_note': '本报告为内部草稿，需经人工审核后方可对外使用。禁止直接发送客户。',
    }


def generate_proposal_outline(
    task_key: str,
    draft_detail: dict[str, Any],
    referenced_evidence: list[dict[str, Any]],
    subject: str = '',
    client_label: str = '',
) -> dict[str, Any]:
    """
    生成建议书提纲（对客提案方向，需通过正式审核流才能使用）。

    注意：这是提纲，不是正式建议书。
    - 必须通过审核才能转为可用状态
    - 严禁绕过审核直接发给客户
    """
    summary = str(draft_detail.get('summary') or '待生成')
    ai_sections = draft_detail.get('ai_enhanced_sections') or {}
    inferred = (
        draft_detail.get('inferred_category')
        or draft_detail.get('primary_threat')
        or draft_detail.get('primary_focus')
        or ''
    )

    outline_items: list[dict[str, str]] = [
        {
            'section': '一、背景与需求判断',
            'key_points': f'基于邮件信号推断的核心需求方向：{inferred}',
        },
    ]

    for field, label in [
        ('differentiation_hints', '二、差异化价值主张'),
        ('recommended_actions', '三、建议行动项'),
        ('response_actions', '三、应对方案要点'),
    ]:
        items = ai_sections.get(field)
        if isinstance(items, list) and items:
            outline_items.append({
                'section': label,
                'key_points': '\n'.join(f'- {str(i)}' for i in items),
            })

    outline_items.append({
        'section': '四、证据支持说明',
        'key_points': (
            f'本提纲基于 {len([e for e in (referenced_evidence or []) if e.get("validated") == "true"])} 条'
            '已校验证据生成，请在正式提案前补充完整证据包。'
        ),
    })

    outline_items.append({
        'section': '五、下一步',
        'key_points': '请研究经理审核上述提纲，确认方向后再制作完整提案文件。',
    })

    return {
        'report_type': 'proposal_outline',
        'report_label': REPORT_TYPE_LABELS['proposal_outline'],
        'task_key': task_key,
        'generated_at': _now_str(),
        'governance_level': 'internal_draft',
        'review_state': 'draft',
        'auto_send_to_client': False,
        'header': {
            'client': client_label or '未知客户',
            'source_email_subject': subject,
            'generated_at': _now_str(),
        },
        'executive_summary': summary,
        'inferred_direction': inferred,
        'outline': outline_items,
        'governance_note': (
            '本提纲为内部草稿，必须经过研究经理和相关负责人正式审核后，'
            '才能作为对客提案使用。禁止跳过审核直接发送。'
        ),
    }
