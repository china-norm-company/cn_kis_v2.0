from datetime import timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.models import F, Q
from django.utils import timezone


class Command(BaseCommand):
    help = 'WorkOrder 冻结 legacy 写入发布前检查（含门槛判定）'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=1, help='统计窗口天数，默认 1 天')
        parser.add_argument(
            '--max-mismatch-count',
            type=int,
            default=0,
            help='允许的 mismatch 总数上限（默认 0）',
        )
        parser.add_argument(
            '--max-mismatch-rate',
            type=float,
            default=0.0,
            help='允许的 mismatch 比例上限（默认 0.0）',
        )
        parser.add_argument(
            '--allow-missing-columns',
            action='store_true',
            help='若目标库尚未迁移双轨列，允许跳过并继续（默认不允许）',
        )

    def handle(self, *args, **options):
        days = max(1, options['days'])
        max_mismatch_count = max(0, options['max_mismatch_count'])
        max_mismatch_rate = max(0.0, options['max_mismatch_rate'])
        allow_missing_columns = bool(options.get('allow_missing_columns'))

        window_end = timezone.now()
        window_start = window_end - timedelta(days=days)
        self.stdout.write(
            self.style.SUCCESS(
                f'WorkOrder freeze preflight: {window_start.isoformat()} ~ {window_end.isoformat()}'
            )
        )

        # 1) Django 系统检查
        self.stdout.write('\n[1/3] django check')
        call_command('check')

        # 2) 双轨列可用性
        self.stdout.write('\n[2/3] schema readiness')
        from apps.workorder.models import WorkOrder, WorkOrderAssignment
        from apps.hr.models import Staff

        missing_targets = []
        if not self._has_db_columns(WorkOrder, ['assigned_to_account_id', 'created_by_account_id']):
            missing_targets.append('workorder.t_work_order')
        if not self._has_db_columns(WorkOrderAssignment, ['assigned_to_account_id', 'assigned_by_account_id']):
            missing_targets.append('workorder.t_work_order_assignment')
        if not self._has_db_columns(Staff, ['account_fk_id']):
            missing_targets.append('hr.t_staff')

        if missing_targets:
            self.stdout.write(self.style.WARNING(
                f'  missing dual-track columns: {", ".join(missing_targets)}'
            ))
            if not allow_missing_columns:
                raise CommandError('preflight failed: dual-track columns missing, run migrations first')
            self.stdout.write('  proceed because --allow-missing-columns is set')

        # 3) 窗口内一致性门槛
        self.stdout.write('\n[3/3] consistency gate')
        touched_qs = WorkOrder.objects.filter(
            Q(create_time__gte=window_start) | Q(update_time__gte=window_start),
            is_deleted=False,
        )

        if missing_targets and allow_missing_columns:
            self.stdout.write('  skipped metrics gate due to missing columns')
            self.stdout.write(self.style.SUCCESS('preflight passed (degraded mode)'))
            return

        assignee_fk_nonnull = touched_qs.filter(assigned_to_account__isnull=False)
        creator_fk_nonnull = touched_qs.filter(created_by_account__isnull=False)
        assignee_mismatch = assignee_fk_nonnull.exclude(
            Q(assigned_to__isnull=True) | Q(assigned_to=F('assigned_to_account'))
        )
        creator_mismatch = creator_fk_nonnull.exclude(
            Q(created_by_id__isnull=True) | Q(created_by_id=F('created_by_account'))
        )

        denominator = assignee_fk_nonnull.count() + creator_fk_nonnull.count()
        mismatch_count = assignee_mismatch.count() + creator_mismatch.count()
        mismatch_rate = 0.0 if denominator == 0 else mismatch_count / denominator

        self.stdout.write(f'  touched_total={touched_qs.count()}')
        self.stdout.write(f'  mismatch_count={mismatch_count}')
        self.stdout.write(f'  mismatch_rate={mismatch_rate:.6f}')
        self.stdout.write(f'  threshold.max_mismatch_count={max_mismatch_count}')
        self.stdout.write(f'  threshold.max_mismatch_rate={max_mismatch_rate:.6f}')

        if mismatch_count > max_mismatch_count or mismatch_rate > max_mismatch_rate:
            raise CommandError('preflight failed: mismatch gate not satisfied')

        self.stdout.write(self.style.SUCCESS('preflight passed'))

    def _has_db_columns(self, model, required_columns):
        table_name = model._meta.db_table
        with connection.cursor() as cursor:
            descriptions = connection.introspection.get_table_description(cursor, table_name)
        existing_columns = {d.name for d in descriptions}
        return all(col in existing_columns for col in required_columns)
