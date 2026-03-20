"""
从 config/claw_registry.yaml 的 skill_definitions 一次性导入到 DB。

用法: python manage.py sync_skill_definitions

之后 runtime_plane.load_skill_registry() 将从 DB 读取（带缓存）。
"""
from pathlib import Path

import yaml
from django.core.management.base import BaseCommand

from apps.secretary.models_skills import SkillDefinition


class Command(BaseCommand):
    help = '从 config/claw_registry.yaml 同步技能定义到数据库'

    def handle(self, *args, **options):
        base = Path(__file__).resolve().parents[5]
        config_path = base / 'config' / 'claw_registry.yaml'
        if not config_path.exists():
            base = Path(__file__).resolve().parents[4]
            config_path = base / 'config' / 'claw_registry.yaml'
        if not config_path.exists():
            self.stderr.write(self.style.ERROR(f'找不到 claw_registry.yaml: {config_path}'))
            return

        with open(config_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}

        definitions = data.get('skill_definitions') or {}
        created = 0
        updated = 0

        for skill_id, raw in definitions.items():
            if not isinstance(raw, dict):
                continue
            display_name = raw.get('display_name') or skill_id.replace('-', ' ').title()
            defaults = {
                'display_name': display_name[:200],
                'description': str(raw.get('description', ''))[:2000],
                'executor': (raw.get('executor') or 'script')[:20],
                'agent_id': str(raw.get('agent_id', ''))[:100],
                'script_path': str(raw.get('script_path', ''))[:500],
                'service_path': str(raw.get('service_path', ''))[:500],
                'service_function': str(raw.get('service_function', 'execute'))[:100],
                'timeout': int(raw.get('timeout', 60)),
                'requires_llm': bool(raw.get('requires_llm', False)),
                'risk_level': str(raw.get('risk_level', 'medium'))[:20],
                'requires_approval': bool(raw.get('requires_approval', False)),
                'agent_tools': list(raw.get('agent_tools') or []),
                'fallback_script': str(raw.get('fallback_script', ''))[:500],
                'is_active': True,
                'bound_workstations': list(raw.get('bound_workstations') or []),
                'baseline_manual_minutes': (
                    int(raw['baseline_manual_minutes'])
                    if raw.get('baseline_manual_minutes') is not None
                    else None
                ),
            }
            obj, was_created = SkillDefinition.objects.update_or_create(
                skill_id=skill_id,
                defaults=defaults,
            )
            if was_created:
                created += 1
                self.stdout.write(f'  + 创建: {skill_id} ({defaults["executor"]})')
            else:
                updated += 1
                self.stdout.write(f'  ~ 更新: {skill_id}')

        self.stdout.write(self.style.SUCCESS(
            f'\n同步完成: 创建 {created} 个, 更新 {updated} 个, 共 {len(definitions)} 个技能'
        ))
