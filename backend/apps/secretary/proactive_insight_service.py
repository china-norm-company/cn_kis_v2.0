"""
Phase 6 主动洞察生命周期管理

处理洞察的审核、推送、行动记录、反馈、转化、过期等操作。
"""
import logging
from typing import Any, Dict, List, Optional

from django.utils import timezone

from .models import InsightStatus, ProactiveInsight

logger = logging.getLogger(__name__)

ALLOWED_REVIEW_TRANSITIONS: Dict[str, List[str]] = {
    'draft': ['pending_review', 'dismissed'],
    'pending_review': ['approved', 'dismissed', 'draft'],
    'approved': ['pushed', 'dismissed'],
    'pushed': ['acted', 'dismissed', 'expired'],
    'acted': [],
    'dismissed': [],
    'expired': [],
}


def review_insight(
    insight_id: int,
    action: str,
    reviewer_id: Optional[int] = None,
    note: str = '',
) -> Dict[str, Any]:
    """
    审核洞察。

    action: approve / dismiss / submit_review / push / act / revert_draft
    """
    insight = ProactiveInsight.objects.filter(id=insight_id).first()
    if not insight:
        return {'ok': False, 'error': 'insight_not_found'}

    target_status = _action_to_status(action, insight.status)
    if not target_status:
        return {
            'ok': False,
            'error': f'invalid_transition: {insight.status} → {action}',
        }

    allowed = ALLOWED_REVIEW_TRANSITIONS.get(insight.status, [])
    if target_status not in allowed:
        return {
            'ok': False,
            'error': f'transition_not_allowed: {insight.status} → {target_status}',
        }

    insight.status = target_status
    update_fields = ['status', 'updated_at']

    if target_status == InsightStatus.APPROVED:
        insight.reviewed_by = reviewer_id
        insight.reviewed_at = timezone.now()
        insight.governance_level = 'internal_working'
        update_fields += ['reviewed_by', 'reviewed_at', 'governance_level']

    if target_status == InsightStatus.PUSHED:
        insight.pushed_at = timezone.now()
        update_fields.append('pushed_at')
        try:
            from .proactive_push_service import push_insight
            push_insight(insight)
        except Exception as e:
            logger.warning('Auto-push failed for insight %d: %s', insight_id, e)

    if target_status == InsightStatus.DISMISSED and note:
        insight.feedback_note = note
        update_fields.append('feedback_note')

    insight.save(update_fields=update_fields)
    logger.info('Insight %d transitioned to %s by %s', insight_id, target_status, reviewer_id)
    return {'ok': True, 'status': target_status}


def record_action(
    insight_id: int,
    action_taken: str,
    action_result: str = '',
    opportunity_id: Optional[int] = None,
) -> Dict[str, Any]:
    """记录洞察的后续行动"""
    insight = ProactiveInsight.objects.filter(id=insight_id).first()
    if not insight:
        return {'ok': False, 'error': 'insight_not_found'}

    insight.action_taken = action_taken
    insight.action_result = action_result
    if opportunity_id:
        insight.linked_opportunity_id = opportunity_id
    if insight.status in (InsightStatus.APPROVED, InsightStatus.PUSHED):
        insight.status = InsightStatus.ACTED
    insight.save(update_fields=[
        'action_taken', 'action_result', 'linked_opportunity_id', 'status', 'updated_at',
    ])
    return {'ok': True, 'status': insight.status}


def record_feedback(
    insight_id: int,
    score: int,
    note: str = '',
) -> Dict[str, Any]:
    """记录洞察反馈评分"""
    insight = ProactiveInsight.objects.filter(id=insight_id).first()
    if not insight:
        return {'ok': False, 'error': 'insight_not_found'}

    insight.feedback_score = max(1, min(5, score))
    insight.feedback_note = note
    insight.save(update_fields=['feedback_score', 'feedback_note', 'updated_at'])
    return {'ok': True}


def convert_to_action_plan(insight_id: int, account_id: int) -> Dict[str, Any]:
    """将洞察转化为 AssistantActionPlan"""
    from .models import AssistantActionPlan

    insight = ProactiveInsight.objects.filter(id=insight_id).first()
    if not insight:
        return {'ok': False, 'error': 'insight_not_found'}

    plan = AssistantActionPlan.objects.create(
        account_id=account_id,
        action_type='proactive_insight',
        title=insight.title,
        description=insight.summary,
        action_payload={
            'source_insight_id': insight.id,
            'insight_type': insight.insight_type,
            'detail': insight.detail,
        },
        biz_domain='crm',
        source_event_type='proactive_insight',
        target_object_refs=[
            {'type': 'client', 'id': insight.client_id}
        ] if insight.client_id else [],
        evidence_refs=insight.source_evidence_refs,
        risk_level='low',
        priority_score=insight.relevance_score,
        confidence_score=insight.relevance_score,
        status='suggested',
    )
    return {'ok': True, 'action_plan_id': plan.id}


def expire_stale_insights() -> int:
    """将过期洞察标记为 expired"""
    now = timezone.now()
    count = ProactiveInsight.objects.filter(
        status__in=[InsightStatus.DRAFT, InsightStatus.PENDING_REVIEW, InsightStatus.APPROVED],
        expires_at__lt=now,
    ).update(status=InsightStatus.EXPIRED)
    if count:
        logger.info('Expired %d stale insights', count)
    return count


def get_insight_analytics() -> Dict[str, Any]:
    """洞察效果分析统计"""
    from django.db.models import Avg, Count, Q

    total = ProactiveInsight.objects.count()
    by_status = dict(
        ProactiveInsight.objects.values_list('status').annotate(c=Count('id')).values_list('status', 'c')
    )
    by_type = dict(
        ProactiveInsight.objects.values_list('insight_type').annotate(c=Count('id')).values_list('insight_type', 'c')
    )
    avg_feedback = ProactiveInsight.objects.filter(
        feedback_score__isnull=False,
    ).aggregate(avg=Avg('feedback_score'))['avg']

    acted_count = by_status.get('acted', 0)
    pushed_count = by_status.get('pushed', 0) + acted_count
    act_rate = round(acted_count / pushed_count, 2) if pushed_count else 0

    dismissed_count = by_status.get('dismissed', 0)
    reviewed_total = pushed_count + dismissed_count + acted_count
    dismiss_rate = round(dismissed_count / reviewed_total, 2) if reviewed_total else 0

    opportunity_count = ProactiveInsight.objects.filter(
        linked_opportunity_id__isnull=False,
    ).count()

    return {
        'total': total,
        'by_status': by_status,
        'by_type': by_type,
        'act_rate': act_rate,
        'dismiss_rate': dismiss_rate,
        'avg_feedback_score': round(avg_feedback, 2) if avg_feedback else None,
        'opportunity_conversions': opportunity_count,
    }


def apply_feedback_learning() -> Dict[str, Any]:
    """
    反馈学习回路：根据历史 dismissed/feedback 数据调整未来洞察优先级。

    规则：
    1. 同一 (insight_type, client_id) 组合近 30 天 dismissed >= 3 次 → 降为 low
    2. feedback_score >= 4 的洞察自动沉淀到知识库
    """
    from django.db.models import Count
    from datetime import timedelta

    cutoff = timezone.now() - timedelta(days=30)

    # 1. Dismissed 降权
    dismiss_groups = (
        ProactiveInsight.objects
        .filter(status=InsightStatus.DISMISSED, created_at__gte=cutoff)
        .values('insight_type', 'client_id')
        .annotate(cnt=Count('id'))
        .filter(cnt__gte=3)
    )

    suppressed = 0
    for group in dismiss_groups:
        updated = ProactiveInsight.objects.filter(
            insight_type=group['insight_type'],
            client_id=group['client_id'],
            status=InsightStatus.DRAFT,
            priority__in=['high', 'medium', 'critical'],
        ).update(priority='low')
        suppressed += updated

    # 2. 高分洞察知识沉淀
    deposited = 0
    high_score = ProactiveInsight.objects.filter(
        feedback_score__gte=4,
        status__in=[InsightStatus.ACTED, InsightStatus.PUSHED],
    ).exclude(
        detail__has_key='knowledge_deposited',
    )[:20]

    for insight in high_score:
        ok = _deposit_insight_to_knowledge(insight)
        if ok:
            deposited += 1
            detail = insight.detail or {}
            detail['knowledge_deposited'] = True
            insight.detail = detail
            insight.save(update_fields=['detail', 'updated_at'])

    logger.info('Feedback learning: suppressed=%d deposited=%d', suppressed, deposited)
    return {'suppressed': suppressed, 'deposited': deposited}


def _deposit_insight_to_knowledge(insight: ProactiveInsight) -> bool:
    """将高分洞察写入知识库"""
    try:
        from apps.knowledge.models import KnowledgeEntry

        entry_type_map = {
            'trend_alert': 'market_insight',
            'client_periodic': 'client_insight',
            'project_recommendation': 'opportunity_insight',
        }
        entry_type = entry_type_map.get(insight.insight_type, 'general_insight')

        detail = insight.detail or {}
        content_parts = [
            f'# {insight.title}',
            '',
            insight.summary,
            '',
        ]
        findings = detail.get('key_findings', [])
        if findings:
            content_parts.append('## 核心发现')
            for f in findings:
                content_parts.append(f'- {f}')
            content_parts.append('')

        actions = detail.get('recommended_actions', [])
        if actions:
            content_parts.append('## 建议行动')
            for a in actions:
                content_parts.append(f'- {a}')

        content = '\n'.join(content_parts)

        KnowledgeEntry.objects.create(
            title=insight.title[:200],
            content=content,
            entry_type=entry_type,
            source='proactive_insight',
            source_id=str(insight.id),
            metadata={
                'insight_id': insight.id,
                'insight_type': insight.insight_type,
                'client_id': insight.client_id,
                'client_name': insight.client_name,
                'feedback_score': insight.feedback_score,
                'relevance_score': insight.relevance_score,
            },
        )
        logger.info('Insight %d deposited to knowledge', insight.id)
        return True
    except Exception as e:
        logger.warning('Knowledge deposit failed for insight %d: %s', insight.id, e)
        return False


def _action_to_status(action: str, current: str) -> Optional[str]:
    mapping = {
        'submit_review': InsightStatus.PENDING_REVIEW,
        'approve': InsightStatus.APPROVED,
        'dismiss': InsightStatus.DISMISSED,
        'push': InsightStatus.PUSHED,
        'act': InsightStatus.ACTED,
        'revert_draft': InsightStatus.DRAFT,
    }
    return mapping.get(action)
