"""
安全管理 API

端点：
- POST /safety/adverse-events/create  AE 上报
- GET  /safety/adverse-events/list    AE 列表
- GET  /safety/adverse-events/{id}    AE 详情
- POST /safety/adverse-events/{id}/follow-up  添加随访
"""
from ninja import Router, Schema, Query
from typing import Optional, Tuple
from datetime import date
from django.db.models import Q
from apps.identity.decorators import require_permission, _get_account_from_request
from apps.subject.models_execution import SubjectProjectSC

from . import services
from .models import AdverseEvent

router = Router()


class AECreateIn(Schema):
    enrollment_id: int
    description: str
    start_date: date
    severity: str
    relation: str
    work_order_id: Optional[int] = None
    action_taken: Optional[str] = ''
    outcome: Optional[str] = 'unknown'
    is_sae: Optional[bool] = False
    open_id: Optional[str] = ''


class AEQueryParams(Schema):
    enrollment_id: Optional[int] = None
    status: Optional[str] = None
    is_sae: Optional[bool] = None
    page: int = 1
    page_size: int = 20


class FollowUpCreateIn(Schema):
    followup_date: date
    current_status: str
    outcome_update: Optional[str] = ''
    severity_change: Optional[str] = ''
    treatment_update: Optional[str] = ''
    requires_further_followup: Optional[bool] = True
    next_followup_date: Optional[date] = None
    notes: Optional[str] = ''


def _subject_project_sc_pair(ae) -> Optional[Tuple[int, str]]:
    """(subject_id, project_code) 用于关联 t_subject_project_sc。"""
    if not ae.enrollment_id:
        return None
    en = ae.enrollment
    if not en or not en.protocol_id:
        return None
    pcode = (en.protocol.code or '').strip()
    if not pcode:
        return None
    return (en.subject_id, pcode)


def _batch_subject_project_sc_records(aes: list) -> dict:
    pairs = {_subject_project_sc_pair(ae) for ae in aes}
    pairs.discard(None)
    if not pairs:
        return {}
    q = Q()
    for sid, pc in pairs:
        q |= Q(subject_id=sid, project_code=pc)
    rows = SubjectProjectSC.objects.filter(q, is_deleted=False)
    return {(r.subject_id, r.project_code): r for r in rows}


def _resolve_subject_project_sc(ae):
    pair = _subject_project_sc_pair(ae)
    if not pair:
        return None
    return SubjectProjectSC.objects.filter(
        subject_id=pair[0], project_code=pair[1], is_deleted=False,
    ).first()


def _ae_to_dict(ae, sc_record=None) -> dict:
    project_code = ''
    project_name = ''
    subject_name = ''
    if ae.enrollment_id:
        en = ae.enrollment
        sub = getattr(en, 'subject', None)
        prot = getattr(en, 'protocol', None)
        if sub:
            subject_name = (sub.name or '').strip()
        if prot:
            project_code = (prot.code or '').strip()
            project_name = (prot.title or '').strip()
    sc_number = ''
    rd_number = ''
    if sc_record is not None:
        sc_number = (getattr(sc_record, 'sc_number', None) or '').strip()
        rd_number = (getattr(sc_record, 'rd_number', None) or '').strip()
    return {
        'id': ae.id, 'enrollment_id': ae.enrollment_id,
        'work_order_id': ae.work_order_id,
        'description': ae.description,
        'start_date': str(ae.start_date), 'end_date': str(ae.end_date) if ae.end_date else None,
        'severity': ae.severity, 'relation': ae.relation,
        'action_taken': ae.action_taken, 'outcome': ae.outcome,
        'is_sae': ae.is_sae, 'status': ae.status,
        'report_date': str(ae.report_date) if ae.report_date else '',
        'deviation_id': getattr(ae, 'deviation_id', None),
        'change_request_id': getattr(ae, 'change_request_id', None),
        'create_time': ae.create_time.isoformat(),
        'project_code': project_code,
        'project_name': project_name,
        'subject_name': subject_name,
        'sc_number': sc_number,
        'rd_number': rd_number,
    }


def _followup_to_dict(f) -> dict:
    return {
        'id': f.id, 'adverse_event_id': f.adverse_event_id,
        'sequence': f.sequence, 'followup_date': str(f.followup_date),
        'current_status': f.current_status,
        'outcome_update': f.outcome_update,
        'requires_further_followup': f.requires_further_followup,
        'create_time': f.create_time.isoformat(),
    }


@router.post('/adverse-events/create', summary='AE上报')
@require_permission('safety.ae.create')
def create_ae(request, data: AECreateIn):
    """上报不良事件"""
    account = _get_account_from_request(request)
    ae = services.create_adverse_event(
        enrollment_id=data.enrollment_id,
        description=data.description,
        start_date=data.start_date,
        severity=data.severity,
        relation=data.relation,
        work_order_id=data.work_order_id,
        action_taken=data.action_taken or '',
        outcome=data.outcome or 'unknown',
        is_sae=data.is_sae or False,
        reported_by_id=account.id if account else None,
        open_id=data.open_id or '',
    )
    ae = AdverseEvent.objects.select_related('enrollment__subject', 'enrollment__protocol').get(pk=ae.id)
    sc = _resolve_subject_project_sc(ae)
    return {'code': 200, 'msg': 'AE上报成功', 'data': _ae_to_dict(ae, sc)}


@router.get('/adverse-events/list', summary='AE列表')
@require_permission('safety.ae.read')
def list_ae(request, params: AEQueryParams = Query(...)):
    result = services.list_adverse_events(
        enrollment_id=params.enrollment_id,
        status=params.status,
        is_sae=params.is_sae,
        page=params.page, page_size=params.page_size,
    )
    items = result['items']
    sc_by_pair = _batch_subject_project_sc_records(items)
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [
                _ae_to_dict(ae, sc_by_pair.get(_subject_project_sc_pair(ae)))
                for ae in items
            ],
            'total': result['total'],
        },
    }


@router.get('/adverse-events/{ae_id}', summary='AE详情')
@require_permission('safety.ae.read')
def get_ae(request, ae_id: int):
    ae = services.get_adverse_event(ae_id)
    if not ae:
        return 404, {'code': 404, 'msg': 'AE不存在'}
    sc = _resolve_subject_project_sc(ae)
    data = _ae_to_dict(ae, sc)
    data['follow_ups'] = [_followup_to_dict(f) for f in ae.follow_ups.all()]
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/adverse-events/stats', summary='AE统计')
@require_permission('safety.ae.read')
def get_ae_stats(request, enrollment_id: Optional[int] = None):
    """获取 AE 统计数据"""
    from .models import AdverseEvent
    from django.db.models import Count
    qs = AdverseEvent.objects.all()
    if enrollment_id:
        qs = qs.filter(enrollment_id=enrollment_id)
    total = qs.count()
    by_severity = dict(qs.values_list('severity').annotate(c=Count('id')).values_list('severity', 'c'))
    by_status = dict(qs.values_list('status').annotate(c=Count('id')).values_list('status', 'c'))
    by_relation = dict(qs.values_list('relation').annotate(c=Count('id')).values_list('relation', 'c'))
    sae_count = qs.filter(is_sae=True).count()
    open_count = qs.exclude(status='closed').count()
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'total': total,
            'by_severity': by_severity,
            'by_status': by_status,
            'by_relation': by_relation,
            'sae_count': sae_count,
            'open_count': open_count,
        },
    }


@router.post('/adverse-events/{ae_id}/follow-up', summary='添加AE随访')
@require_permission('safety.ae.create')
def add_followup(request, ae_id: int, data: FollowUpCreateIn):
    account = _get_account_from_request(request)
    fu = services.add_follow_up(
        ae_id=ae_id,
        followup_date=data.followup_date,
        current_status=data.current_status,
        outcome_update=data.outcome_update or '',
        severity_change=data.severity_change or '',
        treatment_update=data.treatment_update or '',
        requires_further_followup=data.requires_further_followup if data.requires_further_followup is not None else True,
        next_followup_date=data.next_followup_date,
        recorded_by_id=account.id if account else None,
        notes=data.notes or '',
    )
    if not fu:
        return 404, {'code': 404, 'msg': 'AE不存在'}
    return {'code': 200, 'msg': '随访记录添加成功', 'data': _followup_to_dict(fu)}
