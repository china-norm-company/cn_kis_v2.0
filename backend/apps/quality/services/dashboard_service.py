"""
质量管理仪表盘聚合服务

提供质量台首页所需的统计数据、待办事项和最近事件。
"""
import logging
from datetime import date, timedelta

from ..models import (
    Deviation, DeviationStatus, CAPA, CAPAStatus, CAPAActionItem, CAPAActionItemStatus,
    SOP, SOPStatus,
)

logger = logging.getLogger(__name__)


def get_quality_dashboard() -> dict:
    """
    聚合查询质量仪表盘所需的全部数据，一次 API 返回。
    """
    today = date.today()
    thirty_days = today + timedelta(days=30)

    # --- 偏差统计 ---
    dev_qs = Deviation.objects.filter(is_deleted=False)
    open_statuses = [
        DeviationStatus.IDENTIFIED, DeviationStatus.REPORTED,
        DeviationStatus.INVESTIGATING,
    ]
    open_deviations = dev_qs.filter(status__in=open_statuses).count()

    # --- CAPA 统计 ---
    capa_qs = CAPA.objects.filter(is_deleted=False)
    overdue_capas = capa_qs.filter(
        status__in=[CAPAStatus.PLANNED, CAPAStatus.IN_PROGRESS],
        due_date__lt=today,
    ).count()

    # --- SOP 待审查 ---
    sop_qs = SOP.objects.filter(is_deleted=False, status=SOPStatus.EFFECTIVE)
    sops_due_review = sop_qs.filter(
        next_review__isnull=False,
        next_review__lte=thirty_days,
    ).count()

    # --- 数据质疑（本周） ---
    week_start = today - timedelta(days=today.weekday())
    try:
        from apps.edc.models import DataQuery
        weekly_queries = DataQuery.objects.filter(
            create_time__date__gte=week_start,
        ).count()
    except Exception:
        weekly_queries = 0

    stats = {
        'open_deviations': open_deviations,
        'overdue_capas': overdue_capas,
        'sops_due_review': sops_due_review,
        'weekly_queries': weekly_queries,
    }

    # --- 待办事项 ---
    todos = []

    overdue_capa_items = CAPAActionItem.objects.filter(
        status__in=[CAPAActionItemStatus.PENDING, CAPAActionItemStatus.IN_PROGRESS],
        due_date__lt=today,
    ).select_related('capa').order_by('due_date')[:5]
    for item in overdue_capa_items:
        todos.append({
            'type': 'overdue_capa_action',
            'urgency': 'high',
            'title': f'CAPA 行动项超期: {item.title}',
            'link': f'/capa/{item.capa_id}',
            'due_date': str(item.due_date),
        })

    overdue_deviations = dev_qs.filter(
        status__in=open_statuses,
        reported_at__lt=today - timedelta(days=30),
    ).order_by('reported_at')[:5]
    for d in overdue_deviations:
        todos.append({
            'type': 'overdue_deviation',
            'urgency': 'high',
            'title': f'偏差调查超期: {d.code} - {d.title}',
            'link': f'/deviations/{d.id}',
            'due_date': str(d.reported_at),
        })

    sops_needing_review = sop_qs.filter(
        next_review__isnull=False,
        next_review__lte=thirty_days,
    ).order_by('next_review')[:5]
    for s in sops_needing_review:
        todos.append({
            'type': 'sop_review',
            'urgency': 'medium',
            'title': f'SOP 待审查: {s.code} - {s.title}',
            'link': '/sop',
            'due_date': str(s.next_review),
        })

    try:
        from apps.edc.models import DataQuery
        open_queries = DataQuery.objects.filter(
            status='open',
        ).order_by('-create_time')[:5]
        for q in open_queries:
            todos.append({
                'type': 'open_query',
                'urgency': 'low',
                'title': f'数据质疑待回复: {q.field_name}',
                'link': '/queries',
                'due_date': str(q.create_time.date()) if q.create_time else '',
            })
    except Exception:
        pass

    urgency_order = {'high': 0, 'medium': 1, 'low': 2}
    todos.sort(key=lambda t: urgency_order.get(t['urgency'], 9))

    # --- 最近事件时间线 ---
    recent_events = []

    recent_devs = dev_qs.order_by('-create_time')[:5]
    for d in recent_devs:
        recent_events.append({
            'type': 'deviation',
            'title': f'偏差 {d.code}: {d.title}',
            'status': d.status,
            'time': d.create_time.isoformat() if d.create_time else '',
            'link': f'/deviations/{d.id}',
        })

    recent_capas = capa_qs.order_by('-create_time')[:5]
    for c in recent_capas:
        recent_events.append({
            'type': 'capa',
            'title': f'CAPA {c.code}: {c.title}',
            'status': c.status,
            'time': c.create_time.isoformat() if c.create_time else '',
            'link': f'/capa/{c.id}',
        })

    recent_events.sort(key=lambda e: e['time'], reverse=True)
    recent_events = recent_events[:10]

    return {
        'stats': stats,
        'todos': todos,
        'recent_events': recent_events,
    }
