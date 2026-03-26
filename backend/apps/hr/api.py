"""
人事能力 API

端点：
- 资质: /hr/staff/list|create|{id}|stats
- 胜任力: /hr/competency/list|create|{id}
- 评估: /hr/assessments/list|create|{id}
- 培训: /hr/trainings/list|create|{id}|stats
"""
from ninja import Router, Schema, Query, File
from ninja.files import UploadedFile
from typing import Optional, List
from datetime import date

from . import services
from apps.identity.decorators import require_permission, require_any_permission, _get_account_from_request

router = Router()


# ============================================================================
# Schema
# ============================================================================
class StaffQueryParams(Schema):
    department: Optional[str] = None
    gcp_status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class StaffCreateIn(Schema):
    name: str
    position: str
    department: str
    employee_no: Optional[str] = ''
    email: Optional[str] = ''
    phone: Optional[str] = ''
    gcp_cert: Optional[str] = ''
    gcp_expiry: Optional[date] = None
    gcp_status: Optional[str] = 'none'
    other_certs: Optional[str] = ''
    training_status: Optional[str] = '未开始'


class StaffUpdateIn(Schema):
    name: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    employee_no: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gcp_cert: Optional[str] = None
    gcp_expiry: Optional[date] = None
    gcp_status: Optional[str] = None
    other_certs: Optional[str] = None
    training_status: Optional[str] = None


class StaffImportItemIn(Schema):
    name: str
    department: str
    position: Optional[str] = ''
    employee_no: Optional[str] = ''
    email: Optional[str] = ''
    phone: Optional[str] = ''


class StaffImportIn(Schema):
    items: List[StaffImportItemIn]


class CompetencyCreateIn(Schema):
    name: str
    description: Optional[str] = ''
    icon: Optional[str] = ''
    levels: Optional[List[str]] = []
    sort_order: Optional[int] = 0


class CompetencyUpdateIn(Schema):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    levels: Optional[List[str]] = None
    sort_order: Optional[int] = None


class AssessmentQueryParams(Schema):
    staff_id: Optional[int] = None
    period: Optional[str] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class AssessmentCreateIn(Schema):
    staff_id: int
    period: str
    assessor: str
    scores: Optional[dict] = {}
    overall: Optional[str] = ''


class AssessmentUpdateIn(Schema):
    scores: Optional[dict] = None
    overall: Optional[str] = None
    status: Optional[str] = None
    comments: Optional[str] = None


class TrainingQueryParams(Schema):
    # 新字段：前端统一使用 trainee_id
    trainee_id: Optional[int] = None
    # 兼容旧前端参数 staff_id
    staff_id: Optional[int] = None
    status: Optional[str] = None
    category: Optional[str] = None
    page: int = 1
    page_size: int = 20


class TrainingCreateIn(Schema):
    course_name: str
    category: str
    trainee_id: int
    trainer: str
    start_date: date
    hours: int
    end_date: Optional[date] = None
    score: Optional[str] = ''


class TrainingUpdateIn(Schema):
    status: Optional[str] = None
    score: Optional[str] = None
    end_date: Optional[date] = None


class ArchiveQueryParams(Schema):
    keyword: Optional[str] = None
    employment_status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ArchiveUpdateIn(Schema):
    department: Optional[str] = None
    manager_name: Optional[str] = None
    job_rank: Optional[str] = None
    employment_status: Optional[str] = None
    employment_type: Optional[str] = None
    hire_date: Optional[date] = None
    regular_date: Optional[date] = None
    id_card_no: Optional[str] = None
    emergency_contact: Optional[str] = None
    emergency_phone: Optional[str] = None
    address: Optional[str] = None
    remarks: Optional[str] = None
    sync_locked_fields: Optional[List[str]] = None


class ContractCreateIn(Schema):
    staff_id: int
    contract_no: str
    contract_type: Optional[str] = '劳动合同'
    start_date: date
    end_date: Optional[date] = None
    status: Optional[str] = 'active'
    auto_renew: Optional[bool] = False
    file_url: Optional[str] = ''


class CertificateCreateIn(Schema):
    staff_id: int
    cert_type: str
    cert_no: Optional[str] = ''
    issuer: Optional[str] = ''
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    status: Optional[str] = 'valid'


class ChangeLogCreateIn(Schema):
    staff_id: int
    change_type: str
    change_date: date
    before_data: Optional[dict] = {}
    after_data: Optional[dict] = {}
    operated_by: Optional[str] = ''
    reason: Optional[str] = ''


class ExitRecordCreateIn(Schema):
    staff_id: int
    exit_date: date
    exit_type: Optional[str] = '主动离职'
    reason: Optional[str] = ''
    handover_status: Optional[str] = 'pending'


class CommonPageParams(Schema):
    page: int = 1
    page_size: int = 20


class RecruitmentDemandCreateIn(Schema):
    title: str
    department: Optional[str] = ''
    headcount: Optional[int] = 1
    owner: Optional[str] = ''
    status: Optional[str] = 'draft'
    target_date: Optional[date] = None


class CandidateCreateIn(Schema):
    demand_id: Optional[int] = None
    name: str
    phone: Optional[str] = ''
    source: Optional[str] = ''
    stage: Optional[str] = 'screening'
    interviewer: Optional[str] = ''
    offer_amount: Optional[float] = 0


class PerformanceCycleCreateIn(Schema):
    name: str
    period_start: date
    period_end: date
    status: Optional[str] = 'draft'


class PerformanceRecordCreateIn(Schema):
    cycle_id: Optional[int] = None
    staff_id: int
    score: Optional[float] = 0
    grade: Optional[str] = ''
    status: Optional[str] = 'draft'
    improvement_plan: Optional[str] = ''


class PayrollCreateIn(Schema):
    staff_id: int
    pay_month: str
    base_salary: Optional[float] = 0
    bonus: Optional[float] = 0
    deductions: Optional[float] = 0
    net_salary: Optional[float] = 0
    status: Optional[str] = 'draft'


class IncentiveCreateIn(Schema):
    staff_id: int
    incentive_type: Optional[str] = 'bonus'
    amount: Optional[float] = 0
    reason: Optional[str] = ''
    grant_date: Optional[date] = None


class CultureActivityCreateIn(Schema):
    title: str
    category: Optional[str] = '文化活动'
    planned_date: Optional[date] = None
    owner: Optional[str] = ''
    status: Optional[str] = 'planned'
    participant_count: Optional[int] = 0


class EngagementPulseCreateIn(Schema):
    survey_month: str
    score: Optional[float] = 0
    risk_level: Optional[str] = 'low'
    actions: Optional[str] = ''


class CollaborationSnapshotCreateIn(Schema):
    source_workstation: str
    data_type: str
    period: Optional[str] = ''
    payload: Optional[dict] = {}
    sync_status: Optional[str] = 'pending'


class RiskActionCreateIn(Schema):
    staff_id: int
    action_type: Optional[str] = 'interview'
    operator: Optional[str] = ''
    owner: Optional[str] = ''
    due_date: Optional[date] = None
    note: Optional[str] = ''


class RiskActionUpdateIn(Schema):
    sync_status: str
    note: Optional[str] = ''


class RiskActionMetaUpdateIn(Schema):
    owner: Optional[str] = ''
    due_date: Optional[date] = None


# --- P4：绩效结算 Schema ---
class SettlementCreateIn(Schema):
    period: str
    title: Optional[str] = ''
    total_pool: Optional[float] = 0
    rule_id: Optional[int] = None
    notes: Optional[str] = ''


class SettlementTransitionIn(Schema):
    target_status: str
    notes: Optional[str] = ''


class SettlementLineUpdateIn(Schema):
    manual_adjust: Optional[float] = None
    manual_adjust_reason: Optional[str] = None
    final_bonus: Optional[float] = None
    lock_status: Optional[str] = None


class ContributionImportIn(Schema):
    items: List[dict]


class RuleCreateIn(Schema):
    name: str
    version: Optional[str] = ''
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    group_config: Optional[dict] = {}
    weight_config: Optional[dict] = {}
    threshold_config: Optional[dict] = {}
    cap_floor_config: Optional[dict] = {}


class RuleUpdateIn(Schema):
    name: Optional[str] = None
    version: Optional[str] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    group_config: Optional[dict] = None
    weight_config: Optional[dict] = None
    threshold_config: Optional[dict] = None
    cap_floor_config: Optional[dict] = None
    status: Optional[str] = None


# ============================================================================
# 辅助函数
# ============================================================================
def _employment_status_label(code: str) -> str:
    return {
        'probation': '试用期',
        'active': '在职',
        'leave': '停薪留职',
        'exited': '已离职',
    }.get(code or 'active', code or '在职')


def _staff_to_dict(s) -> dict:
    emp = 'active'
    try:
        arch = s.archive
        emp = (arch.employment_status or 'active') if arch else 'active'
    except Exception:
        emp = 'active'
    return {
        'id': s.id, 'name': s.name, 'position': s.position,
        'employee_no': s.employee_no,
        'email': s.email,
        'phone': s.phone,
        'department': s.department, 'gcp_cert': s.gcp_cert,
        'gcp_expiry': s.gcp_expiry.isoformat() if s.gcp_expiry else '',
        'gcp_status': s.gcp_status, 'other_certs': s.other_certs,
        'training_status': s.training_status,
        'employment_status': emp,
        'status': _employment_status_label(emp),
        'create_time': s.create_time.isoformat(),
    }


def _competency_to_dict(c) -> dict:
    return {
        'id': c.id, 'name': c.name, 'description': c.description,
        'icon': c.icon, 'levels': c.levels, 'sort_order': c.sort_order,
    }


def _assessment_to_dict(a) -> dict:
    return {
        'id': a.id,
        'staff_id': a.staff_id,
        'staff_name': a.staff.name if a.staff else '',
        'position': a.staff.position if a.staff else '',
        'period': a.period, 'scores': a.scores,
        'overall': a.overall, 'status': a.status,
        'assessor': a.assessor, 'comments': a.comments,
        'create_time': a.create_time.isoformat(),
    }


def _training_to_dict(t) -> dict:
    return {
        'id': t.id, 'course_name': t.course_name,
        'category': t.category,
        'trainee_id': t.trainee_id,
        'trainee_name': t.trainee.name if t.trainee else '',
        'trainer': t.trainer,
        'start_date': t.start_date.isoformat(),
        'end_date': t.end_date.isoformat() if t.end_date else '',
        'hours': t.hours, 'status': t.status,
        'score': t.score,
        'create_time': t.create_time.isoformat(),
    }


# ============================================================================
# 资质 API
# ============================================================================
@router.get('/staff/list', summary='人员列表')
@require_permission('hr.staff.read')
def list_staff(request, params: StaffQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_staff(
        account=account,
        department=params.department, gcp_status=params.gcp_status,
        page=params.page, page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_staff_to_dict(s) for s in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/staff/stats', summary='人员统计')
@require_permission('hr.staff.read')
def staff_stats(request):
    account = _get_account_from_request(request)
    return {'code': 200, 'msg': 'OK', 'data': services.get_staff_stats(account=account)}


@router.post('/staff/create', summary='创建人员')
@require_any_permission(['hr.staff.create', 'hr.staff.update', 'hr.staff.manage'])
def create_staff(request, data: StaffCreateIn):
    account = _get_account_from_request(request)
    try:
        s = services.create_staff(
            name=data.name, position=data.position, department=data.department,
            employee_no=data.employee_no or '',
            email=data.email or '',
            phone=data.phone or '',
            gcp_cert=data.gcp_cert or '', gcp_expiry=data.gcp_expiry,
            gcp_status=data.gcp_status or 'none', other_certs=data.other_certs or '',
            training_status=data.training_status or '未开始',
            account=account,
        )
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': _staff_to_dict(s)}


@router.post('/staff/sync-feishu', summary='同步飞书通讯录到员工主数据')
@require_any_permission(['hr.staff.create', 'hr.staff.update', 'hr.staff.manage'])
def sync_staff_from_feishu(request):
    stats = services.sync_staff_from_feishu_contacts()
    return {'code': 200, 'msg': 'OK', 'data': stats}


@router.post('/staff/import', summary='批量导入员工基础信息')
@require_any_permission(['hr.staff.create', 'hr.staff.update', 'hr.staff.manage'])
def import_staff(request, data: StaffImportIn):
    account = _get_account_from_request(request)
    try:
        result = services.import_staff_rows([item.dict() for item in data.items], account=account)
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/staff/import-excel', summary='Excel 批量导入员工基础信息')
@require_any_permission(['hr.staff.create', 'hr.staff.update', 'hr.staff.manage'])
def import_staff_excel(request, file: File[UploadedFile] = File(...)):
    account = _get_account_from_request(request)
    name_lower = (file.name or '').lower()
    if not name_lower.endswith('.xlsx'):
        return 400, {'code': 400, 'msg': '仅支持 .xlsx 文件'}
    content = file.read()
    if not content:
        return 400, {'code': 400, 'msg': '文件为空'}
    try:
        result = services.import_staff_excel(content, filename=file.name or '', account=account)
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/staff/{staff_id}', summary='人员详情')
@require_permission('hr.staff.read')
def get_staff(request, staff_id: int):
    account = _get_account_from_request(request)
    s = services.get_staff(staff_id, account=account)
    if not s:
        return 404, {'code': 404, 'msg': '人员不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _staff_to_dict(s)}


@router.put('/staff/{staff_id}', summary='更新人员')
@require_permission('hr.staff.manage')
def update_staff(request, staff_id: int, data: StaffUpdateIn):
    account = _get_account_from_request(request)
    try:
        s = services.update_staff(staff_id, account=account, **data.dict(exclude_unset=True))
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    if not s:
        return 404, {'code': 404, 'msg': '人员不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _staff_to_dict(s)}


@router.delete('/staff/{staff_id}', summary='删除人员')
@require_permission('hr.staff.manage')
def delete_staff(request, staff_id: int):
    account = _get_account_from_request(request)
    ok = services.delete_staff(staff_id, account=account)
    if not ok:
        return 404, {'code': 404, 'msg': '人员不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 胜任力模型 API
# ============================================================================
@router.get('/competency/list', summary='胜任力模型列表')
@require_permission('hr.competency.read')
def list_competency_models(request):
    items = services.list_competency_models()
    return {
        'code': 200, 'msg': 'OK',
        'data': {'items': [_competency_to_dict(c) for c in items]},
    }


@router.post('/competency/create', summary='创建胜任力维度')
@require_permission('hr.competency.manage')
def create_competency_model(request, data: CompetencyCreateIn):
    c = services.create_competency_model(
        name=data.name, description=data.description or '',
        icon=data.icon or '', levels=data.levels or [], sort_order=data.sort_order or 0,
    )
    return {'code': 200, 'msg': 'OK', 'data': _competency_to_dict(c)}


@router.get('/competency/{competency_id}', summary='胜任力维度详情')
@require_permission('hr.competency.read')
def get_competency_model(request, competency_id: int):
    c = services.get_competency_model(competency_id)
    if not c:
        return 404, {'code': 404, 'msg': '维度不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _competency_to_dict(c)}


@router.put('/competency/{competency_id}', summary='更新胜任力维度')
@require_permission('hr.competency.manage')
def update_competency_model(request, competency_id: int, data: CompetencyUpdateIn):
    c = services.update_competency_model(competency_id, **data.dict(exclude_unset=True))
    if not c:
        return 404, {'code': 404, 'msg': '维度不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _competency_to_dict(c)}


@router.delete('/competency/{competency_id}', summary='删除胜任力维度')
@require_permission('hr.competency.manage')
def delete_competency_model(request, competency_id: int):
    ok = services.delete_competency_model(competency_id)
    if not ok:
        return 404, {'code': 404, 'msg': '维度不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 评估 API
# ============================================================================
@router.get('/assessments/list', summary='评估列表')
@require_permission('hr.assessment.read')
def list_assessments(request, params: AssessmentQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_assessments(
        account=account,
        staff_id=params.staff_id, period=params.period,
        status=params.status, page=params.page, page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_assessment_to_dict(a) for a in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.post('/assessments/create', summary='创建评估')
@require_permission('hr.assessment.create')
def create_assessment(request, data: AssessmentCreateIn):
    account = _get_account_from_request(request)
    try:
        a = services.create_assessment(
            staff_id=data.staff_id, period=data.period, assessor=data.assessor,
            scores=data.scores or {}, overall=data.overall or '',
            account=account,
        )
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': _assessment_to_dict(a)}


@router.get('/assessments/{assessment_id}', summary='评估详情')
@require_permission('hr.assessment.read')
def get_assessment(request, assessment_id: int):
    account = _get_account_from_request(request)
    a = services.get_assessment(assessment_id, account=account)
    if not a:
        return 404, {'code': 404, 'msg': '评估不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _assessment_to_dict(a)}


@router.put('/assessments/{assessment_id}', summary='更新评估')
@require_permission('hr.assessment.create')
def update_assessment(request, assessment_id: int, data: AssessmentUpdateIn):
    account = _get_account_from_request(request)
    a = services.update_assessment(assessment_id, account=account, **data.dict(exclude_unset=True))
    if not a:
        return 404, {'code': 404, 'msg': '评估不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _assessment_to_dict(a)}


@router.delete('/assessments/{assessment_id}', summary='删除评估')
@require_permission('hr.assessment.create')
def delete_assessment(request, assessment_id: int):
    account = _get_account_from_request(request)
    ok = services.delete_assessment(assessment_id, account=account)
    if not ok:
        return 404, {'code': 404, 'msg': '评估不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# 培训 API
# ============================================================================
@router.get('/trainings/list', summary='培训列表')
@require_permission('hr.training.read')
def list_trainings(request, params: TrainingQueryParams = Query(...)):
    trainee_id = params.trainee_id or params.staff_id
    account = _get_account_from_request(request)
    result = services.list_trainings(
        account=account,
        trainee_id=trainee_id, status=params.status,
        category=params.category, page=params.page, page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_training_to_dict(t) for t in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/trainings/stats', summary='培训统计')
@require_permission('hr.training.read')
def training_stats(request):
    account = _get_account_from_request(request)
    return {'code': 200, 'msg': 'OK', 'data': services.get_training_stats(account=account)}


@router.post('/trainings/create', summary='创建培训')
@require_permission('hr.training.manage')
def create_training(request, data: TrainingCreateIn):
    account = _get_account_from_request(request)
    try:
        t = services.create_training(
            course_name=data.course_name, category=data.category,
            trainee_id=data.trainee_id, trainer=data.trainer,
            start_date=data.start_date, hours=data.hours,
            end_date=data.end_date, score=data.score or '',
            account=account,
        )
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': _training_to_dict(t)}


@router.get('/trainings/{training_id}', summary='培训详情')
@require_permission('hr.training.read')
def get_training(request, training_id: int):
    account = _get_account_from_request(request)
    t = services.get_training(training_id, account=account)
    if not t:
        return 404, {'code': 404, 'msg': '培训不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _training_to_dict(t)}


@router.put('/trainings/{training_id}', summary='更新培训')
@require_permission('hr.training.manage')
def update_training(request, training_id: int, data: TrainingUpdateIn):
    account = _get_account_from_request(request)
    t = services.update_training(training_id, account=account, **data.dict(exclude_unset=True))
    if not t:
        return 404, {'code': 404, 'msg': '培训不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _training_to_dict(t)}


@router.delete('/trainings/{training_id}', summary='删除培训')
@require_permission('hr.training.manage')
def delete_training(request, training_id: int):
    account = _get_account_from_request(request)
    ok = services.delete_training(training_id, account=account)
    if not ok:
        return 404, {'code': 404, 'msg': '培训不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# S3-4：项目人员分配 + 工作负荷
# ============================================================================
class AssignmentCreateIn(Schema):
    protocol_id: int
    staff_id: int
    role: str
    workload_percentage: Optional[int] = 100


@router.post('/assignments/create', summary='分配人员到项目')
@require_permission('hr.staff.manage')
def create_assignment(request, data: AssignmentCreateIn):
    from apps.hr.models import ProjectAssignment
    assignment, created = ProjectAssignment.objects.get_or_create(
        protocol_id=data.protocol_id,
        staff_id=data.staff_id,
        role=data.role,
        defaults={'workload_percentage': data.workload_percentage or 100},
    )
    if not created:
        assignment.workload_percentage = data.workload_percentage or 100
        assignment.is_active = True
        assignment.save(update_fields=['workload_percentage', 'is_active', 'update_time'])
    return {'code': 200, 'msg': '分配成功', 'data': {
        'id': assignment.id, 'protocol_id': assignment.protocol_id,
        'staff_id': assignment.staff_id, 'role': assignment.role,
        'workload_percentage': assignment.workload_percentage,
    }}


@router.get('/assignments/list', summary='项目人员分配列表')
@require_permission('hr.staff.read')
def list_assignments(request, protocol_id: int = None, staff_id: int = None):
    from apps.hr.models import ProjectAssignment
    qs = ProjectAssignment.objects.filter(is_active=True)
    if protocol_id:
        qs = qs.filter(protocol_id=protocol_id)
    if staff_id:
        qs = qs.filter(staff_id=staff_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': a.id, 'protocol_id': a.protocol_id,
            'staff_id': a.staff_id, 'staff_name': a.staff.name,
            'role': a.role, 'workload_percentage': a.workload_percentage,
        } for a in qs.select_related('staff')],
    }}


@router.get('/workload/{staff_id}', summary='员工工作负荷')
@require_permission('hr.staff.read')
def get_workload(request, staff_id: int):
    from apps.hr.services.workload_service import WorkloadService
    result = WorkloadService.get_staff_workload(staff_id)
    if not result:
        return 404, {'code': 404, 'msg': '员工不存在'}
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/workload', summary='团队工作负荷')
@require_permission('hr.staff.read')
def get_team_workload(request):
    from apps.hr.services.workload_service import WorkloadService
    results = WorkloadService.get_team_workload()
    return {'code': 200, 'msg': 'OK', 'data': {'items': results}}


# ============================================================================
# P1：人事档案中心 API
# ============================================================================
def _archive_to_dict(a) -> dict:
    return {
        'staff_id': a.staff_id,
        'staff_name': a.staff.name if a.staff else '',
        'department': a.department,
        'manager_name': a.manager_name,
        'job_rank': a.job_rank,
        'employment_status': a.employment_status,
        'employment_type': a.employment_type,
        'hire_date': a.hire_date.isoformat() if a.hire_date else '',
        'regular_date': a.regular_date.isoformat() if a.regular_date else '',
        'sync_source': a.sync_source,
        'sync_locked_fields': a.sync_locked_fields,
        'last_sync_at': a.last_sync_at.isoformat() if a.last_sync_at else '',
        'update_time': a.update_time.isoformat(),
    }


@router.get('/archives/list', summary='人事档案列表')
@require_permission('hr.staff.read')
def list_archives(request, params: ArchiveQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_archives(
        account=account,
        keyword=params.keyword,
        employment_status=params.employment_status,
        page=params.page,
        page_size=params.page_size,
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_archive_to_dict(i) for i in result['items']],
        'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
    }}


@router.get('/archives/{staff_id}', summary='人事档案详情')
@require_permission('hr.staff.read')
def get_archive(request, staff_id: int):
    account = _get_account_from_request(request)
    archive = services.get_archive(staff_id, account=account)
    if not archive:
        return 404, {'code': 404, 'msg': '档案不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _archive_to_dict(archive)}


@router.put('/archives/{staff_id}', summary='更新人事档案')
@require_permission('hr.staff.manage')
def update_archive(request, staff_id: int, data: ArchiveUpdateIn):
    account = _get_account_from_request(request)
    try:
        archive = services.upsert_archive(staff_id, account=account, **data.dict(exclude_unset=True))
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    if not archive:
        return 404, {'code': 404, 'msg': '员工不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _archive_to_dict(archive)}


@router.post('/contracts/create', summary='创建合同')
@require_permission('hr.staff.manage')
def create_contract(request, data: ContractCreateIn):
    account = _get_account_from_request(request)
    try:
        c = services.create_contract(account=account, **data.dict())
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': {'id': c.id, 'staff_id': c.staff_id, 'contract_no': c.contract_no}}


@router.get('/contracts/list', summary='合同列表')
@require_permission('hr.staff.read')
def list_contracts(request, staff_id: int = None, page: int = 1, page_size: int = 20):
    account = _get_account_from_request(request)
    result = services.list_contracts(staff_id=staff_id, page=page, page_size=page_size, account=account)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': c.id, 'staff_id': c.staff_id, 'staff_name': c.staff.name if c.staff else '',
        'contract_no': c.contract_no, 'contract_type': c.contract_type,
        'start_date': c.start_date.isoformat(), 'end_date': c.end_date.isoformat() if c.end_date else '',
        'status': c.status, 'auto_renew': c.auto_renew, 'file_url': c.file_url,
    } for c in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.post('/certificates/create', summary='创建证照')
@require_permission('hr.staff.manage')
def create_certificate(request, data: CertificateCreateIn):
    account = _get_account_from_request(request)
    try:
        item = services.create_certificate(account=account, **data.dict())
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'staff_id': item.staff_id, 'cert_type': item.cert_type}}


@router.get('/certificates/list', summary='证照列表')
@require_permission('hr.staff.read')
def list_certificates(request, staff_id: int = None, page: int = 1, page_size: int = 20):
    account = _get_account_from_request(request)
    result = services.list_certificates(staff_id=staff_id, page=page, page_size=page_size, account=account)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': c.id, 'staff_id': c.staff_id, 'staff_name': c.staff.name if c.staff else '',
        'cert_type': c.cert_type, 'cert_no': c.cert_no, 'issuer': c.issuer,
        'issue_date': c.issue_date.isoformat() if c.issue_date else '',
        'expiry_date': c.expiry_date.isoformat() if c.expiry_date else '',
        'status': c.status,
    } for c in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.post('/change-logs/create', summary='创建异动记录')
@require_permission('hr.staff.manage')
def create_change_log(request, data: ChangeLogCreateIn):
    account = _get_account_from_request(request)
    try:
        item = services.create_change_log(account=account, **data.dict())
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'staff_id': item.staff_id, 'change_type': item.change_type}}


@router.get('/change-logs/list', summary='异动记录列表')
@require_permission('hr.staff.read')
def list_change_logs(request, staff_id: int = None, page: int = 1, page_size: int = 20):
    account = _get_account_from_request(request)
    result = services.list_change_logs(staff_id=staff_id, page=page, page_size=page_size, account=account)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': i.id, 'staff_id': i.staff_id, 'staff_name': i.staff.name if i.staff else '',
        'change_type': i.change_type, 'change_date': i.change_date.isoformat(),
        'operated_by': i.operated_by, 'reason': i.reason,
        'before_data': i.before_data, 'after_data': i.after_data,
    } for i in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.post('/exit-records/create', summary='创建离职记录')
@require_permission('hr.staff.manage')
def create_exit_record(request, data: ExitRecordCreateIn):
    account = _get_account_from_request(request)
    try:
        item = services.create_exit_record(account=account, **data.dict())
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    services.upsert_archive(item.staff_id, account=account, employment_status='exited')
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'staff_id': item.staff_id, 'exit_date': item.exit_date.isoformat()}}


@router.get('/exit-records/list', summary='离职记录列表')
@require_permission('hr.staff.read')
def list_exit_records(request, staff_id: int = None, page: int = 1, page_size: int = 20):
    account = _get_account_from_request(request)
    result = services.list_exit_records(staff_id=staff_id, page=page, page_size=page_size, account=account)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': i.id, 'staff_id': i.staff_id, 'staff_name': i.staff.name if i.staff else '',
        'exit_date': i.exit_date.isoformat(), 'exit_type': i.exit_type,
        'reason': i.reason, 'handover_status': i.handover_status,
    } for i in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


# ============================================================================
# P2：招聘、绩效、薪酬激励、文化 API
# ============================================================================
@router.post('/recruitment/demands/create', summary='创建招聘需求')
@require_permission('hr.staff.manage')
def create_recruitment_demand(request, data: RecruitmentDemandCreateIn):
    account = _get_account_from_request(request)
    try:
        item = services.create_recruitment_demand(account=account, **data.dict())
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'title': item.title, 'status': item.status}}


@router.get('/recruitment/demands/list', summary='招聘需求列表')
@require_permission('hr.staff.read')
def list_recruitment_demands(request, status: str = None, page: int = 1, page_size: int = 20):
    account = _get_account_from_request(request)
    result = services.list_recruitment_demands(status=status, page=page, page_size=page_size, account=account)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': d.id, 'title': d.title, 'department': d.department, 'headcount': d.headcount,
        'owner': d.owner, 'status': d.status,
        'target_date': d.target_date.isoformat() if d.target_date else '',
    } for d in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.post('/recruitment/candidates/create', summary='创建候选人')
@require_permission('hr.staff.manage')
def create_candidate(request, data: CandidateCreateIn):
    item = services.create_candidate(**data.dict())
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'name': item.name, 'stage': item.stage}}


@router.get('/recruitment/candidates/list', summary='候选人列表')
@require_permission('hr.staff.read')
def list_candidates(request, demand_id: int = None, stage: str = None, page: int = 1, page_size: int = 20):
    account = _get_account_from_request(request)
    result = services.list_candidates(demand_id=demand_id, stage=stage, page=page, page_size=page_size, account=account)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': c.id, 'name': c.name, 'phone': c.phone, 'source': c.source, 'stage': c.stage,
        'interviewer': c.interviewer, 'offer_amount': float(c.offer_amount), 'demand_id': c.demand_id,
        'demand_title': c.demand.title if c.demand else '',
    } for c in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.post('/performance/cycles/create', summary='创建绩效周期')
@require_permission('hr.staff.manage')
def create_performance_cycle(request, data: PerformanceCycleCreateIn):
    item = services.create_performance_cycle(**data.dict())
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'name': item.name, 'status': item.status}}


@router.get('/performance/cycles/list', summary='绩效周期列表')
@require_permission('hr.staff.read')
def list_performance_cycles(request, params: CommonPageParams = Query(...)):
    result = services.list_performance_cycles(page=params.page, page_size=params.page_size)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': c.id, 'name': c.name, 'period_start': c.period_start.isoformat(),
        'period_end': c.period_end.isoformat(), 'status': c.status,
    } for c in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.post('/performance/records/create', summary='创建绩效记录')
@require_permission('hr.staff.manage')
def create_performance_record(request, data: PerformanceRecordCreateIn):
    account = _get_account_from_request(request)
    try:
        item = services.create_performance_record(account=account, **data.dict())
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'staff_id': item.staff_id, 'score': float(item.score)}}


@router.get('/performance/records/list', summary='绩效记录列表')
@require_permission('hr.staff.read')
def list_performance_records(request, cycle_id: int = None, staff_id: int = None, page: int = 1, page_size: int = 20):
    account = _get_account_from_request(request)
    result = services.list_performance_records(cycle_id=cycle_id, staff_id=staff_id, page=page, page_size=page_size, account=account)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': r.id, 'cycle_id': r.cycle_id, 'cycle_name': r.cycle.name if r.cycle else '',
        'staff_id': r.staff_id, 'staff_name': r.staff.name if r.staff else '',
        'score': float(r.score), 'grade': r.grade, 'status': r.status, 'improvement_plan': r.improvement_plan,
    } for r in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.post('/payroll/records/create', summary='创建薪资记录')
@require_permission('hr.staff.manage')
def create_payroll_record(request, data: PayrollCreateIn):
    account = _get_account_from_request(request)
    try:
        item = services.create_payroll_record(account=account, **data.dict())
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'staff_id': item.staff_id, 'pay_month': item.pay_month}}


@router.get('/payroll/records/list', summary='薪资记录列表')
@require_permission('hr.staff.read')
def list_payroll_records(request, staff_id: int = None, pay_month: str = None, page: int = 1, page_size: int = 20):
    account = _get_account_from_request(request)
    result = services.list_payroll_records(staff_id=staff_id, pay_month=pay_month, page=page, page_size=page_size, account=account)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': p.id, 'staff_id': p.staff_id, 'staff_name': p.staff.name if p.staff else '',
        'pay_month': p.pay_month, 'base_salary': float(p.base_salary),
        'bonus': float(p.bonus), 'deductions': float(p.deductions),
        'net_salary': float(p.net_salary), 'status': p.status,
    } for p in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.post('/payroll/incentives/create', summary='创建激励记录')
@require_permission('hr.staff.manage')
def create_incentive_record(request, data: IncentiveCreateIn):
    account = _get_account_from_request(request)
    try:
        item = services.create_incentive_record(account=account, **data.dict())
    except PermissionError as e:
        return 403, {'code': 403, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'staff_id': item.staff_id, 'amount': float(item.amount)}}


@router.get('/payroll/incentives/list', summary='激励记录列表')
@require_permission('hr.staff.read')
def list_incentives(request, staff_id: int = None, page: int = 1, page_size: int = 20):
    account = _get_account_from_request(request)
    result = services.list_incentives(staff_id=staff_id, page=page, page_size=page_size, account=account)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': i.id, 'staff_id': i.staff_id, 'staff_name': i.staff.name if i.staff else '',
        'incentive_type': i.incentive_type, 'amount': float(i.amount), 'reason': i.reason,
        'grant_date': i.grant_date.isoformat() if i.grant_date else '',
    } for i in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.post('/culture/activities/create', summary='创建文化活动')
@require_permission('hr.staff.manage')
def create_culture_activity(request, data: CultureActivityCreateIn):
    item = services.create_culture_activity(**data.dict())
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'title': item.title, 'status': item.status}}


@router.get('/culture/activities/list', summary='文化活动列表')
@require_permission('hr.staff.read')
def list_culture_activities(request, status: str = None, page: int = 1, page_size: int = 20):
    result = services.list_culture_activities(status=status, page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': c.id, 'title': c.title, 'category': c.category,
        'planned_date': c.planned_date.isoformat() if c.planned_date else '',
        'owner': c.owner, 'status': c.status, 'participant_count': c.participant_count,
    } for c in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.post('/culture/pulse/create', summary='创建敬业度脉冲')
@require_permission('hr.staff.manage')
def create_engagement_pulse(request, data: EngagementPulseCreateIn):
    item = services.create_engagement_pulse(**data.dict())
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'survey_month': item.survey_month, 'score': float(item.score)}}


@router.get('/culture/pulse/list', summary='敬业度脉冲列表')
@require_permission('hr.staff.read')
def list_engagement_pulse(request, params: CommonPageParams = Query(...)):
    result = services.list_engagement_pulse(page=params.page, page_size=params.page_size)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': p.id, 'survey_month': p.survey_month, 'score': float(p.score),
        'risk_level': p.risk_level, 'actions': p.actions,
    } for p in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


# ============================================================================
# P3：跨台协同治理 API
# ============================================================================
@router.post('/collaboration/snapshots/create', summary='创建跨台协同快照')
@require_permission('hr.staff.manage')
def create_collaboration_snapshot(request, data: CollaborationSnapshotCreateIn):
    item = services.create_collaboration_snapshot(**data.dict())
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'source_workstation': item.source_workstation}}


@router.get('/collaboration/snapshots/list', summary='跨台协同快照列表')
@require_permission('hr.staff.read')
def list_collaboration_snapshots(
    request,
    source_workstation: str = None,
    data_type: str = None,
    page: int = 1,
    page_size: int = 20,
):
    result = services.list_collaboration_snapshots(
        source_workstation=source_workstation,
        data_type=data_type,
        page=page,
        page_size=page_size,
    )
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': s.id, 'source_workstation': s.source_workstation, 'data_type': s.data_type,
        'period': s.period, 'payload': s.payload, 'sync_status': s.sync_status,
        'create_time': s.create_time.isoformat(),
    } for s in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.get('/ops/overview', summary='HR经营驾驶舱总览')
@require_permission('hr.staff.read')
def get_ops_overview(request, month: str = None, department: str = None):
    account = _get_account_from_request(request)
    return {'code': 200, 'msg': 'OK', 'data': services.get_ops_overview(month=month, department=department, account=account)}


@router.post('/ops/risk-actions/create', summary='创建风险跟进行动')
@require_permission('hr.staff.manage')
def create_risk_action(request, data: RiskActionCreateIn):
    result = services.create_risk_followup_action(
        staff_id=data.staff_id,
        action_type=data.action_type or 'interview',
        operator=data.operator or '',
        owner=data.owner or '',
        due_date=data.due_date,
        note=data.note or '',
    )
    if not result:
        return 404, {'code': 404, 'msg': '员工不存在'}
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/ops/risk-actions/list', summary='风险跟进行动列表')
@require_permission('hr.staff.read')
def list_risk_actions(request, sync_status: str = None, page: int = 1, page_size: int = 20):
    result = services.list_risk_followup_actions(sync_status=sync_status, page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': i.id,
        'staff_id': (i.payload or {}).get('staff_id', 0),
        'staff_name': (i.payload or {}).get('staff_name', ''),
        'action_type': (i.payload or {}).get('action_type', ''),
        'owner': (i.payload or {}).get('owner', ''),
        'due_date': (i.payload or {}).get('due_date', ''),
        'sync_status': i.sync_status,
        'period': i.period,
        'create_time': i.create_time.isoformat(),
        'payload': i.payload,
    } for i in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.put('/ops/risk-actions/{action_id}', summary='更新风险跟进行动状态')
@require_permission('hr.staff.manage')
def update_risk_action(request, action_id: int, data: RiskActionUpdateIn):
    item = services.update_risk_followup_action(action_id=action_id, sync_status=data.sync_status, note=data.note or '')
    if not item:
        return 404, {'code': 404, 'msg': '风险行动不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': item.id,
        'sync_status': item.sync_status,
        'payload': item.payload,
    }}


@router.put('/ops/risk-actions/{action_id}/meta', summary='更新风险跟进行动负责人和截止日')
@require_permission('hr.staff.manage')
def update_risk_action_meta(request, action_id: int, data: RiskActionMetaUpdateIn):
    item = services.update_risk_followup_action_meta(
        action_id=action_id,
        owner=data.owner or '',
        due_date=data.due_date,
    )
    if not item:
        return 404, {'code': 404, 'msg': '风险行动不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': item.id, 'payload': item.payload}}


# ============================================================================
# P4：绩效结算 API
# ============================================================================

# --- 规则管理 ---
@router.post('/performance-rules/create', summary='创建绩效规则')
@require_permission('hr.staff.manage')
def create_performance_rule(request, data: RuleCreateIn):
    item = services.create_rule(**data.dict())
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': item.id, 'name': item.name, 'version': item.version, 'status': item.status,
    }}


@router.get('/performance-rules/list', summary='绩效规则列表')
@require_permission('hr.staff.read')
def list_performance_rules(request, page: int = 1, page_size: int = 20):
    result = services.list_rules(page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': r.id, 'name': r.name, 'version': r.version,
        'effective_from': r.effective_from.isoformat() if r.effective_from else '',
        'effective_to': r.effective_to.isoformat() if r.effective_to else '',
        'status': r.status, 'weight_config': r.weight_config,
        'threshold_config': r.threshold_config,
        'group_config': r.group_config,
        'cap_floor_config': r.cap_floor_config,
    } for r in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.put('/performance-rules/{rule_id}', summary='更新绩效规则')
@require_permission('hr.staff.manage')
def update_performance_rule(request, rule_id: int, data: RuleUpdateIn):
    fields = {k: v for k, v in data.dict().items() if v is not None}
    item = services.update_rule(rule_id, **fields)
    if not item:
        return 404, {'code': 404, 'msg': '规则不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': item.id, 'name': item.name, 'version': item.version, 'status': item.status,
    }}


# --- 贡献快照 ---
@router.post('/contributions/import', summary='导入贡献快照')
@require_permission('hr.staff.manage')
def import_contribution_snapshots(request, data: ContributionImportIn):
    items = services.import_contributions(data.items)
    return {'code': 200, 'msg': 'OK', 'data': {
        'imported_count': len(items),
        'ids': [i.id for i in items],
    }}


@router.post('/contributions/collect', summary='从工单系统自动采集贡献')
@require_permission('hr.staff.manage')
def collect_contributions(request, period: str = None):
    if not period:
        from datetime import date as _date
        period = _date.today().strftime('%Y-%m')
    operator = getattr(request, 'user_name', '') or ''
    items = services.collect_contributions_from_workorders(period, operator=operator)
    return {'code': 200, 'msg': 'OK', 'data': {
        'period': period, 'collected_count': len(items),
    }}


@router.get('/contributions/list', summary='贡献快照列表')
@require_permission('hr.staff.read')
def list_contribution_snapshots(request, period: str = None, staff_id: int = None,
                                source: str = None, page: int = 1, page_size: int = 50):
    result = services.list_contributions(period=period, staff_id=staff_id, source=source,
                                         page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': c.id, 'period': c.period, 'source_workstation': c.source_workstation,
        'staff_id': c.staff_id, 'staff_name': c.staff_name,
        'project_code': c.project_code, 'group_name': c.group_name,
        'role_in_project': c.role_in_project, 'metrics': c.metrics,
        'amount_contribution': float(c.amount_contribution) if c.amount_contribution else None,
        'data_confidence': float(c.data_confidence),
        'import_source': c.import_source,
        'create_time': c.create_time.isoformat(),
    } for c in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


# --- 结算单 ---
@router.post('/settlements/create', summary='创建绩效结算单')
@require_permission('hr.staff.manage')
def create_settlement_api(request, data: SettlementCreateIn):
    operator = getattr(request, 'user_name', '') or ''
    item = services.create_settlement(
        period=data.period, title=data.title, total_pool=data.total_pool,
        rule_id=data.rule_id, notes=data.notes, created_by=operator,
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': item.id, 'period': item.period, 'title': item.title, 'status': item.status,
    }}


@router.get('/settlements/list', summary='结算单列表')
@require_permission('hr.staff.read')
def list_settlements_api(request, status: str = None, period: str = None,
                         page: int = 1, page_size: int = 20):
    result = services.list_settlements(status=status, period=period, page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': {'items': [{
        'id': s.id, 'period': s.period, 'title': s.title, 'status': s.status,
        'total_pool': float(s.total_pool), 'total_allocated': float(s.total_allocated),
        'data_completeness': float(s.data_completeness),
        'rule_name': s.rule.name if s.rule else '默认规则',
        'created_by': s.created_by,
        'create_time': s.create_time.isoformat(),
    } for s in result['items']], 'total': result['total'], 'page': result['page'], 'page_size': result['page_size']}}


@router.get('/settlements/{settlement_id}', summary='结算单详情')
@require_permission('hr.staff.read')
def get_settlement_detail(request, settlement_id: int):
    item = services.get_settlement(settlement_id)
    if not item:
        return 404, {'code': 404, 'msg': '结算单不存在'}
    lines = services.list_settlement_lines(settlement_id)
    logs = services.list_audit_logs(settlement_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': item.id, 'period': item.period, 'title': item.title, 'status': item.status,
        'total_pool': float(item.total_pool), 'total_allocated': float(item.total_allocated),
        'data_completeness': float(item.data_completeness),
        'rule_name': item.rule.name if item.rule else '默认规则',
        'notes': item.notes,
        'created_by': item.created_by, 'submitted_by': item.submitted_by,
        'approved_by': item.approved_by,
        'submitted_at': item.submitted_at.isoformat() if item.submitted_at else None,
        'approved_at': item.approved_at.isoformat() if item.approved_at else None,
        'create_time': item.create_time.isoformat(),
        'lines': [{
            'id': ln.id, 'staff_id': ln.staff_id,
            'staff_name': ln.staff.name if ln.staff else '',
            'group_name': ln.group_name, 'role_label': ln.role_label,
            'base_score': float(ln.base_score), 'quality_adjust': float(ln.quality_adjust),
            'manual_adjust': float(ln.manual_adjust),
            'manual_adjust_reason': ln.manual_adjust_reason,
            'final_score': float(ln.final_score),
            'suggested_bonus': float(ln.suggested_bonus),
            'final_bonus': float(ln.final_bonus),
            'grade': ln.grade, 'lock_status': ln.lock_status,
        } for ln in lines],
        'audit_logs': [{
            'id': a.id, 'action': a.action,
            'from_status': a.from_status, 'to_status': a.to_status,
            'operator': a.operator, 'detail': a.detail,
            'create_time': a.create_time.isoformat(),
        } for a in logs],
    }}


@router.post('/settlements/{settlement_id}/calculate', summary='触发结算计算')
@require_permission('hr.staff.manage')
def calculate_settlement_api(request, settlement_id: int):
    operator = getattr(request, 'user_name', '') or ''
    try:
        item = services.calculate_settlement(settlement_id, operator=operator)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': item.id, 'status': item.status,
        'data_completeness': float(item.data_completeness),
        'total_allocated': float(item.total_allocated),
    }}


@router.post('/settlements/{settlement_id}/transition', summary='结算单状态转换')
@require_permission('hr.staff.manage')
def transition_settlement_api(request, settlement_id: int, data: SettlementTransitionIn):
    operator = getattr(request, 'user_name', '') or ''
    try:
        item = services.transition_settlement(
            settlement_id, data.target_status,
            operator=operator, notes=data.notes or '',
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': item.id, 'status': item.status,
    }}


@router.put('/settlements/lines/{line_id}', summary='更新结算明细行')
@require_permission('hr.staff.manage')
def update_settlement_line_api(request, line_id: int, data: SettlementLineUpdateIn):
    operator = getattr(request, 'user_name', '') or ''
    try:
        item = services.update_settlement_line(
            line_id,
            manual_adjust=data.manual_adjust,
            manual_adjust_reason=data.manual_adjust_reason,
            final_bonus=data.final_bonus,
            lock_status=data.lock_status,
            operator=operator,
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    if not item:
        return 404, {'code': 404, 'msg': '明细行不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': item.id, 'final_score': float(item.final_score),
        'final_bonus': float(item.final_bonus), 'lock_status': item.lock_status,
    }}
