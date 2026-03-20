from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models import F, Q
from django.utils import timezone


class Command(BaseCommand):
    help = '输出 WorkOrder legacy→FK 迁移窗口日报（freeze/dual-write 观测）'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=1,
            help='统计窗口天数，默认 1 天',
        )

    def handle(self, *args, **options):
        days = max(1, options.get('days') or 1)
        window_end = timezone.now()
        window_start = window_end - timedelta(days=days)

        self.stdout.write(
            self.style.SUCCESS(
                f'WorkOrder 迁移日报窗口: {window_start.isoformat()} ~ {window_end.isoformat()}'
            )
        )
        self.stdout.write(
            f'  config.freeze_legacy_write={getattr(settings, "WORKORDER_FREEZE_LEGACY_WRITE", False)}'
        )
        self.stdout.write(
            f'  config.observe_log_enabled={getattr(settings, "WORKORDER_FREEZE_OBSERVE_LOG_ENABLED", True)}'
        )

        from apps.workorder.models import WorkOrder

        required_columns = ['assigned_to_account_id', 'created_by_account_id']
        if not self._has_db_columns(WorkOrder, required_columns):
            self.stdout.write(self.style.WARNING(
                '  skipped: 当前数据库缺少双轨列（请先执行 workorder 相关迁移）'
            ))
            return

        touched_qs = WorkOrder.objects.filter(
            Q(create_time__gte=window_start) | Q(update_time__gte=window_start),
            is_deleted=False,
        )
        created_qs = WorkOrder.objects.filter(
            create_time__gte=window_start,
            is_deleted=False,
        )

        self.stdout.write('\n[WorkOrder Volume]')
        self.stdout.write(f'  touched_total: {touched_qs.count()}')
        self.stdout.write(f'  created_total: {created_qs.count()}')

        assignee_fk_nonnull = touched_qs.filter(assigned_to_account__isnull=False)
        assignee_freeze_pattern = assignee_fk_nonnull.filter(assigned_to__isnull=True)
        assignee_dualwrite_pattern = assignee_fk_nonnull.filter(assigned_to=F('assigned_to_account'))
        assignee_mismatch = assignee_fk_nonnull.exclude(
            Q(assigned_to__isnull=True) | Q(assigned_to=F('assigned_to_account'))
        )

        creator_fk_nonnull = touched_qs.filter(created_by_account__isnull=False)
        creator_freeze_pattern = creator_fk_nonnull.filter(created_by_id__isnull=True)
        creator_dualwrite_pattern = creator_fk_nonnull.filter(created_by_id=F('created_by_account'))
        creator_mismatch = creator_fk_nonnull.exclude(
            Q(created_by_id__isnull=True) | Q(created_by_id=F('created_by_account'))
        )

        self.stdout.write('\n[Assignee Transition]')
        self.stdout.write(f'  fk_nonnull: {assignee_fk_nonnull.count()}')
        self.stdout.write(f'  freeze_pattern(legacy_null): {assignee_freeze_pattern.count()}')
        self.stdout.write(f'  dualwrite_pattern(fk_eq_legacy): {assignee_dualwrite_pattern.count()}')
        self.stdout.write(f'  mismatch: {assignee_mismatch.count()}')

        self.stdout.write('\n[Creator Transition]')
        self.stdout.write(f'  fk_nonnull: {creator_fk_nonnull.count()}')
        self.stdout.write(f'  freeze_pattern(legacy_null): {creator_freeze_pattern.count()}')
        self.stdout.write(f'  dualwrite_pattern(fk_eq_legacy): {creator_dualwrite_pattern.count()}')
        self.stdout.write(f'  mismatch: {creator_mismatch.count()}')

        sample = list(
            assignee_mismatch.values('id', 'assigned_to', 'assigned_to_account_id')[:10]
        )
        if sample:
            self.stdout.write('\n[Assignee mismatch samples]')
            for row in sample:
                self.stdout.write(
                    f"  - id={row['id']} legacy={row['assigned_to']} fk={row['assigned_to_account_id']}"
                )

        sample = list(
            creator_mismatch.values('id', 'created_by_id', 'created_by_account_id')[:10]
        )
        if sample:
            self.stdout.write('\n[Creator mismatch samples]')
            for row in sample:
                self.stdout.write(
                    f"  - id={row['id']} legacy={row['created_by_id']} fk={row['created_by_account_id']}"
                )

    def _has_db_columns(self, model, required_columns):
        table_name = model._meta.db_table
        with connection.cursor() as cursor:
            descriptions = connection.introspection.get_table_description(cursor, table_name)
        existing_columns = {d.name for d in descriptions}
        return all(col in existing_columns for col in required_columns)
