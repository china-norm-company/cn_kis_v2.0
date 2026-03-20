"""
招募管理服务

覆盖：招募计划 CRUD、渠道管理、广告管理、报名管理、筛选、入组、进度追踪、问题管理、策略管理。
"""
import logging
from typing import Optional
from django.utils import timezone
from django.db import models, transaction

from ..models_recruitment import (
    RecruitmentPlan, RecruitmentPlanStatus,
    EligibilityCriteria,
    RecruitmentChannel,
    RecruitmentBudget,
    RecruitmentAd, AdStatus,
    SubjectRegistration, RegistrationStatus,
    ScreeningRecord, ScreeningResult,
    EnrollmentRecord, EnrollmentRecordStatus,
    RecruitmentProgress,
    RecruitmentIssue, IssueStatus,
    RecruitmentStrategy, StrategyStatus,
    ContactRecord,
)

from .recruitment_notify import (
    notify_new_registration,
    notify_screening_result,
    notify_enrollment_confirmed,
    notify_withdrawal,
    trigger_recruitment_event,
)

logger = logging.getLogger(__name__)

PLAN_VALID_TRANSITIONS = {
    'draft': ['approved', 'cancelled'],
    'approved': ['active', 'cancelled'],
    'active': ['paused', 'completed', 'cancelled'],
    'paused': ['active', 'cancelled'],
}


def _generate_plan_no() -> str:
    """生成招募计划编号 REC-YYYYMM-NNNN"""
    now = timezone.now()
    prefix = f'REC-{now.strftime("%Y%m")}-'
    last = (
        RecruitmentPlan.objects.filter(plan_no__startswith=prefix)
        .order_by('-plan_no').values_list('plan_no', flat=True).first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


def _generate_registration_no() -> str:
    """生成报名编号 REG-YYYYMM-NNNNNN"""
    now = timezone.now()
    prefix = f'REG-{now.strftime("%Y%m")}-'
    last = (
        SubjectRegistration.objects.filter(registration_no__startswith=prefix)
        .order_by('-registration_no').values_list('registration_no', flat=True).first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:06d}'


def _generate_screening_no() -> str:
    now = timezone.now()
    prefix = f'SCR-{now.strftime("%Y%m")}-'
    last = (
        ScreeningRecord.objects.filter(screening_no__startswith=prefix)
        .order_by('-screening_no').values_list('screening_no', flat=True).first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:06d}'


def _generate_enrollment_record_no() -> str:
    now = timezone.now()
    prefix = f'ENR-{now.strftime("%Y%m")}-'
    last = (
        EnrollmentRecord.objects.filter(enrollment_no__startswith=prefix)
        .order_by('-enrollment_no').values_list('enrollment_no', flat=True).first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:06d}'


# ============================================================================
# 招募计划
# ============================================================================
def create_plan(protocol_id: int, title: str, target_count: int,
                start_date, end_date, description: str = '', account=None) -> RecruitmentPlan:
    kw = dict(
        plan_no=_generate_plan_no(), protocol_id=protocol_id,
        title=title, description=description,
        target_count=target_count, start_date=start_date, end_date=end_date,
    )
    if account:
        kw['created_by_id'] = account.id
        kw['manager_id'] = account.id
    return RecruitmentPlan.objects.create(**kw)


def list_plans(protocol_id: int = None, status: str = None,
               page: int = 1, page_size: int = 20) -> dict:
    qs = RecruitmentPlan.objects.all()
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if status:
        qs = qs.filter(status=status)
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    return {'items': list(qs[offset:offset + page_size]), 'total': total, 'page': page, 'page_size': page_size}


def get_plan(plan_id: int) -> Optional[RecruitmentPlan]:
    return RecruitmentPlan.objects.filter(id=plan_id).first()


def update_plan(plan_id: int, **kwargs) -> Optional[RecruitmentPlan]:
    plan = get_plan(plan_id)
    if not plan:
        return None
    allowed = {'title', 'description', 'target_count', 'start_date', 'end_date', 'notes', 'manager_id'}
    for k, v in kwargs.items():
        if v is not None and k in allowed:
            setattr(plan, k, v)
    plan.save()
    return plan


def transition_plan_status(plan_id: int, new_status: str) -> Optional[RecruitmentPlan]:
    plan = get_plan(plan_id)
    if not plan:
        return None
    valid = PLAN_VALID_TRANSITIONS.get(plan.status, [])
    if new_status not in valid:
        raise ValueError(f'不允许从 {plan.status} 转换到 {new_status}')
    plan.status = new_status
    plan.save(update_fields=['status', 'update_time'])
    return plan


# ============================================================================
# 入排标准
# ============================================================================
def create_criteria(plan_id: int, criteria_type: str, description: str,
                    sequence: int = 1, is_mandatory: bool = True) -> EligibilityCriteria:
    return EligibilityCriteria.objects.create(
        plan_id=plan_id, criteria_type=criteria_type,
        description=description, sequence=sequence, is_mandatory=is_mandatory,
    )


def list_criteria(plan_id: int) -> list:
    return list(EligibilityCriteria.objects.filter(plan_id=plan_id).order_by('criteria_type', 'sequence'))


# ============================================================================
# 渠道
# ============================================================================
def create_channel(plan_id: int, channel_type: str, name: str, **kwargs) -> RecruitmentChannel:
    return RecruitmentChannel.objects.create(plan_id=plan_id, channel_type=channel_type, name=name, **kwargs)


def list_channels(plan_id: int) -> list:
    return list(RecruitmentChannel.objects.filter(plan_id=plan_id))


def evaluate_channel(channel_id: int) -> dict:
    ch = RecruitmentChannel.objects.filter(id=channel_id).first()
    if not ch:
        return {}
    conversion = round(ch.enrolled_count / ch.registered_count * 100, 2) if ch.registered_count > 0 else 0
    cost_per = round(float(ch.cost) / ch.enrolled_count, 2) if ch.enrolled_count > 0 else 0
    return {'channel_id': ch.id, 'name': ch.name, 'conversion_rate': conversion, 'cost_per_enrollment': cost_per}


# ============================================================================
# 预算
# ============================================================================
def create_budget(plan_id: int, category: str, budgeted_amount, **kwargs) -> RecruitmentBudget:
    return RecruitmentBudget.objects.create(plan_id=plan_id, category=category, budgeted_amount=budgeted_amount, **kwargs)


def list_budgets(plan_id: int) -> list:
    return list(RecruitmentBudget.objects.filter(plan_id=plan_id))


# ============================================================================
# 广告
# ============================================================================
def create_ad(plan_id: int, ad_type: str, title: str, content: str = '', account=None) -> RecruitmentAd:
    kw = dict(plan_id=plan_id, ad_type=ad_type, title=title, content=content)
    if account:
        kw['created_by_id'] = account.id
    return RecruitmentAd.objects.create(**kw)


def publish_ad(ad_id: int) -> Optional[RecruitmentAd]:
    ad = RecruitmentAd.objects.filter(id=ad_id).first()
    if not ad or ad.status not in (AdStatus.DRAFT, AdStatus.APPROVED):
        return None
    ad.status = AdStatus.PUBLISHED
    ad.published_at = timezone.now()
    ad.save(update_fields=['status', 'published_at', 'update_time'])
    return ad


# ============================================================================
# 报名
# ============================================================================
@transaction.atomic
def create_registration(plan_id: int, name: str, phone: str, channel_id: int = None, **kwargs) -> SubjectRegistration:
    reg = SubjectRegistration.objects.create(
        plan_id=plan_id, channel_id=channel_id,
        registration_no=_generate_registration_no(),
        name=name, phone=phone, **kwargs,
    )
    RecruitmentPlan.objects.filter(id=plan_id).update(
        registered_count=models.F('registered_count') + 1,
    )
    if channel_id:
        RecruitmentChannel.objects.filter(id=channel_id).update(
            registered_count=models.F('registered_count') + 1,
        )
    try:
        reg.refresh_from_db()
        notify_new_registration(reg)
        trigger_recruitment_event('registration_created', {
            'registration_id': reg.id, 'registration_no': reg.registration_no,
            'name': reg.name, 'phone': reg.phone, 'plan_id': plan_id,
        })
    except Exception as e:
        logger.warning("招募通知发送异常（不影响主流程）: %s", e)
    try:
        from libs.wechat_notification import notify_registration_confirmed
        notify_registration_confirmed(reg)
    except Exception as e:
        logger.warning("微信报名确认通知发送异常: %s", e)
    return reg


def list_registrations(plan_id: int = None, status: str = None,
                       page: int = 1, page_size: int = 20, keyword: str = None) -> dict:
    qs = SubjectRegistration.objects.all()
    if plan_id:
        qs = qs.filter(plan_id=plan_id)
    if status:
        qs = qs.filter(status=status)
    if keyword:
        qs = qs.filter(
            models.Q(name__icontains=keyword) |
            models.Q(registration_no__icontains=keyword) |
            models.Q(phone__icontains=keyword)
        )
    qs = qs.order_by('-create_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    # Annotate latest next_contact_date from ContactRecord
    reg_ids = [r.id for r in items]
    if reg_ids:
        from django.db.models import Max
        next_dates = dict(
            ContactRecord.objects.filter(
                registration_id__in=reg_ids,
                next_contact_date__isnull=False,
            ).values('registration_id').annotate(
                latest_next=Max('next_contact_date'),
            ).values_list('registration_id', 'latest_next')
        )
        for item in items:
            item._next_contact_date = next_dates.get(item.id)
    else:
        for item in items:
            item._next_contact_date = None

    return {'items': items, 'total': total}


# ============================================================================
# 筛选
# ============================================================================
@transaction.atomic
def create_screening(registration_id: int, screener_id: int = None) -> ScreeningRecord:
    reg = SubjectRegistration.objects.filter(id=registration_id).first()
    if reg:
        reg.status = RegistrationStatus.SCREENING
        reg.save(update_fields=['status', 'update_time'])
    return ScreeningRecord.objects.create(
        registration_id=registration_id,
        screening_no=_generate_screening_no(),
        screener_id=screener_id,
    )


def get_screening(screening_id: int) -> Optional[ScreeningRecord]:
    return ScreeningRecord.objects.filter(id=screening_id).first()


@transaction.atomic
def complete_screening(screening_id: int, result: str, criteria_checks=None, vital_signs=None, lab_results=None, notes: str = '') -> Optional[ScreeningRecord]:
    record = ScreeningRecord.objects.filter(id=screening_id).first()
    if not record:
        return None
    record.result = result
    record.criteria_checks = criteria_checks
    record.vital_signs = vital_signs
    record.lab_results = lab_results
    record.screened_at = timezone.now()
    if notes:
        record.notes = notes
    record.save()
    reg = record.registration
    if result == ScreeningResult.PASS:
        reg.status = RegistrationStatus.SCREENED_PASS
    else:
        reg.status = RegistrationStatus.SCREENED_FAIL
    reg.save(update_fields=['status', 'update_time'])
    if reg.plan_id:
        RecruitmentPlan.objects.filter(id=reg.plan_id).update(
            screened_count=models.F('screened_count') + 1,
        )
    try:
        notify_screening_result(record, result)
        trigger_recruitment_event('screening_completed', {
            'screening_id': record.id, 'screening_no': record.screening_no,
            'result': result, 'registration_id': reg.id, 'name': reg.name,
        })
    except Exception as e:
        logger.warning("筛选通知发送异常（不影响主流程）: %s", e)
    try:
        from libs.wechat_notification import notify_screening_result_to_subject
        notify_screening_result_to_subject(reg, result, stage='正式筛选')
    except Exception as e:
        logger.warning("微信筛选结果通知发送异常: %s", e)
    return record


# ============================================================================
# 入组（招募侧）
# ============================================================================
@transaction.atomic
def create_enrollment_record(registration_id: int) -> EnrollmentRecord:
    return EnrollmentRecord.objects.create(
        registration_id=registration_id,
        enrollment_no=_generate_enrollment_record_no(),
    )


@transaction.atomic
def confirm_enrollment(enrollment_record_id: int) -> Optional[EnrollmentRecord]:
    record = EnrollmentRecord.objects.select_related('registration').filter(id=enrollment_record_id).first()
    if not record:
        return None
    record.status = EnrollmentRecordStatus.ENROLLED
    record.enrollment_date = timezone.now().date()
    record.save(update_fields=['status', 'enrollment_date', 'update_time'])
    reg = record.registration
    reg.status = RegistrationStatus.ENROLLED
    reg.save(update_fields=['status', 'update_time'])
    if reg.plan_id:
        RecruitmentPlan.objects.filter(id=reg.plan_id).update(
            enrolled_count=models.F('enrolled_count') + 1,
        )

    # 解析关联的 Subject（通过 PreScreeningRecord 或 ScreeningRecord）
    subject = _resolve_subject_from_registration(reg)

    # 创建 subject.Enrollment 记录（工单生成系统依赖此模型）
    enrollment = None
    if subject and reg.plan_id:
        try:
            from ..models import Enrollment, EnrollmentStatus as SubjEnrollStatus
            protocol_id = reg.plan.protocol_id if reg.plan else None
            if protocol_id:
                enrollment, created = Enrollment.objects.get_or_create(
                    subject=subject,
                    protocol_id=protocol_id,
                    defaults={
                        'status': SubjEnrollStatus.ENROLLED,
                        'enrolled_at': timezone.now(),
                    },
                )
                if not created and enrollment.status != SubjEnrollStatus.ENROLLED:
                    enrollment.status = SubjEnrollStatus.ENROLLED
                    enrollment.enrolled_at = timezone.now()
                    enrollment.save(update_fields=['status', 'enrolled_at', 'update_time'])
                logger.info('subject.Enrollment 已创建/更新: subject=%s, protocol=%s', subject.id, protocol_id)
        except Exception as e:
            logger.warning("创建 subject.Enrollment 失败: %s", e)

    try:
        notify_enrollment_confirmed(record)
        trigger_recruitment_event('enrollment_confirmed', {
            'enrollment_id': record.id, 'enrollment_no': record.enrollment_no,
            'registration_id': reg.id, 'name': reg.name,
        })
    except Exception as e:
        logger.warning("入组通知发送异常（不影响主流程）: %s", e)
    try:
        from libs.wechat_notification import notify_enrollment_welcome
        notify_enrollment_welcome(record)
    except Exception as e:
        logger.warning("微信入组欢迎通知发送异常: %s", e)

    # 转介绍→奖励联动
    if subject:
        try:
            from ..models_loyalty import SubjectReferral
            referral = SubjectReferral.objects.filter(
                referred_id=subject.id, status='active'
            ).first()
            if referral:
                from ..models_execution import SubjectPayment
                SubjectPayment.objects.create(
                    subject_id=subject.id,
                    payment_type='referral',
                    amount=getattr(referral, 'reward_amount', 100) or 100,
                    status='pending',
                    notes=f'推荐奖励: {subject.name} 入组成功',
                )
                referral.status = 'rewarded'
                referral.save(update_fields=['status', 'update_time'])
                logger.info('转介绍奖励已创建: referrer=%s, referred=%s', referral.referrer_id, subject.id)
        except Exception as e:
            logger.warning("转介绍奖励联动失败: %s", e)

    # 入组→排程自动关联
    try:
        _auto_create_schedule_slots(reg, record, subject=subject)
    except Exception as e:
        logger.warning("入组排程自动关联失败: %s", e)

    # 入组→工单自动生成
    if enrollment:
        try:
            from apps.visit.models import VisitPlan
            protocol_id = reg.plan.protocol_id if reg.plan else None
            if protocol_id:
                vp = VisitPlan.objects.filter(protocol_id=protocol_id, is_deleted=False).first()
                if vp:
                    from apps.workorder.services.generation_service import WorkOrderGenerationService
                    WorkOrderGenerationService.generate_for_enrollment(enrollment.id, vp.id)
                    logger.info('入组后工单自动生成: enrollment=%s, visit_plan=%s', enrollment.id, vp.id)
        except Exception as e:
            logger.warning("入组后工单自动生成失败: %s", e)

    return record


def _resolve_subject_from_registration(reg) -> Optional['Subject']:
    """从报名记录解析关联的 Subject（通过粗筛 or 筛选链条）"""
    from ..models import Subject
    # 途径1：通过 PreScreeningRecord
    pre = reg.pre_screenings.select_related('subject').first() if hasattr(reg, 'pre_screenings') else None
    if pre and pre.subject_id:
        return pre.subject
    # 途径2：通过 ScreeningRecord → 对应的 Subject（按手机号匹配）
    if reg.phone:
        subj = Subject.objects.filter(phone=reg.phone, is_deleted=False).first()
        if subj:
            return subj
    return None


def _auto_create_schedule_slots(reg, enrollment_record, subject=None):
    """入组后自动为协议创建缺失的排程时间槽（按访视节点）"""
    try:
        from apps.scheduling.models import SchedulePlan, ScheduleSlot
        from apps.visit.models import VisitNode
        from datetime import timedelta

        protocol_id = reg.plan.protocol_id if reg.plan and hasattr(reg.plan, 'protocol_id') else None
        if not protocol_id:
            return

        plan = SchedulePlan.objects.filter(
            visit_plan__protocol_id=protocol_id,
            status='published',
        ).first()
        if not plan:
            return

        baseline_date = enrollment_record.enrollment_date or timezone.now().date()
        nodes = VisitNode.objects.filter(
            plan__protocol_id=protocol_id
        ).order_by('baseline_day')

        for node in nodes:
            scheduled_date = baseline_date + timedelta(days=node.baseline_day)
            ScheduleSlot.objects.get_or_create(
                schedule_plan=plan,
                visit_node=node,
                scheduled_date=scheduled_date,
                defaults={
                    'status': 'planned',
                },
            )
        logger.info('入组排程自动创建: protocol=%s, slots=%d', protocol_id, nodes.count())
    except Exception as e:
        logger.warning('入组排程自动关联失败: %s', e)


# ============================================================================
# 退出/脱落
# ============================================================================
@transaction.atomic
def withdraw_registration(registration_id: int, reason: str, account=None) -> Optional[SubjectRegistration]:
    """报名退出"""
    reg = SubjectRegistration.objects.filter(id=registration_id).first()
    if not reg:
        return None
    if reg.status == RegistrationStatus.WITHDRAWN:
        raise ValueError('该报名已退出')
    if reg.status == RegistrationStatus.ENROLLED:
        raise ValueError('已入组的报名请通过入组记录退出')
    reg.status = RegistrationStatus.WITHDRAWN
    reg.withdrawal_reason = reason
    reg.withdrawal_date = timezone.now()
    if account:
        reg.withdrawal_initiated_by_id = account.id
    reg.save(update_fields=['status', 'withdrawal_reason', 'withdrawal_date', 'withdrawal_initiated_by_id', 'update_time'])
    if reg.plan_id:
        RecruitmentPlan.objects.filter(id=reg.plan_id).update(
            registered_count=models.F('registered_count') - 1,
        )
    try:
        notify_withdrawal(reg, reason)
        trigger_recruitment_event('registration_withdrawn', {
            'registration_id': reg.id, 'registration_no': reg.registration_no,
            'name': reg.name, 'reason': reason,
        })
    except Exception as e:
        logger.warning("退出通知发送异常（不影响主流程）: %s", e)
    return reg


@transaction.atomic
def withdraw_enrollment(enrollment_record_id: int, reason: str, account=None) -> Optional[EnrollmentRecord]:
    """入组退出"""
    record = EnrollmentRecord.objects.select_related('registration').filter(id=enrollment_record_id).first()
    if not record:
        return None
    if record.status == EnrollmentRecordStatus.WITHDRAWN:
        raise ValueError('该入组记录已退出')
    record.status = EnrollmentRecordStatus.WITHDRAWN
    record.withdrawal_reason = reason
    record.withdrawal_date = timezone.now()
    if account:
        record.withdrawal_initiated_by_id = account.id
    record.save(update_fields=['status', 'withdrawal_reason', 'withdrawal_date', 'withdrawal_initiated_by_id', 'update_time'])
    reg = record.registration
    reg.status = RegistrationStatus.WITHDRAWN
    reg.withdrawal_reason = reason
    reg.withdrawal_date = timezone.now()
    reg.save(update_fields=['status', 'withdrawal_reason', 'withdrawal_date', 'update_time'])
    if reg.plan_id:
        RecruitmentPlan.objects.filter(id=reg.plan_id).update(
            enrolled_count=models.F('enrolled_count') - 1,
        )
    return record


# ============================================================================
# 进度
# ============================================================================
def record_progress(plan_id: int) -> RecruitmentProgress:
    plan = RecruitmentPlan.objects.filter(id=plan_id).first()
    if not plan:
        raise ValueError('计划不存在')
    today = timezone.now().date()
    progress, _ = RecruitmentProgress.objects.update_or_create(
        plan_id=plan_id, record_date=today,
        defaults={
            'registered_count': plan.registered_count,
            'screened_count': plan.screened_count,
            'enrolled_count': plan.enrolled_count,
            'completion_rate': plan.completion_rate,
        },
    )
    return progress


# ============================================================================
# 问题 & 策略
# ============================================================================
def create_issue(plan_id: int, title: str, priority: str = 'medium', **kwargs) -> RecruitmentIssue:
    return RecruitmentIssue.objects.create(plan_id=plan_id, title=title, priority=priority, **kwargs)


def resolve_issue(issue_id: int, solution: str) -> Optional[RecruitmentIssue]:
    issue = RecruitmentIssue.objects.filter(id=issue_id).first()
    if not issue:
        return None
    issue.solution = solution
    issue.status = IssueStatus.RESOLVED
    issue.save(update_fields=['solution', 'status', 'update_time'])
    return issue


def create_strategy(plan_id: int, title: str, **kwargs) -> RecruitmentStrategy:
    return RecruitmentStrategy.objects.create(plan_id=plan_id, title=title, **kwargs)


def approve_strategy(strategy_id: int) -> Optional[RecruitmentStrategy]:
    s = RecruitmentStrategy.objects.filter(id=strategy_id).first()
    if not s:
        return None
    s.status = StrategyStatus.APPROVED
    s.save(update_fields=['status', 'update_time'])
    return s


# ============================================================================
# 统计
# ============================================================================
def get_recruitment_funnel(plan_id: int) -> dict:
    """招募漏斗"""
    plan = RecruitmentPlan.objects.filter(id=plan_id).first()
    if not plan:
        return {}
    r, s, e = plan.registered_count, plan.screened_count, plan.enrolled_count
    withdrawn = SubjectRegistration.objects.filter(plan_id=plan_id, status=RegistrationStatus.WITHDRAWN).count()
    return {
        'registered': r, 'screened': s, 'enrolled': e, 'withdrawn': withdrawn,
        'conversion_rates': {
            'registered_to_screened': round(s / r * 100, 1) if r > 0 else 0,
            'screened_to_enrolled': round(e / s * 100, 1) if s > 0 else 0,
            'overall': round(e / r * 100, 1) if r > 0 else 0,
        },
    }


def get_recruitment_trends(plan_id: int, days: int = 30) -> list:
    """招募趋势"""
    from datetime import timedelta
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=days)
    records = RecruitmentProgress.objects.filter(
        plan_id=plan_id, record_date__gte=start_date,
    ).order_by('record_date')
    return [{
        'date': r.record_date.isoformat(),
        'registered': r.registered_count,
        'screened': r.screened_count,
        'enrolled': r.enrolled_count,
    } for r in records]


def get_withdrawal_analysis(plan_id: int) -> dict:
    """退出分析"""
    regs = SubjectRegistration.objects.filter(plan_id=plan_id, status=RegistrationStatus.WITHDRAWN)
    total = regs.count()
    reasons = {}
    for reg in regs:
        reason = reg.withdrawal_reason or '未说明'
        reasons[reason] = reasons.get(reason, 0) + 1
    reason_list = [{'reason': r, 'count': c, 'percentage': round(c / total * 100, 1) if total > 0 else 0} for r, c in reasons.items()]
    return {'total_withdrawn': total, 'reasons': sorted(reason_list, key=lambda x: -x['count'])}


def get_recruitment_statistics(plan_id: int) -> dict:
    plan = RecruitmentPlan.objects.filter(id=plan_id).first()
    if not plan:
        return {}
    channels = RecruitmentChannel.objects.filter(plan_id=plan_id)
    return {
        'plan_id': plan.id,
        'plan_no': plan.plan_no,
        'target_count': plan.target_count,
        'registered_count': plan.registered_count,
        'screened_count': plan.screened_count,
        'enrolled_count': plan.enrolled_count,
        'completion_rate': plan.completion_rate,
        'channels': [{
            'id': c.id, 'name': c.name, 'type': c.channel_type,
            'registered': c.registered_count, 'screened': c.screened_count,
            'enrolled': c.enrolled_count, 'cost': str(c.cost),
        } for c in channels],
    }


# ============================================================================
# 跟进记录
# ============================================================================
def create_contact_record(registration_id: int, contact_type: str, content: str,
                          result: str = 'other', next_contact_date=None,
                          next_contact_plan: str = '', contacted_by_id: int = None,
                          notes: str = '') -> ContactRecord:
    record = ContactRecord.objects.create(
        registration_id=registration_id,
        contact_type=contact_type,
        content=content,
        result=result,
        next_contact_date=next_contact_date,
        next_contact_plan=next_contact_plan,
        contacted_by_id=contacted_by_id,
        notes=notes,
    )
    SubjectRegistration.objects.filter(id=registration_id).update(
        contacted_at=timezone.now(),
        contact_notes=content[:200],
        status=models.Case(
            models.When(status=RegistrationStatus.REGISTERED, then=models.Value('contacted')),
            default=models.F('status'),
        ),
    )
    return record


def list_contact_records(registration_id: int) -> list:
    return list(ContactRecord.objects.filter(registration_id=registration_id))


# ============================================================================
# 任务聚合
# ============================================================================
def get_my_tasks() -> dict:
    from datetime import timedelta
    now = timezone.now()
    three_days_ago = now - timedelta(days=3)
    today = now.date()

    pending_contact = SubjectRegistration.objects.filter(
        status=RegistrationStatus.REGISTERED,
    ).order_by('create_time')

    pending_screening = SubjectRegistration.objects.filter(
        status=RegistrationStatus.SCREENING,
    ).order_by('create_time')

    pending_enrollment = SubjectRegistration.objects.filter(
        status=RegistrationStatus.SCREENED_PASS,
    ).order_by('create_time')

    overdue_followup = SubjectRegistration.objects.filter(
        status__in=[RegistrationStatus.REGISTERED, RegistrationStatus.CONTACTED, RegistrationStatus.SCREENING],
    ).filter(
        models.Q(contacted_at__isnull=True, create_time__lte=three_days_ago) |
        models.Q(contacted_at__lt=three_days_ago)
    ).order_by('create_time')

    need_callback_qs = ContactRecord.objects.filter(
        next_contact_date__lte=today,
    ).values_list('registration_id', flat=True).distinct()
    need_callback = SubjectRegistration.objects.filter(
        id__in=need_callback_qs,
    ).exclude(status__in=[RegistrationStatus.WITHDRAWN, RegistrationStatus.SCREENED_FAIL, RegistrationStatus.ENROLLED]).order_by('create_time')

    def serialize(qs, limit=10):
        items = []
        for r in qs[:limit]:
            items.append({
                'id': r.id, 'registration_no': r.registration_no,
                'name': r.name, 'phone': r.phone, 'status': r.status,
                'create_time': r.create_time.isoformat() if r.create_time else None,
                'contacted_at': r.contacted_at.isoformat() if r.contacted_at else None,
            })
        return items

    return {
        'pending_contact': {'count': pending_contact.count(), 'items': serialize(pending_contact)},
        'pending_screening': {'count': pending_screening.count(), 'items': serialize(pending_screening)},
        'pending_enrollment': {'count': pending_enrollment.count(), 'items': serialize(pending_enrollment)},
        'need_callback': {'count': need_callback.count(), 'items': serialize(need_callback)},
        'overdue_followup': {'count': overdue_followup.count(), 'items': serialize(overdue_followup)},
    }


# ============================================================================
# 广告列表 & 渠道分析
# ============================================================================
def list_ads(plan_id: int) -> list:
    return list(RecruitmentAd.objects.filter(plan_id=plan_id).order_by('-create_time'))


def update_ad(ad_id: int, **kwargs) -> Optional[RecruitmentAd]:
    ad = RecruitmentAd.objects.filter(id=ad_id).first()
    if not ad:
        return None
    for k, v in kwargs.items():
        if v is not None and hasattr(ad, k):
            setattr(ad, k, v)
    ad.save()
    return ad


def generate_recruitment_candidate_list(project_id: int) -> list:
    """
    根据项目入排标准生成按匹配度排序的候选人列表。

    从已报名且通过粗筛/筛选的报名记录中，结合入排标准计算匹配度。
    未筛选的报名人按信息完整度排序。

    Args:
        project_id: 协议/项目 ID

    Returns:
        按 match_score 降序排列的候选人列表
    """
    plans = RecruitmentPlan.objects.filter(protocol_id=project_id)
    if not plans.exists():
        logger.info(f'项目 #{project_id} 无招募计划')
        return []

    plan_ids = list(plans.values_list('id', flat=True))

    eligible_statuses = [
        RegistrationStatus.REGISTERED,
        RegistrationStatus.CONTACTED,
        RegistrationStatus.SCREENING,
        RegistrationStatus.SCREENED_PASS,
    ]
    registrations = SubjectRegistration.objects.filter(
        plan_id__in=plan_ids,
        status__in=eligible_statuses,
    ).order_by('create_time')

    criteria_by_plan = {}
    for plan_id in plan_ids:
        criteria_by_plan[plan_id] = list(
            EligibilityCriteria.objects.filter(plan_id=plan_id).order_by('sequence')
        )

    candidates = []
    for reg in registrations:
        score = 0.0
        score_breakdown = []

        if reg.status == RegistrationStatus.SCREENED_PASS:
            score += 50.0
            score_breakdown.append('筛选通过 +50')
        elif reg.status == RegistrationStatus.SCREENING:
            score += 30.0
            score_breakdown.append('筛选中 +30')
        elif reg.status == RegistrationStatus.CONTACTED:
            score += 15.0
            score_breakdown.append('已联系 +15')
        else:
            score += 5.0
            score_breakdown.append('已报名 +5')

        if reg.phone:
            score += 10.0
            score_breakdown.append('有手机号 +10')
        if reg.gender:
            score += 5.0
        if reg.age:
            score += 5.0

        screenings = ScreeningRecord.objects.filter(registration=reg)
        if screenings.exists():
            latest = screenings.order_by('-create_time').first()
            if latest.criteria_checks and isinstance(latest.criteria_checks, list):
                passed = sum(1 for c in latest.criteria_checks if c.get('passed'))
                total_checks = len(latest.criteria_checks)
                if total_checks > 0:
                    criteria_score = (passed / total_checks) * 30.0
                    score += criteria_score
                    score_breakdown.append(f'标准符合 {passed}/{total_checks} +{criteria_score:.0f}')

        score = min(score, 100.0)

        candidates.append({
            'registration_id': reg.id,
            'registration_no': reg.registration_no,
            'name': reg.name,
            'phone': reg.phone,
            'status': reg.status,
            'match_score': round(score, 1),
            'score_breakdown': score_breakdown,
            'plan_id': reg.plan_id,
            'create_time': reg.create_time.isoformat() if reg.create_time else None,
        })

    candidates.sort(key=lambda x: -x['match_score'])
    logger.info(f'候选人列表生成: project={project_id}, candidates={len(candidates)}')
    return candidates


def get_channel_analytics() -> list:
    channels = RecruitmentChannel.objects.select_related('plan').all()
    result = []
    for ch in channels:
        reg = ch.registered_count or 0
        scr = ch.screened_count or 0
        enr = ch.enrolled_count or 0
        result.append({
            'id': ch.id,
            'name': ch.name,
            'channel_type': ch.channel_type,
            'plan_id': ch.plan_id,
            'plan_title': ch.plan.title if ch.plan else '',
            'registered_count': reg,
            'screened_count': scr,
            'enrolled_count': enr,
            'screening_rate': round(scr / reg * 100, 1) if reg > 0 else 0,
            'enrollment_rate': round(enr / scr * 100, 1) if scr > 0 else 0,
            'overall_rate': round(enr / reg * 100, 1) if reg > 0 else 0,
            'cost': str(ch.cost),
        })
    return result
