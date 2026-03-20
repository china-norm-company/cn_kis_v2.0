"""
仪表盘聚合服务

聚合 6 个维度的统计数据用于总览面板。
"""
import logging
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Avg, Q

from apps.hr.models import Staff, Training, TrainingStatus
from apps.lab_personnel.models import LabStaffProfile, StaffCertificate, CertificateStatus
from apps.lab_personnel.models_scheduling import ShiftSlot, SlotConfirmStatus
from apps.lab_personnel.models_worktime import WorkTimeSummary
from apps.lab_personnel.models_risk import RiskAlert, RiskLevel, RiskStatus

logger = logging.getLogger(__name__)


def get_dashboard_data() -> dict:
    """聚合仪表盘全部数据"""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    # 1. 人员概况
    profiles = LabStaffProfile.objects.filter(staff__is_deleted=False)
    total = profiles.count()
    active = profiles.filter(is_active=True).count()

    by_role = {}
    for p in profiles.filter(is_active=True).values('lab_role').annotate(count=Count('id')):
        by_role[p['lab_role']] = p['count']

    staff_summary = {
        'total': total,
        'active': active,
        'on_leave': total - active,
        'by_role': by_role,
    }

    # 2. 今日排班
    today_slots = ShiftSlot.objects.filter(shift_date=today)
    today_shift = {
        'total_scheduled': today_slots.count(),
        'confirmed': today_slots.filter(confirm_status=SlotConfirmStatus.CONFIRMED).count(),
        'pending_confirm': today_slots.filter(confirm_status=SlotConfirmStatus.PENDING).count(),
        'rejected': today_slots.filter(confirm_status=SlotConfirmStatus.REJECTED).count(),
    }

    # 3. 证书预警
    cert_alerts = {
        'expired': StaffCertificate.objects.filter(status=CertificateStatus.EXPIRED).count(),
        'expiring_7d': StaffCertificate.objects.filter(status=CertificateStatus.EXPIRING_7).count(),
        'expiring_30d': StaffCertificate.objects.filter(status=CertificateStatus.EXPIRING_30).count(),
        'expiring_90d': StaffCertificate.objects.filter(status=CertificateStatus.EXPIRING_90).count(),
    }

    # 4. 本周工时
    summaries = WorkTimeSummary.objects.filter(week_start_date=week_start)
    avg_util = summaries.aggregate(avg=Avg('utilization_rate'))['avg'] or 0
    worktime_this_week = {
        'avg_utilization': round(float(avg_util), 1),
        'overloaded_count': summaries.filter(utilization_rate__gt=90).count(),
        'underloaded_count': summaries.filter(utilization_rate__lt=50).count(),
    }

    # 5. 风险概况
    active_risks = RiskAlert.objects.exclude(
        status__in=[RiskStatus.RESOLVED, RiskStatus.DISMISSED]
    )
    risk_summary = {
        'red': active_risks.filter(level=RiskLevel.RED).count(),
        'yellow': active_risks.filter(level=RiskLevel.YELLOW).count(),
        'blue': active_risks.filter(level=RiskLevel.BLUE).count(),
    }

    # 6. 培训进度（本月）
    month_start = today.replace(day=1)
    this_month_trainings = Training.objects.filter(
        start_date__gte=month_start, is_deleted=False,
    )
    training_progress = {
        'this_month_planned': this_month_trainings.count(),
        'completed': this_month_trainings.filter(status=TrainingStatus.COMPLETED).count(),
        'in_progress': this_month_trainings.filter(status=TrainingStatus.IN_PROGRESS).count(),
        'overdue': this_month_trainings.filter(status=TrainingStatus.OVERDUE).count(),
    }

    # 7. 最近活动（简化版，从 ShiftSlot 和 StaffCertificate 取最近事件）
    recent_activities = []
    recent_confirmed = ShiftSlot.objects.filter(
        confirm_status=SlotConfirmStatus.CONFIRMED,
    ).select_related('staff').order_by('-update_time')[:5]
    for slot in recent_confirmed:
        recent_activities.append({
            'type': 'shift_confirmed',
            'staff_name': slot.staff.name,
            'description': f'确认 {slot.shift_date} 排班',
            'time': slot.update_time.isoformat(),
        })

    return {
        'staff_summary': staff_summary,
        'today_shift': today_shift,
        'cert_alerts': cert_alerts,
        'worktime_this_week': worktime_this_week,
        'risk_summary': risk_summary,
        'training_progress': training_progress,
        'recent_activities': recent_activities[:10],
    }
