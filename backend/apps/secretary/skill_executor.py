"""兼容层：所有秘书台技能执行统一接入 runtime_plane。"""
import logging
import uuid
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


def execute_skill(
    skill_id: str,
    script_name: str,
    params: Optional[Dict[str, Any]] = None,
    timeout: int = 30,
    triggered_by: str = '',
    orchestration_run_id: str = '',
    execution_context=None,
) -> Dict[str, Any]:
    from .runtime_plane import execute_registered_skill

    if execution_context is None:
        logger.warning(
            'execute_skill called without execution_context: skill=%s script=%s triggered_by=%s',
            skill_id,
            script_name,
            triggered_by,
        )
    return execute_registered_skill(
        skill_id=skill_id,
        params=params or {},
        execution_context=execution_context,
        timeout=timeout,
        triggered_by=triggered_by,
        orchestration_run_id=orchestration_run_id,
        script_name_hint=script_name,
    )


def execute_skill_async(
    skill_id: str,
    script_name: str,
    params: Optional[Dict[str, Any]] = None,
    triggered_by: str = '',
    orchestration_run_id: str = '',
    execution_context=None,
) -> Dict[str, Any]:
    task_id = f'SKILL-{uuid.uuid4().hex[:12]}'
    try:
        from .tasks import run_skill_task

        ctx_dict = execution_context.to_dict() if execution_context else None
        run_skill_task.delay(
            task_id=task_id,
            skill_id=skill_id,
            script_name=script_name,
            params=params or {},
            triggered_by=triggered_by,
            orchestration_run_id=orchestration_run_id,
            execution_context_dict=ctx_dict,
        )
        return {'ok': True, 'task_id': task_id, 'status': 'queued'}
    except Exception as exc:
        logger.warning('Failed to enqueue async skill: %s', exc)
        return {'ok': False, 'task_id': task_id, 'status': 'error', 'error': str(exc)}
