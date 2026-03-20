"""
Claw 技能注册表服务

加载 configs/claw_registry.yaml，提供：
- 按工作台查询可用 Claw 技能和 Agent
- 快捷操作列表
- 全局技能列表
"""
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

logger = logging.getLogger(__name__)

_registry_cache: Optional[Dict[str, Any]] = None


def _get_workstation_bindings_from_db() -> Optional[Dict[str, Any]]:
    """从 DB 读取工作台绑定；无数据时返回 None"""
    try:
        from .models_workstation_binding import WorkstationBinding
        if not WorkstationBinding.objects.exists():
            return None
        return {
            b.workstation_key: {
                'key': b.workstation_key,
                'display_name': b.display_name or b.workstation_key,
                'agents': list(b.agent_ids or []),
                'skills': list(b.skill_ids or []),
                'quick_actions': list(b.quick_actions or []),
            }
            for b in WorkstationBinding.objects.all()
        }
    except Exception as e:
        logger.warning('Load workstation bindings from DB failed: %s', e)
        return None


def _load_registry() -> Dict[str, Any]:
    global _registry_cache
    if _registry_cache is not None:
        return _registry_cache

    db_bindings = _get_workstation_bindings_from_db()
    if db_bindings is not None:
        _registry_cache = {
            'shared_skills': [],
            'workstations': {k: {'display_name': v['display_name'], 'agents': v['agents'], 'skills': v['skills'], 'quick_actions': v['quick_actions']} for k, v in db_bindings.items()},
        }
        return _registry_cache

    module_path = Path(__file__).resolve()
    candidate_paths = [
        # 项目根目录：<repo>/configs/claw_registry.yaml
        module_path.parents[3] / 'configs' / 'claw_registry.yaml',
        # 兼容旧部署结构：<repo>/backend/configs/claw_registry.yaml
        module_path.parents[2] / 'configs' / 'claw_registry.yaml',
    ]

    base_dir = os.getenv('CN_KIS_BASE_DIR', '')
    if base_dir:
        candidate_paths.insert(0, Path(base_dir) / 'configs' / 'claw_registry.yaml')

    config_path = next((path for path in candidate_paths if path.exists()), candidate_paths[0])

    if not config_path.exists():
        logger.warning('claw_registry.yaml not found at %s', config_path)
        return {'shared_skills': [], 'workstations': {}}

    with open(config_path, 'r', encoding='utf-8') as f:
        data = yaml.safe_load(f) or {}

    _registry_cache = data
    return data


def reload_registry() -> None:
    global _registry_cache
    _registry_cache = None
    _load_registry()


def get_shared_skills() -> List[str]:
    return _load_registry().get('shared_skills', [])


def get_workstation_config(workstation_key: str) -> Optional[Dict[str, Any]]:
    registry = _load_registry()
    ws_data = registry.get('workstations', {}).get(workstation_key)
    if not ws_data:
        return None
    shared = registry.get('shared_skills', [])
    ws_skills = list(ws_data.get('skills', []))
    all_skills = list(dict.fromkeys(ws_skills + shared))
    return {
        'key': workstation_key,
        'display_name': ws_data.get('display_name', workstation_key),
        'agents': ws_data.get('agents', []),
        'skills': all_skills,
        'quick_actions': ws_data.get('quick_actions', []),
    }


def get_all_workstation_keys() -> List[str]:
    return list(_load_registry().get('workstations', {}).keys())


def get_full_registry() -> Dict[str, Any]:
    registry = _load_registry()
    shared = registry.get('shared_skills', [])
    result = {}
    for key, ws_data in registry.get('workstations', {}).items():
        ws_skills = list(ws_data.get('skills', []))
        all_skills = list(dict.fromkeys(ws_skills + shared))
        result[key] = {
            'key': key,
            'display_name': ws_data.get('display_name', key),
            'agents': ws_data.get('agents', []),
            'skills': all_skills,
            'quick_actions': ws_data.get('quick_actions', []),
        }
    return result
