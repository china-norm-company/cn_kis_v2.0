"""
现金流分析引擎
"""
import logging
from decimal import Decimal
from datetime import date
from dateutil.relativedelta import relativedelta
from django.db.models import Sum, DecimalField
from django.db.models.functions import TruncMonth, Coalesce

from apps.finance.models import (
    Invoice, InvoiceStatus,
    PaymentRecord, PaymentRecordStatus,
    PaymentPlan, PaymentPlanStatus,
    CashFlowRecord, CashFlowType,
)
from apps.finance.models_payable import PayableRecord, PayableStatus

logger = logging.getLogger(__name__)


def get_cashflow_forecast(months: int = 12) -> dict:
    """现金流预测：基于回款计划和应付"""
    today = date.today()
    end_date = today + relativedelta(months=months)

    inflows_by_month = (
        PaymentPlan.objects.filter(
            planned_date__gte=today, planned_date__lte=end_date,
            status__in=[PaymentPlanStatus.PENDING, PaymentPlanStatus.PARTIAL],
        )
        .annotate(month=TruncMonth('planned_date'))
        .values('month')
        .annotate(amount=Sum('remaining_amount'))
        .order_by('month')
    )

    outflows_by_month = (
        PayableRecord.objects.filter(
            due_date__gte=today, due_date__lte=end_date,
            payment_status__in=[PayableStatus.PENDING, PayableStatus.APPROVED],
        )
        .annotate(month=TruncMonth('due_date'))
        .values('month')
        .annotate(amount=Sum('amount'))
        .order_by('month')
    )

    inflow_map = {r['month'].isoformat(): float(r['amount']) for r in inflows_by_month}
    outflow_map = {r['month'].isoformat(): float(r['amount']) for r in outflows_by_month}

    all_months = sorted(set(list(inflow_map.keys()) + list(outflow_map.keys())))

    forecast = []
    cumulative = 0
    for m in all_months:
        inflow = inflow_map.get(m, 0)
        outflow = outflow_map.get(m, 0)
        net = inflow - outflow
        cumulative += net
        forecast.append({
            'month': m,
            'inflow': inflow,
            'outflow': outflow,
            'net': round(net, 2),
            'cumulative': round(cumulative, 2),
        })

    return {'months': months, 'forecast': forecast}


def get_cash_conversion_cycle() -> dict:
    """现金转换周期：DSO, DPO, CCC"""
    today = date.today()
    one_year_ago = today - relativedelta(years=1)

    total_invoiced = Invoice.objects.filter(
        is_deleted=False, invoice_date__gte=one_year_ago,
        status__in=[InvoiceStatus.APPROVED, InvoiceStatus.SENT, InvoiceStatus.PAID],
    ).aggregate(total=Coalesce(Sum('total'), Decimal('0'), output_field=DecimalField()))['total']

    total_received = PaymentRecord.objects.filter(
        status=PaymentRecordStatus.CONFIRMED, payment_date__gte=one_year_ago,
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    ar_outstanding = total_invoiced - total_received

    daily_revenue = total_invoiced / 365 if total_invoiced > 0 else Decimal('1')
    dso = float(ar_outstanding / daily_revenue)

    total_payable = PayableRecord.objects.filter(
        payment_status__in=[PayableStatus.PENDING, PayableStatus.APPROVED],
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    total_paid = PayableRecord.objects.filter(
        payment_status=PayableStatus.PAID,
        create_time__date__gte=one_year_ago,
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    total_purchase = total_payable + total_paid
    daily_purchase = total_purchase / 365 if total_purchase > 0 else Decimal('1')
    dpo = float(total_payable / daily_purchase)

    ccc = dso - dpo

    return {
        'dso': round(dso, 1),
        'dpo': round(dpo, 1),
        'ccc': round(ccc, 1),
        'ar_outstanding': float(ar_outstanding),
        'ap_outstanding': float(total_payable),
    }


def get_cashflow_waterfall(months: int = 6) -> dict:
    """现金流瀑布图数据"""
    end_date = date.today()
    start_date = end_date - relativedelta(months=months)

    inflows = (
        CashFlowRecord.objects.filter(
            flow_type=CashFlowType.INFLOW, record_date__gte=start_date,
        )
        .annotate(month=TruncMonth('record_date'))
        .values('month')
        .annotate(total=Sum('amount'))
        .order_by('month')
    )

    outflows = (
        CashFlowRecord.objects.filter(
            flow_type=CashFlowType.OUTFLOW, record_date__gte=start_date,
        )
        .annotate(month=TruncMonth('record_date'))
        .values('month')
        .annotate(total=Sum('amount'))
        .order_by('month')
    )

    inflow_map = {r['month'].isoformat(): float(r['total']) for r in inflows}
    outflow_map = {r['month'].isoformat(): float(r['total']) for r in outflows}

    all_months = sorted(set(list(inflow_map.keys()) + list(outflow_map.keys())))

    waterfall = []
    running = 0
    for m in all_months:
        inflow = inflow_map.get(m, 0)
        outflow = outflow_map.get(m, 0)
        net = inflow - outflow
        running += net
        waterfall.append({
            'month': m,
            'inflow': inflow,
            'outflow': outflow,
            'net': round(net, 2),
            'balance': round(running, 2),
        })

    return {'months': months, 'waterfall': waterfall}


def get_ar_ap_matching(months: int = 6) -> dict:
    """应收应付到期配比：按月对比到期应收与到期应付"""
    today = date.today()
    end_date = today + relativedelta(months=months)

    ar_by_month = (
        PaymentPlan.objects.filter(
            planned_date__gte=today, planned_date__lte=end_date,
            status__in=[PaymentPlanStatus.PENDING, PaymentPlanStatus.PARTIAL, PaymentPlanStatus.OVERDUE],
        )
        .annotate(month=TruncMonth('planned_date'))
        .values('month')
        .annotate(amount=Coalesce(Sum('remaining_amount'), Decimal('0'), output_field=DecimalField()))
        .order_by('month')
    )

    ap_by_month = (
        PayableRecord.objects.filter(
            due_date__gte=today, due_date__lte=end_date,
            payment_status__in=[PayableStatus.PENDING, PayableStatus.APPROVED],
        )
        .annotate(month=TruncMonth('due_date'))
        .values('month')
        .annotate(amount=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))
        .order_by('month')
    )

    ar_map = {r['month'].isoformat(): float(r['amount']) for r in ar_by_month}
    ap_map = {r['month'].isoformat(): float(r['amount']) for r in ap_by_month}

    all_months = sorted(set(list(ar_map.keys()) + list(ap_map.keys())))

    matching = []
    gap_months = []
    for m in all_months:
        ar = ar_map.get(m, 0)
        ap = ap_map.get(m, 0)
        net = ar - ap
        matching.append({
            'month': m,
            'ar_due': ar,
            'ap_due': ap,
            'net_position': round(net, 2),
        })
        if net < 0:
            gap_months.append(m)

    return {
        'months': months,
        'matching': matching,
        'gap_months': gap_months,
        'has_gap': len(gap_months) > 0,
    }
