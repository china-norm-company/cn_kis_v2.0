"""
软删除商机编号为空的记录（常见于迁移前创建的演示/测试数据）。

用法:
  python manage.py soft_delete_opportunities_without_code
  python manage.py soft_delete_opportunities_without_code --dry-run
"""

from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from apps.crm.models import Opportunity


class Command(BaseCommand):
    help = '将 code 为空或未设置的商机标记为 is_deleted=True（软删除）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='只打印将影响的行数，不写入数据库',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        qs = Opportunity.objects.filter(is_deleted=False).filter(Q(code__isnull=True) | Q(code=''))
        count = qs.count()
        ids = list(qs.values_list('id', flat=True))
        if dry_run:
            self.stdout.write(
                self.style.WARNING(f'[dry-run] 将软删除 {count} 条商机 id={ids}')
            )
            return
        updated = qs.update(is_deleted=True, update_time=timezone.now())
        self.stdout.write(self.style.SUCCESS(f'已软删除 {updated} 条商机（编号为空），id={ids}'))
