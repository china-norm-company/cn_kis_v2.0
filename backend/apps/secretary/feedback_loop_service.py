"""
学习反馈循环服务 (D7)

闭环机制：用户反馈 → 行为画像 → Agent 提示词注入 → 行为改进

核心能力：
1. 用户行为画像：聚合反馈形成 per-user/per-action-type 偏好权重
2. 提示词上下文注入：为每次 Agent 调用注入个性化学习信号
3. 行为调整：根据采纳率/评分自动调整推荐优先级与策略
4. 周期性摘要：定期生成学习报告推动持续优化
"""
import logging
from collections import defaultdict
from datetime import timedelta
from typing import Any, Dict, List, Optional

from django.utils import timezone

logger = logging.getLogger(__name__)

PROFILE_CACHE_TTL_SECONDS = 600
_profile_cache: Dict[int, tuple] = {}


def build_user_behavior_profile(account_id: int, days: int = 90) -> Dict[str, Any]:
    """
    构建用户行为画像：按 action_type 聚合反馈指标，生成偏好权重。
    """
    from .models import AssistantActionPlan, AssistantActionFeedback

    cached = _profile_cache.get(account_id)
    if cached and (timezone.now().timestamp() - cached[0]) < PROFILE_CACHE_TTL_SECONDS:
        return cached[1]

    cutoff = timezone.now() - timedelta(days=days)

    plans = list(
        AssistantActionPlan.objects.filter(
            account_id=account_id,
            created_at__gte=cutoff,
        ).values('id', 'action_type')
    )
    if not plans:
        profile = _empty_profile(account_id, days)
        _profile_cache[account_id] = (timezone.now().timestamp(), profile)
        return profile

    plan_map = {p['id']: p['action_type'] for p in plans}
    plan_ids = list(plan_map.keys())

    feedbacks = list(
        AssistantActionFeedback.objects.filter(
            action_plan_id__in=plan_ids,
            created_at__gte=cutoff,
        ).values('action_plan_id', 'adopted', 'score', 'note')
    )

    by_type: Dict[str, Dict[str, Any]] = defaultdict(
        lambda: {'total': 0, 'adopted': 0, 'scores': [], 'negative_notes': []}
    )

    for fb in feedbacks:
        action_type = plan_map.get(fb['action_plan_id'], 'unknown')
        bucket = by_type[action_type]
        bucket['total'] += 1
        if fb['adopted']:
            bucket['adopted'] += 1
        if fb['score'] is not None:
            bucket['scores'].append(fb['score'])
        if not fb['adopted'] and fb.get('note'):
            bucket['negative_notes'].append(str(fb['note'])[:200])

    type_profiles = {}
    for action_type, stat in by_type.items():
        total = stat['total']
        adoption_rate = stat['adopted'] / total if total else 0.0
        avg_score = sum(stat['scores']) / len(stat['scores']) if stat['scores'] else None

        weight = _compute_weight(adoption_rate, avg_score, total)
        strategy = _derive_strategy(adoption_rate, avg_score, stat['negative_notes'])

        type_profiles[action_type] = {
            'adoption_rate': round(adoption_rate, 3),
            'avg_score': round(avg_score, 2) if avg_score is not None else None,
            'sample_size': total,
            'weight': round(weight, 3),
            'strategy': strategy,
        }

    profile = {
        'account_id': account_id,
        'window_days': days,
        'total_feedback': len(feedbacks),
        'type_profiles': type_profiles,
        'global_adoption_rate': round(
            sum(1 for f in feedbacks if f['adopted']) / len(feedbacks), 3
        ) if feedbacks else 0.0,
        'computed_at': timezone.now().isoformat(),
    }

    _profile_cache[account_id] = (timezone.now().timestamp(), profile)
    return profile


def generate_agent_learning_context(
    account_id: int,
    agent_id: str,
    action_types: Optional[List[str]] = None,
) -> str:
    """
    为 Agent 调用生成个性化学习上下文（注入到 system prompt 末尾）。

    返回一段自然语言描述，告知 Agent 该用户的偏好特征。
    """
    profile = build_user_behavior_profile(account_id)
    type_profiles = profile.get('type_profiles', {})

    if not type_profiles:
        return ''

    relevant = type_profiles
    if action_types:
        relevant = {k: v for k, v in type_profiles.items() if k in action_types}
    if not relevant:
        return ''

    lines = ['[用户行为偏好（基于历史反馈自动生成）]']

    high_adoption = [k for k, v in relevant.items() if v['adoption_rate'] >= 0.7]
    low_adoption = [k for k, v in relevant.items() if v['adoption_rate'] < 0.3 and v['sample_size'] >= 3]

    if high_adoption:
        lines.append(f'- 用户偏好类型: {", ".join(high_adoption)}（采纳率≥70%，可主动推荐）')

    if low_adoption:
        for at in low_adoption:
            p = relevant[at]
            strategy = p.get('strategy', '')
            lines.append(f'- 用户不太接受「{at}」类建议（采纳率{p["adoption_rate"]*100:.0f}%），{strategy}')

    high_scored = [
        (k, v['avg_score']) for k, v in relevant.items()
        if v['avg_score'] is not None and v['avg_score'] >= 4.0
    ]
    if high_scored:
        items = [f'{k}({s:.1f}分)' for k, s in high_scored]
        lines.append(f'- 高评价建议类型: {", ".join(items)}')

    global_rate = profile.get('global_adoption_rate', 0)
    if global_rate < 0.3:
        lines.append('- 该用户对 AI 建议整体持谨慎态度，请提供更充分的依据和说明')
    elif global_rate > 0.8:
        lines.append('- 该用户对 AI 建议整体信任度高，可适度增加主动建议')

    try:
        from .memory_service import build_memory_context

        memory_ctx = build_memory_context(
            worker_code=agent_id,
            subject_key=str(account_id),
            limit=4,
        )
        if memory_ctx:
            lines.append(memory_ctx)
    except Exception:
        pass

    return '\n'.join(lines) if len(lines) > 1 else ''


def adjust_action_priority(
    account_id: int,
    action_type: str,
    base_priority: int,
    base_confidence: int,
) -> Dict[str, int]:
    """
    基于学习信号自动调整动作的优先级和置信度。
    """
    profile = build_user_behavior_profile(account_id)
    type_profiles = profile.get('type_profiles', {})
    tp = type_profiles.get(action_type)

    if not tp or tp['sample_size'] < 3:
        return {'priority': base_priority, 'confidence': base_confidence}

    weight = tp['weight']
    priority_delta = int((weight - 1.0) * 20)
    confidence_delta = int((tp['adoption_rate'] - 0.5) * 16)

    adjusted_priority = max(1, min(100, base_priority + priority_delta))
    adjusted_confidence = max(1, min(100, base_confidence + confidence_delta))

    return {'priority': adjusted_priority, 'confidence': adjusted_confidence}


def get_user_feedback_summary(account_id: int, days: int = 30) -> Dict[str, Any]:
    """
    用户反馈摘要：用于前端展示学习状态仪表盘。
    """
    profile = build_user_behavior_profile(account_id, days=days)
    type_profiles = profile.get('type_profiles', {})

    improving = []
    declining = []

    for action_type, tp in type_profiles.items():
        if tp['sample_size'] >= 5:
            if tp['adoption_rate'] >= 0.6 and (tp.get('avg_score') or 0) >= 3.5:
                improving.append(action_type)
            elif tp['adoption_rate'] < 0.3:
                declining.append(action_type)

    return {
        'account_id': account_id,
        'window_days': days,
        'total_feedback': profile.get('total_feedback', 0),
        'global_adoption_rate': profile.get('global_adoption_rate', 0),
        'type_count': len(type_profiles),
        'improving_types': improving,
        'declining_types': declining,
        'learning_status': _classify_learning_status(profile),
    }


def record_feedback_learning_cycle(
    account_id: int,
    agent_id: str,
    action_type: str,
    *,
    outcome: str,
    root_cause: str,
    better_policy: str,
    replay_score: float = 0.0,
    evidence: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    将用户反馈沉淀为可回放的策略学习记录。
    """
    from .memory_service import learn_policy, remember

    remember(
        worker_code=agent_id,
        memory_type='episodic',
        content=outcome,
        summary=f'{action_type}: {outcome[:100]}',
        evidence=evidence or {},
        account_id=account_id,
        subject_type='account',
        subject_key=str(account_id),
        ttl_days=90,
        importance_score=70,
    )
    return learn_policy(
        worker_code=agent_id,
        domain_code=action_type,
        policy_key=action_type,
        outcome=outcome,
        root_cause=root_cause,
        better_policy=better_policy,
        evidence={'account_id': account_id, **(evidence or {})},
        replay_score=replay_score,
    )


def invalidate_profile_cache(account_id: int):
    _profile_cache.pop(account_id, None)


def _compute_weight(adoption_rate: float, avg_score: Optional[float], sample_size: int) -> float:
    """权重 = f(采纳率, 评分, 样本量)，范围 [0.3, 2.0]"""
    base = 1.0
    adoption_factor = (adoption_rate - 0.5) * 1.2
    score_factor = ((avg_score - 3.0) / 2.0 * 0.4) if avg_score is not None else 0.0
    reliability = min(1.0, sample_size / 8.0)
    weight = base + (adoption_factor + score_factor) * reliability
    return max(0.3, min(2.0, weight))


def _derive_strategy(
    adoption_rate: float,
    avg_score: Optional[float],
    negative_notes: List[str],
) -> str:
    if adoption_rate >= 0.7:
        return '继续当前策略'
    if adoption_rate < 0.3:
        if negative_notes:
            common = _extract_common_theme(negative_notes)
            if common:
                return f'建议调整方向：{common}'
        return '建议降低推送频率，增加解释说明'
    if avg_score is not None and avg_score < 2.5:
        return '建议提高建议质量，减少低价值建议'
    return '保持观察，适度调整'


def _extract_common_theme(notes: List[str]) -> str:
    keywords = defaultdict(int)
    stop_words = {'的', '了', '是', '不', '很', '有', '也', '都', '就', '在', '和'}
    for note in notes[:20]:
        for char_pair in [note[i:i+2] for i in range(len(note) - 1)]:
            if not any(c in stop_words for c in char_pair):
                keywords[char_pair] += 1
    if not keywords:
        return ''
    top = sorted(keywords.items(), key=lambda x: -x[1])[:3]
    if top[0][1] >= 2:
        return '、'.join(k for k, _ in top)
    return ''


def _classify_learning_status(profile: Dict[str, Any]) -> str:
    total = profile.get('total_feedback', 0)
    if total < 5:
        return 'warming_up'
    global_rate = profile.get('global_adoption_rate', 0)
    if global_rate >= 0.7:
        return 'well_calibrated'
    if global_rate >= 0.4:
        return 'learning'
    return 'needs_attention'


def _empty_profile(account_id: int, days: int) -> Dict[str, Any]:
    return {
        'account_id': account_id,
        'window_days': days,
        'total_feedback': 0,
        'type_profiles': {},
        'global_adoption_rate': 0.0,
        'computed_at': timezone.now().isoformat(),
    }
