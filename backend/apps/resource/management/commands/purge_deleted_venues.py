"""
物理删除已软删除的场地记录

用于清空后重新导入场景：软删除的场地仍占用 code 唯一约束，
需先物理删除才能用相同编码重新导入。

Usage:
    python manage.py purge_deleted_venues [--dry-run]
"""
from django.core.management.base import BaseCommand

from apps.resource.models import ResourceItem, ResourceType


class Command(BaseCommand):
    help = '物理删除已软删除的场地（释放编码供重新导入）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='仅统计不实际删除',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        qs = ResourceItem.objects.filter(
            is_deleted=True,
            category__resource_type=ResourceType.ENVIRONMENT,
        )
        count = qs.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS('无已软删除的场地，无需处理'))
            return
        if dry_run:
            codes = list(qs.values_list('code', flat=True)[:20])
            preview = ', '.join(codes) + (' ...' if count > 20 else '')
            self.stdout.write(f'[dry-run] 将删除 {count} 条场地，示例编码: {preview}')
            return
        deleted, _ = qs.delete()
        self.stdout.write(self.style.SUCCESS(f'已物理删除 {deleted} 条场地，可重新导入'))
