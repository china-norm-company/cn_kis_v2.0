"""
工时统计服务

封装工时记录、汇总、利用率分析、产能预测逻辑。
"""
import logging
from typing import Optional
from datetime import date, time, timedelta
from decimal import Decimal

from django.db.models import Sum, Avg, Count, Q

from apps.hr.models import Staff
from apps.lab_personnel.models import LabStaffProfile
from apps.lab_personnel.models_worktime import WorkTimeLog, WorkTimeSummary, WorkTimeSource
from apps.lab_personnel.models_scheduling import ShiftSlot

logger = logging.getLogger(__name__)


def _get_current_week_start() -> date:
    """获取当前周的周一日期"""
    today = date.today()
    return today - timedelta(days=today.weekday())


def list_worktime_logs(
    staff_id: int = None,
    date_from: date = None,
    date_to: date = None,
    source: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """工时明细列表"""
    qs = WorkTimeLog.objects.select_related('staff').all()

    if staff_id:
        qs = qs.filter(staff_id=staff_id)
    if date_from:
        qs = qs.filter(work_date__gte=date_from)
    if date_to:
        qs = qs.filter(work_date__lte=date_to)
    if source:
        qs = qs.filter(source=source)

    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def create_worktime_log(
    staff_id: int,
    work_date: date,
    start_time: str,
    end_time: str = None,
    actual_hours: float = 0,
    source: str = 'manual',
    source_id: int = None,
    description: str = '',
) -> WorkTimeLog:
    """创建工时记录"""
    st = time.fromisoformat(start_time)
    et = time.fromisoformat(end_time) if end_time else None

    log = WorkTimeLog.objects.create(
        staff_id=staff_id,
        work_date=work_date,
        start_time=st,
        end_time=et,
        actual_hours=Decimal(str(actual_hours)),
        source=source,
        source_id=source_id,
        description=description,
    )

    # 触发周汇总更新
    _refresh_week_summary(staff_id, work_date)

    log = WorkTimeLog.objects.select_related('staff').get(pk=log.pk)
    return log


def _refresh_week_summary(staff_id: int, any_date_in_week: date):
    """刷新某人某周的工时汇总"""
    week_start = any_date_in_week - timedelta(days=any_date_in_week.weekday())
    week_end = week_start + timedelta(days=6)

    logs = WorkTimeLog.objects.filter(
        staff_id=staff_id,
        work_date__gte=week_start,
        work_date__lte=week_end,
    )

    total_hours = logs.aggregate(total=Sum('actual_hours'))['total'] or Decimal('0')
    workorder_hours = logs.filter(source=WorkTimeSource.WORKORDER).aggregate(
        total=Sum('actual_hours'))['total'] or Decimal('0')
    training_hours = logs.filter(source=WorkTimeSource.TRAINING).aggregate(
        total=Sum('actual_hours'))['total'] or Decimal('0')
    other_hours = total_hours - workorder_hours - training_hours

    # 获取可用工时（从 profile）
    profile = LabStaffProfile.objects.filter(staff_id=staff_id).first()
    available_hours = Decimal(str(profile.max_weekly_hours)) if profile else Decimal('40')

    utilization_rate = (total_hours / available_hours * 100) if available_hours > 0 else Decimal('0')

    WorkTimeSummary.objects.update_or_create(
        staff_id=staff_id,
        week_start_date=week_start,
        defaults={
            'total_hours': total_hours,
            'workorder_hours': workorder_hours,
            'training_hours': training_hours,
            'other_hours': other_hours,
            'available_hours': available_hours,
            'utilization_rate': min(utilization_rate, Decimal('999.9')),
        },
    )


def get_worktime_summary(
    week_start_date: date = None,
    staff_id: int = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """工时汇总列表"""
    if not week_start_date:
        week_start_date = _get_current_week_start()

    qs = WorkTimeSummary.objects.select_related('staff').filter(
        week_start_date=week_start_date,
    )

    if staff_id:
        qs = qs.filter(staff_id=staff_id)

    qs = qs.order_by('-utilization_rate')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_utilization_analysis(week_start_date: date = None) -> dict:
    """工时利用率分析"""
    if not week_start_date:
        week_start_date = _get_current_week_start()

    summaries = WorkTimeSummary.objects.select_related('staff').filter(
        week_start_date=week_start_date,
    ).order_by('-utilization_rate')

    avg_util = summaries.aggregate(avg=Avg('utilization_rate'))['avg'] or 0
    overloaded = summaries.filter(utilization_rate__gt=90).count()
    underloaded = summaries.filter(utilization_rate__lt=50).count()
    normal = summaries.filter(utilization_rate__gte=50, utilization_rate__lte=90).count()

    staff_details = []
    for s in summaries:
        status = 'overloaded' if s.utilization_rate > 90 else (
            'underloaded' if s.utilization_rate < 50 else 'normal'
        )
        staff_details.append({
            'staff_id': s.staff_id,
            'staff_name': s.staff.name,
            'total_hours': float(s.total_hours),
            'available_hours': float(s.available_hours),
            'utilization_rate': float(s.utilization_rate),
            'status': status,
        })

    return {
        'week_start_date': week_start_date.isoformat(),
        'avg_utilization': round(float(avg_util), 1),
        'overloaded_count': overloaded,
        'underloaded_count': underloaded,
        'normal_count': normal,
        'staff_details': staff_details,
    }


def get_capacity_forecast(weeks: int = 4) -> dict:
    """产能预测（未来 N 周可用工时 vs 需求工时）"""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())

    forecast = []
    for i in range(1, weeks + 1):
        future_week_start = week_start + timedelta(weeks=i)
        future_week_end = future_week_start + timedelta(days=6)

        # 可用工时 = 所有活跃人员的 max_weekly_hours 之和
        profiles = LabStaffProfile.objects.filter(is_active=True, staff__is_deleted=False)
        available = sum(p.max_weekly_hours for p in profiles)

        # 需求工时 = 已有排班时间槽的计划工时之和
        planned = ShiftSlot.objects.filter(
            shift_date__gte=future_week_start,
            shift_date__lte=future_week_end,
        ).aggregate(total=Sum('planned_hours'))['total'] or 0

        forecast.append({
            'week_start': future_week_start.isoformat(),
            'week_end': future_week_end.isoformat(),
            'available_hours': available,
            'planned_hours': float(planned),
            'gap': available - float(planned),
            'status': 'sufficient' if available >= float(planned) else 'shortage',
        })

    return {'forecast': forecast}
