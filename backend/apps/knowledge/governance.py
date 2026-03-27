"""
知识治理服务

实现知识条目的生命周期管理：
1. 状态机转换（draft → processed → pending_review → published → archived）
2. 发布审核工作流
3. 知识版本追踪（通过 source_key 版本号实现）
4. RAG 引用追踪
5. 发布质量门禁检查
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from django.db import transaction
from django.db.models import Avg, Count, Q

logger = logging.getLogger('cn_kis.knowledge.governance')

# ── 状态机允许转换（from → [allowed targets]）
ALLOWED_TRANSITIONS = {
    'draft':          ['processed', 'rejected'],
    'processed':      ['pending_review', 'rejected'],
    'pending_review': ['published', 'rejected', 'processed'],
    'published':      ['archived', 'pending_review'],  # 允许撤回重审
    'archived':       ['pending_review'],               # 允许从归档恢复
    'rejected':       ['draft'],                        # 允许从拒绝重新编辑
}

# ── 发布条件（必须全部满足）
PUBLISH_REQUIREMENTS = {
    'min_title_length': 5,
    'min_content_length': 20,
    'min_quality_score': 40,
}


class KnowledgeGovernanceError(Exception):
    pass


class InvalidStateTransition(KnowledgeGovernanceError):
    pass


class PublishRequirementNotMet(KnowledgeGovernanceError):
    pass


def transition_entry_status(
    entry_id: int,
    target_status: str,
    operator_id: Optional[int] = None,
    reason: str = '',
) -> Tuple[bool, str]:
    """
    执行知识条目状态机转换。

    Args:
        entry_id: 条目 ID
        target_status: 目标状态
        operator_id: 操作人账号 ID
        reason: 转换原因（审批批注等）

    Returns:
        (success: bool, message: str)

    Side effects:
        - 更新 KnowledgeEntry.status
        - published → is_published=True
        - archived / rejected → is_published=False
        - published 时触发向量化任务
    """
    from .models import KnowledgeEntry

    entry = KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False).first()
    if not entry:
        return False, f'条目 #{entry_id} 不存在'

    current = entry.status
    allowed = ALLOWED_TRANSITIONS.get(current, [])

    if target_status not in allowed:
        return False, (
            f'状态不允许：{current} → {target_status}，'
            f'允许的转换：{current} → {allowed}'
        )

    # 发布前质量检查
    if target_status == 'published':
        ok, msg = _check_publish_requirements(entry)
        if not ok:
            return False, msg

    # 执行状态转换
    update_fields = ['status', 'update_time']
    entry.status = target_status

    if target_status == 'published':
        entry.is_published = True
        update_fields.append('is_published')
    elif target_status in ('archived', 'rejected'):
        entry.is_published = False
        update_fields.append('is_published')

    with transaction.atomic():
        entry.save(update_fields=update_fields)

        # 记录审计日志
        _log_state_transition(
            entry_id=entry_id,
            from_status=current,
            to_status=target_status,
            operator_id=operator_id,
            reason=reason,
        )

    # 发布时触发向量化
    if target_status == 'published' and entry.index_status != 'indexed':
        try:
            from .tasks import vectorize_knowledge_entry
            vectorize_knowledge_entry.delay(entry_id)
        except Exception as e:
            logger.warning('Failed to queue vectorization for entry #%s: %s', entry_id, e)

    logger.info(
        'Entry #%s: %s → %s (operator=%s)',
        entry_id, current, target_status, operator_id
    )
    return True, f'状态已更新：{current} → {target_status}'


def _check_publish_requirements(entry) -> Tuple[bool, str]:
    """检查发布条件"""
    reqs = PUBLISH_REQUIREMENTS

    if not entry.title or len(entry.title.strip()) < reqs['min_title_length']:
        return False, f'标题太短（最少 {reqs["min_title_length"]} 字）'

    if not entry.content or len(entry.content.strip()) < reqs['min_content_length']:
        return False, f'内容太短（最少 {reqs["min_content_length"]} 字）'

    quality_score = entry.quality_score or 0
    if quality_score < reqs['min_quality_score']:
        return False, (
            f'质量评分 {quality_score} < {reqs["min_quality_score"]}，'
            '请补充内容后重新提交'
        )

    return True, 'OK'


def _log_state_transition(
    entry_id: int,
    from_status: str,
    to_status: str,
    operator_id: Optional[int],
    reason: str,
):
    """记录状态变更日志（写入 Django logger，未来可存 DB）"""
    logger.info(
        'KnowledgeEntry #%d: %s → %s | operator=%s | reason=%s',
        entry_id, from_status, to_status, operator_id, reason or 'N/A'
    )


def batch_review_entries(
    entry_ids: List[int],
    action: str,  # 'publish' | 'reject'
    operator_id: Optional[int] = None,
    reason: str = '',
) -> Dict[str, Any]:
    """
    批量审核知识条目（审核员工作台专用）。

    action: 'publish' → pending_review → published
            'reject'  → pending_review → rejected
    """
    if action == 'publish':
        target_status = 'published'
    elif action == 'reject':
        target_status = 'rejected'
    else:
        return {'success': False, 'error': f'Unknown action: {action}'}

    results = {'action': action, 'total': len(entry_ids), 'succeeded': 0, 'failed': []}

    for entry_id in entry_ids:
        success, msg = transition_entry_status(
            entry_id=entry_id,
            target_status=target_status,
            operator_id=operator_id,
            reason=reason,
        )
        if success:
            results['succeeded'] += 1
        else:
            results['failed'].append({'entry_id': entry_id, 'reason': msg})

    return results


def get_pending_review_entries(
    entry_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> Dict[str, Any]:
    """
    获取待审核知识条目列表（给审核员用）
    """
    from .models import KnowledgeEntry
    from libs.db_utils import paginate_queryset

    qs = KnowledgeEntry.objects.filter(
        is_deleted=False,
        status='pending_review',
    ).order_by('-update_time')

    if entry_type:
        qs = qs.filter(entry_type=entry_type)

    return paginate_queryset(qs, page=page, page_size=page_size, max_page_size=100)


def recalculate_quality_score(entry_id: int, sync_status: bool = False) -> Dict[str, Any]:
    """
    重新计算知识条目的质量评分（用于人工触发或定期重算）
    """
    from .models import KnowledgeEntry
    from .quality_scorer import score_entry

    entry = KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False).first()
    if not entry:
        return {'success': False, 'error': f'Entry #{entry_id} not found'}

    entity_count = 0
    relation_count = 0
    try:
        from .models import KnowledgeEntity
        entity_count = KnowledgeEntity.objects.filter(linked_entry_id=entry_id, is_deleted=False).count()
    except Exception:
        pass

    merged_properties: Dict[str, Any] = {}
    if entry.namespace:
        merged_properties.setdefault('namespace', entry.namespace)
    if entry.uri:
        merged_properties.setdefault('source_url', entry.uri)

    score_result = score_entry(
        title=entry.title or '',
        content=entry.content or '',
        summary=entry.summary or '',
        tags=entry.tags or [],
        source_type=entry.source_type or '',
        entry_type=entry.entry_type or '',
        created_at=entry.create_time,
        entity_count=entity_count,
        relation_count=relation_count,
        has_source_url=bool(entry.uri),
        properties=merged_properties,
    )
    update_fields = {
        'quality_score': score_result['total'],
    }
    if sync_status:
        routed_status = score_result['routing']
        update_fields['status'] = routed_status
        update_fields['is_published'] = (routed_status == 'published')

    KnowledgeEntry.objects.filter(id=entry_id).update(**update_fields)

    logger.info(
        'Entry #%s quality score recalculated: %d → %d',
        entry_id, entry.quality_score or 0, score_result['total']
    )
    return {
        'success': True,
        'entry_id': entry_id,
        'old_score': entry.quality_score,
        'new_score': score_result['total'],
        'old_status': entry.status,
        'new_status': score_result['routing'] if sync_status else entry.status,
        'sync_status': sync_status,
        'details': score_result,
    }


def track_rag_citation(entry_id: int):
    """
    记录 RAG 引用（每次 Agent 引用某条知识时调用）
    """
    from .models import KnowledgeEntry
    from django.db.models import F

    KnowledgeEntry.objects.filter(id=entry_id, is_deleted=False).update(
        rag_cite_count=F('rag_cite_count') + 1,
    )


def get_knowledge_governance_stats() -> Dict[str, Any]:
    """
    获取知识治理统计（管理后台用）
    """
    from .models import KnowledgeDomainPolicy, KnowledgeEntry

    now = datetime.now(timezone.utc)

    status_counts = dict(
        KnowledgeEntry.objects.filter(is_deleted=False)
        .values('status')
        .annotate(count=Count('id'))
        .values_list('status', 'count')
    )

    type_counts = dict(
        KnowledgeEntry.objects.filter(is_deleted=False, is_published=True)
        .values('entry_type')
        .annotate(count=Count('id'))
        .values_list('entry_type', 'count')
    )

    avg_quality = KnowledgeEntry.objects.filter(
        is_deleted=False,
        quality_score__isnull=False,
    ).aggregate(avg=Avg('quality_score'))['avg'] or 0

    index_counts = dict(
        KnowledgeEntry.objects.filter(is_deleted=False, is_published=True)
        .values('index_status')
        .annotate(count=Count('id'))
        .values_list('index_status', 'count')
    )

    total_citations = KnowledgeEntry.objects.filter(
        is_deleted=False,
    ).aggregate(total=Count('rag_cite_count'))['total'] or 0

    namespace_stats = list(
        KnowledgeEntry.objects.filter(is_deleted=False)
        .values('namespace')
        .annotate(
            total=Count('id'),
            published=Count('id', filter=Q(status='published')),
            pending_review=Count('id', filter=Q(status='pending_review')),
            overdue=Count('id', filter=Q(next_review_at__lt=now)),
        )
        .order_by('namespace')
    )

    owner_stats = list(
        KnowledgeEntry.objects.filter(is_deleted=False, owner__isnull=False)
        .values('owner_id', 'owner__display_name', 'owner__username')
        .annotate(
            total=Count('id'),
            overdue=Count('id', filter=Q(next_review_at__lt=now)),
            pending_review=Count('id', filter=Q(status='pending_review')),
        )
        .order_by('-total', 'owner_id')
    )

    reviewer_stats = list(
        KnowledgeEntry.objects.filter(is_deleted=False, reviewer__isnull=False)
        .values('reviewer_id', 'reviewer__display_name', 'reviewer__username')
        .annotate(
            total=Count('id'),
            overdue=Count('id', filter=Q(next_review_at__lt=now)),
            pending_review=Count('id', filter=Q(status='pending_review')),
        )
        .order_by('-total', 'reviewer_id')
    )

    policies = list(
        KnowledgeDomainPolicy.objects.filter(is_active=True)
        .values(
            'namespace',
            'review_cycle_days',
            'owner_id',
            'owner__display_name',
            'owner__username',
            'reviewer_id',
            'reviewer__display_name',
            'reviewer__username',
        )
        .order_by('namespace')
    )

    return {
        'status_distribution': status_counts,
        'type_distribution': type_counts,
        'avg_quality_score': round(float(avg_quality), 1),
        'index_status': index_counts,
        'domain_policies': policies,
        'namespace_stats': namespace_stats,
        'owner_stats': owner_stats,
        'reviewer_stats': reviewer_stats,
        'total_published': status_counts.get('published', 0),
        'total_pending_review': status_counts.get('pending_review', 0),
        'total_draft': status_counts.get('draft', 0),
        'total_citations': total_citations,
    }
