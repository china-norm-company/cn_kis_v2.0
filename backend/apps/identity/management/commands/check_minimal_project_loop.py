"""
最小项目闭环自检：输出各节点计数与近 7 日增量（与鹿鸣闭环推进 API 口径一致）。
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = '检查最小项目全生命周期闭环相关对象计数（CN KIS V2.0）'

    def handle(self, *args, **options):
        now = timezone.now()
        week_ago = now - timedelta(days=7)

        def line(label, total, recent):
            self.stdout.write(f'  {label}: total={total}, last_7d={recent}')

        # Protocol
        try:
            from apps.protocol.models import Protocol
            pt = Protocol.objects.filter(is_deleted=False).count()
            pr = Protocol.objects.filter(is_deleted=False, create_time__gte=week_ago).count()
            line('Protocol', pt, pr)
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  Protocol: ERROR {e}'))

        # Schedule published
        try:
            from apps.scheduling.models import SchedulePlan, SchedulePlanStatus
            st = SchedulePlan.objects.filter(status=SchedulePlanStatus.PUBLISHED).count()
            sr = SchedulePlan.objects.filter(
                status=SchedulePlanStatus.PUBLISHED, update_time__gte=week_ago,
            ).count()
            line('SchedulePlan(published)', st, sr)
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  SchedulePlan: ERROR {e}'))

        # WorkOrder
        try:
            from apps.workorder.models import WorkOrder
            wt = WorkOrder.objects.filter(is_deleted=False).count()
            wr = WorkOrder.objects.filter(is_deleted=False, create_time__gte=week_ago).count()
            line('WorkOrder', wt, wr)
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  WorkOrder: ERROR {e}'))

        # Enrollment enrolled
        try:
            from apps.subject.models import Enrollment, EnrollmentStatus
            et = Enrollment.objects.filter(status=EnrollmentStatus.ENROLLED).count()
            er = Enrollment.objects.filter(
                status=EnrollmentStatus.ENROLLED, create_time__gte=week_ago,
            ).count()
            line('Enrollment(enrolled)', et, er)
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  Enrollment: ERROR {e}'))

        # Checkin
        try:
            from apps.subject.models_execution import SubjectCheckin
            ct = SubjectCheckin.objects.count()
            cr = SubjectCheckin.objects.filter(create_time__gte=week_ago).count()
            line('SubjectCheckin', ct, cr)
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  SubjectCheckin: ERROR {e}'))

        # Deviation
        try:
            from apps.quality.models import Deviation
            dt = Deviation.objects.filter(is_deleted=False).count()
            dr = Deviation.objects.filter(is_deleted=False, create_time__gte=week_ago).count()
            line('Deviation', dt, dr)
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  Deviation: ERROR {e}'))

        self.stdout.write(self.style.SUCCESS('Done. 对照 docs/MINIMAL_PROJECT_LOOP_ACCEPTANCE.md 验收。'))
