from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.models import F, Q
from django.utils import timezone


class Command(BaseCommand):
    help = 'WorkOrder 冻结灰度小时守护：输出继续/回滚建议并可失败退出'

    def add_arguments(self, parser):
        parser.add_argument('--hours', type=int, default=1, help='统计窗口小时数，默认 1')
        parser.add_argument(
            '--warn-mismatch-count',
            type=int,
            default=1,
            help='告警阈值：mismatch_count >= 该值时建议回滚',
        )
        parser.add_argument(
            '--warn-mismatch-rate',
            type=float,
            default=0.001,
            help='告警阈值：mismatch_rate >= 该值时建议回滚',
        )
        parser.add_argument(
            '--strict',
            action='store_true',
            help='严格模式：命中阈值直接非 0 退出',
        )
        parser.add_argument(
            '--allow-missing-columns',
            action='store_true',
            help='若目标库缺少双轨列，允许降级通过（默认不允许）',
        )

    def handle(self, *args, **options):
        hours = max(1, options['hours'])
        warn_mismatch_count = max(0, options['warn_mismatch_count'])
        warn_mismatch_rate = max(0.0, options['warn_mismatch_rate'])
        strict = bool(options['strict'])
        allow_missing_columns = bool(options['allow_missing_columns'])

        window_end = timezone.now()
        window_start = window_end - timedelta(hours=hours)
        self.stdout.write(
            self.style.SUCCESS(
                f'WorkOrder freeze hourly guard: {window_start.isoformat()} ~ {window_end.isoformat()}'
            )
        )

        from apps.workorder.models import WorkOrder

        if not self._has_db_columns(WorkOrder, ['assigned_to_account_id', 'created_by_account_id']):
            msg = 'missing dual-track columns in t_work_order'
            if allow_missing_columns:
                self.stdout.write(self.style.WARNING(f'  {msg}, proceed in degraded mode'))
                self.stdout.write(self.style.SUCCESS('decision=continue_degraded'))
                return
            raise CommandError(msg)

        touched_qs = WorkOrder.objects.filter(
            Q(create_time__gte=window_start) | Q(update_time__gte=window_start),
            is_deleted=False,
        )
        created_qs = WorkOrder.objects.filter(create_time__gte=window_start, is_deleted=False)

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
        self.stdout.write(f'  created_total={created_qs.count()}')
        self.stdout.write(f'  mismatch_count={mismatch_count}')
        self.stdout.write(f'  mismatch_rate={mismatch_rate:.6f}')
        self.stdout.write(f'  warn_mismatch_count={warn_mismatch_count}')
        self.stdout.write(f'  warn_mismatch_rate={warn_mismatch_rate:.6f}')

        should_warn = (
            mismatch_count >= warn_mismatch_count and warn_mismatch_count > 0
        ) or mismatch_rate >= warn_mismatch_rate
        if should_warn:
            self.stdout.write(self.style.WARNING('decision=rollback_recommended'))
            if strict:
                raise CommandError('hourly guard failed: rollback recommended')
            return

        self.stdout.write(self.style.SUCCESS('decision=continue'))

    def _has_db_columns(self, model, required_columns):
        table_name = model._meta.db_table
        with connection.cursor() as cursor:
            descriptions = connection.introspection.get_table_description(cursor, table_name)
        existing_columns = {d.name for d in descriptions}
        return all(col in existing_columns for col in required_columns)
