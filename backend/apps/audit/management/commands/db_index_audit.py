from django.core.management.base import BaseCommand
from django.apps import apps
from django.db import models


class Command(BaseCommand):
    help = '审计模型中 *_id 整数字段的索引覆盖率（静态）'

    def handle(self, *args, **options):
        total_int_id = 0
        indexed_int_id = 0
        samples = []

        for app_config in apps.get_app_configs():
            for model in app_config.get_models():
                for field in model._meta.fields:
                    if not field.name.endswith('_id'):
                        continue
                    if isinstance(field, (models.IntegerField, models.BigIntegerField)):
                        total_int_id += 1
                        if field.db_index:
                            indexed_int_id += 1
                        elif len(samples) < 30:
                            samples.append(f'{app_config.label}.{model.__name__}.{field.name}')

        coverage = 0.0 if total_int_id == 0 else (indexed_int_id / total_int_id) * 100
        self.stdout.write(self.style.SUCCESS(
            f'int *_id 字段: {total_int_id}, 带索引: {indexed_int_id}, 覆盖率: {coverage:.2f}%'
        ))

        if samples:
            self.stdout.write(self.style.WARNING('以下字段建议优先评估索引：'))
            for item in samples:
                self.stdout.write(f'  - {item}')
