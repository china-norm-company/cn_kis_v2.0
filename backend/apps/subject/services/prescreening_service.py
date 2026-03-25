"""
粗筛管理服务

覆盖：粗筛发起（受试者建档）、草稿保存、完成判定、PI 复核、漏斗统计。
粗筛数据复用 Subject 模型体系（profile / domain / timeseries），
本服务管理 PreScreeningRecord 及其与上下游模型的状态协调。
"""
import logging
from typing import Optional
from datetime import date
from django.utils import timezone
from django.db import transaction
from django.db.models import Count, Q

from ..models import Subject, SubjectStatus
from ..models_profile import SubjectProfile
from ..models_domain import SkinProfile
from ..models_recruitment import (
    SubjectRegistration, RegistrationStatus,
    PreScreeningRecord, PreScreeningResult,
)

logger = logging.getLogger(__name__)


def _generate_pre_screening_no() -> str:
    """生成粗筛编号 PS-YYYYMMDD-NNNN"""
    now = timezone.now()
    prefix = f'PS-{now.strftime("%Y%m%d")}-'
    last = (
        PreScreeningRecord.objects.filter(pre_screening_no__startswith=prefix)
        .order_by('-pre_screening_no').values_list('pre_screening_no', flat=True).first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


def _generate_subject_no() -> str:
    """生成受试者编号 SUB-YYYYMM-NNNN"""
    now = timezone.now()
    prefix = f'SUB-{now.strftime("%Y%m")}-'
    last = (
        Subject.objects.filter(subject_no__startswith=prefix)
        .order_by('-subject_no').values_list('subject_no', flat=True).first()
    )
    seq = int(last.split('-')[-1]) + 1 if last else 1
    return f'{prefix}{seq:04d}'


@transaction.atomic
def start_pre_screening(
    registration_id: int,
    protocol_id: int,
    screener_id: int,
    created_by_id: Optional[int] = None,
) -> dict:
    """
    发起粗筛：
    1. 创建 Subject（如新受试者）+ SubjectProfile + SkinProfile
    2. 创建 PreScreeningRecord
    3. 更新 SubjectRegistration 状态
    """
    reg = SubjectRegistration.objects.select_related('plan').get(id=registration_id)
    if reg.status not in (RegistrationStatus.CONTACTED, RegistrationStatus.REGISTERED):
        if reg.status == RegistrationStatus.PRE_SCREENING:
            existing = PreScreeningRecord.objects.filter(
                registration=reg, result=PreScreeningResult.PENDING,
            ).first()
            if existing:
                return _record_to_dict(existing)
        raise ValueError(f'报名状态 [{reg.get_status_display()}] 不允许发起粗筛')

    subject = Subject.objects.filter(phone=reg.phone, is_deleted=False).first()
    if not subject:
        subject = Subject.objects.create(
            subject_no=_generate_subject_no(),
            name=reg.name,
            gender=reg.gender or '',
            age=reg.age,
            phone=reg.phone,
            source_channel=reg.channel.channel_type if reg.channel else '',
            status=SubjectStatus.PRE_SCREENING,
            created_by_id=created_by_id or screener_id,
        )
        SubjectProfile.objects.create(subject=subject)
        SkinProfile.objects.create(subject=subject)
    else:
        subject.status = SubjectStatus.PRE_SCREENING
        subject.save(update_fields=['status', 'update_time'])

    record = PreScreeningRecord.objects.create(
        registration=reg,
        subject=subject,
        protocol_id=protocol_id,
        pre_screening_no=_generate_pre_screening_no(),
        pre_screening_date=timezone.localdate(),
        start_time=timezone.now(),
        screener_id=screener_id,
        created_by_id=created_by_id or screener_id,
    )

    reg.status = RegistrationStatus.PRE_SCREENING
    reg.save(update_fields=['status', 'update_time'])

    logger.info('粗筛发起: %s -> subject=%s', record.pre_screening_no, subject.subject_no)
    return _record_to_dict(record)


def list_pre_screenings(
    *,
    pre_screening_date: Optional[date] = None,
    result: Optional[str] = None,
    plan_id: Optional[int] = None,
    screener_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """粗筛记录列表"""
    qs = PreScreeningRecord.objects.select_related(
        'subject', 'registration', 'protocol',
    ).order_by('-create_time')

    if pre_screening_date:
        qs = qs.filter(pre_screening_date=pre_screening_date)
    if result:
        qs = qs.filter(result=result)
    if plan_id:
        qs = qs.filter(registration__plan_id=plan_id)
    if screener_id:
        qs = qs.filter(screener_id=screener_id)

    total = qs.count()
    offset = (page - 1) * page_size
    items = [_record_to_dict(r) for r in qs[offset:offset + page_size]]
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def get_pre_screening_detail(record_id: int) -> dict:
    """粗筛记录详情"""
    record = PreScreeningRecord.objects.select_related(
        'subject', 'registration', 'protocol',
    ).get(id=record_id)
    return _record_to_dict(record)


@transaction.atomic
def save_pre_screening_draft(record_id: int, data: dict) -> dict:
    """保存粗筛草稿（各检查模块的聚合数据）"""
    record = PreScreeningRecord.objects.get(id=record_id)
    if record.result != PreScreeningResult.PENDING:
        raise ValueError('粗筛已完成，不允许修改草稿')

    updatable_fields = [
        'hard_exclusion_checks', 'skin_visual_assessment',
        'instrument_summary', 'medical_summary', 'lifestyle_summary',
        'location', 'notes',
    ]
    changed = []
    for field in updatable_fields:
        if field in data:
            setattr(record, field, data[field])
            changed.append(field)

    if changed:
        changed.append('update_time')
        record.save(update_fields=changed)

    return _record_to_dict(record)


@transaction.atomic
def complete_pre_screening(
    record_id: int,
    result: str,
    fail_reasons: Optional[list] = None,
    notes: Optional[str] = None,
) -> dict:
    """
    完成粗筛判定：
    - pass: 更新 Registration → pre_screened_pass, Subject → pre_screened
    - fail: 更新 Registration → pre_screened_fail, Subject → disqualified
    - pending: 等待 PI 复核（状态暂不变）
    - refer: 类似 fail 但标记为推荐其他项目
    """
    record = PreScreeningRecord.objects.select_related(
        'subject', 'registration',
    ).get(id=record_id)

    if record.result != PreScreeningResult.PENDING:
        raise ValueError('粗筛已完成，不允许重复提交')

    if result not in [c[0] for c in PreScreeningResult.choices if c[0] != 'pending']:
        raise ValueError(f'无效的粗筛结果: {result}')

    if result in ('fail', 'refer') and not fail_reasons:
        raise ValueError('粗筛不通过或推荐时必须填写原因')

    record.result = result
    record.end_time = timezone.now()
    if fail_reasons:
        record.fail_reasons = fail_reasons
    if notes:
        record.notes = notes
    record.save(update_fields=['result', 'end_time', 'fail_reasons', 'notes', 'update_time'])

    reg = record.registration
    subject = record.subject

    if result == PreScreeningResult.PASS:
        reg.status = RegistrationStatus.PRE_SCREENED_PASS
        reg.save(update_fields=['status', 'update_time'])
        subject.status = SubjectStatus.PRE_SCREENED
        subject.save(update_fields=['status', 'update_time'])
        # 自动创建正式筛选记录（草稿）
        try:
            from .recruitment_service import create_screening
            create_screening(registration_id=reg.id)
            reg.status = RegistrationStatus.SCREENING if hasattr(RegistrationStatus, 'SCREENING') else reg.status
            reg.save(update_fields=['status', 'update_time'])
            logger.info('粗筛通过→自动创建筛选记录: reg=%s', reg.registration_no)
        except Exception:
            logger.warning('自动创建筛选记录失败', exc_info=True)
    elif result in (PreScreeningResult.FAIL, PreScreeningResult.REFER):
        reg.status = RegistrationStatus.PRE_SCREENED_FAIL
        reg.save(update_fields=['status', 'update_time'])
        subject.status = SubjectStatus.DISQUALIFIED
        subject.save(update_fields=['status', 'update_time'])

    # 粗筛补偿→自动创建支付记录
    compensation = getattr(record, 'compensation_amount', None)
    if compensation and float(compensation) > 0:
        try:
            from ..models_execution import SubjectPayment
            SubjectPayment.objects.create(
                subject=subject,
                payment_type='transportation',
                amount=compensation,
                status='pending',
                notes=f'粗筛交通补贴 ({record.pre_screening_no})',
            )
            logger.info('粗筛补偿→自动创建支付: subject=%s, amount=%s', subject.id, compensation)
        except Exception:
            logger.warning('自动创建粗筛补偿支付失败', exc_info=True)

    try:
        from .recruitment_notify import notify_pre_screening_result
        notify_pre_screening_result(record)
    except Exception:
        logger.warning('粗筛通知发送失败', exc_info=True)

    try:
        from libs.wechat_notification import notify_screening_result_to_subject
        notify_screening_result_to_subject(reg, result, stage='粗筛')
    except Exception:
        logger.warning('微信粗筛结果通知发送失败', exc_info=True)

    logger.info('粗筛完成: %s result=%s', record.pre_screening_no, result)
    return _record_to_dict(record)


@transaction.atomic
def review_pre_screening(
    record_id: int,
    decision: str,
    notes: str,
    reviewer_id: int,
) -> dict:
    """PI 复核粗筛"""
    record = PreScreeningRecord.objects.select_related(
        'subject', 'registration',
    ).get(id=record_id)

    if record.result != PreScreeningResult.PENDING:
        raise ValueError('仅待评估状态的粗筛可以复核')

    if decision not in ('pass', 'fail'):
        raise ValueError('复核结果必须为 pass 或 fail')

    record.reviewer_decision = decision
    record.reviewer_notes = notes
    record.reviewer_id = reviewer_id
    record.reviewed_at = timezone.now()
    record.end_time = timezone.now()

    reg = record.registration
    subject = record.subject

    if decision == 'pass':
        record.result = PreScreeningResult.PASS
        reg.status = RegistrationStatus.PRE_SCREENED_PASS
        reg.save(update_fields=['status', 'update_time'])
        subject.status = SubjectStatus.PRE_SCREENED
        subject.save(update_fields=['status', 'update_time'])
    else:
        record.result = PreScreeningResult.FAIL
        reg.status = RegistrationStatus.PRE_SCREENED_FAIL
        reg.save(update_fields=['status', 'update_time'])
        subject.status = SubjectStatus.DISQUALIFIED
        subject.save(update_fields=['status', 'update_time'])

    record.save(update_fields=[
        'result', 'reviewer_decision', 'reviewer_notes',
        'reviewer_id', 'reviewed_at', 'end_time', 'update_time',
    ])

    logger.info('粗筛复核: %s decision=%s by %s', record.pre_screening_no, decision, reviewer_id)
    return _record_to_dict(record)


def get_today_summary() -> dict:
    """今日粗筛摘要统计"""
    today = timezone.localdate()
    qs = PreScreeningRecord.objects.filter(pre_screening_date=today)
    stats = qs.aggregate(
        total=Count('id'),
        pending=Count('id', filter=Q(result=PreScreeningResult.PENDING)),
        passed=Count('id', filter=Q(result=PreScreeningResult.PASS)),
        failed=Count('id', filter=Q(result=PreScreeningResult.FAIL)),
        referred=Count('id', filter=Q(result=PreScreeningResult.REFER)),
    )
    stats['completed'] = stats['total'] - stats['pending']
    stats['pass_rate'] = (
        round(stats['passed'] / stats['completed'] * 100, 1)
        if stats['completed'] > 0 else 0
    )
    return stats


def get_pre_screening_funnel(plan_id: Optional[int] = None) -> dict:
    """获取包含粗筛环节的招募漏斗数据"""
    reg_qs = SubjectRegistration.objects.all()
    if plan_id:
        reg_qs = reg_qs.filter(plan_id=plan_id)

    registered = reg_qs.count()
    pre_screened = reg_qs.exclude(
        status__in=[RegistrationStatus.REGISTERED, RegistrationStatus.CONTACTED]
    ).count()
    pre_screened_pass = reg_qs.filter(
        status__in=[
            RegistrationStatus.PRE_SCREENED_PASS,
            RegistrationStatus.SCREENING,
            RegistrationStatus.SCREENED_PASS,
            RegistrationStatus.SCREENED_FAIL,
            RegistrationStatus.ENROLLED,
        ]
    ).count()
    screened_pass = reg_qs.filter(
        status__in=[
            RegistrationStatus.SCREENED_PASS,
            RegistrationStatus.ENROLLED,
        ]
    ).count()
    enrolled = reg_qs.filter(status=RegistrationStatus.ENROLLED).count()

    return {
        'registered': registered,
        'pre_screened': pre_screened,
        'pre_screened_pass': pre_screened_pass,
        'screened_pass': screened_pass,
        'enrolled': enrolled,
        'pre_screening_rate': round(pre_screened / registered * 100, 1) if registered > 0 else 0,
        'pre_screening_pass_rate': round(pre_screened_pass / pre_screened * 100, 1) if pre_screened > 0 else 0,
        'screening_pass_rate': round(screened_pass / pre_screened_pass * 100, 1) if pre_screened_pass > 0 else 0,
        'enrollment_rate': round(enrolled / screened_pass * 100, 1) if screened_pass > 0 else 0,
    }


def _record_to_dict(record: PreScreeningRecord) -> dict:
    """将 PreScreeningRecord 序列化为字典"""
    return {
        'id': record.id,
        'pre_screening_no': record.pre_screening_no,
        'registration_id': record.registration_id,
        'registration_no': record.registration.registration_no if record.registration else '',
        'subject_id': record.subject_id,
        'subject_name': record.subject.name if record.subject else '',
        'subject_no': record.subject.subject_no if record.subject else '',
        'protocol_id': record.protocol_id,
        'protocol_title': record.protocol.title if record.protocol else '',
        'pre_screening_date': str(record.pre_screening_date) if record.pre_screening_date else None,
        'start_time': record.start_time.isoformat() if record.start_time else None,
        'end_time': record.end_time.isoformat() if record.end_time else None,
        'location': record.location,
        'hard_exclusion_checks': record.hard_exclusion_checks,
        'skin_visual_assessment': record.skin_visual_assessment,
        'instrument_summary': record.instrument_summary,
        'medical_summary': record.medical_summary,
        'lifestyle_summary': record.lifestyle_summary,
        'result': record.result,
        'result_display': record.get_result_display(),
        'fail_reasons': record.fail_reasons,
        'reviewer_decision': record.reviewer_decision,
        'reviewer_notes': record.reviewer_notes,
        'reviewed_at': record.reviewed_at.isoformat() if record.reviewed_at else None,
        'screening_appointment_id': record.screening_appointment_id,
        'compensation_amount': str(record.compensation_amount) if record.compensation_amount else None,
        'compensation_paid': record.compensation_paid,
        'screener_id': record.screener_id,
        'reviewer_id': record.reviewer_id,
        'notes': record.notes,
        'create_time': record.create_time.isoformat(),
        'update_time': record.update_time.isoformat(),
    }
