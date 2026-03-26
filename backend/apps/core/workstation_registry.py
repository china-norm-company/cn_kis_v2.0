"""
从 backend/configs/workstations.yaml 加载工作台注册表（唯一真相源）。

供 API、脚本与治理视图复用，禁止在业务代码中手写 15/18/19 台列表。
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List

import yaml

_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / 'configs' / 'workstations.yaml'


@lru_cache(maxsize=1)
def workstations_yaml_path() -> Path:
    return _CONFIG_PATH


@lru_cache(maxsize=1)
def load_workstations_registry() -> List[Dict[str, Any]]:
    path = workstations_yaml_path()
    if not path.is_file():
        return []
    with open(path, 'r', encoding='utf-8') as f:
        raw = yaml.safe_load(f) or {}
    items = raw.get('workstations') or []
    out: List[Dict[str, Any]] = []
    business_keys = {
        'secretary', 'finance', 'research', 'execution', 'quality', 'hr', 'crm',
        'recruitment', 'equipment', 'material', 'facility', 'evaluator',
        'lab-personnel', 'ethics', 'reception',
    }
    for w in items:
        if not isinstance(w, dict):
            continue
        key = w.get('key')
        if not key:
            continue
        category = 'business' if key in business_keys else 'platform'
        out.append({
            'key': key,
            'name': w.get('name') or key,
            'description': w.get('description') or '',
            'path': w.get('path') or f'/{key}',
            'port': w.get('port'),
            'package': w.get('package') or '',
            'category': category,
        })
    return out


def registry_total_count() -> int:
    return len(load_workstations_registry())
