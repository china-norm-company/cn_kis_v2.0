"""
加载化妆品功效 CRF 模板

python manage.py load_cosmetic_crfs

从 fixtures/cosmetic_crf_templates.json 批量导入 12 个行业标准 CRF 模板，
同时为每个模板创建与之对应的验证规则。
"""
import json
import os
from django.core.management.base import BaseCommand

from apps.edc.models import CRFTemplate, CRFValidationRule


class Command(BaseCommand):
    help = '加载 12 个化妆品功效标准 CRF 模板'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='强制覆盖已存在的同名模板',
        )

    def handle(self, *args, **options):
        fixture_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            'fixtures', 'cosmetic_crf_templates.json',
        )

        with open(fixture_path, 'r', encoding='utf-8') as f:
            templates_data = json.load(f)

        created = 0
        updated = 0
        skipped = 0

        for tpl_data in templates_data:
            existing = CRFTemplate.objects.filter(name=tpl_data['name']).first()

            if existing and not options['force']:
                skipped += 1
                self.stdout.write(f'  跳过（已存在）: {tpl_data["name"]}')
                continue

            if existing and options['force']:
                existing.version = tpl_data['version']
                existing.description = tpl_data['description']
                existing.schema = tpl_data['schema']
                existing.is_active = True
                existing.save()
                updated += 1
                self.stdout.write(f'  更新: {tpl_data["name"]}')
                tpl = existing
            else:
                tpl = CRFTemplate.objects.create(
                    name=tpl_data['name'],
                    version=tpl_data['version'],
                    description=tpl_data['description'],
                    schema=tpl_data['schema'],
                    is_active=True,
                )
                created += 1
                self.stdout.write(self.style.SUCCESS(f'  创建: {tpl_data["name"]}'))

            # 自动创建验证规则
            self._create_validation_rules(tpl, tpl_data['schema'])

        self.stdout.write(self.style.SUCCESS(
            f'\n完成：创建 {created}，更新 {updated}，跳过 {skipped}，共 {len(templates_data)} 个模板'
        ))

    def _create_validation_rules(self, tpl, schema):
        """根据 JSON Schema 中的 min/max 自动生成验证规则"""
        questions = schema.get('questions', [])
        for q in questions:
            if q.get('type') == 'number' and (q.get('min') is not None or q.get('max') is not None):
                rule_config = {}
                if q.get('min') is not None:
                    rule_config['min'] = q['min']
                if q.get('max') is not None:
                    rule_config['max'] = q['max']

                field_name = q['id']
                # 如果有 repeat，为每个重复字段创建规则
                repeat = q.get('repeat', 1)
                fields_to_validate = [field_name]
                if repeat > 1:
                    fields_to_validate = [f'{field_name}_{i+1}' for i in range(repeat)]
                    fields_to_validate.append(field_name)  # 平均值也需要验证

                for fn in fields_to_validate:
                    CRFValidationRule.objects.update_or_create(
                        template=tpl,
                        field_name=fn,
                        rule_type='range',
                        defaults={
                            'rule_config': rule_config,
                            'error_message': f'{q["title"]}范围应在 {rule_config.get("min", "")}~{rule_config.get("max", "")} 之间',
                            'severity': 'error',
                            'is_active': True,
                        },
                    )
