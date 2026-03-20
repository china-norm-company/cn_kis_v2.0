"""
营收分析引擎
"""
import logging
from decimal import Decimal
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from django.db.models import Sum, Count, Q, F, DecimalField
from django.db.models.functions import TruncMonth, Coalesce

from apps.finance.models import (
    Contract, ContractStatus,
    Invoice, InvoiceStatus,
    PaymentRecord, PaymentRecordStatus,
    PaymentPlan, PaymentPlanStatus,
)

logger = logging.getLogger(__name__)


def get_revenue_pipeline() -> dict:
    """营收管道：合同积压、管道、转化率"""
    today = date.today()

    total_contracted = Contract.objects.filter(
        is_deleted=False,
        status__in=[ContractStatus.SIGNED, ContractStatus.ACTIVE],
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    total_invoiced = Invoice.objects.filter(
        is_deleted=False,
        status__in=[InvoiceStatus.APPROVED, InvoiceStatus.SENT, InvoiceStatus.PAID],
    ).aggregate(total=Coalesce(Sum('total'), Decimal('0'), output_field=DecimalField()))['total']

    total_received = PaymentRecord.objects.filter(
        status=PaymentRecordStatus.CONFIRMED,
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    backlog = total_contracted - total_invoiced

    negotiating = Contract.objects.filter(
        is_deleted=False, status=ContractStatus.NEGOTIATING,
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    invoice_rate = (total_invoiced / total_contracted * 100) if total_contracted > 0 else Decimal('0')
    collection_rate = (total_received / total_invoiced * 100) if total_invoiced > 0 else Decimal('0')

    return {
        'total_contracted': float(total_contracted),
        'total_invoiced': float(total_invoiced),
        'total_received': float(total_received),
        'backlog': float(backlog),
        'pipeline_negotiating': float(negotiating),
        'invoice_conversion_rate': round(float(invoice_rate), 2),
        'collection_rate': round(float(collection_rate), 2),
    }


def get_revenue_trend(period: str = 'month', months: int = 12) -> dict:
    """营收趋势：按月统计"""
    end_date = date.today()
    start_date = end_date - relativedelta(months=months)

    invoiced_by_month = (
        Invoice.objects.filter(
            is_deleted=False, invoice_date__gte=start_date,
            status__in=[InvoiceStatus.APPROVED, InvoiceStatus.SENT, InvoiceStatus.PAID],
        )
        .annotate(month=TruncMonth('invoice_date'))
        .values('month')
        .annotate(total=Sum('total'))
        .order_by('month')
    )

    received_by_month = (
        PaymentRecord.objects.filter(
            status=PaymentRecordStatus.CONFIRMED,
            payment_date__gte=start_date,
        )
        .annotate(month=TruncMonth('payment_date'))
        .values('month')
        .annotate(total=Sum('amount'))
        .order_by('month')
    )

    invoiced_map = {r['month'].isoformat(): float(r['total']) for r in invoiced_by_month}
    received_map = {r['month'].isoformat(): float(r['total']) for r in received_by_month}

    all_months = sorted(set(list(invoiced_map.keys()) + list(received_map.keys())))

    trend = []
    for m in all_months:
        trend.append({
            'month': m,
            'invoiced': invoiced_map.get(m, 0),
            'received': received_map.get(m, 0),
        })

    return {'period': period, 'months': months, 'trend': trend}


def get_revenue_concentration(top_n: int = 10) -> dict:
    """营收集中度：按客户统计 Top N"""
    client_revenue = (
        Contract.objects.filter(
            is_deleted=False,
            status__in=[ContractStatus.SIGNED, ContractStatus.ACTIVE, ContractStatus.COMPLETED],
        )
        .values('client', 'client_id')
        .annotate(total=Sum('amount'))
        .order_by('-total')[:top_n]
    )

    total_all = Contract.objects.filter(
        is_deleted=False,
        status__in=[ContractStatus.SIGNED, ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

    items = []
    cumulative = Decimal('0')
    for r in client_revenue:
        cumulative += r['total']
        pct = (r['total'] / total_all * 100) if total_all > 0 else Decimal('0')
        items.append({
            'client': r['client'],
            'client_id': r['client_id'],
            'amount': float(r['total']),
            'percentage': round(float(pct), 2),
        })

    top_pct = (cumulative / total_all * 100) if total_all > 0 else Decimal('0')

    return {
        'top_n': top_n,
        'items': items,
        'total_revenue': float(total_all),
        'top_concentration': round(float(top_pct), 2),
    }


def get_revenue_recognition() -> dict:
    """收入确认跟踪：按项目展示已确认/已开票/已回款进度"""
    from apps.finance.models import Quote, QuoteStatus

    contracts = Contract.objects.filter(
        is_deleted=False,
        status__in=[ContractStatus.SIGNED, ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    ).order_by('-create_time')[:50]

    projects = []
    for c in contracts:
        invoiced = Invoice.objects.filter(
            contract=c, is_deleted=False,
            status__in=[InvoiceStatus.APPROVED, InvoiceStatus.SENT, InvoiceStatus.PAID],
        ).aggregate(total=Coalesce(Sum('total'), Decimal('0'), output_field=DecimalField()))['total']

        paid_invoiced = Invoice.objects.filter(
            contract=c, is_deleted=False, status=InvoiceStatus.PAID,
        ).aggregate(total=Coalesce(Sum('total'), Decimal('0'), output_field=DecimalField()))['total']

        received = PaymentRecord.objects.filter(
            protocol_id=c.protocol_id, status=PaymentRecordStatus.CONFIRMED,
        ).aggregate(total=Coalesce(Sum('amount'), Decimal('0'), output_field=DecimalField()))['total']

        amount = c.amount or Decimal('0')
        invoice_pct = float(invoiced / amount * 100) if amount > 0 else 0
        receive_pct = float(received / amount * 100) if amount > 0 else 0
        deferred = max(float(received - invoiced), 0)

        projects.append({
            'contract_id': c.id,
            'project': c.project,
            'client': c.client,
            'contract_amount': float(amount),
            'invoiced': float(invoiced),
            'received': float(received),
            'invoice_progress': round(invoice_pct, 2),
            'collection_progress': round(receive_pct, 2),
            'deferred_revenue': deferred,
        })

    total_contract = sum(p['contract_amount'] for p in projects)
    total_invoiced = sum(p['invoiced'] for p in projects)
    total_received = sum(p['received'] for p in projects)

    return {
        'total_contract_amount': total_contract,
        'total_invoiced': total_invoiced,
        'total_received': total_received,
        'recognition_rate': round(total_invoiced / total_contract * 100, 2) if total_contract > 0 else 0,
        'collection_rate': round(total_received / total_contract * 100, 2) if total_contract > 0 else 0,
        'projects': projects,
    }


def get_revenue_forecast(months: int = 12) -> dict:
    """营收预测：基于回款计划"""
    today = date.today()
    end_date = today + relativedelta(months=months)

    plans = (
        PaymentPlan.objects.filter(
            planned_date__gte=today,
            planned_date__lte=end_date,
            status__in=[PaymentPlanStatus.PENDING, PaymentPlanStatus.PARTIAL],
        )
        .annotate(month=TruncMonth('planned_date'))
        .values('month')
        .annotate(
            planned=Sum('planned_amount'),
            received=Sum('received_amount'),
        )
        .order_by('month')
    )

    forecast = []
    for p in plans:
        remaining = float(p['planned'] - p['received'])
        forecast.append({
            'month': p['month'].isoformat(),
            'expected': remaining,
        })

    total_expected = sum(f['expected'] for f in forecast)

    return {
        'months': months,
        'forecast': forecast,
        'total_expected': total_expected,
    }
