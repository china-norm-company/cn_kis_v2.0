"""
财务分析服务

FIN005：盈利分析、财务报表、现金流分析
"""
import logging
from typing import Optional, Dict
from decimal import Decimal
from datetime import date
from django.utils import timezone
from django.db.models import Sum, Count, Q

from apps.finance.models import (
    FinancialReport, FinancialReportStatus,
    ProfitAnalysis, CashFlowRecord, CashFlowType,
    Contract, ContractStatus, Invoice, InvoiceStatus,
    PaymentPlan, PaymentPlanStatus, CostRecord, CostRecordStatus, CostType,
)

logger = logging.getLogger(__name__)


def generate_profit_analysis(
    protocol_id: int, analysis_date: date = None, period_type: str = 'month',
) -> Optional[ProfitAnalysis]:
    """生成项目盈利分析"""
    analysis_date = analysis_date or date.today()

    # 合同收入
    contracts = Contract.objects.filter(
        protocol_id=protocol_id, is_deleted=False,
        status__in=[ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    )
    contract_amount = contracts.aggregate(total=Sum('amount'))['total'] or Decimal('0')

    # 已开票
    invoiced = Invoice.objects.filter(
        contract__protocol_id=protocol_id, is_deleted=False,
    ).exclude(status=InvoiceStatus.DRAFT)
    invoiced_amount = invoiced.aggregate(total=Sum('total'))['total'] or Decimal('0')

    # 已回款
    from apps.finance.models import PaymentRecord, PaymentRecordStatus
    received = PaymentRecord.objects.filter(
        protocol_id=protocol_id, status=PaymentRecordStatus.CONFIRMED,
    )
    received_amount = received.aggregate(total=Sum('amount'))['total'] or Decimal('0')

    # 成本
    costs = CostRecord.objects.filter(
        protocol_id=protocol_id, status=CostRecordStatus.CONFIRMED,
    )
    labor = costs.filter(cost_type=CostType.LABOR).aggregate(s=Sum('amount'))['s'] or Decimal('0')
    material = costs.filter(cost_type=CostType.MATERIAL).aggregate(s=Sum('amount'))['s'] or Decimal('0')
    equipment = costs.filter(cost_type=CostType.EQUIPMENT).aggregate(s=Sum('amount'))['s'] or Decimal('0')
    outsource = costs.filter(cost_type=CostType.OUTSOURCE).aggregate(s=Sum('amount'))['s'] or Decimal('0')
    other = costs.filter(cost_type__in=[CostType.TRAVEL, CostType.OTHER]).aggregate(s=Sum('amount'))['s'] or Decimal('0')
    total_cost = labor + material + equipment + outsource + other

    gross_profit = contract_amount - total_cost
    gross_margin = (gross_profit / contract_amount * 100) if contract_amount else Decimal('0')

    # 预算对比
    from apps.finance.models import ProjectBudget
    budget = ProjectBudget.objects.filter(protocol_id=protocol_id).order_by('-version').first()
    budget_cost = budget.total_cost if budget else Decimal('0')
    cost_variance = budget_cost - total_cost
    cost_variance_rate = (cost_variance / budget_cost * 100) if budget_cost else Decimal('0')

    pa, _ = ProfitAnalysis.objects.update_or_create(
        protocol_id=protocol_id, analysis_date=analysis_date, period_type=period_type,
        defaults={
            'project_name': contracts.first().project if contracts.exists() else '',
            'contract_amount': contract_amount, 'invoiced_amount': invoiced_amount,
            'received_amount': received_amount,
            'labor_cost': labor, 'material_cost': material, 'equipment_cost': equipment,
            'outsource_cost': outsource, 'other_cost': other, 'total_cost': total_cost,
            'gross_profit': gross_profit, 'gross_margin': round(gross_margin, 2),
            'budget_cost': budget_cost, 'cost_variance': cost_variance,
            'cost_variance_rate': round(cost_variance_rate, 2),
        },
    )
    return pa


def generate_financial_report(
    report_no: str, report_name: str, report_type: str,
    period_start: date, period_end: date,
    protocol_id: int = None, generated_by_id: int = None,
) -> FinancialReport:
    """生成财务报表"""
    report = FinancialReport.objects.create(
        report_no=report_no, report_name=report_name,
        report_type=report_type,
        period_start=period_start, period_end=period_end,
        protocol_id=protocol_id,
        generated_by_id=generated_by_id,
    )

    data = _collect_report_data(report)
    report.report_data = data
    report.total_income = Decimal(str(data.get('total_income', 0)))
    report.total_cost = Decimal(str(data.get('total_cost', 0)))
    report.gross_profit = report.total_income - report.total_cost
    if report.total_income:
        report.gross_margin = round(report.gross_profit / report.total_income * 100, 2)
    report.status = FinancialReportStatus.GENERATED
    report.generated_at = timezone.now()
    report.save()

    # 上传飞书
    _upload_report_to_feishu(report)
    return report


def get_cash_flow_summary(
    start_date: date = None, end_date: date = None,
    protocol_id: int = None,
) -> Dict:
    """现金流汇总"""
    qs = CashFlowRecord.objects.all()
    if start_date:
        qs = qs.filter(record_date__gte=start_date)
    if end_date:
        qs = qs.filter(record_date__lte=end_date)
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)

    inflow = qs.filter(flow_type=CashFlowType.INFLOW).aggregate(
        total=Sum('amount'))['total'] or Decimal('0')
    outflow = qs.filter(flow_type=CashFlowType.OUTFLOW).aggregate(
        total=Sum('amount'))['total'] or Decimal('0')

    return {
        'total_inflow': float(inflow),
        'total_outflow': float(outflow),
        'net_flow': float(inflow - outflow),
        'by_category': _cash_flow_by_category(qs),
    }


def get_ar_aging(as_of: date = None) -> Dict:
    """应收账龄分析"""
    as_of = as_of or date.today()
    plans = PaymentPlan.objects.filter(
        status__in=[PaymentPlanStatus.PENDING, PaymentPlanStatus.PARTIAL, PaymentPlanStatus.OVERDUE],
    )
    buckets = {'current': Decimal('0'), '1_30': Decimal('0'), '31_60': Decimal('0'),
               '61_90': Decimal('0'), 'over_90': Decimal('0')}

    for plan in plans:
        days = (as_of - plan.planned_date).days
        remaining = plan.remaining_amount
        if days <= 0:
            buckets['current'] += remaining
        elif days <= 30:
            buckets['1_30'] += remaining
        elif days <= 60:
            buckets['31_60'] += remaining
        elif days <= 90:
            buckets['61_90'] += remaining
        else:
            buckets['over_90'] += remaining

    return {k: float(v) for k, v in buckets.items()}


def get_finance_dashboard() -> Dict:
    """财务看板数据（12 KPI + 趋势 + 预警 + 待办 + 到期）"""
    from datetime import date as dt_date, timedelta
    from dateutil.relativedelta import relativedelta
    from django.db.models import DecimalField
    from django.db.models.functions import Coalesce
    from apps.finance.models import PaymentRecord, PaymentRecordStatus

    today = dt_date.today()
    ZERO = Decimal('0')

    # ── KPI 行1: 收入类 ──
    total_contract = Contract.objects.filter(
        is_deleted=False, status__in=[ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    ).aggregate(total=Coalesce(Sum('amount'), ZERO, output_field=DecimalField()))['total']

    total_invoiced = Invoice.objects.filter(
        is_deleted=False,
        status__in=[InvoiceStatus.APPROVED, InvoiceStatus.SENT, InvoiceStatus.PAID],
    ).aggregate(total=Coalesce(Sum('total'), ZERO, output_field=DecimalField()))['total']

    total_received = PaymentRecord.objects.filter(
        status=PaymentRecordStatus.CONFIRMED,
    ).aggregate(total=Coalesce(Sum('amount'), ZERO, output_field=DecimalField()))['total']

    collection_rate = float(total_received / total_invoiced * 100) if total_invoiced > 0 else 0

    # ── KPI 行2: 成本/效率类 ──
    total_cost = CostRecord.objects.filter(
        status=CostRecordStatus.CONFIRMED,
    ).aggregate(total=Coalesce(Sum('amount'), ZERO, output_field=DecimalField()))['total']

    gross_margin = float((total_contract - total_cost) / total_contract * 100) if total_contract > 0 else 0

    overdue_count = PaymentPlan.objects.filter(status=PaymentPlanStatus.OVERDUE).count()
    overdue_amount = PaymentPlan.objects.filter(
        status=PaymentPlanStatus.OVERDUE,
    ).aggregate(total=Coalesce(Sum('remaining_amount'), ZERO, output_field=DecimalField()))['total']

    daily_revenue = total_invoiced / 365 if total_invoiced > 0 else Decimal('1')
    ar_outstanding = total_invoiced - total_received
    dso = float(ar_outstanding / daily_revenue)

    # ── KPI 行3: 管线/风险类 ──
    backlog = float(total_contract - total_invoiced)

    from apps.finance.models import Quote, QuoteStatus
    pipeline = Quote.objects.filter(
        is_deleted=False, status=QuoteStatus.SENT,
    ).aggregate(total=Coalesce(Sum('total_amount'), ZERO, output_field=DecimalField()))['total']

    risk_exposure = float(overdue_amount)

    active_contracts = Contract.objects.filter(
        is_deleted=False, status=ContractStatus.ACTIVE,
    ).count()

    # ── 月度趋势数据 ──
    from django.db.models.functions import TruncMonth
    six_months_ago = today - relativedelta(months=6)
    invoice_trend = list(
        Invoice.objects.filter(
            is_deleted=False, invoice_date__gte=six_months_ago,
        ).exclude(status=InvoiceStatus.DRAFT)
        .annotate(month=TruncMonth('invoice_date'))
        .values('month').annotate(total=Sum('total')).order_by('month')
    )
    cost_trend = list(
        CostRecord.objects.filter(
            status=CostRecordStatus.CONFIRMED, cost_date__gte=six_months_ago,
        )
        .annotate(month=TruncMonth('cost_date'))
        .values('month').annotate(total=Sum('amount')).order_by('month')
    )

    rev_map = {r['month'].isoformat(): float(r['total']) for r in invoice_trend}
    cost_map = {r['month'].isoformat(): float(r['total']) for r in cost_trend}
    all_months = sorted(set(list(rev_map.keys()) + list(cost_map.keys())))
    trends = [{
        'month': m,
        'revenue': rev_map.get(m, 0),
        'cost': cost_map.get(m, 0),
        'profit': rev_map.get(m, 0) - cost_map.get(m, 0),
    } for m in all_months]

    # ── 预警列表 ──
    from apps.finance.services.alert_service import check_budget_alerts
    budget_alerts = check_budget_alerts()

    overdue_list = list(
        PaymentPlan.objects.filter(status=PaymentPlanStatus.OVERDUE)
        .order_by('-overdue_days')[:5]
        .values('id', 'plan_no', 'client_name', 'remaining_amount', 'overdue_days')
    )
    alerts = []
    for a in budget_alerts[:5]:
        alerts.append({'type': 'budget', 'level': a.get('level', 'warning'), 'message': a.get('message', ''), 'detail': a})
    for o in overdue_list:
        alerts.append({
            'type': 'overdue',
            'level': 'error' if o['overdue_days'] > 60 else 'warning',
            'message': f'{o["client_name"]} 逾期 {o["overdue_days"]} 天，余额 ¥{o["remaining_amount"]}',
            'detail': o,
        })

    # ── 待办事项 ──
    pending_invoices = Invoice.objects.filter(is_deleted=False, status=InvoiceStatus.DRAFT).count()
    pending_costs = CostRecord.objects.filter(status=CostRecordStatus.PENDING).count()
    from apps.finance.models import ProjectBudget
    pending_budgets = ProjectBudget.objects.filter(status='submitted').count()

    todos = []
    if pending_invoices:
        todos.append({'type': 'invoice', 'label': '待审批发票', 'count': pending_invoices})
    if pending_costs:
        todos.append({'type': 'cost', 'label': '待确认成本', 'count': pending_costs})
    if pending_budgets:
        todos.append({'type': 'budget', 'label': '待审批预算', 'count': pending_budgets})
    if overdue_count:
        todos.append({'type': 'overdue', 'label': '逾期催收', 'count': overdue_count})

    # ── 近期到期项 ──
    next_week = today + timedelta(days=7)
    expiring_plans = list(
        PaymentPlan.objects.filter(
            planned_date__gte=today, planned_date__lte=next_week,
            status__in=[PaymentPlanStatus.PENDING, PaymentPlanStatus.PARTIAL],
        ).order_by('planned_date')[:5]
        .values('id', 'plan_no', 'client_name', 'planned_date', 'remaining_amount')
    )
    for p in expiring_plans:
        p['remaining_amount'] = float(p['remaining_amount'])
        p['planned_date'] = str(p['planned_date'])
        p['days_until'] = (date.fromisoformat(p['planned_date']) - today).days

    return {
        'kpis': {
            'total_contract_amount': float(total_contract),
            'total_invoiced': float(total_invoiced),
            'total_received': float(total_received),
            'collection_rate': round(collection_rate, 2),
            'total_cost': float(total_cost),
            'gross_margin': round(gross_margin, 2),
            'overdue_amount': float(overdue_amount),
            'overdue_count': overdue_count,
            'dso': round(dso, 1),
            'backlog': backlog,
            'pipeline': float(pipeline),
            'risk_exposure': risk_exposure,
            'active_contracts': active_contracts,
        },
        'trends': trends,
        'ar_aging': get_ar_aging(today),
        'alerts': alerts,
        'todos': todos,
        'expiring': expiring_plans,
    }


def get_profit_ranking(limit: int = 20) -> dict:
    """项目盈利排行：按毛利率排序"""
    contracts = Contract.objects.filter(
        is_deleted=False,
        status__in=[ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    )

    rankings = []
    for c in contracts:
        amount = c.amount or Decimal('0')
        if amount <= 0:
            continue

        total_cost = CostRecord.objects.filter(
            protocol_id=c.protocol_id, status=CostRecordStatus.CONFIRMED,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        gross_profit = amount - total_cost
        margin = float(gross_profit / amount * 100)

        rankings.append({
            'protocol_id': c.protocol_id,
            'project': c.project,
            'client': c.client,
            'contract_amount': float(amount),
            'total_cost': float(total_cost),
            'gross_profit': float(gross_profit),
            'gross_margin': round(margin, 2),
            'is_loss': margin < 0,
        })

    rankings.sort(key=lambda x: x['gross_margin'], reverse=True)

    all_margins = [r['gross_margin'] for r in rankings]
    avg_margin = sum(all_margins) / len(all_margins) if all_margins else 0
    loss_count = sum(1 for r in rankings if r['is_loss'])
    low_margin_count = sum(1 for r in rankings if 0 <= r['gross_margin'] < 15)

    return {
        'rankings': rankings[:limit],
        'total_projects': len(rankings),
        'average_margin': round(avg_margin, 2),
        'loss_count': loss_count,
        'low_margin_count': low_margin_count,
        'warning_threshold': 15.0,
    }


def get_profit_by_client() -> dict:
    """客户盈利分析：按客户汇总收入/成本/毛利"""
    contracts = Contract.objects.filter(
        is_deleted=False,
        status__in=[ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    ).values('client', 'client_id').annotate(
        total_amount=Sum('amount'),
        project_count=Count('id'),
    ).order_by('-total_amount')

    clients = []
    for cc in contracts:
        client_id = cc['client_id']
        if not client_id:
            continue

        total_cost = CostRecord.objects.filter(
            protocol_id__in=Contract.objects.filter(
                client_id=client_id, is_deleted=False,
            ).values_list('protocol_id', flat=True),
            status=CostRecordStatus.CONFIRMED,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        revenue = cc['total_amount'] or Decimal('0')
        profit = revenue - total_cost
        margin = float(profit / revenue * 100) if revenue > 0 else 0

        clients.append({
            'client_id': client_id,
            'client': cc['client'],
            'revenue': float(revenue),
            'cost': float(total_cost),
            'profit': float(profit),
            'margin': round(margin, 2),
            'project_count': cc['project_count'],
        })

    clients.sort(key=lambda x: x['profit'], reverse=True)

    return {
        'clients': clients,
        'total_clients': len(clients),
    }


def get_contribution_margin() -> dict:
    """贡献边际分析：收入 - 直接变动成本"""
    contracts = Contract.objects.filter(
        is_deleted=False,
        status__in=[ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    )

    direct_types = [CostType.LABOR, CostType.MATERIAL, CostType.OUTSOURCE]
    indirect_types = [CostType.EQUIPMENT, CostType.TRAVEL, CostType.OTHER]

    projects = []
    for c in contracts:
        amount = c.amount or Decimal('0')
        if amount <= 0:
            continue

        costs = CostRecord.objects.filter(
            protocol_id=c.protocol_id, status=CostRecordStatus.CONFIRMED,
        )
        direct = costs.filter(cost_type__in=direct_types).aggregate(
            total=Sum('amount'))['total'] or Decimal('0')
        indirect = costs.filter(cost_type__in=indirect_types).aggregate(
            total=Sum('amount'))['total'] or Decimal('0')

        contribution = amount - direct
        cm_rate = float(contribution / amount * 100)
        net_profit = contribution - indirect
        net_rate = float(net_profit / amount * 100)

        projects.append({
            'protocol_id': c.protocol_id,
            'project': c.project,
            'revenue': float(amount),
            'direct_cost': float(direct),
            'contribution_margin': float(contribution),
            'cm_rate': round(cm_rate, 2),
            'indirect_cost': float(indirect),
            'net_profit': float(net_profit),
            'net_rate': round(net_rate, 2),
        })

    projects.sort(key=lambda x: x['cm_rate'], reverse=True)

    total_rev = sum(p['revenue'] for p in projects)
    total_direct = sum(p['direct_cost'] for p in projects)
    total_indirect = sum(p['indirect_cost'] for p in projects)

    return {
        'projects': projects,
        'summary': {
            'total_revenue': total_rev,
            'total_direct_cost': total_direct,
            'total_contribution': total_rev - total_direct,
            'overall_cm_rate': round((total_rev - total_direct) / total_rev * 100, 2) if total_rev > 0 else 0,
            'total_indirect_cost': total_indirect,
            'total_net_profit': total_rev - total_direct - total_indirect,
        },
    }


def get_estimate_accuracy() -> dict:
    """估算准确度：报价估算 vs 实际毛利的偏差"""
    from apps.finance.models import Quote, QuoteStatus

    contracts = Contract.objects.filter(
        is_deleted=False,
        status__in=[ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    )

    items = []
    for c in contracts:
        amount = c.amount or Decimal('0')
        if amount <= 0:
            continue

        quote = Quote.objects.filter(
            protocol_id=c.protocol_id, is_deleted=False,
            status=QuoteStatus.ACCEPTED,
        ).first()

        estimated_amount = quote.total_amount if quote else amount
        estimated_margin = float((estimated_amount - amount * Decimal('0.7')) / estimated_amount * 100) if estimated_amount > 0 else 30

        actual_cost = CostRecord.objects.filter(
            protocol_id=c.protocol_id, status=CostRecordStatus.CONFIRMED,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        actual_margin = float((amount - actual_cost) / amount * 100)
        deviation = actual_margin - estimated_margin

        items.append({
            'protocol_id': c.protocol_id,
            'project': c.project,
            'estimated_amount': float(estimated_amount),
            'contract_amount': float(amount),
            'actual_cost': float(actual_cost),
            'estimated_margin': round(estimated_margin, 2),
            'actual_margin': round(actual_margin, 2),
            'deviation': round(deviation, 2),
        })

    deviations = [abs(i['deviation']) for i in items]
    avg_deviation = sum(deviations) / len(deviations) if deviations else 0

    return {
        'items': items,
        'total_projects': len(items),
        'average_absolute_deviation': round(avg_deviation, 2),
        'accurate_count': sum(1 for d in deviations if d <= 5),
        'close_count': sum(1 for d in deviations if 5 < d <= 15),
        'far_count': sum(1 for d in deviations if d > 15),
    }


def get_profit_trend(months: int = 12) -> dict:
    """盈利趋势：月度毛利率 + 收入 + 成本变化"""
    from dateutil.relativedelta import relativedelta
    from django.db.models import DecimalField
    from django.db.models.functions import TruncMonth, Coalesce

    end_date = date.today()
    start_date = end_date - relativedelta(months=months)
    ZERO = Decimal('0')

    invoice_by_month = {
        item['month']: float(item['total'])
        for item in Invoice.objects.filter(
            is_deleted=False, invoice_date__gte=start_date,
        ).exclude(status=InvoiceStatus.DRAFT)
        .annotate(month=TruncMonth('invoice_date'))
        .values('month')
        .annotate(total=Coalesce(Sum('total'), ZERO, output_field=DecimalField()))
    }

    cost_by_month = {
        item['month']: float(item['total'])
        for item in CostRecord.objects.filter(
            status=CostRecordStatus.CONFIRMED, cost_date__gte=start_date,
        )
        .annotate(month=TruncMonth('cost_date'))
        .values('month')
        .annotate(total=Coalesce(Sum('amount'), ZERO, output_field=DecimalField()))
    }

    all_months = sorted(set(list(invoice_by_month.keys()) + list(cost_by_month.keys())))

    trend = []
    for m in all_months:
        revenue = invoice_by_month.get(m, 0)
        cost = cost_by_month.get(m, 0)
        profit = revenue - cost
        margin = round(profit / revenue * 100, 2) if revenue > 0 else 0
        trend.append({
            'month': m.isoformat(),
            'revenue': revenue,
            'cost': cost,
            'profit': profit,
            'margin': margin,
        })

    margins = [t['margin'] for t in trend if t['revenue'] > 0]
    avg_margin = round(sum(margins) / len(margins), 2) if margins else 0

    return {
        'trend': trend,
        'average_margin': avg_margin,
        'months': months,
    }


def get_profit_matrix() -> dict:
    """客户价值矩阵：收入规模(X) × 毛利率(Y)，气泡大小=项目数"""
    from django.db.models import DecimalField
    from django.db.models.functions import Coalesce

    ZERO = Decimal('0')
    client_groups = Contract.objects.filter(
        is_deleted=False, client_id__isnull=False,
        status__in=[ContractStatus.ACTIVE, ContractStatus.COMPLETED],
    ).values('client_id', 'client').annotate(
        total_revenue=Coalesce(Sum('amount'), ZERO, output_field=DecimalField()),
        project_count=Count('id'),
    ).order_by('-total_revenue')

    matrix = []
    for cg in client_groups:
        client_id = cg['client_id']
        revenue = float(cg['total_revenue'])
        if revenue <= 0:
            continue

        total_cost = CostRecord.objects.filter(
            protocol_id__in=Contract.objects.filter(
                client_id=client_id, is_deleted=False,
            ).values_list('protocol_id', flat=True),
            status=CostRecordStatus.CONFIRMED,
        ).aggregate(total=Coalesce(Sum('amount'), ZERO, output_field=DecimalField()))['total']

        cost = float(total_cost)
        margin = round((revenue - cost) / revenue * 100, 2)

        matrix.append({
            'client_id': client_id,
            'client': cg['client'],
            'revenue': revenue,
            'cost': cost,
            'margin': margin,
            'project_count': cg['project_count'],
        })

    if not matrix:
        return {
            'matrix': [],
            'axes': {
                'revenue_median': 0,
                'margin_median': 0,
            },
            'quadrant_labels': {
                'star': '明星客户（高收入高利润）',
                'cash_cow': '现金牛（高收入低利润）',
                'potential': '潜力客户（低收入高利润）',
                'dog': '问题客户（低收入低利润）',
            },
        }

    avg_revenue = sum(m['revenue'] for m in matrix) / len(matrix)
    avg_margin = sum(m['margin'] for m in matrix) / len(matrix)

    # Classify quadrants using average values
    for item in matrix:
        if item['revenue'] >= avg_revenue and item['margin'] >= avg_margin:
            item['quadrant'] = 'star'
        elif item['revenue'] >= avg_revenue:
            item['quadrant'] = 'cash_cow'
        elif item['margin'] >= avg_margin:
            item['quadrant'] = 'potential'
        else:
            item['quadrant'] = 'dog'

    return {
        'matrix': matrix,
        'axes': {
            'revenue_median': avg_revenue,
            'margin_median': avg_margin,
        },
        'quadrant_labels': {
            'star': '明星客户（高收入高利润）',
            'cash_cow': '现金牛（高收入低利润）',
            'potential': '潜力客户（低收入高利润）',
            'dog': '问题客户（低收入低利润）',
        },
    }


def _collect_report_data(report: FinancialReport) -> dict:
    """收集报表数据"""
    filters = Q(cost_date__gte=report.period_start, cost_date__lte=report.period_end)
    if report.protocol_id:
        filters &= Q(protocol_id=report.protocol_id)

    costs = CostRecord.objects.filter(filters, status=CostRecordStatus.CONFIRMED)
    total_cost = costs.aggregate(total=Sum('amount'))['total'] or 0

    inv_filters = Q(invoice_date__gte=report.period_start, invoice_date__lte=report.period_end)
    invoices = Invoice.objects.filter(inv_filters, is_deleted=False).exclude(status=InvoiceStatus.DRAFT)
    total_income = invoices.aggregate(total=Sum('total'))['total'] or 0

    return {
        'total_income': float(total_income),
        'total_cost': float(total_cost),
        'invoice_count': invoices.count(),
        'cost_record_count': costs.count(),
    }


def _cash_flow_by_category(qs) -> dict:
    result = {}
    for record in qs.values('category', 'flow_type').annotate(total=Sum('amount')):
        key = f'{record["category"]}_{record["flow_type"]}'
        result[key] = float(record['total'])
    return result


def _upload_report_to_feishu(report: FinancialReport):
    """上传财务报表到飞书云文档"""
    try:
        from libs.feishu_client import feishu_client
        import os
        folder = os.getenv('FEISHU_DOC_FOLDER_TOKEN', '')
        if not folder:
            return
        result = feishu_client.create_document(
            folder_token=folder, title=f'[财报] {report.report_name}',
        )
        if result:
            token = result.get('document', {}).get('document_id', '')
            if token:
                report.feishu_doc_token = token
                report.save(update_fields=['feishu_doc_token'])
    except Exception as e:
        logger.error(f'财务报表上传飞书失败: {e}')
