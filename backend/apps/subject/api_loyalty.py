"""
忠诚度/留存 API

路由前缀：/loyalty/
"""
from ninja import Router, Schema
from typing import Optional

from apps.identity.decorators import require_permission
from .models_loyalty import SubjectLoyaltyScore, SubjectReferral, RiskLevel

router = Router()


# ============================================================================
# Schema
# ============================================================================
class ReferralCreateIn(Schema):
    referrer_id: int
    referred_id: int
    plan_id: Optional[int] = None


def _loyalty_dict(s) -> dict:
    return {
        'id': s.id, 'subject_id': s.subject_id,
        'total_score': s.total_score,
        'participation_count': s.participation_count,
        'completion_count': s.completion_count,
        'compliance_avg': str(s.compliance_avg),
        'last_activity_date': s.last_activity_date.isoformat() if s.last_activity_date else None,
        'risk_level': s.risk_level,
    }


# ============================================================================
# 忠诚度评分
# ============================================================================
@router.get('/subject/{subject_id}', summary='获取受试者忠诚度')
@require_permission('subject.subject.read')
def get_loyalty(request, subject_id: int):
    score, _ = SubjectLoyaltyScore.objects.get_or_create(subject_id=subject_id)
    return {'code': 200, 'msg': 'OK', 'data': _loyalty_dict(score)}


@router.get('/retention-risk', summary='高流失风险受试者列表')
@require_permission('subject.subject.read')
def list_retention_risk(request, risk_level: Optional[str] = None):
    qs = SubjectLoyaltyScore.objects.all().order_by('-risk_level', 'last_activity_date')
    if risk_level:
        qs = qs.filter(risk_level=risk_level)
    else:
        qs = qs.filter(risk_level__in=[RiskLevel.MEDIUM, RiskLevel.HIGH])
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_loyalty_dict(s) for s in qs[:100]],
    }}


@router.get('/ranking', summary='忠诚度排行榜')
@require_permission('subject.subject.read')
def loyalty_ranking(request, limit: int = 20):
    items = SubjectLoyaltyScore.objects.order_by('-total_score')[:limit]
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_loyalty_dict(s) for s in items],
    }}


# ============================================================================
# 推荐关系
# ============================================================================
@router.post('/referral', summary='记录推荐关系')
@require_permission('subject.subject.create')
def create_referral(request, data: ReferralCreateIn):
    ref = SubjectReferral.objects.create(
        referrer_id=data.referrer_id,
        referred_id=data.referred_id,
        plan_id=data.plan_id,
    )
    return {'code': 200, 'msg': 'OK', 'data': {'id': ref.id}}


@router.get('/referrals/{subject_id}', summary='受试者推荐列表')
@require_permission('subject.subject.read')
def list_referrals(request, subject_id: int):
    made = SubjectReferral.objects.filter(referrer_id=subject_id).values('id', 'referred_id', 'plan_id', 'status', 'create_time')
    received = SubjectReferral.objects.filter(referred_id=subject_id).values('id', 'referrer_id', 'plan_id', 'status', 'create_time')
    return {'code': 200, 'msg': 'OK', 'data': {
        'referrals_made': list(made),
        'referred_by': list(received),
    }}


# ============================================================================
# AI 脱落预测
# ============================================================================
@router.get('/dropout-prediction/{subject_id}', summary='单个受试者脱落风险')
@require_permission('subject.subject.read')
def get_dropout_prediction(request, subject_id: int):
    from .services.dropout_prediction import predict_dropout_risk
    result = predict_dropout_risk(subject_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/dropout-predictions', summary='批量脱落风险预测')
@require_permission('subject.subject.read')
def list_dropout_predictions(request, plan_id: Optional[int] = None, limit: int = 50):
    from .services.dropout_prediction import batch_predict
    results = batch_predict(plan_id=plan_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': results[:limit],
        'total': len(results),
    }}


# ============================================================================
# NPS 汇总统计（管理端）
# ============================================================================
@router.post('/dropout-intervention/{subject_id}', summary='创建挽留干预')
@require_permission('subject.subject.update')
def create_dropout_intervention(request, subject_id: int):
    """对高风险受试者创建挽留干预工单 + 飞书通知"""
    from apps.workorder.models import WorkOrder
    from .services.dropout_prediction import predict_dropout_risk
    import logging
    logger = logging.getLogger('cn_kis.loyalty')

    risk = predict_dropout_risk(subject_id)
    if risk['risk_score'] < 40:
        return {'code': 400, 'msg': '该受试者当前脱落风险较低，无需干预'}

    from .models import Subject, Enrollment
    subject = Subject.objects.filter(id=subject_id, is_deleted=False).first()
    if not subject:
        return 404, {'code': 404, 'msg': '受试者不存在'}

    enrollment = Enrollment.objects.filter(subject=subject, status='enrolled').first()
    wo = WorkOrder.objects.create(
        title=f'脱落预防干预 - {subject.name}({subject.subject_no})',
        description=f'脱落风险: {risk["risk_score"]}/100 ({risk["risk_level"]})\n'
                    f'建议: {risk["recommendation"]}\n'
                    f'主要因素: {", ".join(f["detail"] for f in risk["factors"][:3])}',
        work_type='intervention',
        priority='high' if risk['risk_score'] >= 70 else 'medium',
        enrollment_id=enrollment.id if enrollment else None,
        status='pending',
    )

    try:
        from libs.notification import _build_card_with_actions, _safe_send
        import os
        card = _build_card_with_actions(
            title='脱落预防干预工单',
            color='red' if risk['risk_score'] >= 70 else 'orange',
            fields=[
                {'name': '受试者', 'value': f'{subject.name} ({subject.subject_no})'},
                {'name': '风险分数', 'value': f'{risk["risk_score"]}/100'},
                {'name': '建议措施', 'value': risk['recommendation'][:80]},
            ],
            actions=[
                {'text': '接受干预', 'type': 'primary', 'value': {
                    'action': 'accept_workorder', 'workorder_id': str(wo.id),
                }},
            ],
            note='CN KIS 受试者留存管理',
        )
        chat_id = os.getenv('NOTIFICATION_CHAT_ID', '')
        if chat_id:
            _safe_send(chat_id, 'interactive', card)
    except Exception as e:
        logger.warning(f'干预通知发送失败: {e}')

    return {'code': 200, 'msg': '干预工单已创建', 'data': {
        'workorder_id': wo.id,
        'risk_score': risk['risk_score'],
        'risk_level': risk['risk_level'],
    }}


@router.get('/nps-stats', summary='NPS 统计')
@require_permission('subject.subject.read')
def nps_stats(request, plan_id: Optional[int] = None):
    from .models_loyalty import SubjectNPS
    from django.db.models import Avg
    qs = SubjectNPS.objects.all()
    if plan_id:
        qs = qs.filter(plan_id=plan_id)
    total = qs.count()
    if total == 0:
        return {'code': 200, 'msg': 'OK', 'data': {
            'total': 0, 'avg_score': 0, 'nps_value': 0,
            'promoters': 0, 'passives': 0, 'detractors': 0,
        }}
    avg_score = qs.aggregate(avg=Avg('score'))['avg'] or 0
    promoters = qs.filter(score__gte=9).count()
    detractors = qs.filter(score__lte=6).count()
    passives = total - promoters - detractors
    nps_value = round((promoters - detractors) / total * 100, 1)
    return {'code': 200, 'msg': 'OK', 'data': {
        'total': total,
        'avg_score': round(avg_score, 1),
        'nps_value': nps_value,
        'promoters': promoters,
        'passives': passives,
        'detractors': detractors,
    }}
