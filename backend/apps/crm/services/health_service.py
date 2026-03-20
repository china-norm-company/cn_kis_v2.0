"""
客户健康度计算与预警服务

六维评分体系：
- 互动(20%): 关键人联系频率、沟通记录密度
- 收入(25%): 合同金额同比/环比、回款率
- 满意度(20%): 满意度调查均值、工单解决率
- 增长(15%): 项目数量趋势、品类渗透率
- 忠诚度(10%): 复购率、合作年限
- 创新(10%): 联合创新项目数
"""
import logging
from datetime import date, timedelta
from typing import Optional

from django.db.models import Avg, Count, Sum, Q
from django.db.models.functions import Coalesce

from apps.crm.models import (
    Client, ClientContact, ClientHealthScore, ClientAlert,
    ClientProductLine, InnovationCalendar,
    SatisfactionSurvey, Ticket,
    AlertType, AlertSeverity, ChurnRisk,
)

logger = logging.getLogger(__name__)


def calculate_health_score(client_id: int) -> Optional[ClientHealthScore]:
    """计算单个客户的六维健康度评分"""
    try:
        client = Client.objects.get(id=client_id, is_deleted=False)
    except Client.DoesNotExist:
        return None

    today = date.today()
    details = {}

    # 1. 互动评分 (权重20%)
    engagement = _calc_engagement(client_id, today)
    details['engagement'] = engagement

    # 2. 收入评分 (权重25%)
    revenue = _calc_revenue(client_id)
    details['revenue'] = revenue

    # 3. 满意度评分 (权重20%)
    satisfaction = _calc_satisfaction(client_id)
    details['satisfaction'] = satisfaction

    # 4. 增长评分 (权重15%)
    growth = _calc_growth(client_id)
    details['growth'] = growth

    # 5. 忠诚度评分 (权重10%)
    loyalty = _calc_loyalty(client, today)
    details['loyalty'] = loyalty

    # 6. 创新评分 (权重10%)
    innovation = _calc_innovation(client_id)
    details['innovation'] = innovation

    overall = int(
        engagement['score'] * 0.20
        + revenue['score'] * 0.25
        + satisfaction['score'] * 0.20
        + growth['score'] * 0.15
        + loyalty['score'] * 0.10
        + innovation['score'] * 0.10
    )

    churn_risk = ChurnRisk.LOW
    risk_factors = []
    recommended_actions = []

    if overall < 40:
        churn_risk = ChurnRisk.CRITICAL
        risk_factors.append('综合评分极低')
        recommended_actions.append('立即安排高层拜访')
    elif overall < 60:
        churn_risk = ChurnRisk.HIGH
        risk_factors.append('综合评分偏低')
        recommended_actions.append('制定客户挽留计划')
    elif overall < 75:
        churn_risk = ChurnRisk.MEDIUM

    if engagement['score'] < 50:
        risk_factors.append('互动频率不足')
        recommended_actions.append('增加联系频率，主动发起技术交流')
    if revenue['score'] < 50:
        risk_factors.append('收入贡献下降')
        recommended_actions.append('分析收入下降原因，寻找追加机会')
    if satisfaction['score'] < 50:
        risk_factors.append('满意度偏低')
        recommended_actions.append('进行深度满意度访谈')

    score = ClientHealthScore.objects.create(
        client=client,
        score_date=today,
        overall_score=overall,
        engagement_score=engagement['score'],
        revenue_score=revenue['score'],
        satisfaction_score=satisfaction['score'],
        growth_score=growth['score'],
        loyalty_score=loyalty['score'],
        innovation_score=innovation['score'],
        churn_risk=churn_risk,
        risk_factors=risk_factors,
        recommended_actions=recommended_actions,
        calculation_details=details,
    )

    check_and_create_alerts(client, score)
    return score


def calculate_all_health_scores():
    """批量计算所有活跃客户的健康度（定时任务调用）"""
    clients = Client.objects.filter(is_deleted=False).exclude(
        level='potential',
    )
    results = []
    for client in clients:
        try:
            score = calculate_health_score(client.id)
            if score:
                results.append(score)
        except Exception as e:
            logger.error(f'健康度计算失败 client#{client.id}: {e}')
    return results


def get_health_overview() -> dict:
    """全局健康度总览"""
    from django.db.models import Max, Subquery, OuterRef

    clients = Client.objects.filter(is_deleted=False)
    latest_scores = []
    for client in clients:
        score = ClientHealthScore.objects.filter(
            client=client,
        ).order_by('-score_date').first()
        if score:
            latest_scores.append(score)

    if not latest_scores:
        return {'total_clients': clients.count(), 'scored_clients': 0, 'distribution': {}}

    risk_dist = {}
    tier_scores = {}
    for s in latest_scores:
        risk_dist[s.churn_risk] = risk_dist.get(s.churn_risk, 0) + 1
        tier = s.client.partnership_tier
        if tier not in tier_scores:
            tier_scores[tier] = []
        tier_scores[tier].append(s.overall_score)

    tier_avg = {
        tier: round(sum(scores) / len(scores), 1)
        for tier, scores in tier_scores.items()
    }

    return {
        'total_clients': clients.count(),
        'scored_clients': len(latest_scores),
        'avg_score': round(sum(s.overall_score for s in latest_scores) / len(latest_scores), 1),
        'risk_distribution': risk_dist,
        'tier_avg_scores': tier_avg,
    }


def check_and_create_alerts(client: Client, score: ClientHealthScore):
    """基于健康度评分自动创建预警"""
    if score.churn_risk in (ChurnRisk.HIGH, ChurnRisk.CRITICAL):
        existing = ClientAlert.objects.filter(
            client=client, alert_type=AlertType.CHURN_RISK, resolved=False,
        ).exists()
        if not existing:
            ClientAlert.objects.create(
                client=client,
                alert_type=AlertType.CHURN_RISK,
                severity=AlertSeverity.CRITICAL if score.churn_risk == ChurnRisk.CRITICAL else AlertSeverity.WARNING,
                description=f'客户 {client.name} 流失风险等级: {score.get_churn_risk_display()}，综合评分 {score.overall_score}',
                suggested_action='、'.join(score.recommended_actions[:3]),
            )

    if score.engagement_score < 40:
        existing = ClientAlert.objects.filter(
            client=client, alert_type=AlertType.CONTACT_GAP, resolved=False,
        ).exists()
        if not existing:
            ClientAlert.objects.create(
                client=client,
                alert_type=AlertType.CONTACT_GAP,
                severity=AlertSeverity.WARNING,
                description=f'客户 {client.name} 互动评分仅 {score.engagement_score}，存在联系中断风险',
                suggested_action='安排关键人回访，恢复沟通节奏',
            )

    if score.revenue_score < 40:
        existing = ClientAlert.objects.filter(
            client=client, alert_type=AlertType.REVENUE_DECLINE, resolved=False,
        ).exists()
        if not existing:
            ClientAlert.objects.create(
                client=client,
                alert_type=AlertType.REVENUE_DECLINE,
                severity=AlertSeverity.WARNING,
                description=f'客户 {client.name} 收入评分仅 {score.revenue_score}，收入贡献可能下降',
                suggested_action='分析项目管道，识别收入恢复机会',
            )


# ============================================================================
# 内部维度计算函数
# ============================================================================
def _calc_engagement(client_id: int, today: date) -> dict:
    contacts = ClientContact.objects.filter(client_id=client_id, is_deleted=False)
    total = contacts.count()
    if total == 0:
        return {'score': 30, 'reason': '无关键联系人'}

    overdue_count = 0
    for c in contacts:
        if c.last_contact_date is None:
            overdue_count += 1
        elif (today - c.last_contact_date).days > c.contact_frequency_days:
            overdue_count += 1

    ratio = 1 - (overdue_count / total) if total > 0 else 0
    score = int(ratio * 100)
    return {'score': min(score, 100), 'total_contacts': total, 'overdue': overdue_count}


def _calc_revenue(client_id: int) -> dict:
    try:
        from apps.protocol.models import Protocol
        from apps.finance.models import Contract
        from django.db.models.functions import Coalesce

        protocol_ids = list(
            Protocol.objects.filter(sponsor_id=client_id, is_deleted=False)
            .values_list('id', flat=True)
        )
        total_amount = Contract.objects.filter(
            protocol_id__in=protocol_ids,
        ).aggregate(total=Coalesce(Sum('amount'), 0))['total']

        score = min(int(float(total_amount) / 10000), 100) if total_amount else 30
        return {'score': score, 'total_contract_amount': float(total_amount)}
    except Exception:
        return {'score': 50, 'reason': '收入数据暂不可用'}


def _calc_satisfaction(client_id: int) -> dict:
    surveys = SatisfactionSurvey.objects.filter(client_id=client_id, is_deleted=False)
    if not surveys.exists():
        return {'score': 60, 'reason': '无满意度数据'}
    avg = surveys.aggregate(avg=Avg('overall_satisfaction'))['avg'] or 0
    score = int(avg * 10)
    return {'score': min(score, 100), 'avg_satisfaction': round(avg, 1)}


def _calc_growth(client_id: int) -> dict:
    try:
        from apps.protocol.models import Protocol
        total_projects = Protocol.objects.filter(
            sponsor_id=client_id, is_deleted=False,
        ).count()

        product_lines = ClientProductLine.objects.filter(
            client_id=client_id, is_deleted=False,
        ).count()

        score = min(total_projects * 10 + product_lines * 5, 100)
        return {'score': score, 'total_projects': total_projects, 'product_lines': product_lines}
    except Exception:
        return {'score': 50, 'reason': '增长数据暂不可用'}


def _calc_loyalty(client: Client, today: date) -> dict:
    if client.partnership_start_date:
        years = (today - client.partnership_start_date).days / 365
        score = min(int(years * 20), 100)
        return {'score': score, 'years': round(years, 1)}
    return {'score': 40, 'reason': '合作起始日期未设置'}


def _calc_innovation(client_id: int) -> dict:
    innovations = InnovationCalendar.objects.filter(
        client_id=client_id, is_deleted=False,
        status__in=['engaged', 'project_created'],
    ).count()
    score = min(innovations * 25, 100)
    return {'score': score, 'engaged_innovations': innovations}
