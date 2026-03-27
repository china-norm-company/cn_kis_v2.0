"""
实验室人员管理 API

端点：
- 仪表盘: /lab-personnel/dashboard
- 人员档案: /lab-personnel/staff/*
- 证书管理: /lab-personnel/certificates/*
- 方法资质: /lab-personnel/method-quals/*
- 排班管理: /lab-personnel/schedules/*
- 工时统计: /lab-personnel/worktime/*
- 工单派发: /lab-personnel/dispatch/*
- 风险预警: /lab-personnel/risks/*
"""
from ninja import Router, Schema, Query
from pydantic import ConfigDict
from typing import Optional, List
from datetime import date

from apps.identity.decorators import require_permission

router = Router()


# ============================================================================
# Schema 定义
# ============================================================================

# --- 人员档案 ---
class StaffListParams(Schema):
    lab_role: Optional[str] = None
    competency_level: Optional[str] = None
    employment_type: Optional[str] = None
    is_active: Optional[bool] = None
    search: Optional[str] = None
    page: int = 1
    page_size: int = 20


class LabProfileCreateIn(Schema):
    lab_role: str = 'instrument_operator'
    lab_role_secondary: Optional[str] = ''
    employment_type: str = 'full_time'
    competency_level: str = 'L1'
    available_weekdays: Optional[List[int]] = [1, 2, 3, 4, 5]
    max_daily_hours: int = 8
    max_weekly_hours: int = 40
    notes: Optional[str] = ''


# --- 证书管理 ---
class CertificateListParams(Schema):
    staff_id: Optional[int] = None
    cert_type: Optional[str] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class CertificateCreateIn(Schema):
    staff_id: int
    cert_type: str
    cert_name: str
    cert_number: Optional[str] = ''
    issuing_authority: Optional[str] = ''
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    file_url: Optional[str] = ''


class CertificateUpdateIn(Schema):
    cert_name: Optional[str] = None
    cert_number: Optional[str] = None
    issuing_authority: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    file_url: Optional[str] = None
    status: Optional[str] = None


class CertificateRenewIn(Schema):
    new_expiry_date: date
    new_cert_number: Optional[str] = None


# --- 方法资质 ---
class MethodQualListParams(Schema):
    staff_id: Optional[int] = None
    method_id: Optional[int] = None
    level: Optional[str] = None
    page: int = 1
    page_size: int = 20


class MethodQualCreateIn(Schema):
    staff_id: int
    method_id: int
    level: str = 'learning'
    qualified_date: Optional[date] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = ''


class MethodQualUpdateIn(Schema):
    level: Optional[str] = None
    qualified_date: Optional[date] = None
    expiry_date: Optional[date] = None
    total_executions: Optional[int] = None
    last_execution_date: Optional[date] = None
    notes: Optional[str] = None


# --- 排班管理 ---
class ScheduleCreateIn(Schema):
    week_start_date: date
    notes: Optional[str] = ''


class SlotListParams(Schema):
    schedule_id: Optional[int] = None
    staff_id: Optional[int] = None
    shift_date: Optional[date] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    confirm_status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class SlotCreateIn(Schema):
    schedule_id: int
    staff_id: int
    shift_date: date
    start_time: str
    end_time: str
    planned_hours: Optional[float] = None
    project_name: Optional[str] = ''
    protocol_id: Optional[int] = None
    tasks_description: Optional[str] = ''


class SlotUpdateIn(Schema):
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    planned_hours: Optional[float] = None
    project_name: Optional[str] = None
    protocol_id: Optional[int] = None
    tasks_description: Optional[str] = None


class SwapRequestCreateIn(Schema):
    original_slot_id: int
    target_staff_id: int
    reason: str


# --- 工时统计 ---
class WorkTimeListParams(Schema):
    staff_id: Optional[int] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    source: Optional[str] = None
    page: int = 1
    page_size: int = 20


class WorkTimeCreateIn(Schema):
    staff_id: int
    work_date: date
    start_time: str
    end_time: Optional[str] = None
    actual_hours: float
    source: str = 'manual'
    source_id: Optional[int] = None
    description: Optional[str] = ''


class WorkTimeSummaryParams(Schema):
    week_start_date: Optional[date] = None
    staff_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


# --- 工单派发 ---
class DispatchAssignIn(Schema):
    workorder_id: int
    staff_id: int
    force: bool = False


# --- 风险预警 ---
class RiskListParams(Schema):
    level: Optional[str] = None
    risk_type: Optional[str] = None
    status: Optional[str] = None
    related_staff_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


class RiskResolveIn(Schema):
    action_taken: str


# ============================================================================
# 辅助函数
# ============================================================================
def _profile_to_dict(p) -> dict:
    return {
        'id': p.id,
        'staff_id': p.staff_id,
        'staff_name': p.staff.name,
        'employee_no': p.staff.employee_no,
        'position': p.staff.position,
        'department': p.staff.department,
        'phone': p.staff.phone,
        'email': p.staff.email,
        'lab_role': p.lab_role,
        'lab_role_display': p.get_lab_role_display(),
        'lab_role_secondary': p.lab_role_secondary,
        'employment_type': p.employment_type,
        'employment_type_display': p.get_employment_type_display(),
        'competency_level': p.competency_level,
        'competency_level_display': p.get_competency_level_display(),
        'competency_level_updated_at': p.competency_level_updated_at.isoformat() if p.competency_level_updated_at else None,
        'available_weekdays': p.available_weekdays,
        'max_daily_hours': p.max_daily_hours,
        'max_weekly_hours': p.max_weekly_hours,
        'is_active': p.is_active,
        'gcp_status': p.staff.gcp_status,
        'gcp_expiry': p.staff.gcp_expiry.isoformat() if p.staff.gcp_expiry else None,
        'notes': p.notes,
        'create_time': p.create_time.isoformat(),
    }


def _cert_to_dict(c) -> dict:
    return {
        'id': c.id,
        'staff_id': c.staff_id,
        'staff_name': c.staff.name,
        'cert_type': c.cert_type,
        'cert_type_display': c.get_cert_type_display(),
        'cert_name': c.cert_name,
        'cert_number': c.cert_number,
        'issuing_authority': c.issuing_authority,
        'issue_date': c.issue_date.isoformat() if c.issue_date else None,
        'expiry_date': c.expiry_date.isoformat() if c.expiry_date else None,
        'status': c.status,
        'status_display': c.get_status_display(),
        'is_locked': c.is_locked,
        'file_url': c.file_url,
        'create_time': c.create_time.isoformat(),
    }


def _method_qual_to_dict(mq) -> dict:
    return {
        'id': mq.id,
        'staff_id': mq.staff_id,
        'staff_name': mq.staff.name,
        'method_id': mq.method_id,
        'method_name': mq.method.name,
        'method_code': mq.method.code,
        'level': mq.level,
        'level_display': mq.get_level_display(),
        'qualified_date': mq.qualified_date.isoformat() if mq.qualified_date else None,
        'expiry_date': mq.expiry_date.isoformat() if mq.expiry_date else None,
        'total_executions': mq.total_executions,
        'last_execution_date': mq.last_execution_date.isoformat() if mq.last_execution_date else None,
        'notes': mq.notes,
        'create_time': mq.create_time.isoformat(),
    }


def _schedule_to_dict(s, include_slots=False) -> dict:
    d = {
        'id': s.id,
        'week_start_date': s.week_start_date.isoformat(),
        'week_end_date': s.week_end_date.isoformat(),
        'status': s.status,
        'status_display': s.get_status_display(),
        'published_at': s.published_at.isoformat() if s.published_at else None,
        'notes': s.notes,
        'slot_count': s.slots.count() if hasattr(s, 'slots') else 0,
        'create_time': s.create_time.isoformat(),
    }
    if include_slots:
        d['slots'] = [_slot_to_dict(slot) for slot in s.slots.select_related('staff').all()]
    return d


def _slot_to_dict(slot) -> dict:
    return {
        'id': slot.id,
        'schedule_id': slot.schedule_id,
        'staff_id': slot.staff_id,
        'staff_name': slot.staff.name,
        'shift_date': slot.shift_date.isoformat(),
        'start_time': slot.start_time.strftime('%H:%M'),
        'end_time': slot.end_time.strftime('%H:%M'),
        'planned_hours': float(slot.planned_hours),
        'project_name': slot.project_name,
        'protocol_id': slot.protocol_id,
        'tasks_description': slot.tasks_description,
        'confirm_status': slot.confirm_status,
        'confirm_status_display': slot.get_confirm_status_display(),
        'reject_reason': slot.reject_reason,
        'create_time': slot.create_time.isoformat(),
    }


def _worktime_log_to_dict(w) -> dict:
    return {
        'id': w.id,
        'staff_id': w.staff_id,
        'staff_name': w.staff.name,
        'work_date': w.work_date.isoformat(),
        'start_time': w.start_time.strftime('%H:%M'),
        'end_time': w.end_time.strftime('%H:%M') if w.end_time else None,
        'actual_hours': float(w.actual_hours),
        'source': w.source,
        'source_display': w.get_source_display(),
        'source_id': w.source_id,
        'description': w.description,
        'create_time': w.create_time.isoformat(),
    }


def _worktime_summary_to_dict(s) -> dict:
    return {
        'id': s.id,
        'staff_id': s.staff_id,
        'staff_name': s.staff.name,
        'week_start_date': s.week_start_date.isoformat(),
        'total_hours': float(s.total_hours),
        'workorder_hours': float(s.workorder_hours),
        'training_hours': float(s.training_hours),
        'other_hours': float(s.other_hours),
        'available_hours': float(s.available_hours),
        'utilization_rate': float(s.utilization_rate),
    }


def _risk_to_dict(r) -> dict:
    return {
        'id': r.id,
        'risk_type': r.risk_type,
        'risk_type_display': r.get_risk_type_display(),
        'level': r.level,
        'level_display': r.get_level_display(),
        'title': r.title,
        'description': r.description,
        'status': r.status,
        'status_display': r.get_status_display(),
        'related_staff_id': r.related_staff_id,
        'related_staff_name': r.related_staff.name if r.related_staff else None,
        'related_object_type': r.related_object_type,
        'related_object_id': r.related_object_id,
        'action_taken': r.action_taken,
        'resolved_at': r.resolved_at.isoformat() if r.resolved_at else None,
        'create_time': r.create_time.isoformat(),
    }


# ============================================================================
# 仪表盘 API
# ============================================================================
@router.get('/dashboard', summary='人员管理总览面板')
@require_permission('lab_personnel.dashboard.read')
def dashboard(request):
    from .services.dashboard_service import get_dashboard_data
    data = get_dashboard_data()
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# 人员档案 API
# ============================================================================
@router.get('/staff/list', summary='实验室人员列表')
@require_permission('lab_personnel.staff.read')
def list_staff(request, params: StaffListParams = Query(...)):
    from .services.staff_service import list_lab_staff
    result = list_lab_staff(
        lab_role=params.lab_role,
        competency_level=params.competency_level,
        employment_type=params.employment_type,
        is_active=params.is_active,
        search=params.search,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_profile_to_dict(p) for p in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/staff/qualification-matrix', summary='资质矩阵视图')
@require_permission('lab_personnel.staff.read')
def qualification_matrix(request):
    from .services.qualification_service import get_qualification_matrix
    data = get_qualification_matrix()
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/staff/{staff_id}', summary='人员完整档案')
@require_permission('lab_personnel.staff.read')
def get_staff_detail(request, staff_id: int):
    from .services.staff_service import get_staff_full_detail
    data = get_staff_full_detail(staff_id)
    if not data:
        return {'code': 404, 'msg': '人员不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/staff/{staff_id}/profile', summary='创建/更新实验室档案')
@require_permission('lab_personnel.staff.manage')
def upsert_lab_profile(request, staff_id: int, data: LabProfileCreateIn):
    from .services.staff_service import upsert_lab_staff_profile
    profile = upsert_lab_staff_profile(staff_id, **data.dict())
    if not profile:
        return {'code': 404, 'msg': 'Staff不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _profile_to_dict(profile)}


# ============================================================================
# 证书管理 API
# ============================================================================
@router.get('/certificates/list', summary='证书列表')
@require_permission('lab_personnel.certificate.read')
def list_certificates(request, params: CertificateListParams = Query(...)):
    from .services.certificate_service import list_certificates as _list_certs
    result = _list_certs(
        staff_id=params.staff_id,
        cert_type=params.cert_type,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_cert_to_dict(c) for c in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/certificates/create', summary='新增证书')
@require_permission('lab_personnel.certificate.manage')
def create_certificate(request, data: CertificateCreateIn):
    from .services.certificate_service import create_certificate as _create_cert
    cert = _create_cert(**data.dict())
    return {'code': 200, 'msg': 'OK', 'data': _cert_to_dict(cert)}


@router.get('/certificates/expiry-alerts', summary='到期预警列表')
@require_permission('lab_personnel.certificate.read')
def cert_expiry_alerts(request):
    from .services.certificate_service import get_expiry_alerts
    data = get_expiry_alerts()
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.put('/certificates/{cert_id}', summary='更新证书')
@require_permission('lab_personnel.certificate.manage')
def update_certificate(request, cert_id: int, data: CertificateUpdateIn):
    from .services.certificate_service import update_certificate as _update_cert
    cert = _update_cert(cert_id, **data.dict(exclude_unset=True))
    if not cert:
        return {'code': 404, 'msg': '证书不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _cert_to_dict(cert)}


@router.post('/certificates/{cert_id}/renew', summary='证书续期')
@require_permission('lab_personnel.certificate.manage')
def renew_certificate(request, cert_id: int, data: CertificateRenewIn):
    from .services.certificate_service import renew_certificate as _renew_cert
    cert = _renew_cert(cert_id, new_expiry_date=data.new_expiry_date,
                       new_cert_number=data.new_cert_number)
    if not cert:
        return {'code': 404, 'msg': '证书不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _cert_to_dict(cert)}


# ============================================================================
# 方法资质 API
# ============================================================================
@router.get('/method-quals/list', summary='方法资质列表')
@require_permission('lab_personnel.qualification.read')
def list_method_quals(request, params: MethodQualListParams = Query(...)):
    from .services.qualification_service import list_method_qualifications
    result = list_method_qualifications(
        staff_id=params.staff_id,
        method_id=params.method_id,
        level=params.level,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_method_qual_to_dict(mq) for mq in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/method-quals/create', summary='新增方法资质')
@require_permission('lab_personnel.qualification.manage')
def create_method_qual(request, data: MethodQualCreateIn):
    from .services.qualification_service import create_method_qualification
    mq = create_method_qualification(**data.dict())
    return {'code': 200, 'msg': 'OK', 'data': _method_qual_to_dict(mq)}


@router.get('/method-quals/gap-analysis', summary='能力差距分析')
@require_permission('lab_personnel.qualification.read')
def gap_analysis(request, protocol_id: int = None):
    from .services.qualification_service import get_gap_analysis
    data = get_gap_analysis(protocol_id=protocol_id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.put('/method-quals/{qual_id}', summary='更新方法资质')
@require_permission('lab_personnel.qualification.manage')
def update_method_qual(request, qual_id: int, data: MethodQualUpdateIn):
    from .services.qualification_service import update_method_qualification
    mq = update_method_qualification(qual_id, **data.dict(exclude_unset=True))
    if not mq:
        return {'code': 404, 'msg': '方法资质不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _method_qual_to_dict(mq)}


# ============================================================================
# 排班管理 API
# ============================================================================
@router.get('/schedules/list', summary='排班计划列表')
@require_permission('lab_personnel.schedule.read')
def list_schedules(request, page: int = 1, page_size: int = 20):
    from .services.scheduling_service import list_schedules as _list_schedules
    result = _list_schedules(page=page, page_size=page_size)
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_schedule_to_dict(s) for s in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/schedules/create', summary='创建排班计划')
@require_permission('lab_personnel.schedule.manage')
def create_schedule(request, data: ScheduleCreateIn):
    from .services.scheduling_service import create_schedule as _create
    schedule = _create(
        week_start_date=data.week_start_date,
        notes=data.notes or '',
        created_by_id=getattr(request, 'user_id', None),
    )
    return {'code': 200, 'msg': 'OK', 'data': _schedule_to_dict(schedule)}


@router.get('/schedules/{schedule_id}', summary='排班计划详情')
@require_permission('lab_personnel.schedule.read')
def get_schedule(request, schedule_id: int):
    from .services.scheduling_service import get_schedule as _get
    s = _get(schedule_id)
    if not s:
        return {'code': 404, 'msg': '排班计划不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _schedule_to_dict(s, include_slots=True)}


@router.post('/schedules/{schedule_id}/publish', summary='发布排班')
@require_permission('lab_personnel.schedule.manage')
def publish_schedule(request, schedule_id: int):
    from .services.scheduling_service import publish_schedule as _publish
    result = _publish(schedule_id)
    if not result['success']:
        return {'code': 400, 'msg': result['msg'], 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _schedule_to_dict(result['schedule'])}


@router.get('/schedules/slots', summary='排班时间槽查询')
@require_permission('lab_personnel.schedule.read')
def list_slots(request, params: SlotListParams = Query(...)):
    from .services.scheduling_service import list_slots as _list_slots
    result = _list_slots(
        schedule_id=params.schedule_id,
        staff_id=params.staff_id,
        shift_date=params.shift_date,
        date_from=params.date_from,
        date_to=params.date_to,
        confirm_status=params.confirm_status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_slot_to_dict(slot) for slot in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/schedules/slots/create', summary='创建排班时间槽')
@require_permission('lab_personnel.schedule.manage')
def create_slot(request, data: SlotCreateIn):
    from .services.scheduling_service import create_slot as _create_slot
    result = _create_slot(**data.dict())
    if not result['success']:
        return {'code': 400, 'msg': result['msg'], 'data': result.get('conflicts')}
    return {'code': 200, 'msg': 'OK', 'data': _slot_to_dict(result['slot'])}


@router.put('/schedules/slots/{slot_id}', summary='更新排班时间槽')
@require_permission('lab_personnel.schedule.manage')
def update_slot(request, slot_id: int, data: SlotUpdateIn):
    from .services.scheduling_service import update_slot as _update_slot
    result = _update_slot(slot_id, **data.dict(exclude_unset=True))
    if not result['success']:
        return {'code': 400, 'msg': result['msg'], 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _slot_to_dict(result['slot'])}


@router.delete('/schedules/slots/{slot_id}', summary='删除排班时间槽')
@require_permission('lab_personnel.schedule.manage')
def delete_slot(request, slot_id: int):
    from .services.scheduling_service import delete_slot as _delete_slot
    ok = _delete_slot(slot_id)
    if not ok:
        return {'code': 404, 'msg': '排班时间槽不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.post('/schedules/slots/{slot_id}/confirm', summary='确认排班')
@require_permission('lab_personnel.schedule.read')
def confirm_slot(request, slot_id: int):
    from .services.scheduling_service import confirm_slot as _confirm
    result = _confirm(slot_id)
    if not result['success']:
        return {'code': 400, 'msg': result['msg'], 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _slot_to_dict(result['slot'])}


@router.post('/schedules/slots/{slot_id}/reject', summary='拒绝排班')
@require_permission('lab_personnel.schedule.read')
def reject_slot(request, slot_id: int, reason: str = ''):
    from .services.scheduling_service import reject_slot as _reject
    result = _reject(slot_id, reason=reason)
    if not result['success']:
        return {'code': 400, 'msg': result['msg'], 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _slot_to_dict(result['slot'])}


@router.get('/schedules/conflicts', summary='排班冲突检测')
@require_permission('lab_personnel.schedule.read')
def detect_conflicts(request, schedule_id: int = None, week_start_date: date = None):
    from .services.scheduling_service import detect_conflicts as _detect
    data = _detect(schedule_id=schedule_id, week_start_date=week_start_date)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/schedules/swap-requests/create', summary='换班申请')
@require_permission('lab_personnel.schedule.read')
def create_swap_request(request, data: SwapRequestCreateIn):
    from .services.scheduling_service import create_swap_request as _create_swap
    result = _create_swap(
        original_slot_id=data.original_slot_id,
        requester_id=getattr(request, 'user_id', None),
        target_staff_id=data.target_staff_id,
        reason=data.reason,
    )
    if not result['success']:
        return {'code': 400, 'msg': result['msg'], 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': result['data']}


@router.post('/schedules/swap-requests/{swap_id}/approve', summary='审批换班')
@require_permission('lab_personnel.schedule.manage')
def approve_swap_request(request, swap_id: int, approved: bool = True):
    from .services.scheduling_service import approve_swap_request as _approve
    result = _approve(swap_id, approved=approved,
                      approved_by_id=getattr(request, 'user_id', None))
    if not result['success']:
        return {'code': 400, 'msg': result['msg'], 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': result['data']}


# ============================================================================
# 工时统计 API
# ============================================================================
@router.get('/worktime/logs', summary='工时明细')
@require_permission('lab_personnel.worktime.read')
def list_worktime_logs(request, params: WorkTimeListParams = Query(...)):
    from .services.worktime_service import list_worktime_logs as _list_logs
    result = _list_logs(
        staff_id=params.staff_id,
        date_from=params.date_from,
        date_to=params.date_to,
        source=params.source,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_worktime_log_to_dict(w) for w in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/worktime/summary', summary='工时汇总')
@require_permission('lab_personnel.worktime.read')
def worktime_summary(request, params: WorkTimeSummaryParams = Query(...)):
    from .services.worktime_service import get_worktime_summary
    result = get_worktime_summary(
        week_start_date=params.week_start_date,
        staff_id=params.staff_id,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_worktime_summary_to_dict(s) for s in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/worktime/utilization', summary='工时利用率分析')
@require_permission('lab_personnel.worktime.read')
def worktime_utilization(request, week_start_date: date = None):
    from .services.worktime_service import get_utilization_analysis
    data = get_utilization_analysis(week_start_date=week_start_date)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/worktime/logs/create', summary='手动录入工时')
@require_permission('lab_personnel.worktime.manage')
def create_worktime_log(request, data: WorkTimeCreateIn):
    from .services.worktime_service import create_worktime_log as _create_log
    log = _create_log(**data.dict())
    return {'code': 200, 'msg': 'OK', 'data': _worktime_log_to_dict(log)}


@router.get('/worktime/capacity-forecast', summary='产能预测')
@require_permission('lab_personnel.worktime.read')
def capacity_forecast(request, weeks: int = 4):
    from .services.worktime_service import get_capacity_forecast
    data = get_capacity_forecast(weeks=weeks)
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# 工单派发 API
# ============================================================================
@router.get('/dispatch/candidates', summary='工单候选执行人')
@require_permission('lab_personnel.dispatch.read')
def dispatch_candidates(request, workorder_id: int):
    from .services.dispatch_service import get_dispatch_candidates
    data = get_dispatch_candidates(workorder_id=workorder_id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/dispatch/assign', summary='资质校验派工')
@require_permission('lab_personnel.dispatch.manage')
def dispatch_assign(request, data: DispatchAssignIn):
    from .services.dispatch_service import dispatch_assign as _assign
    result = _assign(
        workorder_id=data.workorder_id,
        staff_id=data.staff_id,
        force=data.force,
        assigned_by_id=getattr(request, 'user_id', None),
    )
    if not result['success']:
        return {'code': 400, 'msg': result['msg'], 'data': result.get('checks')}
    return {'code': 200, 'msg': 'OK', 'data': result['data']}


@router.get('/dispatch/monitor', summary='执行监控面板')
@require_permission('lab_personnel.dispatch.read')
def dispatch_monitor(request):
    from .services.dispatch_service import get_dispatch_monitor
    data = get_dispatch_monitor()
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# 风险预警 API
# ============================================================================
@router.get('/risks/list', summary='风险预警列表')
@require_permission('lab_personnel.risk.read')
def list_risks(request, params: RiskListParams = Query(...)):
    from .services.risk_engine import list_risks as _list_risks
    result = _list_risks(
        level=params.level,
        risk_type=params.risk_type,
        status=params.status,
        related_staff_id=params.related_staff_id,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_risk_to_dict(r) for r in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/risks/stats', summary='风险统计')
@require_permission('lab_personnel.risk.read')
def risk_stats(request):
    from .services.risk_engine import get_risk_stats
    data = get_risk_stats()
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/risks/{risk_id}/acknowledge', summary='确认风险')
@require_permission('lab_personnel.risk.manage')
def acknowledge_risk(request, risk_id: int):
    from .services.risk_engine import acknowledge_risk as _ack
    risk = _ack(risk_id)
    if not risk:
        return {'code': 404, 'msg': '风险不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _risk_to_dict(risk)}


@router.post('/risks/{risk_id}/resolve', summary='解决风险')
@require_permission('lab_personnel.risk.manage')
def resolve_risk(request, risk_id: int, data: RiskResolveIn):
    from .services.risk_engine import resolve_risk as _resolve
    risk = _resolve(risk_id, action_taken=data.action_taken,
                    resolved_by_id=getattr(request, 'user_id', None))
    if not risk:
        return {'code': 404, 'msg': '风险不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _risk_to_dict(risk)}


@router.post('/risks/scan', summary='手动触发风险扫描')
@require_permission('lab_personnel.risk.manage')
def trigger_risk_scan(request):
    from .services.risk_engine import run_risk_scan
    result = run_risk_scan()
    return {'code': 200, 'msg': 'OK', 'data': result}


# ============================================================================
# 数据导出
# ============================================================================

# ============================================================================
# Delegation Log（PI 授权日志）
# ============================================================================

class DelegationLogCreateIn(Schema):
    staff_id: int
    protocol_id: int
    protocol_name: Optional[str] = ''
    scope: str
    delegation_date: str
    expiry_date: Optional[str] = None
    pi_name: str
    pi_staff_id: Optional[int] = None
    notes: Optional[str] = ''


class DelegationLogUpdateIn(Schema):
    scope: Optional[str] = None
    expiry_date: Optional[str] = None
    is_active: Optional[bool] = None
    revoke_reason: Optional[str] = None
    notes: Optional[str] = None


def _delegation_to_dict(d):
    return {
        'id': d.id,
        'staff_id': d.staff_id,
        'staff_name': d.staff.name if d.staff else '',
        'protocol_id': d.protocol_id,
        'protocol_name': d.protocol_name,
        'scope': d.scope,
        'delegation_date': d.delegation_date.isoformat() if d.delegation_date else None,
        'expiry_date': d.expiry_date.isoformat() if d.expiry_date else None,
        'pi_name': d.pi_name,
        'is_active': d.is_active,
        'revoked_at': d.revoked_at.isoformat() if d.revoked_at else None,
        'revoke_reason': d.revoke_reason,
        'notes': d.notes,
        'create_time': d.create_time.isoformat() if d.create_time else None,
    }


@router.get('/delegation-logs/list', summary='授权日志列表')
@require_permission('lab_personnel.staff.read')
def list_delegation_logs(request, staff_id: int = None, protocol_id: int = None, page: int = 1, page_size: int = 20):
    from .models_compliance import DelegationLog
    qs = DelegationLog.objects.select_related('staff').all()
    if staff_id:
        qs = qs.filter(staff_id=staff_id)
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {
        'code': 200, 'msg': 'OK',
        'data': {'items': [_delegation_to_dict(d) for d in items], 'total': total},
    }


@router.post('/delegation-logs/create', summary='创建授权日志')
@require_permission('lab_personnel.staff.manage')
def create_delegation_log(request, data: DelegationLogCreateIn):
    from .models_compliance import DelegationLog
    from apps.hr.models import Staff
    from datetime import date as _date
    staff = Staff.objects.filter(id=data.staff_id, is_deleted=False).first()
    if not staff:
        return {'code': 404, 'msg': '人员不存在', 'data': None}

    d = DelegationLog.objects.create(
        staff=staff,
        protocol_id=data.protocol_id,
        protocol_name=data.protocol_name or '',
        scope=data.scope,
        delegation_date=_date.fromisoformat(data.delegation_date),
        expiry_date=_date.fromisoformat(data.expiry_date) if data.expiry_date else None,
        pi_name=data.pi_name,
        pi_staff_id=data.pi_staff_id,
        notes=data.notes or '',
    )
    d = DelegationLog.objects.select_related('staff').get(pk=d.pk)
    return {'code': 200, 'msg': 'OK', 'data': _delegation_to_dict(d)}


@router.put('/delegation-logs/{log_id}', summary='更新授权日志')
@require_permission('lab_personnel.staff.manage')
def update_delegation_log(request, log_id: int, data: DelegationLogUpdateIn):
    from .models_compliance import DelegationLog
    from datetime import date as _date
    d = DelegationLog.objects.select_related('staff').filter(id=log_id).first()
    if not d:
        return {'code': 404, 'msg': '授权日志不存在', 'data': None}
    if data.scope is not None:
        d.scope = data.scope
    if data.expiry_date is not None:
        d.expiry_date = _date.fromisoformat(data.expiry_date)
    if data.is_active is not None:
        d.is_active = data.is_active
        if not data.is_active:
            d.revoked_at = _date.today()
    if data.revoke_reason is not None:
        d.revoke_reason = data.revoke_reason
    if data.notes is not None:
        d.notes = data.notes
    d.save()
    return {'code': 200, 'msg': 'OK', 'data': _delegation_to_dict(d)}


# ============================================================================
# 变更审计日志
# ============================================================================

class AuditLogQueryIn(Schema):
    model_config = ConfigDict(protected_namespaces=())
    model_name: Optional[str] = None
    record_id: Optional[int] = None
    page: int = 1
    page_size: int = 50


@router.get('/audit-logs/list', summary='变更审计日志')
@require_permission('lab_personnel.staff.read')
def list_audit_logs(request, params: AuditLogQueryIn = Query(...)):
    from .models_compliance import FieldChangeLog
    qs = FieldChangeLog.objects.all()
    if params.model_name:
        qs = qs.filter(model_name=params.model_name)
    if params.record_id:
        qs = qs.filter(record_id=params.record_id)
    total = qs.count()
    offset = (params.page - 1) * params.page_size
    items = list(qs[offset:offset + params.page_size])
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [
                {
                    'id': log.id,
                    'model_name': log.model_name,
                    'record_id': log.record_id,
                    'field_name': log.field_name,
                    'old_value': log.old_value,
                    'new_value': log.new_value,
                    'changed_by_name': log.changed_by_name,
                    'changed_at': log.changed_at.isoformat() if log.changed_at else None,
                    'reason': log.reason,
                }
                for log in items
            ],
            'total': total,
        },
    }


# ============================================================================
# 数据导出
# ============================================================================

@router.get('/export/qualification-matrix', summary='导出资质矩阵Excel')
@require_permission('lab_personnel.staff.read')
def export_qualification_matrix(request):
    from django.http import HttpResponse
    from .services.export_service import export_qualification_matrix as _export
    buf = _export()
    response = HttpResponse(
        buf.read(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = 'attachment; filename="qualification_matrix.xlsx"'
    return response


@router.get('/export/worktime', summary='导出工时报表Excel')
@require_permission('lab_personnel.worktime.read')
def export_worktime(request, week_start_date: str = None):
    from django.http import HttpResponse
    from .services.export_service import export_worktime as _export
    from datetime import date as _date
    ws_date = _date.fromisoformat(week_start_date) if week_start_date else None
    buf = _export(ws_date)
    response = HttpResponse(
        buf.read(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = 'attachment; filename="worktime_report.xlsx"'
    return response


@router.get('/export/schedule', summary='导出排班计划Excel')
@require_permission('lab_personnel.schedule.read')
def export_schedule(request, week_start_date: str = None):
    from django.http import HttpResponse
    from .services.export_service import export_schedule as _export
    from datetime import date as _date
    ws_date = _date.fromisoformat(week_start_date) if week_start_date else None
    buf = _export(ws_date)
    response = HttpResponse(
        buf.read(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = 'attachment; filename="schedule.xlsx"'
    return response
