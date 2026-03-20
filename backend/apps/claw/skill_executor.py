"""Claw 技能统一入口，委托给秘书台的 runtime_plane。"""
from typing import Any, Dict, List, Optional


def execute_skill(
    skill_id: str,
    params: Optional[Dict[str, Any]] = None,
    execution_context: Optional[Any] = None,
    timeout: Optional[int] = None,
) -> Dict[str, Any]:
    from apps.secretary.runtime_plane import execute_registered_skill

    return execute_registered_skill(
        skill_id=skill_id,
        params=params or {},
        execution_context=execution_context,
        timeout=timeout,
        triggered_by='agent_tool',
    )


def list_skills() -> List[Dict[str, Any]]:
    from apps.secretary.runtime_plane import list_skills as _list_skills

    return _list_skills()


def get_skill_definition(skill_id: str) -> Optional[Dict]:
    from apps.secretary.runtime_plane import get_skill_definition as _get_skill_definition

    return _get_skill_definition(skill_id)
