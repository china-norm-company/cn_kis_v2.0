"""
招募管理 API

路由前缀：/recruitment/
覆盖：计划 CRUD + 审批、入排标准、渠道管理、广告、报名、筛选、入组、进度、问题、策略。
"""
from ninja import Router, Schema, Query
from typing import Optional, List
from datetime import datetime, date
from apps.identity.decorators import require_permission, _get_account_from_request
from .services import recruitment_service as svc

router = Router()


# ============================================================================
# Schema
# ============================================================================
class PlanCreateIn(Schema):
    protocol_id: int
    title: str
    target_count: int
    start_date: date
    end_date: date
    description: Optional[str] = ''


class PlanUpdateIn(Schema):
    title: Optional[str] = None
    description: Optional[str] = None
    target_count: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None


class PlanStatusIn(Schema):
    status: str


class CriteriaCreateIn(Schema):
    criteria_type: str
    description: str
    sequence: int = 1
    is_mandatory: bool = True


class ChannelCreateIn(Schema):
    channel_type: str
    name: str
    description: Optional[str] = ''
    contact_person: Optional[str] = ''
    contact_phone: Optional[str] = ''


class AdCreateIn(Schema):
    ad_type: str
    title: str
    content: Optional[str] = ''


class RegistrationCreateIn(Schema):
    plan_id: int
    name: str
    phone: str
    channel_id: Optional[int] = None
    gender: Optional[str] = ''
    age: Optional[int] = None
    email: Optional[str] = ''
    medical_history: Optional[str] = ''


class WithdrawalIn(Schema):
    reason: str
    notes: Optional[str] = ''


class CriteriaCheckItem(Schema):
    criteria_id: int
    met: bool
    notes: Optional[str] = ''


class VitalSignsIn(Schema):
    bp_systolic: Optional[int] = None
    bp_diastolic: Optional[int] = None
    heart_rate: Optional[int] = None
    temperature: Optional[float] = None
    weight_kg: Optional[float] = None
    height_cm: Optional[float] = None


class ScreeningCompleteIn(Schema):
    result: str
    criteria_checks: Optional[List[CriteriaCheckItem]] = None
    vital_signs: Optional[VitalSignsIn] = None
    lab_results: Optional[list] = None
    notes: Optional[str] = ''


class IssueCreateIn(Schema):
    title: str
    priority: Optional[str] = 'medium'
    issue_type: Optional[str] = ''
    description: Optional[str] = ''


class IssueResolveIn(Schema):
    solution: str


class StrategyCreateIn(Schema):
    title: str
    issue_id: Optional[int] = None
    strategy_type: Optional[str] = ''
    description: Optional[str] = ''
    rationale: Optional[str] = ''
    expected_outcome: Optional[str] = ''


class ContactRecordCreateIn(Schema):
    contact_type: str = 'phone'
    content: str
    result: str = 'other'
    next_contact_date: Optional[date] = None
    next_contact_plan: Optional[str] = ''
    notes: Optional[str] = ''


class AdUpdateIn(Schema):
    title: Optional[str] = None
    content: Optional[str] = None
    ad_type: Optional[str] = None


# ============================================================================
# 辅助函数
# ============================================================================
def _plan_dict(p) -> dict:
    code = ''
    if getattr(p, 'protocol', None) is not None:
        code = (p.protocol.code or '').strip()
    return {
        'id': p.id, 'plan_no': p.plan_no, 'protocol_id': p.protocol_id,
        'title': p.title, 'description': p.description,
        'target_count': p.target_count, 'enrolled_count': p.enrolled_count,
        'screened_count': p.screened_count, 'registered_count': p.registered_count,
        'start_date': p.start_date.isoformat(), 'end_date': p.end_date.isoformat(),
        'status': p.status, 'completion_rate': p.completion_rate,
        'create_time': p.create_time.isoformat(),
        'protocol_code': code,
    }


# ============================================================================
# 招募计划
# ============================================================================
@router.get('/plans', summary='招募计划列表')
@require_permission('subject.recruitment.read')
def list_plans(request, protocol_id: Optional[int] = None, status: Optional[str] = None,
               page: int = 1, page_size: int = 20):
    result = svc.list_plans(protocol_id=protocol_id, status=status, page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_plan_dict(p) for p in result['items']],
        'total': result['total'],
    }}


@router.post('/plans', summary='创建招募计划')
@require_permission('subject.recruitment.create')
def create_plan(request, data: PlanCreateIn):
    account = _get_account_from_request(request)
    plan = svc.create_plan(
        protocol_id=data.protocol_id, title=data.title,
        target_count=data.target_count, start_date=data.start_date,
        end_date=data.end_date, description=data.description or '',
        account=account,
    )
    return {'code': 200, 'msg': 'OK', 'data': _plan_dict(plan)}


@router.get('/plans/{plan_id}', summary='招募计划详情')
@require_permission('subject.recruitment.read')
def get_plan(request, plan_id: int):
    plan = svc.get_plan(plan_id)
    if not plan:
        return 404, {'code': 404, 'msg': '计划不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _plan_dict(plan)}


@router.put('/plans/{plan_id}', summary='更新招募计划')
@require_permission('subject.recruitment.update')
def update_plan(request, plan_id: int, data: PlanUpdateIn):
    plan = svc.update_plan(plan_id, **data.dict(exclude_unset=True))
    if not plan:
        return 404, {'code': 404, 'msg': '计划不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _plan_dict(plan)}


@router.post('/plans/{plan_id}/status', summary='变更计划状态')
@require_permission('subject.recruitment.approve')
def transition_plan_status(request, plan_id: int, data: PlanStatusIn):
    try:
        plan = svc.transition_plan_status(plan_id, data.status)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    if not plan:
        return 404, {'code': 404, 'msg': '计划不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': plan.id, 'status': plan.status}}


@router.get('/plans/{plan_id}/statistics', summary='招募统计')
@require_permission('subject.recruitment.read')
def get_plan_statistics(request, plan_id: int):
    data = svc.get_recruitment_statistics(plan_id)
    if not data:
        return 404, {'code': 404, 'msg': '计划不存在'}
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# 入排标准
# ============================================================================
@router.get('/plans/{plan_id}/criteria', summary='入排标准列表')
@require_permission('subject.recruitment.read')
def list_criteria(request, plan_id: int):
    items = svc.list_criteria(plan_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': c.id, 'criteria_type': c.criteria_type,
            'sequence': c.sequence, 'description': c.description,
            'is_mandatory': c.is_mandatory,
        } for c in items],
    }}


@router.post('/plans/{plan_id}/criteria', summary='新增入排标准')
@require_permission('subject.recruitment.create')
def add_criteria(request, plan_id: int, data: CriteriaCreateIn):
    c = svc.create_criteria(plan_id, data.criteria_type, data.description, data.sequence, data.is_mandatory)
    return {'code': 200, 'msg': 'OK', 'data': {'id': c.id}}


# ============================================================================
# 渠道
# ============================================================================
@router.get('/plans/{plan_id}/channels', summary='渠道列表')
@require_permission('subject.recruitment.read')
def list_channels(request, plan_id: int):
    items = svc.list_channels(plan_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': c.id, 'channel_type': c.channel_type, 'name': c.name,
            'registered_count': c.registered_count, 'screened_count': c.screened_count,
            'enrolled_count': c.enrolled_count, 'status': c.status,
        } for c in items],
    }}


@router.post('/plans/{plan_id}/channels', summary='新增渠道')
@require_permission('subject.recruitment.create')
def add_channel(request, plan_id: int, data: ChannelCreateIn):
    c = svc.create_channel(plan_id, data.channel_type, data.name,
                           description=data.description, contact_person=data.contact_person,
                           contact_phone=data.contact_phone)
    return {'code': 200, 'msg': 'OK', 'data': {'id': c.id}}


@router.get('/channels/{channel_id}/evaluate', summary='渠道效果评估')
@require_permission('subject.recruitment.read')
def evaluate_channel(request, channel_id: int):
    data = svc.evaluate_channel(channel_id)
    if not data:
        return 404, {'code': 404, 'msg': '渠道不存在'}
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# 广告
# ============================================================================
@router.post('/plans/{plan_id}/ads', summary='创建广告')
@require_permission('subject.recruitment.create')
def create_ad(request, plan_id: int, data: AdCreateIn):
    account = _get_account_from_request(request)
    ad = svc.create_ad(plan_id, data.ad_type, data.title, data.content or '', account)
    return {'code': 200, 'msg': 'OK', 'data': {'id': ad.id, 'status': ad.status}}


@router.post('/ads/{ad_id}/publish', summary='发布广告')
@require_permission('subject.recruitment.approve')
def publish_ad(request, ad_id: int):
    ad = svc.publish_ad(ad_id)
    if not ad:
        return 400, {'code': 400, 'msg': '无法发布'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': ad.id, 'status': ad.status}}


# ============================================================================
# 报名
# ============================================================================
@router.get('/registrations', summary='报名列表')
@require_permission('subject.recruitment.read')
def list_registrations(request, plan_id: Optional[int] = None, status: Optional[str] = None,
                       keyword: Optional[str] = None, page: int = 1, page_size: int = 20):
    result = svc.list_registrations(plan_id=plan_id, status=status, keyword=keyword, page=page, page_size=page_size)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'registration_no': r.registration_no,
            'name': r.name, 'phone': r.phone, 'gender': r.gender,
            'age': r.age, 'status': r.status,
            'contacted_at': r.contacted_at.isoformat() if r.contacted_at else None,
            'contact_notes': r.contact_notes,
            'next_contact_date': r._next_contact_date.isoformat() if getattr(r, '_next_contact_date', None) else None,
            'create_time': r.create_time.isoformat(),
        } for r in result['items']],
        'total': result['total'],
    }}


@router.post('/registrations', summary='创建报名')
@require_permission('subject.recruitment.create')
def create_registration(request, data: RegistrationCreateIn):
    reg = svc.create_registration(
        plan_id=data.plan_id, name=data.name, phone=data.phone,
        channel_id=data.channel_id, gender=data.gender or '',
        age=data.age, email=data.email or '',
        medical_history=data.medical_history or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': {'id': reg.id, 'registration_no': reg.registration_no}}


# ============================================================================
# 退出/脱落
# ============================================================================
@router.post('/registrations/{reg_id}/withdraw', summary='报名退出')
@require_permission('subject.recruitment.update')
def withdraw_registration(request, reg_id: int, data: WithdrawalIn):
    account = _get_account_from_request(request)
    try:
        reg = svc.withdraw_registration(reg_id, reason=data.reason, account=account)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    if not reg:
        return 404, {'code': 404, 'msg': '报名记录不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': reg.id, 'status': reg.status}}


@router.post('/enrollment-records/{record_id}/withdraw', summary='入组退出')
@require_permission('subject.recruitment.update')
def withdraw_enrollment(request, record_id: int, data: WithdrawalIn):
    account = _get_account_from_request(request)
    try:
        record = svc.withdraw_enrollment(record_id, reason=data.reason, account=account)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    if not record:
        return 404, {'code': 404, 'msg': '入组记录不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': record.id, 'status': record.status}}


# ============================================================================
# 筛选
# ============================================================================
@router.post('/registrations/{reg_id}/screening', summary='创建筛选')
@require_permission('subject.recruitment.create')
def create_screening(request, reg_id: int):
    account = _get_account_from_request(request)
    record = svc.create_screening(reg_id, screener_id=account.id if account else None)
    return {'code': 200, 'msg': 'OK', 'data': {'id': record.id, 'screening_no': record.screening_no}}


@router.get('/screenings/{screening_id}', summary='筛选详情')
@require_permission('subject.recruitment.read')
def get_screening(request, screening_id: int):
    record = svc.get_screening(screening_id)
    if not record:
        return 404, {'code': 404, 'msg': '筛选记录不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {
        'id': record.id, 'screening_no': record.screening_no,
        'registration_id': record.registration_id,
        'result': record.result, 'criteria_checks': record.criteria_checks,
        'vital_signs': record.vital_signs, 'lab_results': record.lab_results,
        'screener_id': record.screener_id,
        'screened_at': record.screened_at.isoformat() if record.screened_at else None,
        'notes': record.notes, 'create_time': record.create_time.isoformat(),
    }}


@router.put('/screenings/{screening_id}/complete', summary='完成筛选')
@require_permission('subject.recruitment.update')
def complete_screening(request, screening_id: int, data: ScreeningCompleteIn):
    criteria_data = [c.dict() for c in data.criteria_checks] if data.criteria_checks else None
    vital_data = data.vital_signs.dict() if data.vital_signs else None
    record = svc.complete_screening(
        screening_id, result=data.result,
        criteria_checks=criteria_data,
        vital_signs=vital_data,
        lab_results=data.lab_results,
        notes=data.notes or '',
    )
    if not record:
        return 404, {'code': 404, 'msg': '筛选记录不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': record.id, 'result': record.result}}


# ============================================================================
# 入组
# ============================================================================
@router.post('/registrations/{reg_id}/enrollment', summary='创建入组记录')
@require_permission('subject.recruitment.create')
def create_enrollment_record(request, reg_id: int):
    record = svc.create_enrollment_record(reg_id)
    return {'code': 200, 'msg': 'OK', 'data': {'id': record.id, 'enrollment_no': record.enrollment_no}}


@router.post('/enrollment-records/{record_id}/confirm', summary='确认入组')
@require_permission('subject.recruitment.approve')
def confirm_enrollment(request, record_id: int):
    record = svc.confirm_enrollment(record_id)
    if not record:
        return 404, {'code': 404, 'msg': '记录不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': record.id, 'status': record.status}}


# ============================================================================
# 进度
# ============================================================================
@router.post('/plans/{plan_id}/progress', summary='记录进度快照')
@require_permission('subject.recruitment.update')
def record_progress(request, plan_id: int):
    try:
        progress = svc.record_progress(plan_id)
    except ValueError as e:
        return 404, {'code': 404, 'msg': str(e)}
    return {'code': 200, 'msg': 'OK', 'data': {
        'record_date': progress.record_date.isoformat(),
        'completion_rate': str(progress.completion_rate),
    }}


# ============================================================================
# 问题
# ============================================================================
@router.post('/plans/{plan_id}/issues', summary='创建招募问题')
@require_permission('subject.recruitment.create')
def create_issue(request, plan_id: int, data: IssueCreateIn):
    issue = svc.create_issue(
        plan_id, title=data.title, priority=data.priority,
        issue_type=data.issue_type or '', description=data.description or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': {'id': issue.id}}


@router.put('/issues/{issue_id}/resolve', summary='解决招募问题')
@require_permission('subject.recruitment.update')
def resolve_issue(request, issue_id: int, data: IssueResolveIn):
    issue = svc.resolve_issue(issue_id, data.solution)
    if not issue:
        return 404, {'code': 404, 'msg': '问题不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': issue.id, 'status': issue.status}}


# ============================================================================
# 策略
# ============================================================================
@router.post('/plans/{plan_id}/strategies', summary='创建招募策略')
@require_permission('subject.recruitment.create')
def create_strategy(request, plan_id: int, data: StrategyCreateIn):
    kwargs = data.dict(exclude_unset=True)
    kwargs.pop('title', None)
    s = svc.create_strategy(plan_id, title=data.title, **kwargs)
    return {'code': 200, 'msg': 'OK', 'data': {'id': s.id}}


@router.post('/strategies/{strategy_id}/approve', summary='批准策略')
@require_permission('subject.recruitment.approve')
def approve_strategy(request, strategy_id: int):
    s = svc.approve_strategy(strategy_id)
    if not s:
        return 404, {'code': 404, 'msg': '策略不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': s.id, 'status': s.status}}


# ============================================================================
# 分析统计
# ============================================================================
@router.get('/plans/{plan_id}/funnel', summary='招募漏斗')
@require_permission('subject.recruitment.read')
def get_recruitment_funnel(request, plan_id: int):
    data = svc.get_recruitment_funnel(plan_id)
    if not data:
        return 404, {'code': 404, 'msg': '计划不存在'}
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/plans/{plan_id}/trends', summary='招募趋势')
@require_permission('subject.recruitment.read')
def get_recruitment_trends(request, plan_id: int, days: int = 30):
    data = svc.get_recruitment_trends(plan_id, days)
    return {'code': 200, 'msg': 'OK', 'data': {'items': data}}


@router.get('/plans/{plan_id}/withdrawal-analysis', summary='退出分析')
@require_permission('subject.recruitment.read')
def get_withdrawal_analysis(request, plan_id: int):
    data = svc.get_withdrawal_analysis(plan_id)
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# 跟进记录
# ============================================================================
@router.get('/registrations/{reg_id}/contacts', summary='跟进记录列表')
@require_permission('subject.recruitment.read')
def list_contact_records(request, reg_id: int):
    items = svc.list_contact_records(reg_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'contact_type': r.contact_type,
            'content': r.content, 'result': r.result,
            'next_contact_date': r.next_contact_date.isoformat() if r.next_contact_date else None,
            'next_contact_plan': r.next_contact_plan,
            'contacted_by_id': r.contacted_by_id,
            'notes': r.notes,
            'contact_date': r.contact_date.isoformat(),
        } for r in items],
    }}


@router.post('/registrations/{reg_id}/contacts', summary='添加跟进记录')
@require_permission('subject.recruitment.update')
def create_contact_record(request, reg_id: int, data: ContactRecordCreateIn):
    account = _get_account_from_request(request)
    record = svc.create_contact_record(
        registration_id=reg_id,
        contact_type=data.contact_type,
        content=data.content,
        result=data.result,
        next_contact_date=data.next_contact_date,
        next_contact_plan=data.next_contact_plan or '',
        contacted_by_id=account.id if account else None,
        notes=data.notes or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': {'id': record.id}}


# ============================================================================
# 任务聚合
# ============================================================================
@router.get('/my-tasks', summary='今日任务')
@require_permission('subject.recruitment.read')
def get_my_tasks(request):
    data = svc.get_my_tasks()
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# 广告管理（补充列表和编辑）
# ============================================================================
@router.get('/plans/{plan_id}/ads', summary='广告列表')
@require_permission('subject.recruitment.read')
def list_ads(request, plan_id: int):
    items = svc.list_ads(plan_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': a.id, 'ad_type': a.ad_type, 'title': a.title,
            'content': a.content, 'status': a.status,
            'published_at': a.published_at.isoformat() if a.published_at else None,
            'create_time': a.create_time.isoformat(),
        } for a in items],
    }}


@router.put('/ads/{ad_id}', summary='编辑广告')
@require_permission('subject.recruitment.update')
def update_ad(request, ad_id: int, data: AdUpdateIn):
    ad = svc.update_ad(ad_id, **data.dict(exclude_unset=True))
    if not ad:
        return 404, {'code': 404, 'msg': '广告不存在'}
    return {'code': 200, 'msg': 'OK', 'data': {'id': ad.id, 'status': ad.status}}


# ============================================================================
# 渠道分析（跨计划维度）
# ============================================================================
@router.get('/channel-analytics', summary='渠道汇总分析')
@require_permission('subject.recruitment.read')
def get_channel_analytics(request):
    data = svc.get_channel_analytics()
    return {'code': 200, 'msg': 'OK', 'data': {'items': data}}


# ============================================================================
# 批量操作
# ============================================================================
class BatchRegistrationStatusIn(Schema):
    registration_ids: List[int]
    action: str  # 'confirm' | 'reject' | 'archive'
    reason: Optional[str] = ''


class BatchScreeningIn(Schema):
    registration_ids: List[int]


class BatchEnrollmentIn(Schema):
    screening_ids: List[int]


@router.post('/batch/registration-status', summary='批量更新报名状态')
@require_permission('subject.recruitment.update')
def batch_update_registration_status(request, data: BatchRegistrationStatusIn):
    from .models_recruitment import SubjectRegistration
    account = _get_account_from_request(request)

    success_ids = []
    fail_ids = []
    status_map = {'confirm': 'confirmed', 'reject': 'rejected', 'archive': 'archived'}
    target_status = status_map.get(data.action)
    if not target_status:
        return 400, {'code': 400, 'msg': f'不支持的操作: {data.action}'}

    for reg_id in data.registration_ids:
        try:
            reg = SubjectRegistration.objects.filter(id=reg_id, is_deleted=False).first()
            if reg:
                reg.status = target_status
                if data.reason:
                    reg.contact_notes = (reg.contact_notes or '') + f'\n批量操作: {data.reason}'
                reg.save(update_fields=['status', 'contact_notes', 'update_time'])
                success_ids.append(reg_id)
            else:
                fail_ids.append(reg_id)
        except Exception:
            fail_ids.append(reg_id)

    return {'code': 200, 'msg': f'成功 {len(success_ids)} 条, 失败 {len(fail_ids)} 条', 'data': {
        'success_ids': success_ids, 'fail_ids': fail_ids,
    }}


@router.post('/batch/create-screenings', summary='批量创建筛选')
@require_permission('subject.recruitment.create')
def batch_create_screenings(request, data: BatchScreeningIn):
    account = _get_account_from_request(request)
    success = []
    fail = []
    for reg_id in data.registration_ids:
        try:
            record = svc.create_screening(reg_id, screener_id=account.id if account else None)
            success.append({'registration_id': reg_id, 'screening_id': record.id})
        except Exception as e:
            fail.append({'registration_id': reg_id, 'error': str(e)})

    return {'code': 200, 'msg': f'成功 {len(success)}, 失败 {len(fail)}', 'data': {
        'success': success, 'fail': fail,
    }}


@router.post('/batch/confirm-enrollments', summary='批量确认入组')
@require_permission('subject.recruitment.approve')
def batch_confirm_enrollments(request, data: BatchEnrollmentIn):
    success = []
    fail = []
    for sid in data.screening_ids:
        try:
            from .models_recruitment import EnrollmentRecord
            record = EnrollmentRecord.objects.filter(id=sid, is_deleted=False).first()
            if record:
                result = svc.confirm_enrollment(record.id)
                if result:
                    success.append(record.id)
                else:
                    fail.append({'id': sid, 'error': '确认失败'})
            else:
                fail.append({'id': sid, 'error': '不存在'})
        except Exception as e:
            fail.append({'id': sid, 'error': str(e)})

    return {'code': 200, 'msg': f'成功 {len(success)}, 失败 {len(fail)}', 'data': {
        'success_ids': success, 'fail': fail,
    }}


# ============================================================================
# 转介绍管理（招募台视角）
# ============================================================================
@router.get('/referrals', summary='转介绍列表')
@require_permission('subject.recruitment.read')
def list_referrals(request, plan_id: Optional[int] = None, status: Optional[str] = None,
                   page: int = 1, page_size: int = 20):
    from .models_loyalty import SubjectReferral
    qs = SubjectReferral.objects.filter(is_deleted=False).order_by('-create_time')
    if plan_id:
        qs = qs.filter(plan_id=plan_id)
    if status:
        qs = qs.filter(status=status)
    total = qs.count()
    start = (page - 1) * page_size
    items = qs[start:start + page_size]
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': r.id, 'referrer_id': r.referrer_id, 'referred_id': r.referred_id,
            'plan_id': r.plan_id, 'status': r.status,
            'reward_amount': str(r.reward_amount) if hasattr(r, 'reward_amount') else '0',
            'create_time': r.create_time.isoformat(),
        } for r in items],
        'total': total,
    }}


class ReferralVerifyIn(Schema):
    status: str  # 'verified' | 'rejected'
    notes: Optional[str] = ''


@router.post('/referrals/{referral_id}/verify', summary='审核转介绍')
@require_permission('subject.recruitment.approve')
def verify_referral(request, referral_id: int, data: ReferralVerifyIn):
    from .models_loyalty import SubjectReferral
    ref = SubjectReferral.objects.filter(id=referral_id, is_deleted=False).first()
    if not ref:
        return 404, {'code': 404, 'msg': '不存在'}
    ref.status = data.status
    ref.save(update_fields=['status', 'update_time'])
    return {'code': 200, 'msg': 'OK', 'data': {'id': ref.id, 'status': ref.status}}
