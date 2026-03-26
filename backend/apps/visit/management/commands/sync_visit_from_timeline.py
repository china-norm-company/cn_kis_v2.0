from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = '将已完成的排程核心数据同步到访视管理（VisitPlan/VisitNode/ScheduleSlot）'

    def add_arguments(self, parser):
        parser.add_argument('--order-id', type=int, default=0, help='仅同步指定 execution_order_id')

    def handle(self, *args, **options):
        from apps.scheduling.models import TimelineSchedule, TimelineScheduleStatus
        from apps.visit.services.timeline_sync_service import sync_visit_from_timeline_schedule

        order_id = int(options.get('order_id') or 0)
        qs = TimelineSchedule.objects.filter(status=TimelineScheduleStatus.COMPLETED).order_by('-update_time')
        if order_id > 0:
            qs = qs.filter(execution_order_upload_id=order_id)

        total = qs.count()
        ok = 0
        self.stdout.write(self.style.NOTICE(f'待同步排程核心: {total}'))
        for sch in qs:
            try:
                result = sync_visit_from_timeline_schedule(sch)
                if result.get('ok'):
                    ok += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"[OK] order={sch.execution_order_upload_id} "
                            f"visit_plan={result.get('visit_plan_id')} slots={result.get('slot_count')}"
                        )
                    )
                else:
                    self.stdout.write(self.style.WARNING(f"[SKIP] order={sch.execution_order_upload_id} {result}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"[ERR] order={sch.execution_order_upload_id} {e}"))

        self.stdout.write(self.style.SUCCESS(f'同步完成: {ok}/{total}'))

