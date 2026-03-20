from django.core.management.base import BaseCommand

from apps.feishu_sync.services import recommend_unique_key_fields


class Command(BaseCommand):
    help = '推荐指定表的 from_feishu 幂等唯一键'

    def add_arguments(self, parser):
        parser.add_argument('table_name', type=str, help='数据库表名，例如 t_staff')

    def handle(self, *args, **options):
        table_name = options['table_name']
        keys = recommend_unique_key_fields(table_name)
        if not keys:
            self.stdout.write(self.style.ERROR(f'未找到模型或无可推荐字段: {table_name}'))
            return
        self.stdout.write(self.style.SUCCESS(f'{table_name} 推荐 unique_key_fields: {keys}'))
