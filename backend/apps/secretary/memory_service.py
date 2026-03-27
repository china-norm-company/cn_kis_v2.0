from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Dict, List, Optional

from django.utils import timezone

logger = logging.getLogger(__name__)


def ensure_worker_profile(
    worker_code: str,
    domain_code: str = '',
    worker_name: str = '',
    account_id: Optional[int] = None,
    project_key: str = '',
    customer_key: str = '',
    subject_key: str = '',
):
    from .models_memory import WorkerMemoryProfile

    profile, _ = WorkerMemoryProfile.objects.get_or_create(
        worker_code=worker_code,
        account_id=account_id,
        project_key=project_key,
        customer_key=customer_key,
        subject_key=subject_key,
        defaults={
            'worker_name': worker_name or worker_code,
            'domain_code': domain_code,
        },
    )
    changed = False
    if domain_code and profile.domain_code != domain_code:
        profile.domain_code = domain_code
        changed = True
    if worker_name and profile.worker_name != worker_name:
        profile.worker_name = worker_name
        changed = True
    if changed:
        profile.save(update_fields=['domain_code', 'worker_name', 'updated_at'])
    return profile


def remember(
    worker_code: str,
    memory_type: str,
    content: str,
    *,
    summary: str = '',
    evidence: Optional[Dict[str, Any]] = None,
    source_task_id: str = '',
    account_id: Optional[int] = None,
    domain_code: str = '',
    subject_type: str = '',
    subject_key: str = '',
    ttl_days: int = 0,
    importance_score: int = 50,
    is_core: bool = False,
    visibility: str = 'private',
    auto_importance: bool = False,
) -> Dict[str, Any]:
    from .models_memory import WorkerMemoryRecord

    if auto_importance and content:
        try:
            importance_score = auto_infer_importance(content, {'worker_code': worker_code, 'memory_type': memory_type})
        except Exception:
            pass

    profile = ensure_worker_profile(
        worker_code=worker_code,
        domain_code=domain_code,
        account_id=account_id,
        subject_key=subject_key if subject_type == 'subject' else '',
        customer_key=subject_key if subject_type == 'customer' else '',
        project_key=subject_key if subject_type == 'project' else '',
    )
    expires_at = timezone.now() + timedelta(days=ttl_days) if ttl_days > 0 else None
    record = WorkerMemoryRecord.objects.create(
        profile=profile,
        memory_type=memory_type,
        worker_code=worker_code,
        subject_type=subject_type,
        subject_key=subject_key,
        content=content,
        summary=summary or content[:120],
        evidence=evidence or {},
        source_task_id=source_task_id,
        importance_score=importance_score,
        ttl_days=ttl_days,
        expires_at=expires_at,
        is_core=is_core,
        visibility=visibility,
    )
    return {'id': record.id, 'summary': record.summary, 'memory_type': record.memory_type}


def recall_memories(
    worker_code: str,
    *,
    subject_key: str = '',
    memory_types: Optional[List[str]] = None,
    limit: int = 8,
    include_team: bool = False,
    business_run_id: str = '',
) -> List[Dict[str, Any]]:
    from .models_memory import WorkerMemoryRecord
    from django.db.models import Q

    base_q = Q(worker_code=worker_code)
    if include_team:
        team_q = Q(visibility='team')
        if business_run_id:
            team_q &= Q(source_task_id__startswith=business_run_id[:20])
        global_q = Q(visibility='global')
        base_q = base_q | team_q | global_q

    qs = WorkerMemoryRecord.objects.filter(base_q, compressed=False).order_by('-importance_score', '-created_at')
    qs = qs.filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now()))
    if subject_key:
        qs = qs.filter(subject_key=subject_key)
    if memory_types:
        qs = qs.filter(memory_type__in=memory_types)
    rows = []
    for record in qs[:limit]:
        # 更新最后访问时间（衰减计算用）
        try:
            WorkerMemoryRecord.objects.filter(pk=record.pk).update(last_accessed_at=timezone.now())
        except Exception:
            pass
        rows.append(
            {
                'id': record.id,
                'memory_type': record.memory_type,
                'summary': record.summary,
                'content': record.content,
                'evidence': record.evidence,
                'is_core': record.is_core,
                'visibility': record.visibility,
            }
        )
    return rows


def build_memory_context(
    worker_code: str,
    *,
    subject_key: str = '',
    limit: int = 6,
    include_team: bool = False,
    business_run_id: str = '',
) -> str:
    from .models_memory import WorkerMemoryRecord

    # 先加载核心记忆（始终注入，不受 limit 限制）
    core_records = WorkerMemoryRecord.objects.filter(
        worker_code=worker_code, is_core=True, compressed=False,
    ).order_by('-importance_score')[:5]

    # 再加载普通记忆
    memories = recall_memories(
        worker_code,
        subject_key=subject_key,
        memory_types=['episodic', 'semantic', 'policy'],
        limit=limit,
        include_team=include_team,
        business_run_id=business_run_id,
    )
    if not memories and not core_records:
        return ''

    lines = ['[数字员工长期记忆]']
    for record in core_records:
        lines.append(f'[核心] {record.summary}')
    for item in memories:
        prefix = '[共享]' if item.get('visibility') in ('team', 'global') else ''
        lines.append(f'- {item["memory_type"]}{prefix}: {item["summary"]}')
    return '\n'.join(lines)


def learn_policy(
    worker_code: str,
    policy_key: str,
    outcome: str,
    root_cause: str,
    better_policy: str,
    *,
    evidence: Optional[Dict[str, Any]] = None,
    replay_score: float = 0.0,
    domain_code: str = '',
) -> Dict[str, Any]:
    from .models_memory import WorkerPolicyUpdate

    update = WorkerPolicyUpdate.objects.create(
        worker_code=worker_code,
        domain_code=domain_code,
        policy_key=policy_key,
        outcome=outcome,
        root_cause=root_cause,
        better_policy=better_policy,
        evidence=evidence or {},
        replay_score=replay_score,
        status=WorkerPolicyUpdate.Status.EVALUATING if replay_score < 0.8 else WorkerPolicyUpdate.Status.ACTIVE,
        activated_at=timezone.now() if replay_score >= 0.8 else None,
    )
    remember(
        worker_code=worker_code,
        memory_type='policy',
        content=better_policy,
        summary=f'{policy_key}: {better_policy[:100]}',
        evidence={'outcome': outcome, 'root_cause': root_cause, **(evidence or {})},
        domain_code=domain_code,
        importance_score=80,
    )
    return {'id': update.id, 'status': update.status}


def _log_policy_governance_event(action: str, update, operator_id: Optional[int], payload: Optional[Dict[str, Any]] = None) -> None:
    try:
        from .models_governance import GovernanceMetricEvent

        GovernanceMetricEvent.objects.create(
            event_type=GovernanceMetricEvent.EventType.MANUAL_OVERRIDE,
            source='policy_learning',
            dimension_1=f'{update.worker_code}:{update.policy_key}'[:120],
            dimension_2=action[:120],
            account_id=operator_id,
            payload={
                'policy_update_id': update.id,
                'worker_code': update.worker_code,
                'policy_key': update.policy_key,
                'status': update.status,
                **(payload or {}),
            },
        )
    except Exception as exc:
        logger.debug('_log_policy_governance_event failed: %s', exc)


def submit_policy_for_evaluation(update_id: int, operator_id: Optional[int] = None) -> Dict[str, Any]:
    """DRAFT -> EVALUATING：将草稿策略提交评测。"""
    from .models_memory import WorkerPolicyUpdate

    update = WorkerPolicyUpdate.objects.filter(id=update_id).first()
    if not update:
        return {'ok': False, 'message': '策略升级记录不存在'}
    if update.status != WorkerPolicyUpdate.Status.DRAFT:
        return {'ok': False, 'message': '仅草稿状态的策略可提交评测'}
    update.status = WorkerPolicyUpdate.Status.EVALUATING
    update.save(update_fields=['status', 'updated_at'])
    _log_policy_governance_event('submit_evaluation', update, operator_id)
    return {
        'ok': True,
        'message': '策略已提交评测',
        'policy_update_id': update.id,
        'status': update.status,
    }


def approve_policy_evaluation(update_id: int, operator_id: Optional[int] = None) -> Dict[str, Any]:
    """EVALUATING -> ACTIVE：批准评测中的策略使其生效。"""
    from .models_memory import WorkerPolicyUpdate

    update = WorkerPolicyUpdate.objects.filter(id=update_id).first()
    if not update:
        return {'ok': False, 'message': '策略升级记录不存在'}
    if update.status != WorkerPolicyUpdate.Status.EVALUATING:
        return {'ok': False, 'message': '仅评测中的策略可批准生效'}

    siblings = WorkerPolicyUpdate.objects.filter(
        worker_code=update.worker_code, policy_key=update.policy_key,
    ).exclude(id=update.id)
    retired_ids = list(siblings.filter(status=WorkerPolicyUpdate.Status.ACTIVE).values_list('id', flat=True))
    if retired_ids:
        siblings.filter(status=WorkerPolicyUpdate.Status.ACTIVE).update(status=WorkerPolicyUpdate.Status.RETIRED)
    update.status = WorkerPolicyUpdate.Status.ACTIVE
    update.activated_at = timezone.now()
    update.save(update_fields=['status', 'activated_at', 'updated_at'])
    _log_policy_governance_event('approve_evaluation', update, operator_id, payload={'retired_update_ids': retired_ids})
    return {
        'ok': True,
        'message': '策略已批准生效',
        'policy_update_id': update.id,
        'status': update.status,
        'retired_update_ids': retired_ids,
    }


def reject_policy_evaluation(update_id: int, operator_id: Optional[int] = None, reason: str = '') -> Dict[str, Any]:
    """EVALUATING -> RETIRED：驳回评测中的策略。"""
    from .models_memory import WorkerPolicyUpdate

    update = WorkerPolicyUpdate.objects.filter(id=update_id).first()
    if not update:
        return {'ok': False, 'message': '策略升级记录不存在'}
    if update.status != WorkerPolicyUpdate.Status.EVALUATING:
        return {'ok': False, 'message': '仅评测中的策略可驳回'}
    update.status = WorkerPolicyUpdate.Status.RETIRED
    update.save(update_fields=['status', 'updated_at'])
    _log_policy_governance_event('reject_evaluation', update, operator_id, payload={'reason': reason})
    return {
        'ok': True,
        'message': '策略已驳回',
        'policy_update_id': update.id,
        'status': update.status,
    }


def activate_policy_update(update_id: int, operator_id: Optional[int] = None) -> Dict[str, Any]:
    from .models_memory import WorkerPolicyUpdate

    update = WorkerPolicyUpdate.objects.filter(id=update_id).first()
    if not update:
        return {'ok': False, 'message': '策略升级记录不存在'}

    siblings = WorkerPolicyUpdate.objects.filter(
        worker_code=update.worker_code,
        policy_key=update.policy_key,
    ).exclude(id=update.id)
    retired_ids = list(siblings.filter(status=WorkerPolicyUpdate.Status.ACTIVE).values_list('id', flat=True))
    if retired_ids:
        siblings.filter(status=WorkerPolicyUpdate.Status.ACTIVE).update(status=WorkerPolicyUpdate.Status.RETIRED)
    update.status = WorkerPolicyUpdate.Status.ACTIVE
    update.activated_at = timezone.now()
    update.save(update_fields=['status', 'activated_at', 'updated_at'])
    _log_policy_governance_event(
        'activate',
        update,
        operator_id,
        payload={'retired_update_ids': retired_ids},
    )
    return {
        'ok': True,
        'message': '策略已激活',
        'policy_update_id': update.id,
        'status': update.status,
        'retired_update_ids': retired_ids,
    }


def retire_policy_update(update_id: int, operator_id: Optional[int] = None, reason: str = '') -> Dict[str, Any]:
    from .models_memory import WorkerPolicyUpdate

    update = WorkerPolicyUpdate.objects.filter(id=update_id).first()
    if not update:
        return {'ok': False, 'message': '策略升级记录不存在'}
    update.status = WorkerPolicyUpdate.Status.RETIRED
    update.save(update_fields=['status', 'updated_at'])
    _log_policy_governance_event('retire', update, operator_id, payload={'reason': reason})
    return {
        'ok': True,
        'message': '策略已退役',
        'policy_update_id': update.id,
        'status': update.status,
    }


def rollback_policy_update(update_id: int, operator_id: Optional[int] = None, reason: str = '') -> Dict[str, Any]:
    from .models_memory import WorkerPolicyUpdate

    current = WorkerPolicyUpdate.objects.filter(id=update_id).first()
    if not current:
        return {'ok': False, 'message': '策略升级记录不存在'}
    if current.status != WorkerPolicyUpdate.Status.ACTIVE:
        return {'ok': False, 'message': '仅生效中的策略支持回滚'}

    previous = (
        WorkerPolicyUpdate.objects.filter(
            worker_code=current.worker_code,
            policy_key=current.policy_key,
        )
        .exclude(id=current.id)
        .order_by('-activated_at', '-created_at')
        .first()
    )
    if not previous:
        return {'ok': False, 'message': '无可回滚的上一版本策略'}

    current.status = WorkerPolicyUpdate.Status.RETIRED
    current.save(update_fields=['status', 'updated_at'])
    previous.status = WorkerPolicyUpdate.Status.ACTIVE
    previous.activated_at = timezone.now()
    previous.save(update_fields=['status', 'activated_at', 'updated_at'])
    _log_policy_governance_event(
        'rollback',
        current,
        operator_id,
        payload={
            'reason': reason,
            'restored_policy_update_id': previous.id,
        },
    )
    return {
        'ok': True,
        'message': '策略已回滚',
        'policy_update_id': current.id,
        'status': current.status,
        'restored_policy_update_id': previous.id,
        'restored_status': previous.status,
    }


# ============================================================================
# 核心记忆 / 主动遗忘 / 自动重要性 / 记忆压缩
# ============================================================================

def auto_infer_importance(content: str, context: Optional[Dict[str, Any]] = None) -> int:
    """用 LLM 自动推断记忆重要性（0-100），失败时返回默认 50。"""
    try:
        from apps.agent_gateway.services import quick_chat
        prompt = (
            '你是记忆重要性评估助手。请评估以下内容对 AI Agent 的长期记忆价值，'
            '返回一个 0-100 的整数分数（100=极重要，0=无价值），只返回数字，不要其他内容。\n\n'
            f'内容：{content[:500]}'
        )
        raw = quick_chat(message=prompt, temperature=0.1, max_tokens=10)
        score = int(raw.strip().split()[0])
        return max(0, min(100, score))
    except Exception:
        return 50


def set_core_memory(worker_code: str, content: str, subject_type: str = 'persona', summary: str = '') -> int:
    """设置/更新核心记忆（始终注入到 Agent 的 system prompt）。
    同 worker_code + subject_type 只保留最新一条 is_core=True。"""
    from .models_memory import WorkerMemoryRecord

    WorkerMemoryRecord.objects.filter(
        worker_code=worker_code, subject_type=subject_type, is_core=True,
    ).update(is_core=False)

    record = WorkerMemoryRecord.objects.create(
        worker_code=worker_code,
        memory_type='semantic',
        subject_type=subject_type,
        content=content,
        summary=summary or content[:120],
        importance_score=100,
        is_core=True,
        visibility='private',
    )
    return record.id


def forget_stale_memories(worker_code: str, days_threshold: int = 30) -> int:
    """主动遗忘：将过期、低重要性的记忆标记为 compressed（不再召回但保留审计）。
    返回处理的记忆数量。"""
    from .models_memory import WorkerMemoryRecord
    from django.db.models import Q

    count = 0
    now = timezone.now()

    # 1. TTL 已过期的
    expired_qs = WorkerMemoryRecord.objects.filter(
        worker_code=worker_code,
        compressed=False,
        is_core=False,
        expires_at__lt=now,
    )
    c = expired_qs.update(compressed=True)
    count += c

    # 2. importance_score < 20 且超过 days_threshold 天未访问（或创建）
    stale_cutoff = now - timedelta(days=days_threshold)
    stale_qs = WorkerMemoryRecord.objects.filter(
        worker_code=worker_code,
        compressed=False,
        is_core=False,
        importance_score__lt=20,
    ).filter(
        Q(last_accessed_at__lt=stale_cutoff) | Q(last_accessed_at__isnull=True, created_at__lt=stale_cutoff)
    )
    c = stale_qs.update(compressed=True)
    count += c

    logger.debug('forget_stale_memories: worker=%s forgotten=%d', worker_code, count)
    return count


def compress_memories(worker_code: str, subject_key: str = '', threshold: int = 10) -> Optional[int]:
    """将同一 subject_key 下超过 threshold 条的 episodic 记忆用 LLM 合并为一条 semantic 摘要。
    原始记忆标记 compressed=True，返回新生成的摘要记忆 ID。"""
    from .models_memory import WorkerMemoryRecord

    qs = WorkerMemoryRecord.objects.filter(
        worker_code=worker_code,
        memory_type='episodic',
        compressed=False,
        is_core=False,
    )
    if subject_key:
        qs = qs.filter(subject_key=subject_key)
    qs = qs.order_by('created_at')

    if qs.count() < threshold:
        return None

    records = list(qs[:50])
    combined_content = '\n'.join(f'[{r.subject_type}:{r.subject_key}] {r.content[:300]}' for r in records)
    summary_text = combined_content

    try:
        from apps.agent_gateway.services import quick_chat
        summary_text = quick_chat(
            message=f'将以下多条记忆压缩为一条语义摘要（500字内），保留关键事实：\n{combined_content[:1500]}',
            system_prompt='记忆压缩助手，中文，简洁。',
            temperature=0.3,
            max_tokens=512,
        )
    except Exception as exc:
        logger.warning('compress_memories LLM failed: %s', exc)

    new_record = remember(
        worker_code=worker_code,
        memory_type='semantic',
        content=summary_text,
        summary=summary_text[:200],
        subject_key=subject_key,
        subject_type=records[0].subject_type if records else '',
        importance_score=70,
        visibility='private',
    )

    # 标记原始记忆为已压缩
    record_ids = [r.id for r in records]
    WorkerMemoryRecord.objects.filter(id__in=record_ids).update(compressed=True)

    logger.info('compress_memories: worker=%s compressed=%d new_id=%s', worker_code, len(records), new_record['id'])
    return new_record['id']
