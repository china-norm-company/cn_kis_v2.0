"""
执行管理 API

端点前缀：通过 /subject/{id}/ 路径调用
包含：签到签出、依从性评估、礼金支付。
"""
from ninja import Router, Schema, Query
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from apps.identity.decorators import require_permission, require_any_permission, _get_account_from_request

router = Router()


# ============================================================================
# Schema
# ============================================================================
class CheckinIn(Schema):
    enrollment_id: Optional[int] = None
    work_order_id: Optional[int] = None
    location: Optional[str] = ''


class ComplianceIn(Schema):
    enrollment_id: Optional[int] = None
    visit_attendance_rate: float = 100.0
    questionnaire_completion_rate: float = 100.0
    time_window_deviation_days: float = 0
    notes: Optional[str] = ''


class PaymentCreateIn(Schema):
    payment_type: str
    amount: Decimal
    enrollment_id: Optional[int] = None
    notes: Optional[str] = ''


class PaymentConfirmIn(Schema):
    transaction_id: Optional[str] = ''
    payment_method: Optional[str] = ''
    notes: Optional[str] = ''


class BatchPaymentIn(Schema):
    subject_ids: list
    payment_type: str
    amount: Decimal
    notes: Optional[str] = ''


class TicketReplyIn(Schema):
    reply: str


class TicketAssignIn(Schema):
    assigned_to_id: int


class AppointmentCreateIn(Schema):
    appointment_date: date
    appointment_time: Optional[str] = None
    purpose: Optional[str] = ''
    visit_point: Optional[str] = ''
    enrollment_id: Optional[int] = None
    project_code: Optional[str] = ''
    project_name: Optional[str] = ''
    name_pinyin_initials: Optional[str] = ''  # 拼音首字母，用户手动填写


class AppointmentImportItem(Schema):
    """单条预约导入项，若受试者不存在则按手机号/编号自动补建。"""
    subject_phone: Optional[str] = None
    subject_no: Optional[str] = None
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    name_pinyin_initials: Optional[str] = None  # 拼音首字母，Excel 上传或手动填写
    liaison: Optional[str] = None  # 联络员，Excel 列名「联络员」
    gender: Optional[str] = None
    age: Optional[int] = None
    birth_date: Optional[str] = None  # 出生年月（预约导入表）
    appointment_date: Optional[str] = None  # 前端传字符串，后端解析为 date
    appointment_time: Optional[str] = None
    purpose: Optional[str] = ''
    visit_point: Optional[str] = ''
    project_code: Optional[str] = ''
    project_name: Optional[str] = ''
    sc_number: Optional[str] = None  # SC号，导入时非空则直接使用
    rd_number: Optional[str] = None  # RD号，导入时非空则直接使用


class AppointmentImportIn(Schema):
    items: List[AppointmentImportItem]


class AppointmentUpdateIn(Schema):
    """单条预约部分字段更新（今日队列编辑用），仅传要改的字段。"""
    appointment_date: Optional[str] = None  # YYYY-MM-DD
    appointment_time: Optional[str] = None  # HH:mm
    visit_point: Optional[str] = None
    purpose: Optional[str] = None
    project_code: Optional[str] = None
    project_name: Optional[str] = None
    name_pinyin_initials: Optional[str] = None
    liaison: Optional[str] = None


class AppointmentBatchItem(Schema):
    appointment_date: str
    appointment_time: Optional[str] = None
    visit_point: Optional[str] = ''


class AppointmentBatchIn(Schema):
    items: List[AppointmentBatchItem]
    project_code: Optional[str] = ''
    project_name: Optional[str] = ''
    name_pinyin_initials: Optional[str] = ''
    liaison: Optional[str] = ''
    gender: Optional[str] = ''
    age: Optional[int] = None
    enrollment_id: Optional[int] = None


class ScheduleQueryIn(Schema):
    week_offset: int = 0
    month_offset: Optional[int] = None
    person_name: Optional[str] = None


# ============================================================================
# 维周排程（与衡技我的排程同源，供接待台等调用）
# ============================================================================
@router.get('/my-schedule', summary='我的排程')
@require_any_permission([
    'evaluator.schedule.read',
    'subject.recruitment.read',
    'workorder.workorder.read',
])
def my_schedule(request, params: Query[ScheduleQueryIn]):
    """获取当前用户（或指定人员）的排程；与评估台/接待台共用数据源。"""
    account = _get_account_from_request(request)
    from apps.workorder.services.evaluator_service import get_my_schedule, get_my_schedule_month
    if params.month_offset is not None:
        data = get_my_schedule_month(
            account.id,
            month_offset=params.month_offset,
            person_name=params.person_name or '',
        )
    else:
        data = get_my_schedule(
            account.id,
            week_offset=params.week_offset,
            person_name=params.person_name or '',
        )
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# 签到签出
# ============================================================================
@router.post('/{subject_id}/checkin', summary='受试者签到')
@require_permission('subject.subject.update')
def subject_checkin(request, subject_id: int, data: CheckinIn):
    from .services.execution_service import checkin
    account = _get_account_from_request(request)
    record = checkin(
        subject_id, enrollment_id=data.enrollment_id,
        work_order_id=data.work_order_id, location=data.location or '',
        account=account,
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': record.id, 'checkin_date': record.checkin_date.isoformat(),
        'status': record.status,
    }}


@router.post('/checkins/{checkin_id}/checkout', summary='受试者签出')
@require_permission('subject.subject.update')
def subject_checkout(request, checkin_id: int):
    from .services.execution_service import checkout
    record = checkout(checkin_id)
    if not record:
        return 404, {'code': 404, 'msg': '签到记录不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': record.id, 'status': record.status,
        'checkout_time': record.checkout_time.isoformat() if record.checkout_time else None,
    }}


@router.post('/{subject_id}/appointments', summary='新建预约')
@require_permission('subject.subject.update')
def create_appointment(request, subject_id: int, data: AppointmentCreateIn):
    from .services.execution_service import create_appointment as svc_create
    from datetime import time
    appt_time = None
    if data.appointment_time:
        parts = data.appointment_time.split(':')
        if len(parts) >= 2:
            appt_time = time(int(parts[0]), int(parts[1]))
    appt = svc_create(
        subject_id=subject_id,
        appointment_date=data.appointment_date,
        appointment_time=appt_time,
        purpose=data.purpose or '',
        enrollment_id=data.enrollment_id,
        visit_point=data.visit_point or '',
        project_code=data.project_code or '',
        project_name=data.project_name or '',
        name_pinyin_initials=(data.name_pinyin_initials or '').strip() or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': {'id': appt.id}}


def _parse_import_date(s: Optional[str]):
    """将前端/Excel 的日期字符串转为 date，支持 YYYY-MM-DD / YYYY/M/D / 2026年3月5日。"""
    if not s:
        return None
    s = str(s).strip()
    if not s:
        return None
    # 2026年3月5日
    import re
    m = re.match(r'^(\d{4})年(\d{1,2})月(\d{1,2})日?$', s)
    if m:
        try:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except (ValueError, IndexError):
            pass
    # YYYY-MM-DD
    if len(s) >= 10 and s[4] == '-' and s[7] == '-':
        try:
            return date(int(s[:4]), int(s[5:7]), int(s[8:10]))
        except (ValueError, IndexError):
            pass
    # YYYY/M/D
    if '/' in s:
        try:
            parts = [p.strip() for p in s.split('/')]
            if len(parts) == 3:
                return date(int(parts[0]), int(parts[1]), int(parts[2]))
        except (ValueError, IndexError):
            pass
    return None


def _normalize_import_gender(value: Optional[str]) -> str:
    raw = (value or '').strip().lower()
    if raw in ('男', 'male', 'm', '1'):
        return 'male'
    if raw in ('女', 'female', 'f', '2'):
        return 'female'
    if raw in ('其他', 'other', 'o', 'unknown'):
        return 'other'
    return ''


def _build_import_subject_name(item: AppointmentImportItem) -> str:
    explicit_name = (item.subject_name or '').strip()
    if explicit_name:
        return explicit_name
    if item.subject_phone:
        digits = ''.join(ch for ch in str(item.subject_phone) if ch.isdigit())
        suffix = digits[-4:] if digits else '未命名'
        return f'导入受试者{suffix}'
    if item.subject_no:
        return f'导入受试者{str(item.subject_no).strip()[-4:]}'
    return '导入受试者'


def _resolve_or_create_subject_for_import(item: AppointmentImportItem, account=None):
    """按手机号/编号匹配或新建受试者。匹配到已有受试者时，用导入的姓名/性别/年龄更新。"""
    from .models import Subject
    from .services.profile_service import update_profile as svc_update_profile
    from .services.subject_service import (
        create_subject as svc_create_subject,
        find_subjects_by_mobile_normalized,
        normalize_subject_phone,
        resolve_subject_for_mobile_session,
    )

    subject = None
    if item.subject_id:
        subject = Subject.objects.filter(id=item.subject_id, is_deleted=False).first()
    if not subject and item.subject_phone:
        raw_p = item.subject_phone.strip()
        mob = normalize_subject_phone(raw_p)
        appt_d = _parse_import_date(item.appointment_date)
        if mob and find_subjects_by_mobile_normalized(mob).exists():
            subject = resolve_subject_for_mobile_session(raw_p, appt_d)
        if not subject:
            subject = Subject.objects.filter(phone=raw_p, is_deleted=False).first()
    if not subject and item.subject_no:
        subject = Subject.objects.filter(subject_no=item.subject_no.strip(), is_deleted=False).first()
    if subject:
        update_fields = []
        if (item.subject_name or '').strip():
            subject.name = (item.subject_name or '').strip()
            update_fields.append('name')
        if item.gender is not None:
            norm = _normalize_import_gender(item.gender)
            if norm and subject.gender != norm:
                subject.gender = norm
                update_fields.append('gender')
        if item.age is not None:
            try:
                age_val = int(item.age)
                if 0 <= age_val <= 150 and subject.age != age_val:
                    subject.age = age_val
                    update_fields.append('age')
            except (TypeError, ValueError):
                pass
        if update_fields:
            subject.save(update_fields=update_fields + ['update_time'])
        birth_date = _parse_import_date(item.birth_date)
        if birth_date:
            # 导入预约表中的出生年月写入受试者档案，供小程序认证基础信息校验使用
            svc_update_profile(subject.id, birth_date=birth_date)
        return subject

    phone = (item.subject_phone or '').strip()
    subject_no = (item.subject_no or '').strip()
    if not phone and not subject_no:
        return None

    subject = svc_create_subject(
        name=_build_import_subject_name(item),
        gender=_normalize_import_gender(item.gender),
        age=item.age,
        phone=phone,
        source_channel='other',
        account=account,
    )
    if subject_no:
        exists = Subject.objects.filter(subject_no=subject_no).exclude(id=subject.id).exists()
        if not exists:
            subject.subject_no = subject_no
            subject.save(update_fields=['subject_no', 'update_time'])
    birth_date = _parse_import_date(item.birth_date)
    if birth_date:
        svc_update_profile(subject.id, birth_date=birth_date)
    return subject


@router.post('/appointments/import', summary='批量导入预约')
@require_any_permission(['subject.subject.update', 'subject.subject.create'])
def import_appointments(request, data: AppointmentImportIn):
    """批量导入预约，支持按手机号/受试者编号匹配；未命中时自动补建受试者。"""
    import logging
    from .services.execution_service import create_appointment as svc_create
    from datetime import time

    logger = logging.getLogger(__name__)
    created = 0
    errors: list[dict] = []
    account = _get_account_from_request(request)

    if not data or not hasattr(data, 'items'):
        return 400, {'code': 400, 'msg': '请求体缺少 items 列表', 'data': {}}
    if not isinstance(data.items, list):
        return 400, {'code': 400, 'msg': 'items 必须为数组', 'data': {}}
    if len(data.items) == 0:
        return 400, {'code': 400, 'msg': '请上传包含至少一行的预约数据', 'data': {}}

    try:
        for idx, item in enumerate(data.items):
            phone = (item.subject_phone or '').strip()
            project_code = (item.project_code or '').strip()
            if not phone:
                errors.append({'row': idx + 1, 'msg': '手机号不能为空'})
                continue
            if not project_code:
                errors.append({'row': idx + 1, 'msg': '项目编号不能为空'})
                continue

            subject = _resolve_or_create_subject_for_import(item, account=account)
            if not subject:
                errors.append({'row': idx + 1, 'msg': '请至少填写手机号或受试者编号'})
                continue

            appt_date = _parse_import_date(item.appointment_date)
            if not appt_date:
                errors.append({'row': idx + 1, 'msg': '预约日期无效，请使用 YYYY-MM-DD、YYYY/M/D 或 2026年3月5日 格式'})
                continue

            appt_time = None
            if item.appointment_time:
                parts = str(item.appointment_time).strip().split(':')
                if len(parts) >= 2:
                    try:
                        appt_time = time(int(parts[0]), int(parts[1]))
                    except (ValueError, IndexError):
                        pass

            try:
                svc_create(
                    subject_id=subject.id,
                    appointment_date=appt_date,
                    appointment_time=appt_time,
                    purpose=item.purpose or '',
                    enrollment_id=None,
                    visit_point=item.visit_point or '',
                    project_code=project_code,
                    project_name=item.project_name or '',
                    name_pinyin_initials=(item.name_pinyin_initials or '').strip() or '',
                    liaison=(item.liaison or '').strip() or '',
                )
                pc = project_code
                sc_val = (item.sc_number or '').strip()
                rd_val = (item.rd_number or '').strip()
                if pc and (sc_val or rd_val):
                    from apps.subject.services.reception_service import ensure_project_sc_from_import
                    ensure_project_sc_from_import(
                        subject_id=subject.id,
                        project_code=pc,
                        sc_number=sc_val or None,
                        rd_number=rd_val or None,
                        operator_id=account.id if account else None,
                    )
                created += 1
            except Exception as e:
                errors.append({'row': idx + 1, 'msg': str(e)})

        return {'code': 200, 'msg': 'OK', 'data': {'created': created, 'errors': errors}}
    except Exception as e:
        logger.exception('预约导入失败: %s', e)
        err_msg = str(e).strip() if e else ''
        if not err_msg:
            err_msg = '导入失败，请检查数据格式（预约日期为 YYYY-MM-DD / YYYY/M/D，且项目编号、手机号不能为空）'
        return 500, {
            'code': 500,
            'msg': err_msg,
            'data': {},
        }


@router.patch('/appointments/{appointment_id}', summary='更新单条预约（今日队列编辑）')
@require_permission('subject.subject.update')
def update_appointment(request, appointment_id: int, data: AppointmentUpdateIn):
    from .services.execution_service import update_appointment as svc_update
    from datetime import time as dt_time, date as dt_date
    appt_date = None
    if data.appointment_date:
        s = data.appointment_date.strip()
        if len(s) >= 10 and s[4] == '-' and s[7] == '-':
            try:
                appt_date = dt_date(int(s[:4]), int(s[5:7]), int(s[8:10]))
            except (ValueError, IndexError):
                pass
    appt_time = None
    if data.appointment_time:
        parts = data.appointment_time.strip().split(':')
        if len(parts) >= 2:
            try:
                appt_time = dt_time(int(parts[0]), int(parts[1]))
            except (ValueError, IndexError):
                pass
    appt = svc_update(
        appointment_id=appointment_id,
        appointment_date=appt_date,
        appointment_time=appt_time,
        visit_point=data.visit_point,
        purpose=data.purpose,
        project_code=data.project_code,
        project_name=data.project_name,
        name_pinyin_initials=data.name_pinyin_initials,
        liaison=data.liaison,
    )
    if not appt:
        return 404, {'code': 404, 'msg': '预约不存在或已取消'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': appt.id}}


@router.get('/{subject_id}/appointments/latest', summary='该受试者在该项目下最近一次预约时间')
@require_permission('subject.subject.read')
def get_latest_appointment_time(request, subject_id: int, project_code: Optional[str] = None):
    from .services.execution_service import get_latest_appointment_time as svc
    t = svc(subject_id=subject_id, project_code=project_code or '')
    return {'code': 200, 'msg': 'OK', 'data': {'appointment_time': t}}


@router.get('/appointments/daily-summary', summary='按日按项目预约情况汇总')
@require_permission('subject.subject.read')
def get_daily_appointment_summary(request, target_date: Optional[date] = None, project_code: Optional[str] = None):
    from .services.execution_service import get_daily_appointment_summary as svc
    from django.utils import timezone
    d = None
    if getattr(request, 'GET', None):
        raw = request.GET.get('target_date')
        if raw and isinstance(raw, str):
            try:
                parts = raw.strip().split('-')
                if len(parts) == 3:
                    d = date(int(parts[0]), int(parts[1]), int(parts[2]))
            except (ValueError, TypeError, IndexError):
                pass
    if d is None and target_date is not None:
        d = target_date if hasattr(target_date, 'isoformat') else None
    if d is None:
        d = timezone.localdate()
    pc = ''
    if getattr(request, 'GET', None) and request.GET.get('project_code'):
        pc = request.GET.get('project_code') or ''
    else:
        pc = (project_code or '') if project_code is not None else ''
    slots = svc(target_date=d, project_code=pc or '')
    return {'code': 200, 'msg': 'OK', 'data': {'date': d.isoformat(), 'slots': slots}}


@router.post('/{subject_id}/appointments/batch', summary='批量创建回访预约')
@require_permission('subject.subject.update')
def batch_create_appointments(request, subject_id: int, data: AppointmentBatchIn):
    from .services.execution_service import batch_create_appointments as svc
    ids = svc(
        subject_id=subject_id,
        items=[i.dict() for i in data.items],
        project_code=data.project_code or '',
        project_name=data.project_name or '',
        name_pinyin_initials=data.name_pinyin_initials or '',
        liaison=data.liaison or '',
        gender=data.gender or '',
        age=data.age,
        enrollment_id=data.enrollment_id,
    )
    return {'code': 200, 'msg': 'OK', 'data': {'created': len(ids), 'ids': ids}}


@router.get('/{subject_id}/checkins', summary='签到记录列表')
@require_permission('subject.subject.read')
def list_checkins(request, subject_id: int):
    from .services.execution_service import list_checkins as svc_list
    items = svc_list(subject_id=subject_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'checkin_date': r.checkin_date.isoformat(),
            'checkin_time': r.checkin_time.isoformat() if r.checkin_time else None,
            'checkout_time': r.checkout_time.isoformat() if r.checkout_time else None,
            'status': r.status,
        } for r in items],
    }}


# ============================================================================
# 依从性
# ============================================================================
@router.get('/{subject_id}/compliance', summary='依从性记录')
@require_permission('subject.subject.read')
def get_compliance(request, subject_id: int):
    from .services.compliance_service import list_compliance_records
    items = list_compliance_records(subject_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'assessment_date': r.assessment_date.isoformat(),
            'visit_attendance_rate': str(r.visit_attendance_rate),
            'questionnaire_completion_rate': str(r.questionnaire_completion_rate),
            'time_window_deviation': str(r.time_window_deviation),
            'overall_score': str(r.overall_score), 'level': r.level,
        } for r in items],
    }}


@router.post('/{subject_id}/compliance', summary='记录依从性评估')
@require_permission('subject.subject.update')
def assess_compliance(request, subject_id: int, data: ComplianceIn):
    from .services.compliance_service import assess_compliance as svc_assess
    account = _get_account_from_request(request)
    record = svc_assess(
        subject_id=subject_id, enrollment_id=data.enrollment_id,
        visit_attendance_rate=data.visit_attendance_rate,
        questionnaire_completion_rate=data.questionnaire_completion_rate,
        time_window_deviation_days=data.time_window_deviation_days,
        notes=data.notes or '',
        assessed_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': record.id, 'overall_score': str(record.overall_score), 'level': record.level,
    }}


# ============================================================================
# 礼金支付
# ============================================================================
@router.post('/{subject_id}/payment', summary='创建礼金支付')
@require_permission('subject.subject.update')
def create_payment(request, subject_id: int, data: PaymentCreateIn):
    from .services.payment_service import create_payment as svc_create
    account = _get_account_from_request(request)
    payment = svc_create(
        subject_id=subject_id, payment_type=data.payment_type,
        amount=data.amount, enrollment_id=data.enrollment_id,
        notes=data.notes or '', account=account,
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': payment.id, 'payment_no': payment.payment_no, 'status': payment.status,
    }}


@router.post('/payments/{payment_id}/initiate', summary='发起礼金支付')
@require_permission('subject.subject.update')
def initiate_payment(request, payment_id: int):
    from .services.payment_service import initiate_payment as svc_initiate
    payment = svc_initiate(payment_id)
    if not payment:
        return 400, {'code': 400, 'msg': '无法发起支付'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': payment.id, 'status': payment.status}}


@router.post('/payments/{payment_id}/confirm', summary='确认支付完成')
@require_permission('subject.subject.update')
def confirm_payment(request, payment_id: int, data: PaymentConfirmIn):
    from .services.payment_service import confirm_payment as svc_confirm
    payment = svc_confirm(payment_id, data.transaction_id or '', data.payment_method or '')
    if not payment:
        return 404, {'code': 404, 'msg': '支付记录不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': payment.id, 'status': payment.status}}


@router.get('/{subject_id}/payments', summary='礼金记录列表')
@require_permission('subject.subject.read')
def list_payments(request, subject_id: int):
    from .services.payment_service import list_payments as svc_list
    items = svc_list(subject_id=subject_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': p.id, 'payment_no': p.payment_no,
            'payment_type': p.payment_type, 'amount': str(p.amount),
            'status': p.status,
            'paid_at': p.paid_at.isoformat() if p.paid_at else None,
        } for p in items],
    }}


@router.get('/payments/summary', summary='支付汇总统计')
@require_permission('subject.subject.read')
def payment_summary(request):
    from .services.payment_service import get_payment_summary
    data = get_payment_summary()
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/payments/batch-create', summary='批量创建支付记录')
@require_permission('subject.subject.update')
def batch_create_payments(request, data: BatchPaymentIn):
    from .services.payment_service import batch_create_payments as svc_batch
    account = _get_account_from_request(request)
    results = svc_batch(
        subject_ids=data.subject_ids,
        payment_type=data.payment_type,
        amount=data.amount,
        notes=data.notes or '',
        account=account,
    )
    return {'code': 200, 'msg': 'OK', 'data': {'created_count': len(results), 'ids': results}}


# ============================================================================
# 客服工单（B端管理）
# ============================================================================
@router.get('/support-tickets', summary='客服工单列表')
@require_permission('subject.recruitment.read')
def list_support_tickets(request, status: Optional[str] = None):
    from .services.execution_service import list_support_tickets as svc_list, calc_ticket_sla
    items = svc_list(status=status)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': t.id, 'ticket_no': t.ticket_no, 'category': t.category,
            'title': t.title, 'status': t.status,
            'assigned_to_id': t.assigned_to_id,
            'priority': t.priority,
            'sla': calc_ticket_sla(t),
            'create_time': t.create_time.isoformat(),
        } for t in items],
    }}


@router.post('/support-tickets/{ticket_id}/reply', summary='回复客服工单')
@require_permission('subject.recruitment.update')
def reply_support_ticket(request, ticket_id: int, data: TicketReplyIn):
    from .services.execution_service import reply_support_ticket as svc_reply
    account = _get_account_from_request(request)
    ticket = svc_reply(ticket_id, data.reply, account)
    if not ticket:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': ticket.id, 'status': ticket.status}}


@router.post('/support-tickets/{ticket_id}/assign', summary='指派客服工单')
@require_permission('subject.recruitment.update')
def assign_support_ticket(request, ticket_id: int, data: TicketAssignIn):
    from .services.execution_service import assign_support_ticket as svc_assign
    account = _get_account_from_request(request)
    ticket = svc_assign(ticket_id, data.assigned_to_id, account)
    if not ticket:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': ticket.id, 'status': ticket.status}}


@router.post('/support-tickets/{ticket_id}/close', summary='关闭客服工单')
@require_permission('subject.recruitment.update')
def close_support_ticket(request, ticket_id: int):
    from .services.execution_service import close_support_ticket as svc_close
    account = _get_account_from_request(request)
    ticket = svc_close(ticket_id, account)
    if not ticket:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': ticket.id, 'status': ticket.status}}
