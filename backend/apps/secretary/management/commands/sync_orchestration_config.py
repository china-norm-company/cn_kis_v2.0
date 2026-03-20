"""
从 orchestration_service 的默认常量导入编排配置到 DB。

用法: python manage.py sync_orchestration_config

之后编排路由从 DB 加载（见 reload_orchestration_config 热更新）。
"""
from django.core.management.base import BaseCommand

from apps.secretary.models_orchestration_config import (
    DomainAgentMapping,
    DomainSkillMapping,
    KeywordDomainMapping,
)
from apps.secretary.orchestration_service import (
    _DEFAULT_DOMAIN_AGENT_MAP,
    _DEFAULT_DOMAIN_CLAW_MAP,
    _DEFAULT_KEYWORD_DOMAIN_MAP,
)


class Command(BaseCommand):
    help = '从默认常量同步编排配置（领域→Agent、领域→技能、关键词→领域）到数据库'

    def handle(self, *args, **options):
        created_a = updated_a = 0
        for domain_code, agent_id in _DEFAULT_DOMAIN_AGENT_MAP.items():
            _, was_created = DomainAgentMapping.objects.update_or_create(
                domain_code=domain_code,
                defaults={
                    'agent_id': agent_id,
                    'display_name': domain_code,
                    'priority': 0,
                },
            )
            if was_created:
                created_a += 1
            else:
                updated_a += 1

        created_s = updated_s = 0
        for domain_code, skill_ids in _DEFAULT_DOMAIN_CLAW_MAP.items():
            for priority, skill_id in enumerate(reversed(skill_ids)):
                _, was_created = DomainSkillMapping.objects.update_or_create(
                    domain_code=domain_code,
                    skill_id=skill_id,
                    defaults={'priority': priority},
                )
                if was_created:
                    created_s += 1
                else:
                    updated_s += 1

        created_k = updated_k = 0
        for keyword, domain_code in _DEFAULT_KEYWORD_DOMAIN_MAP.items():
            _, was_created = KeywordDomainMapping.objects.update_or_create(
                keyword=keyword,
                defaults={'domain_code': domain_code},
            )
            if was_created:
                created_k += 1
            else:
                updated_k += 1

        self.stdout.write(self.style.SUCCESS(
            f'编排配置同步完成: DomainAgent 创建 {created_a} 更新 {updated_a}, '
            f'DomainSkill 创建 {created_s} 更新 {updated_s}, '
            f'KeywordDomain 创建 {created_k} 更新 {updated_k}'
        ))
