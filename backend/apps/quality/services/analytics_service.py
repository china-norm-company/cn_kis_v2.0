"""
质量分析服务

提供趋势数据、KPI 指标、管理评审输入数据。
"""
import logging
from datetime import date, timedelta
from django.db.models import Count, Q, F
from django.db.models.functions import TruncMonth

from ..models import (
    Deviation, DeviationStatus, CAPA, CAPAStatus, SOP, SOPStatus,
)

logger = logging.getLogger(__name__)


def get_deviation_trend(months: int = 12, project_id: int = None) -> list:
    """月度偏差趋势（近 N 个月）"""
    end_date = date.today()
    start_date = end_date - timedelta(days=months * 30)

    qs = Deviation.objects.filter(
        is_deleted=False,
        reported_at__gte=start_date,
    )
    if project_id:
        qs = qs.filter(project_id=project_id)

    monthly = (
        qs.annotate(month=TruncMonth('reported_at'))
        .values('month')
        .annotate(count=Count('id'))
        .order_by('month')
    )

    return [
        {'month': item['month'].strftime('%Y-%m'), 'count': item['count']}
        for item in monthly
    ]


def get_deviation_category_distribution(project_id: int = None) -> list:
    """偏差分类占比"""
    qs = Deviation.objects.filter(is_deleted=False)
    if project_id:
        qs = qs.filter(project_id=project_id)

    dist = qs.values('category').annotate(count=Count('id')).order_by('-count')
    return [{'category': item['category'], 'count': item['count']} for item in dist]


def get_capa_closure_rate(months: int = 12) -> list:
    """CAPA 按时关闭率趋势"""
    end_date = date.today()
    start_date = end_date - timedelta(days=months * 30)

    qs = CAPA.objects.filter(
        is_deleted=False,
        create_time__date__gte=start_date,
    )

    monthly = (
        qs.annotate(month=TruncMonth('create_time'))
        .values('month')
        .annotate(
            total=Count('id'),
            closed=Count('id', filter=Q(status=CAPAStatus.CLOSED)),
            on_time=Count('id', filter=Q(
                status=CAPAStatus.CLOSED,
                update_time__date__lte=F('due_date'),
            )),
        )
        .order_by('month')
    )

    result = []
    for item in monthly:
        total = item['total']
        on_time = item['on_time']
        rate = round(on_time / total * 100, 1) if total > 0 else 0
        result.append({
            'month': item['month'].strftime('%Y-%m'),
            'total': total,
            'closed': item['closed'],
            'on_time': on_time,
            'on_time_rate': rate,
        })

    return result


def get_deviation_recurrence(months: int = 6) -> list:
    """偏差复发分析（同类偏差在指定时间内的重复出现）"""
    end_date = date.today()
    start_date = end_date - timedelta(days=months * 30)

    qs = Deviation.objects.filter(
        is_deleted=False,
        reported_at__gte=start_date,
    )

    category_counts = (
        qs.values('category')
        .annotate(count=Count('id'))
        .filter(count__gt=1)
        .order_by('-count')
    )

    return [
        {'category': item['category'], 'count': item['count'], 'is_recurring': item['count'] >= 3}
        for item in category_counts
    ]


def get_sop_review_completion_rate() -> dict:
    """SOP 定期审查完成率"""
    today = date.today()
    effective_sops = SOP.objects.filter(is_deleted=False, status=SOPStatus.EFFECTIVE)
    total = effective_sops.count()
    overdue = effective_sops.filter(next_review__lt=today).count()
    on_track = total - overdue

    return {
        'total': total,
        'on_track': on_track,
        'overdue': overdue,
        'rate': round(on_track / total * 100, 1) if total > 0 else 100,
    }


def get_management_review_data() -> dict:
    """管理评审输入数据包"""
    return {
        'deviation_trend': get_deviation_trend(12),
        'deviation_categories': get_deviation_category_distribution(),
        'capa_closure_rates': get_capa_closure_rate(12),
        'deviation_recurrence': get_deviation_recurrence(6),
        'sop_review': get_sop_review_completion_rate(),
        'summary': {
            'total_deviations': Deviation.objects.filter(is_deleted=False).count(),
            'open_deviations': Deviation.objects.filter(
                is_deleted=False,
            ).exclude(status=DeviationStatus.CLOSED).count(),
            'total_capas': CAPA.objects.filter(is_deleted=False).count(),
            'closed_capas': CAPA.objects.filter(is_deleted=False, status=CAPAStatus.CLOSED).count(),
            'effective_sops': SOP.objects.filter(is_deleted=False, status=SOPStatus.EFFECTIVE).count(),
        },
    }
