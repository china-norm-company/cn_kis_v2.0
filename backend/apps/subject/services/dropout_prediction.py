"""
AI 脱落预测服务

基于多维度特征计算受试者脱落风险分数：
- 依从性分数（ComplianceRecord）
- 访视出勤率（SubjectCheckin）
- 问卷完成率（QuestionnaireResponse）
- 不良反应严重程度（AdverseEvent）
- 日记填写频率（SubjectDiary）
- 活跃度（最近登录/操作时间）
"""
import logging
from datetime import timedelta

from django.utils import timezone

logger = logging.getLogger(__name__)


def predict_dropout_risk(subject_id: int) -> dict:
    """
    计算单个受试者的脱落风险。

    Returns:
        {
            'subject_id': int,
            'risk_score': float (0-100, 越高越危险),
            'risk_level': 'low' | 'medium' | 'high',
            'factors': [{'name': str, 'score': float, 'detail': str}],
            'recommendation': str,
        }
    """
    factors = []
    weights = {
        'compliance': 0.30,
        'attendance': 0.25,
        'questionnaire': 0.15,
        'ae_severity': 0.15,
        'diary': 0.10,
        'activity': 0.05,
    }

    compliance_score = _eval_compliance(subject_id)
    factors.append(compliance_score)

    attendance_score = _eval_attendance(subject_id)
    factors.append(attendance_score)

    questionnaire_score = _eval_questionnaire(subject_id)
    factors.append(questionnaire_score)

    ae_score = _eval_adverse_events(subject_id)
    factors.append(ae_score)

    diary_score = _eval_diary(subject_id)
    factors.append(diary_score)

    activity_score = _eval_activity(subject_id)
    factors.append(activity_score)

    weighted_risk = sum(
        f['score'] * weights.get(f['name'], 0.1)
        for f in factors
    )
    risk_score = min(100, max(0, weighted_risk))

    if risk_score >= 70:
        risk_level = 'high'
        recommendation = '建议立即安排项目经理一对一关怀访谈，排查脱落原因'
    elif risk_score >= 40:
        risk_level = 'medium'
        recommendation = '建议加强随访频率，通过微信/短信提醒并关注依从性'
    else:
        risk_level = 'low'
        recommendation = '维持当前管理节奏，定期监测即可'

    return {
        'subject_id': subject_id,
        'risk_score': round(risk_score, 1),
        'risk_level': risk_level,
        'factors': factors,
        'recommendation': recommendation,
    }


def batch_predict(enrollment_ids: list = None, plan_id: int = None) -> list:
    """批量预测脱落风险"""
    from ..models import Subject
    qs = Subject.objects.filter(is_deleted=False, status='active')
    if plan_id:
        from ..models_recruitment import EnrollmentRecord
        subject_ids = EnrollmentRecord.objects.filter(
            plan_id=plan_id, status='enrolled',
        ).values_list('subject_id', flat=True)
        qs = qs.filter(id__in=subject_ids)

    results = []
    for subj in qs[:200]:
        try:
            result = predict_dropout_risk(subj.id)
            results.append(result)
        except Exception as e:
            logger.warning(f'脱落预测失败 subject_id={subj.id}: {e}')
    results.sort(key=lambda r: r['risk_score'], reverse=True)
    return results


def _eval_compliance(subject_id: int) -> dict:
    """依从性评估"""
    try:
        from ..models_execution import ComplianceRecord
        records = ComplianceRecord.objects.filter(
            subject_id=subject_id, is_deleted=False,
        ).order_by('-check_date')[:10]
        if not records:
            return {'name': 'compliance', 'score': 30, 'detail': '无依从性记录'}
        avg = sum(r.score for r in records if r.score) / len(records)
        risk = max(0, 100 - avg)
        return {'name': 'compliance', 'score': risk, 'detail': f'近期平均依从性 {avg:.0f}%'}
    except Exception:
        return {'name': 'compliance', 'score': 30, 'detail': '评估异常'}


def _eval_attendance(subject_id: int) -> dict:
    """出勤率评估"""
    try:
        from ..models_execution import SubjectCheckin
        last_30 = timezone.now() - timedelta(days=30)
        total = SubjectCheckin.objects.filter(
            subject_id=subject_id, checkin_date__gte=last_30.date(),
        ).count()
        attended = SubjectCheckin.objects.filter(
            subject_id=subject_id, checkin_date__gte=last_30.date(),
            status__in=['checked_out', 'in_progress'],
        ).count()
        if total == 0:
            return {'name': 'attendance', 'score': 50, 'detail': '近30天无排程'}
        rate = attended / total * 100
        risk = max(0, 100 - rate)
        return {'name': 'attendance', 'score': risk, 'detail': f'出勤率 {rate:.0f}% ({attended}/{total})'}
    except Exception:
        return {'name': 'attendance', 'score': 30, 'detail': '评估异常'}


def _eval_questionnaire(subject_id: int) -> dict:
    """问卷完成率评估"""
    try:
        from ..models_execution import QuestionnaireResponse
        total = QuestionnaireResponse.objects.filter(
            subject_id=subject_id, is_deleted=False,
        ).count()
        completed = QuestionnaireResponse.objects.filter(
            subject_id=subject_id, is_deleted=False, status='completed',
        ).count()
        if total == 0:
            return {'name': 'questionnaire', 'score': 20, 'detail': '无问卷任务'}
        rate = completed / total * 100
        risk = max(0, 100 - rate)
        return {'name': 'questionnaire', 'score': risk, 'detail': f'问卷完成率 {rate:.0f}%'}
    except Exception:
        return {'name': 'questionnaire', 'score': 20, 'detail': '评估异常'}


def _eval_adverse_events(subject_id: int) -> dict:
    """不良反应评估"""
    try:
        from apps.safety.models import AdverseEvent
        aes = AdverseEvent.objects.filter(
            subject_id=subject_id, is_deleted=False,
        )
        total = aes.count()
        if total == 0:
            return {'name': 'ae_severity', 'score': 0, 'detail': '无不良反应'}
        severe = aes.filter(severity__in=['severe', 'life_threatening', 'death']).count()
        moderate = aes.filter(severity='moderate').count()
        risk = min(100, severe * 40 + moderate * 15 + total * 5)
        return {'name': 'ae_severity', 'score': risk, 'detail': f'AE总数 {total}, 严重 {severe}'}
    except Exception:
        return {'name': 'ae_severity', 'score': 0, 'detail': '评估异常'}


def _eval_diary(subject_id: int) -> dict:
    """日记填写评估"""
    try:
        from ..models_loyalty import SubjectDiary
        last_14 = timezone.now().date() - timedelta(days=14)
        filled_days = SubjectDiary.objects.filter(
            subject_id=subject_id, is_deleted=False,
            entry_date__gte=last_14,
        ).count()
        rate = filled_days / 14 * 100
        risk = max(0, 100 - rate)
        return {'name': 'diary', 'score': risk, 'detail': f'近14天日记 {filled_days}/14 天'}
    except Exception:
        return {'name': 'diary', 'score': 30, 'detail': '评估异常'}


def _eval_activity(subject_id: int) -> dict:
    """活跃度评估"""
    try:
        from ..models import Subject
        subj = Subject.objects.filter(id=subject_id).first()
        if not subj:
            return {'name': 'activity', 'score': 50, 'detail': '受试者不存在'}
        last_active = getattr(subj, 'update_time', None)
        if not last_active:
            return {'name': 'activity', 'score': 50, 'detail': '无活跃记录'}
        days_inactive = (timezone.now() - last_active).days
        if days_inactive > 30:
            return {'name': 'activity', 'score': 80, 'detail': f'已 {days_inactive} 天未活跃'}
        elif days_inactive > 14:
            return {'name': 'activity', 'score': 50, 'detail': f'{days_inactive} 天未活跃'}
        else:
            return {'name': 'activity', 'score': 10, 'detail': f'最近 {days_inactive} 天内活跃'}
    except Exception:
        return {'name': 'activity', 'score': 30, 'detail': '评估异常'}
