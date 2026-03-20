"""
邮件信号任务草稿服务

职责：
- 定义允许的 task_key 注册表（Phase 1 / Phase 2）
- 校验任务键合法性、场景匹配、前置关联确认
- 与 api.py 中的 generate_mail_signal_tasks 视图解耦
"""
from __future__ import annotations

from typing import Optional

# Phase 1：人工确认后回写 CRM / 研究上下文，不需要专项执行
PHASE1_TASK_KEYS: frozenset[str] = frozenset({
    'opportunity_draft',
    'client_profile_update',
    'research_context_sync',
    'client_risk_alert',
    'followup_action_draft',
})

# Phase 2：升级为真实专项分析执行链，结果写入 evidence_refs / draft_artifact_refs
PHASE2_TASK_KEYS: frozenset[str] = frozenset({
    'market_trend_brief',
    'competitive_intel_brief',
    'claim_strategy_brief',
})

ALLOWED_TASK_KEYS: frozenset[str] = PHASE1_TASK_KEYS | PHASE2_TASK_KEYS

# 每种邮件业务类型建议生成的任务键（允许的子集）
_SIGNAL_TYPE_TO_SUGGESTED_KEYS: dict[str, list[str]] = {
    'inquiry': ['opportunity_draft', 'client_profile_update', 'market_trend_brief', 'claim_strategy_brief'],
    'project_followup': ['research_context_sync', 'followup_action_draft'],
    'competitor_pressure': ['client_risk_alert', 'competitive_intel_brief'],
    'complaint': ['client_risk_alert', 'followup_action_draft'],
    'relationship_signal': ['client_profile_update', 'followup_action_draft'],
    'unknown': ['opportunity_draft', 'client_profile_update', 'followup_action_draft'],
}

# Phase 2 任务要求先有已确认的客户或联系人关联
REQUIRES_CONFIRMED_LINK_KEYS: frozenset[str] = frozenset({
    'market_trend_brief',
    'competitive_intel_brief',
    'claim_strategy_brief',
    'opportunity_draft',
})


def validate_task_keys(
    task_keys: list[str],
    signal_type: str,
    *,
    strict_scene: bool = False,
) -> tuple[list[str], list[dict]]:
    """
    校验请求的 task_keys。

    返回：
    - valid_keys: 校验通过的键列表（已去重、保序）
    - errors: 被拒绝项的详细说明列表 [{task_key, reason}]

    strict_scene=True 时，不在当前信号类型建议集内的键也会被拒绝。
    """
    suggested = set(_SIGNAL_TYPE_TO_SUGGESTED_KEYS.get(signal_type or 'unknown', []))
    seen: set[str] = set()
    valid: list[str] = []
    errors: list[dict] = []

    for key in (task_keys or []):
        if key in seen:
            continue
        seen.add(key)
        if key not in ALLOWED_TASK_KEYS:
            errors.append({
                'task_key': key,
                'reason': f'task_key "{key}" 不在允许列表中，请检查任务目录 v1',
            })
            continue
        if strict_scene and key not in suggested:
            errors.append({
                'task_key': key,
                'reason': (
                    f'task_key "{key}" 与当前邮件类型 "{signal_type}" 不匹配，'
                    f'该类型建议任务为 {sorted(suggested)}'
                ),
            })
            continue
        valid.append(key)

    return valid, errors


def check_confirmed_link_requirement(
    event_id: int,
    task_keys: list[str],
) -> Optional[str]:
    """
    对需要前置关联确认的 task_key，检查是否存在已确认的客户或联系人关联。

    如果不满足，返回错误信息字符串；满足则返回 None。
    """
    needs_check = [k for k in task_keys if k in REQUIRES_CONFIRMED_LINK_KEYS]
    if not needs_check:
        return None

    from .models import MailSignalLink
    has_confirmed = MailSignalLink.objects.filter(
        mail_signal_event_id=event_id,
        confirmed=True,
        link_type__in=['client', 'contact'],
    ).exists()
    if not has_confirmed:
        keys_str = ', '.join(needs_check)
        return (
            f'任务 [{keys_str}] 要求先确认客户或联系人关联，'
            f'请在详情页确认候选关联后再生成草稿'
        )
    return None


def suggest_task_keys(signal_type: str) -> list[str]:
    """返回指定邮件类型的建议任务键列表。"""
    return list(_SIGNAL_TYPE_TO_SUGGESTED_KEYS.get(signal_type or 'unknown', []))
