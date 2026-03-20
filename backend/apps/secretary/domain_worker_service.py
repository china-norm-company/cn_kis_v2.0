from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from django.conf import settings

logger = logging.getLogger(__name__)

_DOMAIN_CACHE: Optional[Dict[str, Any]] = None
_REGISTRY_PATH = Path(settings.BASE_DIR) / 'configs' / 'domain_workers.yaml'
_KNOWLEDGE_FACTORY_PATH = Path(settings.BASE_DIR) / 'configs' / 'knowledge_factory.yaml'


def load_domain_worker_registry(force_reload: bool = False) -> Dict[str, Any]:
    global _DOMAIN_CACHE
    if _DOMAIN_CACHE is not None and not force_reload:
        return _DOMAIN_CACHE
    if not _REGISTRY_PATH.exists():
        logger.warning('domain worker registry missing: %s', _REGISTRY_PATH)
        _DOMAIN_CACHE = {'domains': {}}
        return _DOMAIN_CACHE
    _DOMAIN_CACHE = yaml.safe_load(_REGISTRY_PATH.read_text(encoding='utf-8')) or {'domains': {}}
    return _DOMAIN_CACHE


def list_domain_workers() -> List[Dict[str, Any]]:
    registry = load_domain_worker_registry()
    items = []
    for domain_code, config in (registry.get('domains') or {}).items():
        items.append({'domain_code': domain_code, **config})
    return items


def get_domain_worker(domain_code: str) -> Optional[Dict[str, Any]]:
    registry = load_domain_worker_registry()
    domains = registry.get('domains') or {}
    if domain_code in domains:
        return {'domain_code': domain_code, **domains[domain_code]}

    for code, config in domains.items():
        aliases = set(config.get('aliases', []) or [])
        if domain_code in aliases:
            return {'domain_code': code, **config}
    return None


def resolve_domain_agent(domain_code: str, fallback: str = 'general-assistant') -> str:
    worker = get_domain_worker(domain_code)
    if not worker:
        return fallback
    return worker.get('lead_agent_id') or fallback


def resolve_domain_skills(domain_code: str) -> List[str]:
    worker = get_domain_worker(domain_code)
    if not worker:
        return []
    skills: List[str] = []
    lead_skill = worker.get('lead_skill_id')
    if lead_skill:
        skills.append(lead_skill)
    for skill_id in worker.get('skill_ids', []) or []:
        if skill_id and skill_id not in skills:
            skills.append(skill_id)
    return skills


def resolve_topic_packages(domain_code: str) -> Dict[str, List[str]]:
    """
    解析 domain worker 对应的专题包清单，并应用显式别名映射。
    """
    worker = get_domain_worker(domain_code)
    if not worker:
        return {'requested': [], 'resolved': [], 'unresolved': []}

    knowledge_cfg = {}
    if _KNOWLEDGE_FACTORY_PATH.exists():
        knowledge_cfg = yaml.safe_load(_KNOWLEDGE_FACTORY_PATH.read_text(encoding='utf-8')) or {}
    known_packages = set()
    known_packages.update((knowledge_cfg.get('mother_libraries') or {}).keys())
    for item in knowledge_cfg.get('tier0_topic_packages', []) or []:
        package_id = item.get('package_id')
        if package_id:
            known_packages.add(package_id)
    try:
        from apps.knowledge.models import TopicPackage
        known_packages.update(
            TopicPackage.objects.filter(is_deleted=False).values_list('package_id', flat=True)
        )
    except Exception:
        pass

    aliases = worker.get('topic_package_aliases') or {}
    requested = list(worker.get('tier0_topic_packages', []) or [])
    resolved: List[str] = []
    unresolved: List[str] = []
    for package_id in requested:
        target = aliases.get(package_id, package_id)
        if target and target in known_packages:
            resolved.append(target)
        else:
            unresolved.append(package_id)
    return {'requested': requested, 'resolved': resolved, 'unresolved': unresolved}


def sync_domain_worker_blueprints() -> Dict[str, int]:
    from .models_workers import DomainWorkerBlueprint

    created = 0
    updated = 0
    for worker in list_domain_workers():
        defaults = {
            'display_name': worker.get('display_name', worker['domain_code']),
            'workstation_hint': worker.get('workstation_hint', ''),
            'lead_agent_id': worker.get('lead_agent_id', ''),
            'lead_skill_id': worker.get('lead_skill_id', ''),
            'responsibilities': worker.get('responsibilities', []),
            'boundary_rules': worker.get('boundary_rules', []),
            'collaboration_agents': worker.get('collaboration_agents', []),
            'tier0_topic_packages': resolve_topic_packages(worker['domain_code']).get('resolved', []),
            'evaluation_targets': worker.get('evaluation_targets', {}),
            'enabled': True,
        }
        _, was_created = DomainWorkerBlueprint.objects.update_or_create(
            domain_code=worker['domain_code'],
            defaults=defaults,
        )
        if was_created:
            created += 1
        else:
            updated += 1
    return {'created': created, 'updated': updated}
