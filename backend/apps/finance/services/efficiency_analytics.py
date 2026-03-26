"""
运营效率分析引擎
"""
import logging
from decimal import Decimal
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from django.db.models import Sum, Avg, DecimalField
from django.db.models.functions import Coalesce

from apps.finance.models import (
    Contract, ContractStatus,
    PaymentRecord, PaymentRecordStatus,
    PaymentPlan, PaymentPlanStatus,
    ProjectBudget,
)

logger = logging.getLogger(__name__)


def get_operational_efficiency() -> dict:
    """运营效率指标"""
    today = date.today()
    one_year_ago = today - relativedelta(years=1)

    annual_revenue = Contract.objects.filter(
        is_deleted=False,
        signed_date__gte=one_year_ago,
        status__in=[ContractStatus.SIGNED, ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    ).aggregate(
        total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField())
    )['total']

    active_contracts = Contract.objects.filter(
        is_deleted=False,
        status__in=[ContractStatus.SIGNED, ContractStatus.ACTIVE],
    ).count()

    completed_contracts = Contract.objects.filter(
        is_deleted=False,
        status=ContractStatus.COMPLETED,
    ).count()

    total_contracts = active_contracts + completed_contracts
    completion_rate = (completed_contracts / total_contracts * 100) if total_contracts > 0 else 0

    annual_received = PaymentRecord.objects.filter(
        status=PaymentRecordStatus.CONFIRMED,
        payment_date__gte=one_year_ago,
    ).aggregate(
        total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField())
    )['total']

    collection_cycle = (
        PaymentPlan.objects.filter(
            status=PaymentPlanStatus.COMPLETED,
            create_time__date__gte=one_year_ago,
        )
        .aggregate(avg_days=Coalesce(Avg('overdue_days'), Decimal('0'), output_field=DecimalField()))
    )['avg_days']

    return {
        'annual_revenue': float(annual_revenue),
        'annual_received': float(annual_received),
        'active_contracts': active_contracts,
        'completed_contracts': completed_contracts,
        'completion_rate': round(completion_rate, 2),
        'avg_collection_cycle_days': float(collection_cycle),
    }


def get_collection_efficiency() -> dict:
    """回款效率"""
    today = date.today()

    total_planned = PaymentPlan.objects.aggregate(
        total=Coalesce(Sum('planned_amount'), Decimal('0'), output_field=DecimalField())
    )['total']

    total_received = PaymentPlan.objects.aggregate(
        total=Coalesce(Sum('received_amount'), Decimal('0'), output_field=DecimalField())
    )['total']

    collection_rate = (total_received / total_planned * 100) if total_planned > 0 else Decimal('0')

    completed_plans = PaymentPlan.objects.filter(status=PaymentPlanStatus.COMPLETED)
    on_time_count = completed_plans.filter(overdue_days=0).count()
    total_completed = completed_plans.count()
    on_time_rate = (on_time_count / total_completed * 100) if total_completed > 0 else 0

    overdue_count = PaymentPlan.objects.filter(status=PaymentPlanStatus.OVERDUE).count()
    pending_count = PaymentPlan.objects.filter(
        status__in=[PaymentPlanStatus.PENDING, PaymentPlanStatus.PARTIAL],
    ).count()

    return {
        'total_planned': float(total_planned),
        'total_received': float(total_received),
        'collection_rate': round(float(collection_rate), 2),
        'on_time_rate': round(on_time_rate, 2),
        'overdue_count': overdue_count,
        'pending_count': pending_count,
    }


def get_budget_accuracy() -> dict:
    """预算准确率"""
    budgets = ProjectBudget.objects.filter(
        status__in=['executing', 'completed'],
    )

    items = []
    total_budget = Decimal('0')
    total_actual = Decimal('0')

    for b in budgets[:30]:
        budget_cost = b.total_cost
        actual_cost = b.actual_cost
        total_budget += budget_cost
        total_actual += actual_cost

        if budget_cost > 0:
            accuracy = 100 - abs(float((actual_cost - budget_cost) / budget_cost * 100))
        else:
            accuracy = 0

        items.append({
            'budget_id': b.id,
            'budget_no': b.budget_no,
            'project_name': b.project_name,
            'budget_cost': float(budget_cost),
            'actual_cost': float(actual_cost),
            'accuracy': round(max(0, accuracy), 2),
        })

    overall_accuracy = 0
    if total_budget > 0:
        overall_accuracy = 100 - abs(float((total_actual - total_budget) / total_budget * 100))

    return {
        'overall_accuracy': round(max(0, overall_accuracy), 2),
        'project_count': len(items),
        'projects': items,
    }


def get_period_comparison(current_start: date = None, current_end: date = None) -> dict:
    """同期对比：当期 vs 上期 vs 去年同期"""
    from apps.finance.models import CostRecord, CostRecordStatus, Invoice, InvoiceStatus
    from dateutil.relativedelta import relativedelta

    today = date.today()
    if not current_end:
        current_end = today
    if not current_start:
        current_start = today.replace(day=1)

    period_days = (current_end - current_start).days + 1

    prev_end = current_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period_days - 1)

    yoy_start = current_start - relativedelta(years=1)
    yoy_end = current_end - relativedelta(years=1)

    def _calc_metrics(start, end):
        invoiced = Invoice.objects.filter(
            is_deleted=False, invoice_date__gte=start, invoice_date__lte=end,
            status__in=[InvoiceStatus.APPROVED, InvoiceStatus.SENT, InvoiceStatus.PAID],
        ).aggregate(total=Coalesce(Sum('total'), Decimal('0'), output_field=DecimalField()))['total']

        received = PaymentRecord.objects.filter(
            status=PaymentRecordStatus.CONFIRMED,
            payment_date__gte=start, payment_date__lte=end,
        ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

        cost = CostRecord.objects.filter(
            status=CostRecordStatus.CONFIRMED,
            cost_date__gte=start, cost_date__lte=end,
        ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

        profit = invoiced - cost
        margin = float(profit / invoiced * 100) if invoiced > 0 else 0

        signed = Contract.objects.filter(
            is_deleted=False, signed_date__gte=start, signed_date__lte=end,
        ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

        return {
            'invoiced': float(invoiced),
            'received': float(received),
            'cost': float(cost),
            'profit': float(profit),
            'margin': round(margin, 2),
            'signed': float(signed),
        }

    current = _calc_metrics(current_start, current_end)
    previous = _calc_metrics(prev_start, prev_end)
    yoy = _calc_metrics(yoy_start, yoy_end)

    def _pct_change(current_val, base_val):
        if base_val == 0:
            return None
        return round((current_val - base_val) / base_val * 100, 2)

    comparison = {}
    for key in current:
        comparison[key] = {
            'current': current[key],
            'previous': previous[key],
            'yoy': yoy[key],
            'mom_change': _pct_change(current[key], previous[key]),
            'yoy_change': _pct_change(current[key], yoy[key]),
        }

    return {
        'current_period': {'start': str(current_start), 'end': str(current_end)},
        'previous_period': {'start': str(prev_start), 'end': str(prev_end)},
        'yoy_period': {'start': str(yoy_start), 'end': str(yoy_end)},
        'comparison': comparison,
    }
