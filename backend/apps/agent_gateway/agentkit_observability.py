"""
AgentKit 观测集成。

当前版本提供四层能力：
1. 统一构建 AgentKit-compatible payload，避免主调用链散落埋点逻辑
2. 启用后把事件写入 GovernanceMetricEvent，形成可查询的运营观测数据
3. 如配置 webhook，则将相同 payload 外发到外部 AgentKit/观测网关
4. webhook 外发具备指数退避重试（最多 3 次）+ HMAC-SHA256 签名 + 死信记录
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from typing import TYPE_CHECKING, Any, Dict

import requests
from django.utils import timezone

if TYPE_CHECKING:
    from .models import AgentCall

logger = logging.getLogger(__name__)


def is_agentkit_enabled() -> bool:
    return os.getenv('AGENTKIT_SDK_ENABLED', '0') == '1'


def build_agentkit_payload(call: 'AgentCall') -> Dict[str, Any]:
    session = getattr(call, 'session', None)
    session_context = getattr(session, 'context', None) or {}
    token_usage = call.token_usage if isinstance(call.token_usage, dict) else {}
    tool_calls = call.tool_calls_log if isinstance(call.tool_calls_log, list) else []
    total_tokens = int(token_usage.get('total_tokens') or 0)
    workstation_key = ''
    business_object_type = ''
    business_object_id = ''
    role_code = ''
    execution_task_id = ''
    orchestration_run_id = ''
    gate_run_id = ''
    if isinstance(session_context, dict):
        business_context = session_context.get('business_context')
        if not isinstance(business_context, dict):
            business_context = {}
        workstation_key = str(
            session_context.get('workstation_key')
            or business_context.get('workstation_key')
            or ''
        )[:80]
        business_object_type = str(
            session_context.get('business_object_type')
            or business_context.get('business_object_type')
            or ''
        )[:80]
        business_object_id = str(
            session_context.get('business_object_id')
            or business_context.get('business_object_id')
            or ''
        )[:120]
        role_code = str(
            session_context.get('role_code')
            or business_context.get('role_code')
            or ''
        )[:80]
        execution_task_id = str(
            session_context.get('execution_task_id')
            or business_context.get('execution_task_id')
            or ''
        )[:120]
        orchestration_run_id = str(
            session_context.get('orchestration_run_id')
            or business_context.get('orchestration_run_id')
            or ''
        )[:120]
        gate_run_id = str(
            session_context.get('gate_run_id')
            or business_context.get('gate_run_id')
            or ''
        )[:120]

    return {
        'event_name': 'agent_call_observed',
        'observed_at': timezone.now().isoformat(),
        'call_id': call.id,
        'agent_id': call.agent_id,
        'provider': call.provider,
        'model_id': call.model_id or '',
        'status': call.status,
        'duration_ms': int(call.duration_ms or 0),
        'tool_calls_count': len(tool_calls),
        'token_usage': token_usage,
        'total_tokens': total_tokens,
        'session_id': getattr(session, 'session_id', ''),
        'account_id': getattr(session, 'account_id', None),
        'workstation_key': workstation_key,
        'business_object_type': business_object_type,
        'business_object_id': business_object_id,
        'role_code': role_code,
        'execution_task_id': execution_task_id,
        'orchestration_run_id': orchestration_run_id,
        'gate_run_id': gate_run_id,
    }


def _persist_event(payload: Dict[str, Any]) -> None:
    from apps.secretary.models_governance import GovernanceMetricEvent

    status = str(payload.get('status') or '').lower()
    event_type = (
        GovernanceMetricEvent.EventType.RUNTIME_SUCCESS
        if status == 'success'
        else GovernanceMetricEvent.EventType.RUNTIME_FAILED
    )
    GovernanceMetricEvent.objects.create(
        event_type=event_type,
        source='agentkit',
        dimension_1=str(payload.get('agent_id') or '')[:120],
        dimension_2=str(payload.get('model_id') or '')[:120],
        account_id=payload.get('account_id'),
        workstation=str(payload.get('workstation_key') or '')[:64],
        payload=payload,
    )


def _sign_payload(body_bytes: bytes) -> str:
    secret = os.getenv('AGENTKIT_WEBHOOK_SECRET', '').strip()
    if not secret:
        return ''
    return hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()


def _post_webhook(payload: Dict[str, Any], max_retries: int = 3) -> None:
    webhook = os.getenv('AGENTKIT_OBSERVABILITY_WEBHOOK', '').strip()
    if not webhook:
        return

    body_bytes = json.dumps(payload, ensure_ascii=False, default=str).encode('utf-8')
    headers = {'Content-Type': 'application/json'}
    sig = _sign_payload(body_bytes)
    if sig:
        headers['X-AgentKit-Signature'] = f'sha256={sig}'

    last_exc = None
    for attempt in range(max_retries):
        try:
            resp = requests.post(webhook, data=body_bytes, timeout=5, headers=headers)
            resp.raise_for_status()
            return
        except Exception as exc:
            last_exc = exc
            if attempt < max_retries - 1:
                time.sleep(min(2 ** attempt, 8))

    _persist_webhook_dead_letter(payload, str(last_exc))
    raise last_exc


def _persist_webhook_dead_letter(payload: Dict[str, Any], error: str) -> None:
    try:
        from apps.secretary.models_governance import GovernanceMetricEvent
        GovernanceMetricEvent.objects.create(
            event_type='webhook_failed',
            source='agentkit_webhook',
            dimension_1=str(payload.get('agent_id') or '')[:120],
            dimension_2=error[:120],
            account_id=payload.get('account_id'),
            workstation=str(payload.get('workstation_key') or '')[:64],
            payload={'original_payload': payload, 'error': error[:500]},
        )
    except Exception as exc:
        logger.warning('_persist_webhook_dead_letter failed: %s', exc)


def report_agent_call(call: 'AgentCall') -> None:
    """
    上报单次 Agent 调用到 AgentKit-compatible sink。

    设计原则：
    - 默认不开启，避免影响现有主链稳定性
    - 启用后至少写入本地治理事件，确保不是空壳
    - 若配置 webhook，带指数退避重试 + HMAC 签名外发
    - 重试全部失败后写入死信记录（GovernanceMetricEvent.webhook_failed）
    """
    if not is_agentkit_enabled():
        return
    payload = build_agentkit_payload(call)
    _persist_event(payload)
    try:
        _post_webhook(payload)
    except Exception as exc:
        logger.warning(
            'AgentKit webhook report failed after retries: agent=%s call=%s err=%s',
            call.agent_id,
            call.id,
            exc,
        )
