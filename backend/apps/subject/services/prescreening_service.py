"""
初筛管理服务

覆盖：初筛发起（受试者建档）、草稿保存、完成判定、PI 复核、漏斗统计。
初筛数据复用 Subject 模型体系（profile / domain / timeseries），
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
from .prescreening_appointment_sync import sync_after_prescreening_state_change

logger = logging.getLogger(__name__)


def _generate_pre_screening_no() -> str:
    """生成初筛编号 PS-YYYYMMDD-NNNN"""
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


def _find_registration_for_protocol(subject: Subject, protocol_id: int) -> Optional[SubjectRegistration]:
    """按受试者手机号与协议匹配招募报名（同一协议下多计划时取最新一条）。"""
    from .subject_service import normalize_subject_phone

    mob = normalize_subject_phone(subject.phone)
    qs = (
        SubjectRegistration.objects.select_related('plan')
        .filter(plan__protocol_id=protocol_id)
        .order_by('-create_time')
    )
    for reg in qs:
        if mob and normalize_subject_phone(reg.phone) == mob:
            return reg
        if not mob and (reg.phone or '').strip() == (subject.phone or '').strip():
            return reg
    return None


IMPORT_SYNC_PROTOCOL_CODE = '__IMPORT_SYNC__'
IMPORT_SYNC_PLAN_NO = 'PLAN-IMPORT-SYNC-001'


def _ensure_import_sync_protocol_and_plan():
    """
    占位协议 + 占位招募计划：用于「从预约同步」且不校验真实 Protocol.code 时挂接初筛记录。
    勿删；真实项目编号写在初筛备注 [导入同步] 中。
    """
    from apps.protocol.models import Protocol, ProtocolStatus
    from ..models_recruitment import RecruitmentPlan, RecruitmentPlanStatus

    proto, _ = Protocol.objects.get_or_create(
        code=IMPORT_SYNC_PROTOCOL_CODE,
        defaults={
            'title': '预约导入同步（占位协议）',
            'status': ProtocolStatus.ACTIVE,
        },
    )
    plan, _ = RecruitmentPlan.objects.get_or_create(
        plan_no=IMPORT_SYNC_PLAN_NO,
        defaults={
            'protocol': proto,
            'title': '预约导入同步计划',
            'description': '用于预约管理导入名单同步初筛，不绑定真实协议编号',
            'target_count': 999999,
            'start_date': date(2020, 1, 1),
            'end_date': date(2099, 12, 31),
            'status': RecruitmentPlanStatus.ACTIVE,
        },
    )
    if plan.protocol_id != proto.id:
        plan.protocol = proto
        plan.save(update_fields=['protocol_id', 'update_time'])
    return proto, plan


def _pick_or_create_registration_for_import_sync(subject: Subject, plan: 'RecruitmentPlan') -> SubjectRegistration:
    """在占位计划下，按手机号复用可发起初筛的报名；否则新建一条。"""
    from .recruitment_service import _generate_registration_no
    from .subject_service import normalize_subject_phone
    from ..models_recruitment import RecruitmentPlan

    mob = normalize_subject_phone(subject.phone)
    qs = SubjectRegistration.objects.filter(plan_id=plan.id).order_by('-create_time')
    regs = list(qs)
    if mob:
        regs = [r for r in regs if normalize_subject_phone(r.phone) == mob]
    else:
        regs = [r for r in regs if (r.phone or '').strip() == (subject.phone or '').strip()]

    for reg in regs:
        if PreScreeningRecord.objects.filter(
            registration=reg, result=PreScreeningResult.PENDING,
        ).exists():
            continue
        if reg.status in (RegistrationStatus.REGISTERED, RegistrationStatus.CONTACTED):
            return reg

    return SubjectRegistration.objects.create(
        plan=plan,
        registration_no=_generate_registration_no(),
        name=(subject.name or '受试者').strip() or '受试者',
        gender=subject.gender or '',
        age=subject.age,
        phone=subject.phone or '',
        status=RegistrationStatus.CONTACTED,
    )


@transaction.atomic
def start_pre_screening(
    registration_id: int,
    protocol_id: int,
    screener_id: int,
    created_by_id: Optional[int] = None,
    pre_screening_date: Optional[date] = None,
) -> dict:
    """
    发起初筛：
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
        raise ValueError(f'报名状态 [{reg.get_status_display()}] 不允许发起初筛')

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

    ps_date = pre_screening_date or timezone.localdate()
    record = PreScreeningRecord.objects.create(
        registration=reg,
        subject=subject,
        protocol_id=protocol_id,
        pre_screening_no=_generate_pre_screening_no(),
        pre_screening_date=ps_date,
        start_time=timezone.now(),
        screener_id=screener_id,
        created_by_id=created_by_id or screener_id,
    )

    reg.status = RegistrationStatus.PRE_SCREENING
    reg.save(update_fields=['status', 'update_time'])

    logger.info('初筛发起: %s -> subject=%s', record.pre_screening_no, subject.subject_no)
    return _record_to_dict(record)


def sync_prescreening_from_appointments(
    *,
    target_date: Optional[date] = None,
    screener_id: int,
    created_by_id: Optional[int] = None,
) -> dict:
    """
    将预约管理中的预约（全部访视点），按受试者 + 项目编号对齐协议与报名后发起初筛记录。

    - 仅处理 appointment_date = target_date（默认本地今日），不限定访视点；
    - 排除已取消预约；
    - 同一受试者 + 同一协议当日只发起一条；
    - 需存在 SubjectRegistration（手机号与 Protocol.code 对应计划一致）且尚无待评估初筛记录。
    """
    from apps.protocol.models import Protocol
    from ..models_execution import SubjectAppointment, AppointmentStatus

    day = target_date or timezone.localdate()
    created = 0
    skipped = 0
    errors: list[dict] = []

    appts = (
        SubjectAppointment.objects.filter(appointment_date=day)
        .exclude(status=AppointmentStatus.CANCELLED)
        .select_related('subject')
        .order_by('id')
    )

    seen: set[tuple[int, int]] = set()

    for appt in appts:
        subject = appt.subject
        if not subject:
            continue
        pc = (appt.project_code or '').strip()
        if not pc:
            errors.append({'appointment_id': appt.id, 'msg': '项目编号为空'})
            continue

        protocol = Protocol.objects.filter(code=pc, is_deleted=False).first()
        if not protocol:
            errors.append({'appointment_id': appt.id, 'msg': f'未找到协议编号「{pc}」'})
            continue

        key = (subject.id, protocol.id)
        if key in seen:
            skipped += 1
            continue
        seen.add(key)

        reg = _find_registration_for_protocol(subject, protocol.id)
        if not reg:
            errors.append({
                'appointment_id': appt.id,
                'subject_id': subject.id,
                'msg': '无对应招募报名（请确认手机号与该协议下报名一致）',
            })
            continue

        if PreScreeningRecord.objects.filter(
            registration=reg,
            result=PreScreeningResult.PENDING,
        ).exists():
            skipped += 1
            continue

        try:
            start_pre_screening(
                registration_id=reg.id,
                protocol_id=protocol.id,
                screener_id=screener_id,
                created_by_id=created_by_id,
                pre_screening_date=day,
            )
            created += 1
        except Exception as e:
            errors.append({
                'appointment_id': appt.id,
                'subject_id': subject.id,
                'msg': str(e),
            })

    logger.info(
        '初筛同步(预约全访视点): date=%s created=%s skipped=%s errors=%s',
        day, created, skipped, len(errors),
    )
    return {'target_date': str(day), 'created': created, 'skipped': skipped, 'errors': errors}


def list_pre_screenings(
    *,
    pre_screening_date: Optional[date] = None,
    pre_screening_date_from: Optional[date] = None,
    pre_screening_date_to: Optional[date] = None,
    result: Optional[str] = None,
    plan_id: Optional[int] = None,
    screener_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """初筛记录列表"""
    qs = PreScreeningRecord.objects.select_related(
        'subject', 'registration', 'protocol',
    ).order_by('-create_time')

    if pre_screening_date_from is not None or pre_screening_date_to is not None:
        if pre_screening_date_from is not None and pre_screening_date_to is not None:
            qs = qs.filter(
                pre_screening_date__gte=pre_screening_date_from,
                pre_screening_date__lte=pre_screening_date_to,
            )
        elif pre_screening_date_from is not None:
            qs = qs.filter(pre_screening_date=pre_screening_date_from)
        else:
            qs = qs.filter(pre_screening_date__lte=pre_screening_date_to)
    elif pre_screening_date:
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
    """初筛记录详情"""
    record = PreScreeningRecord.objects.select_related(
        'subject', 'registration', 'protocol',
    ).get(id=record_id)
    return _record_to_dict(record)


@transaction.atomic
def save_pre_screening_draft(record_id: int, data: dict) -> dict:
    """保存初筛草稿（各检查模块的聚合数据）"""
    record = PreScreeningRecord.objects.get(id=record_id)
    if record.result != PreScreeningResult.PENDING:
        raise ValueError('初筛已完成，不允许修改草稿')

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
    完成初筛判定：
    - pass: 更新 Registration → pre_screened_pass, Subject → pre_screened
    - fail: 更新 Registration → pre_screened_fail, Subject → disqualified
    - pending: 等待 PI 复核（状态暂不变）
    - refer: 类似 fail 但标记为推荐其他项目
    """
    record = PreScreeningRecord.objects.select_related(
        'subject', 'registration',
    ).get(id=record_id)

    if record.result != PreScreeningResult.PENDING:
        raise ValueError('初筛已完成，不允许重复提交')

    if result not in [c[0] for c in PreScreeningResult.choices if c[0] != 'pending']:
        raise ValueError(f'无效的初筛结果: {result}')

    if result in ('fail', 'refer') and not fail_reasons:
        raise ValueError('初筛不通过或推荐时必须填写原因')

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
            logger.info('初筛通过→自动创建筛选记录: reg=%s', reg.registration_no)
        except Exception:
            logger.warning('自动创建筛选记录失败', exc_info=True)
    elif result in (PreScreeningResult.FAIL, PreScreeningResult.REFER):
        reg.status = RegistrationStatus.PRE_SCREENED_FAIL
        reg.save(update_fields=['status', 'update_time'])
        subject.status = SubjectStatus.DISQUALIFIED
        subject.save(update_fields=['status', 'update_time'])

    # 初筛补偿→自动创建支付记录
    compensation = getattr(record, 'compensation_amount', None)
    if compensation and float(compensation) > 0:
        try:
            from ..models_execution import SubjectPayment
            SubjectPayment.objects.create(
                subject=subject,
                payment_type='transportation',
                amount=compensation,
                status='pending',
                notes=f'初筛交通补贴 ({record.pre_screening_no})',
            )
            logger.info('初筛补偿→自动创建支付: subject=%s, amount=%s', subject.id, compensation)
        except Exception:
            logger.warning('自动创建初筛补偿支付失败', exc_info=True)

    try:
        from .recruitment_notify import notify_pre_screening_result
        notify_pre_screening_result(record)
    except Exception:
        logger.warning('初筛通知发送失败', exc_info=True)

    try:
        from libs.wechat_notification import notify_screening_result_to_subject
        notify_screening_result_to_subject(reg, result, stage='初筛')
    except Exception:
        logger.warning('微信初筛结果通知发送失败', exc_info=True)

    logger.info('初筛完成: %s result=%s', record.pre_screening_no, result)
    sync_after_prescreening_state_change(record, source='complete')
    return _record_to_dict(record)


@transaction.atomic
def review_pre_screening(
    record_id: int,
    decision: str,
    notes: str,
    reviewer_id: int,
) -> dict:
    """PI 复核初筛"""
    record = PreScreeningRecord.objects.select_related(
        'subject', 'registration',
    ).get(id=record_id)

    if record.result != PreScreeningResult.PENDING:
        raise ValueError('仅待评估状态的初筛可以复核')

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

    logger.info('初筛复核: %s decision=%s by %s', record.pre_screening_no, decision, reviewer_id)
    sync_after_prescreening_state_change(record, source='review')
    return _record_to_dict(record)


def get_today_summary() -> dict:
    """今日初筛摘要统计"""
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
    """获取包含初筛环节的招募漏斗数据"""
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
