"""
风险分析引擎
"""
import logging
from decimal import Decimal
from datetime import date
from django.db.models import Sum, Avg, DecimalField
from django.db.models.functions import Coalesce

from apps.finance.models import (
    Contract, PaymentPlan, PaymentPlanStatus,
    ProjectBudget,
)
from apps.finance.models_settlement import CreditScore

logger = logging.getLogger(__name__)


def calculate_credit_scores() -> list:
    """计算并存储所有客户的信用评分"""
    today = date.today()

    clients = (
        Contract.objects.filter(is_deleted=False)
        .values('client_id', 'client')
        .annotate(total_amount=Sum('amount'))
        .filter(client_id__isnull=False)
        .order_by('-total_amount')
    )

    scores = []
    for client in clients:
        client_id = client['client_id']
        client_name = client['client']

        total_plans = PaymentPlan.objects.filter(client_id=client_id).count()
        on_time_plans = PaymentPlan.objects.filter(
            client_id=client_id,
            status=PaymentPlanStatus.COMPLETED,
            overdue_days=0,
        ).count()

        overdue_plans = PaymentPlan.objects.filter(
            client_id=client_id,
            status__in=[PaymentPlanStatus.OVERDUE, PaymentPlanStatus.COMPLETED],
            overdue_days__gt=0,
        )
        overdue_count = overdue_plans.count()
        avg_overdue = overdue_plans.aggregate(
            avg=Coalesce(Avg('overdue_days'), Decimal('0'), output_field=DecimalField())
        )['avg']

        on_time_rate = (on_time_plans / total_plans * 100) if total_plans > 0 else Decimal('100')

        score = 100
        if on_time_rate < 50:
            score -= 40
        elif on_time_rate < 70:
            score -= 25
        elif on_time_rate < 90:
            score -= 10

        if avg_overdue > 90:
            score -= 30
        elif avg_overdue > 60:
            score -= 20
        elif avg_overdue > 30:
            score -= 10

        if overdue_count > 5:
            score -= 15
        elif overdue_count > 2:
            score -= 5

        score = max(0, min(100, score))

        if score >= 90:
            grade = 'A'
        elif score >= 75:
            grade = 'B'
        elif score >= 60:
            grade = 'C'
        elif score >= 40:
            grade = 'D'
        else:
            grade = 'E'

        obj, _ = CreditScore.objects.update_or_create(
            client_id=client_id, score_date=today,
            defaults={
                'client_name': client_name,
                'score': score,
                'grade': grade,
                'on_time_rate': on_time_rate,
                'avg_overdue_days': avg_overdue,
                'overdue_count': overdue_count,
                'total_amount': client['total_amount'] or Decimal('0'),
                'score_detail': {
                    'total_plans': total_plans,
                    'on_time_plans': on_time_plans,
                    'overdue_count': overdue_count,
                    'avg_overdue_days': float(avg_overdue),
                },
            },
        )
        scores.append(obj)

    return scores


def get_revenue_at_risk() -> dict:
    """营收风险：逾期 + 争议金额"""
    overdue_amount = PaymentPlan.objects.filter(
        status=PaymentPlanStatus.OVERDUE,
    ).aggregate(
        total=Coalesce(Sum('remaining_amount'), Decimal('0'), output_field=DecimalField())
    )['total']

    overdue_count = PaymentPlan.objects.filter(
        status=PaymentPlanStatus.OVERDUE,
    ).count()

    severely_overdue = PaymentPlan.objects.filter(
        status=PaymentPlanStatus.OVERDUE, overdue_days__gt=90,
    ).aggregate(
        total=Coalesce(Sum('remaining_amount'), Decimal('0'), output_field=DecimalField())
    )['total']

    total_outstanding = PaymentPlan.objects.filter(
        status__in=[PaymentPlanStatus.PENDING, PaymentPlanStatus.PARTIAL, PaymentPlanStatus.OVERDUE],
    ).aggregate(
        total=Coalesce(Sum('remaining_amount'), Decimal('0'), output_field=DecimalField())
    )['total']

    risk_rate = (overdue_amount / total_outstanding * 100) if total_outstanding > 0 else Decimal('0')

    return {
        'overdue_amount': float(overdue_amount),
        'overdue_count': overdue_count,
        'severely_overdue_amount': float(severely_overdue),
        'total_outstanding': float(total_outstanding),
        'risk_rate': round(float(risk_rate), 2),
    }


def get_budget_overrun_risks() -> dict:
    """预算超支风险：已超支或即将超支的项目"""
    budgets = ProjectBudget.objects.filter(
        status__in=['executing', 'approved'],
    )

    at_risk = []
    for b in budgets:
        if b.total_cost <= 0:
            continue
        usage_rate = float(b.actual_cost / b.total_cost * 100)
        if usage_rate >= 80:
            at_risk.append({
                'budget_id': b.id,
                'budget_no': b.budget_no,
                'project_name': b.project_name,
                'protocol_id': b.protocol_id,
                'budget_cost': float(b.total_cost),
                'actual_cost': float(b.actual_cost),
                'usage_rate': round(usage_rate, 2),
                'overrun': usage_rate > 100,
            })

    at_risk.sort(key=lambda x: x['usage_rate'], reverse=True)

    return {
        'total_projects': budgets.count(),
        'at_risk_count': len(at_risk),
        'projects': at_risk,
    }


def get_risk_dashboard() -> dict:
    """风险看板汇总"""
    revenue_risk = get_revenue_at_risk()
    budget_risk = get_budget_overrun_risks()

    low_credit = CreditScore.objects.filter(
        score_date=date.today(), grade__in=['D', 'E'],
    ).count()

    total_risk_amount = revenue_risk['overdue_amount']
    overrun_projects = budget_risk['at_risk_count']

    if total_risk_amount > 1000000 or overrun_projects > 3 or low_credit > 5:
        risk_level = 'high'
    elif total_risk_amount > 500000 or overrun_projects > 1 or low_credit > 2:
        risk_level = 'medium'
    else:
        risk_level = 'low'

    return {
        'risk_level': risk_level,
        'revenue_risk': revenue_risk,
        'budget_risk': budget_risk,
        'low_credit_clients': low_credit,
    }
