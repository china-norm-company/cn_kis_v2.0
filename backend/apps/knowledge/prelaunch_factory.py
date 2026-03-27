from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

import yaml
from django.conf import settings
from django.db.models import Count, Q


def load_factory_config() -> Dict[str, Any]:
    path = Path(settings.BASE_DIR) / 'configs' / 'knowledge_factory.yaml'

    if not path.exists():
        return {'mother_libraries': {}, 'tier0_topic_packages': [], 'minimum_assets': {}}
    return yaml.safe_load(path.read_text(encoding='utf-8')) or {}


def build_prelaunch_factory_report() -> Dict[str, Any]:
    from apps.knowledge.models import KnowledgeEntry, TopicPackage

    config = load_factory_config()
    mother_libraries = config.get('mother_libraries', {})
    tier0_configs = config.get('tier0_topic_packages', [])
    minimum_assets = config.get('minimum_assets', {})

    published_entries = KnowledgeEntry.objects.filter(is_deleted=False, is_published=True)
    authority_entries = published_entries.filter(
        Q(entry_type='regulation') | Q(entry_type='method_reference')
    )

    mother_stats: Dict[str, Dict[str, Any]] = {}
    for key, item in mother_libraries.items():
        qs = published_entries
        entry_types = item.get('entry_types') or []
        namespaces = item.get('namespaces') or []
        if entry_types:
            qs = qs.filter(entry_type__in=entry_types)
        if namespaces:
            qs = qs.filter(namespace__in=namespaces)
        mother_stats[key] = {
            'label': item.get('label', key),
            'entries': qs.count(),
            'entry_types': entry_types,
            'namespaces': namespaces,
        }

    tier0_targets = [_normalize_tier0_target(item) for item in tier0_configs]
    tier0_package_ids = [item['package_id'] for item in tier0_targets]
    package_qs = TopicPackage.objects.all()
    tier0_rows = list(
        package_qs.filter(package_id__in=tier0_package_ids).values(
            'package_id',
            'canonical_topic',
            'required_for_release',
            'status',
        )
    )
    package_counts = {
        row['package_id']: published_entries.filter(topic_package__package_id=row['package_id']).count()
        for row in tier0_rows
    }
    package_authority_counts = {
        row['package_id']: authority_entries.filter(topic_package__package_id=row['package_id']).count()
        for row in tier0_rows
    }
    package_coverage = {
        row['package_id']: (
            TopicPackage.objects.filter(package_id=row['package_id'], is_deleted=False).first().coverage_rate()
            if TopicPackage.objects.filter(package_id=row['package_id'], is_deleted=False).exists()
            else 0.0
        )
        for row in tier0_rows
    }
    missing_tier0 = []
    tier0_stats = []
    for target in tier0_targets:
        package_id = target['package_id']
        entries = package_counts.get(package_id, 0)
        authority = package_authority_counts.get(package_id, 0)
        coverage = package_coverage.get(package_id, 0.0)
        ready = (
            entries >= target['min_entries']
            and authority >= target['min_authority_entries']
            and coverage >= target['min_coverage_rate']
        )
        if not ready:
            missing_tier0.append(package_id)
        row = next((r for r in tier0_rows if r['package_id'] == package_id), None)
        tier0_stats.append(
            {
                'package_id': package_id,
                'label': target['label'],
                'canonical_topic': row['canonical_topic'] if row else target['label'],
                'required_for_release': bool(row['required_for_release']) if row else True,
                'status': row['status'] if row else 'missing',
                'entries': entries,
                'authority_entries': authority,
                'coverage_rate': coverage,
                'min_entries': target['min_entries'],
                'min_authority_entries': target['min_authority_entries'],
                'min_coverage_rate': target['min_coverage_rate'],
                'ready': ready,
            }
        )

    comparison_counts = (
        published_entries.values('entry_type')
        .annotate(total=Count('id'))
        .order_by('entry_type')
    )

    return {
        'minimum_assets': minimum_assets,
        'structured_entries': published_entries.count(),
        'authority_entries': authority_entries.count(),
        'mother_libraries': mother_stats,
        'tier0_packages': tier0_stats,
        'missing_tier0_packages': missing_tier0,
        'comparison_entry_distribution': list(comparison_counts),
    }


def evaluate_prelaunch_factory_gate(report: Dict[str, Any]) -> Dict[str, Any]:
    minimum_assets = report.get('minimum_assets', {})
    structured_target = int(minimum_assets.get('structured_entries', 0) or 0)
    authority_target = int(minimum_assets.get('authority_entries', 0) or 0)

    structured_ok = report.get('structured_entries', 0) >= structured_target if structured_target else True
    authority_ok = report.get('authority_entries', 0) >= authority_target if authority_target else True
    tier0_ok = not report.get('missing_tier0_packages')

    checks = {
        'structured_entries': structured_ok,
        'authority_entries': authority_ok,
        'tier0_packages': tier0_ok,
    }
    return {
        'passed': all(checks.values()),
        'checks': checks,
        'missing_tier0_packages': report.get('missing_tier0_packages', []),
    }


def _normalize_tier0_target(item: Any) -> Dict[str, Any]:
    if isinstance(item, str):
        return {
            'package_id': item,
            'label': item,
            'min_entries': 1,
            'min_authority_entries': 1,
            'min_coverage_rate': 0.1,
        }
    return {
        'package_id': item.get('package_id', ''),
        'label': item.get('label', item.get('package_id', '')),
        'min_entries': int(item.get('min_entries', 1) or 1),
        'min_authority_entries': int(item.get('min_authority_entries', 1) or 1),
        'min_coverage_rate': float(item.get('min_coverage_rate', 0.1) or 0.1),
    }
