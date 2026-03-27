"""
快照服务：存储关键指标趋势
"""
import logging
from decimal import Decimal
from datetime import date
from dateutil.relativedelta import relativedelta
from django.db.models import Sum, DecimalField
from django.db.models.functions import Coalesce

from apps.finance.models import (
    Contract, ContractStatus,
    Invoice, InvoiceStatus,
    PaymentRecord, PaymentRecordStatus,
    PaymentPlan, PaymentPlanStatus,
    CostRecord, CostRecordStatus,
)
from apps.finance.models_settlement import AnalysisSnapshot

logger = logging.getLogger(__name__)

METRIC_TYPES = [
    'total_revenue',
    'total_cost',
    'gross_margin',
    'collection_rate',
    'overdue_amount',
    'active_contracts',
]


def take_daily_snapshot() -> list:
    """生成每日关键指标快照"""
    today = date.today()
    yesterday = today - relativedelta(days=1)
    year_ago_today = today - relativedelta(years=1)

    metrics = {}

    metrics['total_revenue'] = Contract.objects.filter(
        is_deleted=False,
        status__in=[ContractStatus.SIGNED, ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    metrics['total_cost'] = CostRecord.objects.filter(
        status=CostRecordStatus.CONFIRMED,
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    revenue = metrics['total_revenue']
    cost = metrics['total_cost']
    metrics['gross_margin'] = ((revenue - cost) / revenue * 100) if revenue > 0 else Decimal('0')

    total_invoiced = Invoice.objects.filter(
        is_deleted=False,
        status__in=[InvoiceStatus.APPROVED, InvoiceStatus.SENT, InvoiceStatus.PAID],
    ).aggregate(total=Coalesce(Sum('total'), Decimal('0'), output_field=DecimalField()))['total']

    total_received = PaymentRecord.objects.filter(
        status=PaymentRecordStatus.CONFIRMED,
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    metrics['collection_rate'] = (total_received / total_invoiced * 100) if total_invoiced > 0 else Decimal('0')

    metrics['overdue_amount'] = PaymentPlan.objects.filter(
        status=PaymentPlanStatus.OVERDUE,
    ).aggregate(total=Coalesce(Sum('remaining_amount'), Decimal('0'), output_field=DecimalField()))['total']

    metrics['active_contracts'] = Decimal(Contract.objects.filter(
        is_deleted=False,
        status__in=[ContractStatus.SIGNED, ContractStatus.ACTIVE],
    ).count())

    snapshots = []
    for metric_type, value in metrics.items():
        previous = AnalysisSnapshot.objects.filter(
            snapshot_date=yesterday, metric_type=metric_type,
            dimension_type='company', dimension_id=0,
        ).first()

        yoy = AnalysisSnapshot.objects.filter(
            snapshot_date=year_ago_today, metric_type=metric_type,
            dimension_type='company', dimension_id=0,
        ).first()

        obj, _ = AnalysisSnapshot.objects.update_or_create(
            snapshot_date=today, metric_type=metric_type,
            dimension_type='company', dimension_id=0,
            defaults={
                'value': value,
                'previous_value': previous.value if previous else None,
                'yoy_value': yoy.value if yoy else None,
            },
        )
        snapshots.append(obj)

    return snapshots


def get_metric_trend(metric_type: str, months: int = 12) -> dict:
    """获取指标趋势"""
    end_date = date.today()
    start_date = end_date - relativedelta(months=months)

    snapshots = AnalysisSnapshot.objects.filter(
        metric_type=metric_type,
        dimension_type='company',
        dimension_id=0,
        snapshot_date__gte=start_date,
    ).order_by('snapshot_date')

    trend = [{
        'date': s.snapshot_date.isoformat(),
        'value': float(s.value),
        'previous_value': float(s.previous_value) if s.previous_value is not None else None,
        'yoy_value': float(s.yoy_value) if s.yoy_value is not None else None,
    } for s in snapshots]

    return {
        'metric_type': metric_type,
        'months': months,
        'data_points': len(trend),
        'trend': trend,
    }
