"""
趋势分析服务 (A1)

提供入组趋势、工单趋势、偏差趋势、营收趋势及完成日期预测。
"""
import logging
from datetime import date, timedelta
from typing import Dict, Any, Optional

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth, Coalesce

logger = logging.getLogger(__name__)


def get_enrollment_trend(protocol_id: int, days: int = 90) -> Dict[str, Any]:
    """
    入组趋势曲线（计划 vs 实际 vs 预测）

    返回:
        plan: [{date, count}]    计划入组曲线（线性分布）
        actual: [{date, count}]  实际入组曲线（累计）
        predicted: [{date, count}] 预测曲线（基于近期速率）
        summary: {enrolled, sample_size, enrollment_rate, predicted_completion_date}
    """
    from apps.protocol.models import Protocol
    from apps.subject.models import Enrollment

    try:
        protocol = Protocol.objects.get(id=protocol_id, is_deleted=False)
    except Protocol.DoesNotExist:
        return {'plan': [], 'actual': [], 'predicted': [], 'summary': {}}

    sample_size = protocol.sample_size or 0
    today = date.today()
    start_date = today - timedelta(days=days)

    # Actual enrollment trend (cumulative by date)
    enrollments = Enrollment.objects.filter(
        protocol_id=protocol_id,
        status='enrolled',
    ).order_by('create_time')

    daily_counts = (
        Enrollment.objects.filter(
            protocol_id=protocol_id,
            status='enrolled',
            create_time__date__gte=start_date,
        )
        .annotate(day=TruncDate('create_time'))
        .values('day')
        .annotate(count=Count('id'))
        .order_by('day')
    )

    # Build cumulative actual curve
    pre_count = Enrollment.objects.filter(
        protocol_id=protocol_id,
        status='enrolled',
        create_time__date__lt=start_date,
    ).count()

    actual = []
    cumulative = pre_count
    daily_map = {item['day']: item['count'] for item in daily_counts}

    current = start_date
    while current <= today:
        cumulative += daily_map.get(current, 0)
        actual.append({'date': current.isoformat(), 'count': cumulative})
        current += timedelta(days=1)

    total_enrolled = cumulative

    # Plan curve (linear from 0 to sample_size over protocol duration)
    plan = []
    if sample_size > 0:
        protocol_start = protocol.create_time.date() if protocol.create_time else start_date
        plan_duration = max((today - protocol_start).days, 1)
        for point in actual:
            d = date.fromisoformat(point['date'])
            elapsed = max((d - protocol_start).days, 0)
            planned = min(round(sample_size * elapsed / plan_duration), sample_size)
            plan.append({'date': point['date'], 'count': planned})

    # Predicted curve (linear extrapolation from last 30 days)
    predicted = []
    predicted_completion = None
    if sample_size > 0 and total_enrolled < sample_size:
        recent_start = today - timedelta(days=30)
        recent_enrolled = Enrollment.objects.filter(
            protocol_id=protocol_id,
            status='enrolled',
            create_time__date__gte=recent_start,
        ).count()

        daily_rate = recent_enrolled / 30.0 if recent_enrolled > 0 else 0
        if daily_rate > 0:
            remaining = sample_size - total_enrolled
            days_to_complete = int(remaining / daily_rate)
            predicted_completion = (today + timedelta(days=days_to_complete)).isoformat()

            # Generate prediction points for the next 60 days or until complete
            pred_days = min(days_to_complete, 60)
            for i in range(1, pred_days + 1):
                pred_date = today + timedelta(days=i)
                pred_count = min(total_enrolled + int(daily_rate * i), sample_size)
                predicted.append({'date': pred_date.isoformat(), 'count': pred_count})

    enrollment_rate = round(total_enrolled / sample_size * 100, 1) if sample_size > 0 else 0

    return {
        'plan': plan,
        'actual': actual,
        'predicted': predicted,
        'summary': {
            'enrolled': total_enrolled,
            'sample_size': sample_size,
            'enrollment_rate': enrollment_rate,
            'predicted_completion_date': predicted_completion,
        },
    }


def get_workorder_trend(protocol_id: Optional[int] = None, days: int = 30,
                        granularity: str = 'day') -> Dict[str, Any]:
    """
    工单完成趋势（每日/每周/每月新增、完成、积压）

    granularity: 'day' | 'week' | 'month'
    """
    from apps.workorder.models import WorkOrder

    today = date.today()
    start_date = today - timedelta(days=days)

    base_qs = WorkOrder.objects.filter(is_deleted=False)
    if protocol_id:
        base_qs = base_qs.filter(enrollment__protocol_id=protocol_id)

    trunc_fn = {'day': TruncDate, 'week': TruncWeek, 'month': TruncMonth}.get(
        granularity, TruncDate
    )

    # New work orders per period
    created = (
        base_qs.filter(create_time__date__gte=start_date)
        .annotate(period=trunc_fn('create_time'))
        .values('period')
        .annotate(count=Count('id'))
        .order_by('period')
    )

    # Completed work orders per period
    completed = (
        base_qs.filter(
            completed_at__date__gte=start_date,
            status__in=['completed', 'approved'],
        )
        .annotate(period=trunc_fn('completed_at'))
        .values('period')
        .annotate(count=Count('id'))
        .order_by('period')
    )

    created_map = {item['period'].isoformat() if item['period'] else '': item['count'] for item in created}
    completed_map = {item['period'].isoformat() if item['period'] else '': item['count'] for item in completed}

    # Build combined series
    all_dates = sorted(set(list(created_map.keys()) + list(completed_map.keys())))
    series = []
    backlog = base_qs.filter(
        create_time__date__lt=start_date,
    ).exclude(status__in=['completed', 'approved', 'cancelled']).count()

    for d in all_dates:
        if not d:
            continue
        new = created_map.get(d, 0)
        done = completed_map.get(d, 0)
        backlog = backlog + new - done
        series.append({
            'date': d,
            'created': new,
            'completed': done,
            'backlog': max(backlog, 0),
        })

    return {
        'series': series,
        'granularity': granularity,
        'total_created': sum(item['created'] for item in series),
        'total_completed': sum(item['completed'] for item in series),
        'current_backlog': series[-1]['backlog'] if series else 0,
    }


def get_deviation_trend(days: int = 90) -> Dict[str, Any]:
    """偏差趋势（按月统计，含严重度分布）"""
    from apps.quality.models import Deviation

    start_date = date.today() - timedelta(days=days)

    deviations = (
        Deviation.objects.filter(reported_at__gte=start_date)
        .annotate(month=TruncMonth('reported_at'))
        .values('month', 'severity')
        .annotate(count=Count('id'))
        .order_by('month', 'severity')
    )

    # Group by month
    monthly = {}
    for item in deviations:
        m = item['month'].isoformat()[:7] if item['month'] else ''
        if m not in monthly:
            monthly[m] = {'month': m, 'critical': 0, 'major': 0, 'minor': 0, 'total': 0}
        severity = item['severity']
        if severity in monthly[m]:
            monthly[m][severity] = item['count']
        monthly[m]['total'] += item['count']

    return {
        'series': sorted(monthly.values(), key=lambda x: x['month']),
    }


def get_revenue_trend(days: int = 180) -> Dict[str, Any]:
    """营收趋势（按月：合同额、回款额、应收余额）"""
    from apps.finance.models import Contract, Payment

    start_date = date.today() - timedelta(days=days)

    # Contract amounts by month
    contracts = (
        Contract.objects.filter(
            create_time__date__gte=start_date,
        )
        .annotate(month=TruncMonth('create_time'))
        .values('month')
        .annotate(total=Coalesce(Sum('amount'), 0))
        .order_by('month')
    )

    # Payments by month
    payments = (
        Payment.objects.filter(
            create_time__date__gte=start_date,
        )
        .annotate(month=TruncMonth('create_time'))
        .values('month')
        .annotate(total=Coalesce(Sum('actual_amount'), 0))
        .order_by('month')
    )

    contract_map = {
        item['month'].isoformat()[:7]: float(item['total'])
        for item in contracts if item['month']
    }
    payment_map = {
        item['month'].isoformat()[:7]: float(item['total'])
        for item in payments if item['month']
    }

    all_months = sorted(set(list(contract_map.keys()) + list(payment_map.keys())))
    series = []
    cumulative_receivable = 0
    for m in all_months:
        contracted = contract_map.get(m, 0)
        received = payment_map.get(m, 0)
        cumulative_receivable += contracted - received
        series.append({
            'month': m,
            'contracted': contracted,
            'received': received,
            'receivable': max(cumulative_receivable, 0),
        })

    return {'series': series}


def predict_completion_date(protocol_id: int) -> Dict[str, Any]:
    """基于当前入组速率预测项目完成时间"""
    from apps.protocol.models import Protocol
    from apps.subject.models import Enrollment

    try:
        protocol = Protocol.objects.get(id=protocol_id, is_deleted=False)
    except Protocol.DoesNotExist:
        return {'predicted_date': None, 'confidence': 0, 'message': '协议不存在'}

    sample_size = protocol.sample_size or 0
    if sample_size == 0:
        return {'predicted_date': None, 'confidence': 0, 'message': '未设置样本量'}

    enrolled = Enrollment.objects.filter(
        protocol_id=protocol_id, status='enrolled',
    ).count()

    if enrolled >= sample_size:
        return {
            'predicted_date': date.today().isoformat(),
            'confidence': 100,
            'message': '入组已完成',
        }

    # Calculate rates over different periods
    today = date.today()
    rates = {}
    for period_days, label in [(7, '7d'), (14, '14d'), (30, '30d')]:
        period_start = today - timedelta(days=period_days)
        count = Enrollment.objects.filter(
            protocol_id=protocol_id,
            status='enrolled',
            create_time__date__gte=period_start,
        ).count()
        rates[label] = count / period_days if count > 0 else 0

    # Use weighted average (more weight to recent data)
    weighted_rate = (rates['7d'] * 3 + rates['14d'] * 2 + rates['30d'] * 1) / 6
    if weighted_rate <= 0:
        return {'predicted_date': None, 'confidence': 0, 'message': '近期无入组数据'}

    remaining = sample_size - enrolled
    days_needed = int(remaining / weighted_rate)
    predicted = today + timedelta(days=days_needed)

    # Confidence based on data consistency
    if rates['7d'] > 0 and rates['30d'] > 0:
        consistency = min(rates['7d'], rates['30d']) / max(rates['7d'], rates['30d'])
        confidence = round(consistency * 100)
    else:
        confidence = 20

    return {
        'predicted_date': predicted.isoformat(),
        'confidence': confidence,
        'days_remaining': days_needed,
        'daily_rate': round(weighted_rate, 2),
        'message': f'预计 {days_needed} 天后完成入组',
    }


def get_all_trends(protocol_id: Optional[int] = None,
                   granularity: str = 'day') -> Dict[str, Any]:
    """聚合所有趋势数据"""
    result = {}

    if protocol_id:
        result['enrollment'] = get_enrollment_trend(protocol_id)
        result['prediction'] = predict_completion_date(protocol_id)

    result['workorder'] = get_workorder_trend(protocol_id, granularity=granularity)

    try:
        result['deviation'] = get_deviation_trend()
    except Exception as e:
        logger.warning(f'偏差趋势获取失败: {e}')
        result['deviation'] = {'series': []}

    try:
        result['revenue'] = get_revenue_trend()
    except Exception as e:
        logger.warning(f'营收趋势获取失败: {e}')
        result['revenue'] = {'series': []}

    return result
