"""
项目结项质量报告服务

汇总项目全生命周期的质量数据，生成结构化报告。
"""
import logging
from django.db.models import Count, Q

from ..models import (
    Deviation, DeviationStatus, DeviationSeverity,
    CAPA, CAPAStatus,
)

logger = logging.getLogger(__name__)


def generate_project_quality_report(protocol_id: int) -> dict:
    """
    生成项目质量报告

    包含：项目基本信息、偏差汇总、CAPA汇总、质量门禁结果
    """
    # 偏差汇总
    dev_qs = Deviation.objects.filter(is_deleted=False, project_id=protocol_id)
    total_deviations = dev_qs.count()
    closed_deviations = dev_qs.filter(status=DeviationStatus.CLOSED).count()
    closure_rate = round(closed_deviations / total_deviations * 100, 1) if total_deviations > 0 else 100

    severity_dist = dict(
        dev_qs.values('severity').annotate(count=Count('id')).values_list('severity', 'count')
    )
    status_dist = dict(
        dev_qs.values('status').annotate(count=Count('id')).values_list('status', 'count')
    )
    category_dist = dict(
        dev_qs.values('category').annotate(count=Count('id')).values_list('category', 'count')
    )

    deviation_list = [
        {
            'code': d.code, 'title': d.title, 'category': d.category,
            'severity': d.severity, 'status': d.status,
            'reported_at': d.reported_at.isoformat(),
            'closed_at': d.closed_at.isoformat() if d.closed_at else None,
        }
        for d in dev_qs.order_by('-reported_at')
    ]

    # CAPA 汇总
    capa_qs = CAPA.objects.filter(is_deleted=False, deviation__project_id=protocol_id)
    total_capas = capa_qs.count()
    closed_capas = capa_qs.filter(status=CAPAStatus.CLOSED).count()
    capa_closure_rate = round(closed_capas / total_capas * 100, 1) if total_capas > 0 else 100

    capa_list = [
        {
            'code': c.code, 'title': c.title, 'type': c.type,
            'status': c.status, 'effectiveness': c.effectiveness,
            'due_date': c.due_date.isoformat(),
            'responsible': c.responsible,
        }
        for c in capa_qs.order_by('-create_time')
    ]

    # 数据质疑汇总
    try:
        from apps.edc.models import DataQuery
        query_qs = DataQuery.objects.filter(project_id=protocol_id)
        total_queries = query_qs.count()
        resolved_queries = query_qs.filter(status='closed').count()
    except Exception:
        total_queries = 0
        resolved_queries = 0

    # 质量门禁结果
    from .quality_gate_service import check_all_gates
    gates = check_all_gates(protocol_id)

    return {
        'protocol_id': protocol_id,
        'deviation_summary': {
            'total': total_deviations,
            'closed': closed_deviations,
            'closure_rate': closure_rate,
            'by_severity': severity_dist,
            'by_status': status_dist,
            'by_category': category_dist,
            'list': deviation_list,
        },
        'capa_summary': {
            'total': total_capas,
            'closed': closed_capas,
            'closure_rate': capa_closure_rate,
            'list': capa_list,
        },
        'query_summary': {
            'total': total_queries,
            'resolved': resolved_queries,
        },
        'quality_gates': gates,
    }
