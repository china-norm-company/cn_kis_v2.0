"""
统一执行平面。

把 Agent / Claw / service / script 的执行回执收敛到同一套任务状态机和审计表。
"""
from __future__ import annotations

import importlib
import inspect
import json
import logging
import os
import subprocess
import sys
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

import yaml
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

_registry_cache: Optional[Dict[str, Dict[str, Any]]] = None
_REGISTRY_PATH = Path(settings.BASE_DIR) / 'configs' / 'claw_registry.yaml'
_SKILLS_ROOT = Path(settings.BASE_DIR).parent / 'openclaw-skills'


@dataclass
class ScopeProof:
    account_id: Optional[int] = None
    account_username: str = ''
    data_scope: str = ''
    project_ids: list[int] = field(default_factory=list)
    permissions: list[str] = field(default_factory=list)
    is_admin: bool = False


@dataclass
class ApprovalGate:
    required: bool = False
    status: str = ''
    approver_id: Optional[int] = None


@dataclass
class Compensation:
    actions: list[Dict[str, Any]] = field(default_factory=list)


def load_skill_registry(force_reload: bool = False) -> Dict[str, Dict[str, Any]]:
    """从 DB 加载技能定义（带内存缓存）；若无则回退到 YAML。"""
    global _registry_cache
    if _registry_cache is not None and not force_reload:
        return _registry_cache
    try:
        from apps.secretary.models_skills import SkillDefinition
        qs = SkillDefinition.objects.filter(is_active=True)
        if qs.exists():
            _registry_cache = {
                s.skill_id: s.to_registry_dict()
                for s in qs
            }
            logger.info('load_skill_registry: loaded %d skills from DB', len(_registry_cache))
            return _registry_cache
    except Exception as e:
        logger.warning('load_skill_registry from DB failed: %s, falling back to YAML', e)
    if not _REGISTRY_PATH.exists():
        logger.warning('claw registry not found: %s', _REGISTRY_PATH)
        _registry_cache = {}
        return _registry_cache
    data = yaml.safe_load(_REGISTRY_PATH.read_text(encoding='utf-8')) or {}
    _registry_cache = data.get('skill_definitions', {}) or {}
    return _registry_cache


def get_skill_definition(skill_id: str) -> Optional[Dict[str, Any]]:
    registry = load_skill_registry()
    if skill_id in registry:
        return registry.get(skill_id)
    # 测试或运行中动态新增 SkillDefinition 后，缓存可能尚未刷新；miss 时强制重载一次。
    registry = load_skill_registry(force_reload=True)
    return registry.get(skill_id)


def list_skills() -> list[Dict[str, Any]]:
    registry = load_skill_registry()
    return [
        {
            'id': skill_id,
            'executor': skill_def.get('executor', 'script'),
            'agent_id': skill_def.get('agent_id', ''),
            'service_path': skill_def.get('service_path', ''),
            'timeout': skill_def.get('timeout', 60),
            'requires_llm': skill_def.get('requires_llm', False),
        }
        for skill_id, skill_def in registry.items()
    ]


def build_scope_proof(execution_context: Optional[Any] = None) -> Dict[str, Any]:
    if execution_context is None:
        return asdict(ScopeProof())
    return asdict(
        ScopeProof(
            account_id=getattr(execution_context, 'account_id', None),
            account_username=getattr(execution_context, 'account_username', ''),
            data_scope=getattr(execution_context, 'data_scope', ''),
            project_ids=list(getattr(execution_context, 'project_ids', []) or []),
            permissions=list(getattr(execution_context, 'permissions', []) or []),
            is_admin=bool(getattr(execution_context, 'is_admin', False)),
        )
    )


def _get_ctx_str(execution_context: Optional[Any], key: str, max_len: int = 120) -> str:
    """从 execution_context 取字符串（支持属性或 dict）。"""
    if execution_context is None:
        return ''
    val = getattr(execution_context, key, None)
    if val is None and isinstance(execution_context, dict):
        val = execution_context.get(key)
    if val is None:
        return ''
    s = str(val).strip()
    return s[:max_len] if max_len else s


def _resolve_role_for_skill(skill_id: str):
    """根据技能 ID 从岗位定义解析岗位对象（用于 automation_level / human_confirmation_points）。"""
    try:
        from .models_roles import WorkerRoleDefinition

        for role in WorkerRoleDefinition.objects.filter(enabled=True).order_by('role_code'):
            if skill_id in list(role.mapped_skill_ids or []):
                return role
    except Exception as e:
        logger.debug('_resolve_role_for_skill %s: %s', skill_id, e)
        return None
    return None


def _resolve_role_for_agent(agent_id: str, workstation_key: str = ''):
    """根据 Agent ID 从岗位定义解析岗位对象，必要时结合工作台范围过滤。"""
    try:
        from .models_roles import WorkerRoleDefinition

        for role in WorkerRoleDefinition.objects.filter(enabled=True).order_by('role_code'):
            if agent_id not in list(role.mapped_agent_ids or []):
                continue
            scope = list(role.workstation_scope or [])
            if scope and workstation_key and workstation_key not in scope:
                continue
            return role
    except Exception as e:
        logger.debug('_resolve_role_for_agent %s: %s', agent_id, e)
        return None
    return None


def _resolve_role_code_for_skill(skill_id: str) -> str:
    """根据技能 ID 从岗位定义解析 role_code（mapped_skill_ids 包含该 skill 的岗位）。"""
    role = _resolve_role_for_skill(skill_id)
    return role.role_code if role else ''


def _resolve_role_code_for_agent(agent_id: str, workstation_key: str = '') -> str:
    role = _resolve_role_for_agent(agent_id, workstation_key)
    return role.role_code if role else ''


def create_execution_task(
    runtime_type: str,
    name: str,
    target: str,
    account_id: Optional[int],
    input_payload: Optional[Dict[str, Any]] = None,
    context_payload: Optional[Dict[str, Any]] = None,
    scope_proof: Optional[Dict[str, Any]] = None,
    parent_task_id: str = '',
    risk_level: str = 'medium',
    requires_approval: bool = False,
    business_run_id: str = '',
    role_code: str = '',
    domain_code: str = '',
    workstation_key: str = '',
    business_object_type: str = '',
    business_object_id: str = '',
    gate_run_id: str = '',
) -> str:
    from .models_runtime import UnifiedExecutionTask, UnifiedExecutionTransition

    task_id = f'{runtime_type[:4].upper()}-{timezone.now().strftime("%Y%m%d%H%M%S")}-{uuid.uuid4().hex[:6]}'
    initial_status = (
        UnifiedExecutionTask.Status.SUGGESTED
        if requires_approval
        else UnifiedExecutionTask.Status.PENDING
    )
    task = UnifiedExecutionTask.objects.create(
        task_id=task_id,
        parent_task_id=parent_task_id,
        business_run_id=business_run_id,
        role_code=role_code,
        domain_code=domain_code,
        workstation_key=workstation_key,
        business_object_type=business_object_type,
        business_object_id=business_object_id,
        gate_run_id=gate_run_id,
        runtime_type=runtime_type,
        name=name,
        target=target,
        account_id=account_id,
        status=initial_status,
        risk_level=risk_level,
        requires_approval=requires_approval,
        approval_status='pending' if requires_approval else '',
        input_payload=input_payload or {},
        context_payload=context_payload or {},
        scope_proof=scope_proof or {},
    )
    UnifiedExecutionTransition.objects.create(
        task=task,
        from_status='',
        to_status=initial_status,
        note='task_created',
        payload={'runtime_type': runtime_type, 'target': target},
    )
    return task_id


def transition_execution_task(task_id: str, to_status: str, note: str = '', payload: Optional[Dict[str, Any]] = None) -> None:
    from .models_runtime import UnifiedExecutionTask, UnifiedExecutionTransition

    task = UnifiedExecutionTask.objects.get(task_id=task_id)
    old_status = task.status
    task.status = to_status
    if to_status == UnifiedExecutionTask.Status.RUNNING and task.started_at is None:
        task.started_at = timezone.now()
    if to_status in {
        UnifiedExecutionTask.Status.SUCCEEDED,
        UnifiedExecutionTask.Status.PARTIAL,
        UnifiedExecutionTask.Status.FAILED,
        UnifiedExecutionTask.Status.COMPENSATED,
        UnifiedExecutionTask.Status.CANCELLED,
    }:
        task.completed_at = timezone.now()
    task.save(update_fields=['status', 'started_at', 'completed_at', 'updated_at'])
    UnifiedExecutionTransition.objects.create(
        task=task,
        from_status=old_status,
        to_status=to_status,
        note=note,
        payload=payload or {},
    )


def finalize_execution_task(
    task_id: str,
    ok: bool,
    output: Any = None,
    error: str = '',
    metrics: Optional[Dict[str, Any]] = None,
    receipt: Optional[Dict[str, Any]] = None,
    compensation: Optional[list[Dict[str, Any]]] = None,
) -> None:
    from .models_runtime import UnifiedExecutionTask, UnifiedExecutionTransition

    task = UnifiedExecutionTask.objects.get(task_id=task_id)
    final_status = UnifiedExecutionTask.Status.SUCCEEDED if ok else UnifiedExecutionTask.Status.FAILED
    old_status = task.status
    task.output_payload = output if isinstance(output, dict) else {'result': output}
    task.error_text = error
    task.metrics = metrics or {}
    task.receipt = receipt or {}
    task.compensation = compensation or []
    task.completed_at = timezone.now()
    task.status = final_status
    task.save(
        update_fields=[
            'output_payload',
            'error_text',
            'metrics',
            'receipt',
            'compensation',
            'completed_at',
            'status',
            'updated_at',
        ]
    )
    UnifiedExecutionTransition.objects.create(
        task=task,
        from_status=old_status,
        to_status=final_status,
        note='task_finished',
        payload={'ok': ok, 'error': error[:500]},
    )


def execute_registered_skill(
    skill_id: str,
    params: Optional[Dict[str, Any]] = None,
    execution_context: Optional[Any] = None,
    timeout: Optional[int] = None,
    triggered_by: str = '',
    orchestration_run_id: str = '',
    parent_task_id: str = '',
    script_name_hint: str = '',
) -> Dict[str, Any]:
    params = params or {}
    skill_def = get_skill_definition(skill_id)
    if not skill_def:
        return {'ok': False, 'error': f'Unknown skill: {skill_id}', 'output': None}

    requires_approval = bool(skill_def.get('requires_approval', False))
    risk_level = str(skill_def.get('risk_level', 'medium'))

    # 前置依赖检查：required_skills 中的技能必须已在同一 business_run 中完成
    required_skills = skill_def.get('required_skills') or []
    if required_skills and orchestration_run_id:
        try:
            from .models_runtime import UnifiedExecutionTask
            for req_sid in required_skills:
                if not UnifiedExecutionTask.objects.filter(
                    name=req_sid,
                    business_run_id=orchestration_run_id,
                    status=UnifiedExecutionTask.Status.SUCCEEDED,
                ).exists():
                    return {
                        'ok': False,
                        'error': f'前置依赖技能 {req_sid} 尚未完成，无法执行 {skill_id}',
                        'output': None,
                        'dependency_unmet': True,
                    }
        except Exception as exc:
            logger.warning('skill prerequisite check failed (non-blocking): %s', exc)

    # 幂等性检查：idempotent=True 时同一 business_run 不重复执行
    if skill_def.get('idempotent') and orchestration_run_id:
        try:
            from .models_runtime import UnifiedExecutionTask
            existing = UnifiedExecutionTask.objects.filter(
                name=skill_id,
                business_run_id=orchestration_run_id,
                status=UnifiedExecutionTask.Status.SUCCEEDED,
            ).first()
            if existing:
                return {
                    'ok': True,
                    'output': existing.output_payload,
                    'error': '',
                    'task_id': existing.task_id,
                    'idempotent_hit': True,
                }
        except Exception as exc:
            logger.warning('idempotent check failed (non-blocking): %s', exc)

    # P2 业务节点门禁：高风险执行前须通过门禁，命中的 gate_run_id 回写任务
    gate_run_id = ''
    if risk_level == 'high':
        try:
            from .evidence_gate_service import check_business_gate
            ctx = {'skill_id': skill_id, 'role_code': _resolve_role_code_for_skill(skill_id)}
            passed, reason, gate_run_id = check_business_gate('high_risk_execution', ctx)
            if not passed:
                logger.warning('execute_registered_skill gate blocked: skill=%s reason=%s', skill_id, reason)
                _auto_learn_on_failure(
                    skill_id=skill_id,
                    role_code=_resolve_role_code_for_skill(skill_id),
                    error=f'门禁阻断: {reason}',
                    task_id=f'gate-block-{skill_id}',
                    workstation_key='',
                )
                return {'ok': False, 'error': reason, 'output': None, 'gate_blocked': True}
        except Exception as e:
            logger.warning('check_business_gate failed (allow execution): %s', e)
            gate_run_id = ''

    # Active policy 运行时消费：读取已激活的策略来动态调整执行参数
    requires_approval, risk_level = _apply_active_policies(
        skill_id, _resolve_role_code_for_skill(skill_id), requires_approval, risk_level,
    )

    # Fail-closed: high-risk or approval-required skills must have execution_context
    if (risk_level == 'high' or requires_approval) and execution_context is None:
        logger.warning(
            'execute_registered_skill fail-closed: skill=%s risk_level=%s requires_approval=%s missing execution_context',
            skill_id, risk_level, requires_approval,
        )
        return {
            'ok': False,
            'error': '执行上下文缺失，高风险或需审批技能禁止执行',
            'output': None,
            'pending_approval': False,
        }

    executor = skill_def.get('executor', 'script')
    effective_timeout = timeout or skill_def.get('timeout', 60)
    account_id = getattr(execution_context, 'account_id', None)
    scope_proof = build_scope_proof(execution_context)
    # 二轮收口：从上下文与岗位映射写入业务对象与岗位字段
    workstation_key = _get_ctx_str(execution_context, 'workstation_key')
    business_object_type = _get_ctx_str(execution_context, 'business_object_type')
    business_object_id = _get_ctx_str(execution_context, 'business_object_id')
    agent_id = str(skill_def.get('agent_id') or '')
    role_code = _resolve_role_code_for_skill(skill_id)
    if not role_code and agent_id:
        role_code = _resolve_role_code_for_agent(agent_id, workstation_key)
    domain_code = (skill_def.get('domain') or skill_def.get('domain_code') or '')[:80]
    # 岗位规则：L4 人工确认岗强制 requires_approval
    role_obj = _resolve_role_for_skill(skill_id) or (_resolve_role_for_agent(agent_id, workstation_key) if agent_id else None)
    if role_obj and getattr(role_obj, 'automation_level', None) == 'L4':
        requires_approval = True
    task_id = create_execution_task(
        runtime_type='claw',
        name=skill_id,
        target=f'{executor}:{skill_def.get("agent_id") or skill_def.get("service_path") or skill_def.get("script_path", "")}',
        account_id=account_id,
        input_payload=params,
        context_payload={
            'triggered_by': triggered_by,
            'orchestration_run_id': orchestration_run_id,
            'script_name_hint': script_name_hint,
        },
        scope_proof=scope_proof,
        parent_task_id=parent_task_id,
        risk_level=risk_level,
        requires_approval=requires_approval,
        business_run_id=orchestration_run_id or '',
        role_code=role_code,
        domain_code=domain_code,
        workstation_key=workstation_key,
        business_object_type=business_object_type,
        business_object_id=business_object_id,
        gate_run_id=gate_run_id,
    )

    # Approval gate: do not run until approved
    if requires_approval:
        logger.info('execute_registered_skill: task %s requires approval, not executing', task_id)
        return {
            'ok': False,
            'error': '',
            'output': None,
            'pending_approval': True,
            'task_id': task_id,
            'message': '任务已创建，需审批通过后执行',
        }

    transition_execution_task(task_id, 'running', note='executor_started')

    start = time.monotonic()
    try:
        if executor == 'service':
            output = _execute_service(skill_def, params, execution_context)
        elif executor == 'agent':
            output = _execute_agent(skill_id, skill_def, params, execution_context)
        else:
            output = _execute_script(skill_id, skill_def, params, effective_timeout, execution_context)
        ok = not bool(output.get('error'))
        result = {
            'ok': ok,
            'output': output.get('output', output),
            'error': output.get('error', ''),
            'task_id': task_id,
            'duration_ms': int((time.monotonic() - start) * 1000),
            'meta': {
                'skill_id': skill_id,
                'executor': executor,
                'triggered_by': triggered_by,
                'orchestration_run_id': orchestration_run_id,
            },
        }
    except Exception as exc:
        logger.exception('registered skill execution failed: %s', skill_id)
        result = {
            'ok': False,
            'output': None,
            'error': str(exc),
            'task_id': task_id,
            'duration_ms': int((time.monotonic() - start) * 1000),
            'meta': {'skill_id': skill_id, 'executor': executor},
        }

    finalize_execution_task(
        task_id=task_id,
        ok=result['ok'],
        output=result.get('output'),
        error=result.get('error', ''),
        metrics={'duration_ms': result['duration_ms']},
        receipt=result.get('meta', {}),
    )

    # 输出契约校验：检查输出是否包含约定字段
    output_contract = skill_def.get('output_contract') or {}
    if result['ok'] and output_contract.get('fields'):
        output_data = result.get('output')
        if isinstance(output_data, dict):
            missing_fields = [f for f in output_contract['fields'] if f not in output_data]
            if missing_fields:
                logger.warning(
                    'output_contract violation: skill=%s missing_fields=%s',
                    skill_id, missing_fields,
                )
                result['output_contract_warning'] = f'输出缺少约定字段: {", ".join(missing_fields)}'

    _write_legacy_skill_log(
        task_id=task_id,
        skill_id=skill_id,
        params=params,
        result=result,
        triggered_by=triggered_by,
        orchestration_run_id=orchestration_run_id,
        execution_context=execution_context,
        script_name=script_name_hint or skill_def.get('script_path', skill_id),
    )
    _write_memory_record(
        task_id=task_id,
        skill_id=skill_id,
        role_code=role_code,
        workstation_key=workstation_key,
        business_object_type=business_object_type,
        business_object_id=business_object_id,
        ok=result['ok'],
        output_snippet=str(result.get('output', ''))[:500],
    )
    # 技能失败时尝试 fallback_script
    if not result['ok'] and skill_def.get('fallback_script') and executor != 'agent':
        try:
            logger.info('execute_registered_skill: trying fallback for %s: %s', skill_id, skill_def['fallback_script'])
            fallback_output = _execute_script(
                skill_id, {**skill_def, 'script_path': skill_def['fallback_script']},
                params, effective_timeout, execution_context,
            )
            if not fallback_output.get('error'):
                result = {
                    'ok': True,
                    'output': fallback_output.get('output', fallback_output),
                    'error': '',
                    'task_id': task_id,
                    'duration_ms': result.get('duration_ms', 0),
                    'meta': {**result.get('meta', {}), 'fallback_used': True},
                }
                finalize_execution_task(task_id=task_id, ok=True, output=result['output'], error='', metrics={'fallback': True}, receipt={'fallback_script': skill_def['fallback_script']})
        except Exception as fb_exc:
            logger.warning('fallback execution failed for %s: %s', skill_id, fb_exc)

    # 技能失败时自动生成策略学习候选
    if not result['ok']:
        _auto_learn_on_failure(
            skill_id=skill_id,
            role_code=role_code,
            error=result.get('error', ''),
            task_id=task_id,
            workstation_key=workstation_key,
        )
    return result


def _apply_active_policies(
    skill_id: str,
    role_code: str,
    requires_approval: bool,
    risk_level: str,
) -> tuple:
    """
    读取与当前技能/岗位匹配的 ACTIVE 策略，动态调整执行参数。
    策略可影响：requires_approval 升级、risk_level 升级。
    只做升级不做降级（安全优先）。
    """
    try:
        from .models_memory import WorkerPolicyUpdate

        worker_code = role_code or skill_id
        active_policies = WorkerPolicyUpdate.objects.filter(
            worker_code=worker_code,
            status=WorkerPolicyUpdate.Status.ACTIVE,
        ).values_list('policy_key', 'better_policy', 'evidence')

        for policy_key, better_policy, evidence in active_policies:
            ev = evidence if isinstance(evidence, dict) else {}
            # 策略指定强制审批
            if ev.get('enforce_approval'):
                requires_approval = True
                logger.info('_apply_active_policies: enforce_approval via %s', policy_key)
            # 策略指定风险升级
            policy_risk = ev.get('upgrade_risk_level', '')
            if policy_risk == 'high' and risk_level != 'high':
                risk_level = 'high'
                logger.info('_apply_active_policies: upgrade risk to high via %s', policy_key)
    except Exception as exc:
        logger.debug('_apply_active_policies failed (non-blocking): %s', exc)
    return requires_approval, risk_level


def _auto_learn_on_failure(
    skill_id: str,
    role_code: str,
    error: str,
    task_id: str,
    workstation_key: str,
) -> None:
    """
    技能执行失败后自动生成 WorkerPolicyUpdate 草稿供人工审批。
    仅在同类失败 24h 内未生成过策略草稿时才创建（避免风暴式写入）。
    """
    try:
        from django.utils import timezone as _tz
        from datetime import timedelta as _td
        from .models_memory import WorkerPolicyUpdate

        worker_code = role_code or skill_id
        policy_key = f'{skill_id}_failure'
        recent = WorkerPolicyUpdate.objects.filter(
            worker_code=worker_code,
            policy_key=policy_key,
            status__in=[WorkerPolicyUpdate.Status.DRAFT, WorkerPolicyUpdate.Status.EVALUATING],
            created_at__gte=_tz.now() - _td(hours=24),
        ).exists()
        if recent:
            return

        error_short = (error or '执行异常')[:300]
        WorkerPolicyUpdate.objects.create(
            worker_code=worker_code,
            domain_code=workstation_key or skill_id,
            policy_key=policy_key,
            outcome=f'技能 {skill_id} 执行失败',
            root_cause=error_short,
            better_policy=(
                f'针对技能 {skill_id} 的失败原因「{error_short[:80]}」，'
                '建议检查参数边界、超时配置和依赖服务可用性，'
                '必要时调整重试策略或降级路径。'
            ),
            evidence={
                'task_id': task_id,
                'skill_id': skill_id,
                'workstation_key': workstation_key,
                'triggered_by': 'auto_learn_on_failure',
            },
            replay_score=0.0,
            status=WorkerPolicyUpdate.Status.DRAFT,  # 始终创建草稿，需人工审批后才能生效
        )
        logger.debug('_auto_learn_on_failure: created WorkerPolicyUpdate for %s/%s', worker_code, policy_key)

        # 同时创建技能进化模板草稿
        try:
            from .models_skills import SkillTemplate
            import uuid as _uuid
            SkillTemplate.objects.create(
                template_id=f'TPL-FAIL-{_uuid.uuid4().hex[:10].upper()}',
                source='auto_evolved',
                skill_id_hint=skill_id,
                worker_code=worker_code,
                trigger_condition=f'技能 {skill_id} 执行失败时的改进建议',
                processing_steps=[f'根因: {error_short[:100]}', '改进：检查参数边界和依赖服务'],
                description=f'技能 {skill_id} 失败后自动提炼的改进模板',
                confidence_score=0.3,
                source_task_ids=[task_id],
                status='draft',
            )
        except Exception as exc:
            logger.debug('create SkillTemplate on failure failed: %s', exc)
    except Exception as exc:
        logger.debug('_auto_learn_on_failure failed: %s', exc)


def _write_memory_record(
    task_id: str,
    skill_id: str,
    role_code: str,
    workstation_key: str,
    business_object_type: str,
    business_object_id: str,
    ok: bool,
    output_snippet: str,
) -> None:
    """技能执行后自动写入 WorkerMemoryRecord（情景记忆）。"""
    try:
        from .models_memory import WorkerMemoryRecord
        WorkerMemoryRecord.objects.create(
            memory_type='episodic',
            worker_code=role_code or skill_id,
            subject_type=business_object_type or 'skill_execution',
            subject_key=business_object_id or task_id,
            content=output_snippet,
            summary=f'技能 {skill_id} {"成功" if ok else "失败"}执行',
            evidence={'task_id': task_id, 'skill_id': skill_id, 'workstation_key': workstation_key},
            source_task_id=task_id,
            importance_score=60 if ok else 80,
        )
    except Exception as exc:
        logger.debug('_write_memory_record failed: %s', exc)


def _execute_service(skill_def: Dict[str, Any], params: Dict[str, Any], execution_context: Optional[Any]) -> Dict[str, Any]:
    service_path = skill_def.get('service_path', '')
    func_name = skill_def.get('service_function', 'execute')
    if not service_path:
        return {'error': 'No service_path configured'}

    module = importlib.import_module(service_path)
    func = getattr(module, func_name, None)
    if func is None:
        return {'error': f'Function {func_name} not found in {service_path}'}

    sig = inspect.signature(func)
    call_kwargs = dict(params)
    if 'execution_context' in sig.parameters:
        call_kwargs['execution_context'] = execution_context
    output = func(**call_kwargs)
    return {'output': output}


def _execute_agent(
    skill_id: str,
    skill_def: Dict[str, Any],
    params: Dict[str, Any],
    execution_context: Optional[Any],
) -> Dict[str, Any]:
    from apps.agent_gateway.models import AgentCallStatus
    from apps.agent_gateway.services import call_agent

    agent_id = skill_def.get('agent_id', '')
    if not agent_id:
        return {'error': f'No agent_id configured for {skill_id}'}

    message = params.get('message') or params.get('query') or f'请执行技能 {skill_id}'
    context = {
        'skill_id': skill_id,
        'skill_params': params,
        'execution_context': build_scope_proof(execution_context),
    }
    call = call_agent(
        account_id=getattr(execution_context, 'account_id', 0) or 0,
        agent_id=agent_id,
        message=message,
        context=context,
    )
    return {
        'output': {
            'status': 'success' if call.status == AgentCallStatus.SUCCESS else 'failed',
            'output': call.output_text[:4000],
            'call_id': call.id,
            'tool_calls': len(call.tool_calls_log or []),
        },
        'error': '' if call.status == AgentCallStatus.SUCCESS else (call.error_message or 'agent call failed'),
    }


def _execute_script(
    skill_id: str,
    skill_def: Dict[str, Any],
    params: Dict[str, Any],
    timeout: int,
    execution_context: Optional[Any],
) -> Dict[str, Any]:
    script_path = skill_def.get('script_path', '')
    if not script_path:
        return {'error': f'No script_path configured for {skill_id}'}
    full_path = (_SKILLS_ROOT / script_path).resolve()
    if not full_path.exists():
        return {'error': f'Script not found: {full_path}'}

    args = [sys.executable, str(full_path)]
    for key, value in params.items():
        if isinstance(value, bool):
            if value:
                args.append(f'--{key}')
        elif value is not None:
            args.extend([f'--{key}', str(value)])

    env = os.environ.copy()
    env['SKILL_PARAMS'] = json.dumps(params, ensure_ascii=False, default=str)
    if execution_context is not None:
        env['SKILL_EXECUTION_CONTEXT'] = json.dumps(build_scope_proof(execution_context), ensure_ascii=False)

    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(full_path.parent),
            env=env,
        )
    except subprocess.TimeoutExpired:
        return {'error': f'Script timed out after {timeout}s'}

    if proc.returncode != 0:
        return {
            'error': proc.stderr.strip()[:2000] if proc.stderr else f'exit code {proc.returncode}',
            'output': proc.stdout.strip()[:1000] if proc.stdout else '',
        }

    stdout = proc.stdout.strip()
    if not stdout:
        return {'output': ''}
    try:
        return {'output': json.loads(stdout)}
    except json.JSONDecodeError:
        return {'output': stdout}


def approve_and_run_execution_task(
    task_id: str,
    approver_id: int,
) -> Dict[str, Any]:
    """
    审批通过后执行任务（硬门禁：仅 SUGGESTED 状态可审批并执行）。

    状态流转: SUGGESTED -> APPROVED -> RUNNING -> SUCCEEDED/FAILED
    """
    from .models_runtime import UnifiedExecutionTask

    task = UnifiedExecutionTask.objects.filter(task_id=task_id).first()
    if not task:
        return {'ok': False, 'error': f'任务不存在: {task_id}', 'output': None}
    if task.status != UnifiedExecutionTask.Status.SUGGESTED:
        return {
            'ok': False,
            'error': f'仅「已建议」任务可审批，当前状态: {task.status}',
            'output': None,
        }
    if not task.requires_approval:
        return {'ok': False, 'error': '该任务无需审批', 'output': None}

    task.approval_status = 'approved'
    task.save(update_fields=['approval_status', 'updated_at'])
    transition_execution_task(task_id, UnifiedExecutionTask.Status.APPROVED, note='approved', payload={'approver_id': approver_id})
    transition_execution_task(task_id, 'running', note='executor_started')

    skill_id = task.name
    params = task.input_payload or {}
    skill_def = get_skill_definition(skill_id)
    if not skill_def:
        finalize_execution_task(task_id, ok=False, error=f'Unknown skill: {skill_id}')
        return {'ok': False, 'error': f'未知技能: {skill_id}', 'output': None}

    executor = skill_def.get('executor', 'script')
    effective_timeout = skill_def.get('timeout', 60)
    scope_proof = task.scope_proof or {}
    execution_context = None
    try:
        from .execution_context import SkillExecutionContext
        if scope_proof and scope_proof.get('account_id') is not None:
            execution_context = SkillExecutionContext.from_dict(scope_proof)
    except Exception as e:
        logger.warning('approve_and_run: could not build execution_context from scope_proof: %s', e)

    start = time.monotonic()
    try:
        if executor == 'service':
            output = _execute_service(skill_def, params, execution_context)
        elif executor == 'agent':
            output = _execute_agent(skill_id, skill_def, params, execution_context)
        else:
            output = _execute_script(skill_id, skill_def, params, effective_timeout, execution_context)
        ok = not bool(output.get('error'))
        result = {
            'ok': ok,
            'output': output.get('output', output),
            'error': output.get('error', ''),
            'task_id': task_id,
            'duration_ms': int((time.monotonic() - start) * 1000),
            'meta': {'skill_id': skill_id, 'executor': executor, 'approver_id': approver_id},
        }
    except Exception as exc:
        logger.exception('approve_and_run execution failed: %s', skill_id)
        result = {
            'ok': False,
            'output': None,
            'error': str(exc),
            'task_id': task_id,
            'duration_ms': int((time.monotonic() - start) * 1000),
            'meta': {'skill_id': skill_id, 'executor': executor, 'approver_id': approver_id},
        }

    finalize_execution_task(
        task_id=task_id,
        ok=result['ok'],
        output=result.get('output'),
        error=result.get('error', ''),
        metrics={'duration_ms': result['duration_ms']},
        receipt=result.get('meta', {}),
    )
    _write_legacy_skill_log(
        task_id=task_id,
        skill_id=skill_id,
        params=params,
        result=result,
        triggered_by='approve_and_run',
        orchestration_run_id=task.context_payload.get('orchestration_run_id', ''),
        execution_context=execution_context,
        script_name=task.context_payload.get('script_name_hint', skill_id),
    )
    return result


def _write_legacy_skill_log(
    task_id: str,
    skill_id: str,
    params: Dict[str, Any],
    result: Dict[str, Any],
    triggered_by: str,
    orchestration_run_id: str,
    execution_context: Optional[Any],
    script_name: str,
) -> None:
    try:
        from .models_orchestration import SkillExecutionLog

        SkillExecutionLog.objects.create(
            skill_id=skill_id,
            script_name=script_name,
            params_json=params,
            status='success' if result.get('ok') else 'failed',
            output_json=result.get('output') if isinstance(result.get('output'), dict) else {'result': result.get('output')},
            error=result.get('error', ''),
            duration_ms=result.get('duration_ms', 0),
            triggered_by=triggered_by,
            orchestration_run_id=orchestration_run_id,
            execution_task_id=task_id,
            account_id=getattr(execution_context, 'account_id', None),
            data_scope=getattr(execution_context, 'data_scope', ''),
        )
    except Exception as exc:
        logger.debug('failed to write legacy skill log: %s', exc)
