"""
从 config/claw_registry.yaml 的 workstations 导入工作台绑定到 DB。

用法: python manage.py sync_workstation_bindings

之后 digital_workforce_api 与 claw_registry 将优先从 DB 读取。
"""
from pathlib import Path

import yaml
from django.core.management.base import BaseCommand

from apps.secretary.models_workstation_binding import WorkstationBinding


class Command(BaseCommand):
    help = '从 claw_registry.yaml 同步工作台绑定到数据库'

    def handle(self, *args, **options):
        base = Path(__file__).resolve().parents[5]
        config_path = base / 'config' / 'claw_registry.yaml'
        if not config_path.exists():
            config_path = Path(__file__).resolve().parents[4] / 'config' / 'claw_registry.yaml'
        if not config_path.exists():
            self.stderr.write(self.style.ERROR(f'找不到 claw_registry.yaml: {config_path}'))
            return

        with open(config_path, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f) or {}

        workstations = data.get('workstations') or {}
        shared_skills = list(data.get('shared_skills') or [])
        created = 0
        updated = 0

        for ws_key, ws_data in workstations.items():
            if not isinstance(ws_data, dict):
                continue
            ws_skills = list(ws_data.get('skills') or [])
            all_skills = list(dict.fromkeys(ws_skills + shared_skills))
            defaults = {
                'display_name': (ws_data.get('display_name') or ws_key)[:120],
                'agent_ids': list(ws_data.get('agents') or []),
                'skill_ids': all_skills,
                'quick_actions': list(ws_data.get('quick_actions') or []),
            }
            _, was_created = WorkstationBinding.objects.update_or_create(
                workstation_key=ws_key,
                defaults=defaults,
            )
            if was_created:
                created += 1
                self.stdout.write(f'  + 创建: {ws_key} ({defaults["display_name"]})')
            else:
                updated += 1
                self.stdout.write(f'  ~ 更新: {ws_key}')

        self.stdout.write(self.style.SUCCESS(
            f'\n工作台绑定同步完成: 创建 {created} 个, 更新 {updated} 个, 共 {len(workstations)} 个工作台'
        ))
