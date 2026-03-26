"""
用户反馈（已落库且已创建 GitHub Issue）→ 鹿鸣上线治理缺口池。

与 feedback_service 解耦：秘书台只调用本模块入口，避免循环 import。
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

logger = logging.getLogger(__name__)

FEISHU_REF_PREFIX = 'user_feedback:'

if TYPE_CHECKING:
    from apps.secretary.feedback_models import UserFeedback


def _normalize_workstation(ws: str) -> str:
    if ws == 'governance':
        return 'admin'
    return ws


def ensure_launch_gap_from_user_feedback(feedback: UserFeedback) -> Optional[int]:
    """
    同步创建 LaunchGovernanceGap。幂等：同一飞书 message_id 仅一条（feishu_ref）。

    返回新建缺口 id；已存在或条件不满足时返回 None。
    """
    if not feedback.feishu_message_id or not feedback.github_issue_url:
        return None

    from .models_launch_governance import LaunchGapStatus, LaunchGovernanceGap

    ref = f'{FEISHU_REF_PREFIX}{feedback.feishu_message_id}'
    if LaunchGovernanceGap.objects.filter(feishu_ref=ref).exists():
        logger.debug('launch gap skip duplicate feishu_ref=%s', ref)
        return None

    cat = feedback.category or 'other'
    gap_type_map = {
        'bug': '用户反馈/Bug',
        'feature': '用户反馈/建议',
        'data': '用户反馈/数据',
        'performance': '用户反馈/性能',
    }
    gap_type = gap_type_map.get(cat, '用户反馈/其他')

    title_src = (feedback.ai_summary or feedback.raw_text or '用户反馈').strip()
    title = title_src[:500]
    description = (
        f'分类：{cat}\n'
        f'反馈人：{feedback.sender_name or feedback.sender_open_id or "未知"}\n\n'
        f'原文：\n{feedback.raw_text or ""}'
    )

    severity = feedback.severity or 'medium'
    blocked = cat == 'bug' and severity == 'high'

    g = LaunchGovernanceGap.objects.create(
        title=title,
        description=description,
        gap_type=gap_type,
        severity=severity,
        related_workstation=_normalize_workstation(feedback.workstation or ''),
        blocked_loop=blocked,
        status=LaunchGapStatus.OPEN,
        github_issue_url=feedback.github_issue_url,
        feishu_ref=ref,
        next_action='确认复现并指派负责人',
        verification_status='pending',
    )
    logger.info(
        'launch_gap_from_feedback gap_id=%s message_id=%s',
        g.id,
        feedback.feishu_message_id,
    )
    return g.id
