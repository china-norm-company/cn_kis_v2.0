"""
成本分析引擎
"""
import logging
from decimal import Decimal
from datetime import date
from dateutil.relativedelta import relativedelta
from django.db.models import Sum, Count, DecimalField
from django.db.models.functions import TruncMonth, Coalesce

from apps.finance.models import (
    CostRecord, CostRecordStatus, CostType,
    ProjectBudget, BudgetItem,
    Contract,
)

logger = logging.getLogger(__name__)


def get_cost_structure(protocol_id: int = None) -> dict:
    """成本结构：按成本类型分布"""
    qs = CostRecord.objects.filter(status=CostRecordStatus.CONFIRMED)
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)

    by_type = (
        qs.values('cost_type')
        .annotate(total=Sum('amount'), count=Count('id'))
        .order_by('-total')
    )

    total = qs.aggregate(
        total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField())
    )['total']

    items = []
    for r in by_type:
        pct = (r['total'] / total * 100) if total > 0 else Decimal('0')
        label = dict(CostType.choices).get(r['cost_type'], r['cost_type'])
        items.append({
            'cost_type': r['cost_type'],
            'label': label,
            'amount': float(r['total']),
            'count': r['count'],
            'percentage': round(float(pct), 2),
        })

    return {
        'protocol_id': protocol_id,
        'total_cost': float(total),
        'breakdown': items,
    }


def get_unit_cost_analysis(protocol_id: int) -> dict:
    """单位成本分析：每人/每次成本"""
    total_cost = CostRecord.objects.filter(
        protocol_id=protocol_id, status=CostRecordStatus.CONFIRMED,
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    labor_cost = CostRecord.objects.filter(
        protocol_id=protocol_id, status=CostRecordStatus.CONFIRMED,
        cost_type=CostType.LABOR,
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    total_hours = CostRecord.objects.filter(
        protocol_id=protocol_id, status=CostRecordStatus.CONFIRMED,
        cost_type=CostType.LABOR, work_hours__isnull=False,
    ).aggregate(total=Coalesce(Sum('work_hours'), Decimal('0'), output_field=DecimalField()))['total']

    cost_records_count = CostRecord.objects.filter(
        protocol_id=protocol_id, status=CostRecordStatus.CONFIRMED,
    ).count()

    avg_per_record = (total_cost / cost_records_count) if cost_records_count > 0 else Decimal('0')
    avg_hourly = (labor_cost / total_hours) if total_hours > 0 else Decimal('0')

    return {
        'protocol_id': protocol_id,
        'total_cost': float(total_cost),
        'labor_cost': float(labor_cost),
        'total_work_hours': float(total_hours),
        'cost_records_count': cost_records_count,
        'avg_cost_per_record': round(float(avg_per_record), 2),
        'avg_hourly_rate': round(float(avg_hourly), 2),
    }


def get_cost_variance(protocol_id: int) -> dict:
    """成本偏差：预算 vs 实际（按科目）"""
    budget = ProjectBudget.objects.filter(protocol_id=protocol_id).first()
    if not budget:
        return {
            'protocol_id': protocol_id,
            'has_budget': False,
            'items': [],
        }

    budget_items = BudgetItem.objects.filter(budget=budget).select_related('category')

    actual_by_type = dict(
        CostRecord.objects.filter(
            protocol_id=protocol_id, status=CostRecordStatus.CONFIRMED,
        )
        .values_list('cost_type')
        .annotate(total=Sum('amount'))
    )

    items = []
    for bi in budget_items:
        budget_amount = float(bi.budget_amount)
        actual_amount = float(bi.actual_amount)
        variance = actual_amount - budget_amount
        variance_rate = (variance / budget_amount * 100) if budget_amount > 0 else 0
        items.append({
            'category': bi.category.name,
            'category_code': bi.category.code,
            'budget_amount': budget_amount,
            'actual_amount': actual_amount,
            'variance': round(variance, 2),
            'variance_rate': round(variance_rate, 2),
        })

    budget_total = float(budget.total_cost)
    actual_total = float(budget.actual_cost)

    return {
        'protocol_id': protocol_id,
        'has_budget': True,
        'budget_total': budget_total,
        'actual_total': actual_total,
        'total_variance': round(actual_total - budget_total, 2),
        'items': items,
    }


def get_cost_benchmark() -> dict:
    """成本基准对标：按项目类型的历史成本均值和当前项目对比"""
    import statistics

    confirmed = CostRecord.objects.filter(status=CostRecordStatus.CONFIRMED)
    protocol_costs = dict(
        confirmed.values_list('protocol_id')
        .annotate(total=Sum('amount'))
    )

    if not protocol_costs:
        return {'benchmarks': [], 'projects': []}

    all_totals = [float(v) for v in protocol_costs.values()]
    if len(all_totals) >= 2:
        mean = statistics.mean(all_totals)
        stdev = statistics.stdev(all_totals)
    elif len(all_totals) == 1:
        mean = all_totals[0]
        stdev = 0
    else:
        mean, stdev = 0, 0

    projects = []
    for pid, total in protocol_costs.items():
        total_f = float(total)
        deviation = (total_f - mean) / stdev if stdev > 0 else 0
        is_anomaly = abs(deviation) > 2

        contract = Contract.objects.filter(
            protocol_id=pid, is_deleted=False,
        ).first()
        project_name = contract.project if contract else f'项目{pid}'
        contract_amount = float(contract.amount) if contract else 0
        margin = ((contract_amount - total_f) / contract_amount * 100) if contract_amount > 0 else 0

        projects.append({
            'protocol_id': pid,
            'project_name': project_name,
            'total_cost': round(total_f, 2),
            'contract_amount': contract_amount,
            'gross_margin': round(margin, 2),
            'deviation': round(deviation, 2),
            'is_anomaly': is_anomaly,
        })

    projects.sort(key=lambda x: x['total_cost'], reverse=True)

    return {
        'benchmark_mean': round(mean, 2),
        'benchmark_stdev': round(stdev, 2),
        'project_count': len(projects),
        'anomaly_count': sum(1 for p in projects if p['is_anomaly']),
        'projects': projects,
    }


def get_cost_trend(months: int = 12) -> dict:
    """成本趋势：按月统计"""
    end_date = date.today()
    start_date = end_date - relativedelta(months=months)

    by_month = (
        CostRecord.objects.filter(
            status=CostRecordStatus.CONFIRMED,
            cost_date__gte=start_date,
        )
        .annotate(month=TruncMonth('cost_date'))
        .values('month')
        .annotate(total=Sum('amount'), count=Count('id'))
        .order_by('month')
    )

    trend = [{
        'month': r['month'].isoformat(),
        'amount': float(r['total']),
        'count': r['count'],
    } for r in by_month]

    return {'months': months, 'trend': trend}
