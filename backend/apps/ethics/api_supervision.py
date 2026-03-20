"""
伦理监督 API (ETH004)
"""
from ninja import Router, Query
from apps.identity.decorators import require_permission, _get_account_from_request
from .schemas import SupervisionCreateIn, SupervisionStatusUpdateIn, SupervisionQueryParams, ErrorOut
from .services import supervision_service as service

router = Router()


def _supervision_to_dict(s) -> dict:
    return {
        'id': s.id,
        'supervision_no': s.supervision_no,
        'protocol_id': s.protocol_id,
        'protocol_title': s.protocol.title if s.protocol else '',
        'supervision_type': s.supervision_type,
        'supervision_type_display': s.get_supervision_type_display(),
        'status': s.status,
        'status_display': s.get_status_display(),
        'planned_date': str(s.planned_date) if s.planned_date else None,
        'actual_date': str(s.actual_date) if s.actual_date else None,
        'completed_date': str(s.completed_date) if s.completed_date else None,
        'scope': s.scope,
        'findings': s.findings,
        'corrective_actions': s.corrective_actions,
        'corrective_deadline': str(s.corrective_deadline) if s.corrective_deadline else None,
        'corrective_completed': s.corrective_completed,
        'verification_notes': s.verification_notes,
        'supervisor_names': s.supervisor_names,
        'created_at': s.create_time.isoformat(),
    }


@router.post('/supervisions', summary='创建监督计划', response={200: dict, 400: ErrorOut})
@require_permission('ethics.supervision.create')
def create_supervision(request, data: SupervisionCreateIn):
    account = _get_account_from_request(request)
    supervision = service.create_supervision(
        protocol_id=data.protocol_id,
        supervision_type=data.supervision_type,
        planned_date=data.planned_date,
        scope=data.scope or '',
        notes=data.notes or '',
        supervisor_names=data.supervisor_names or [],
        created_by_id=account.id if account else None,
    )
    if not supervision:
        return 400, {'code': 400, 'msg': '创建失败：项目不存在'}
    return {'code': 200, 'msg': '监督计划创建成功', 'data': _supervision_to_dict(supervision)}


@router.get('/supervisions', summary='监督列表')
@require_permission('ethics.supervision.read')
def list_supervisions(request, params: SupervisionQueryParams = Query(...)):
    result = service.list_supervisions(
        protocol_id=params.protocol_id,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_supervision_to_dict(s) for s in result['items']],
            'total': result['total'],
        },
    }


@router.get('/supervisions/{supervision_id}', summary='监督详情', response={200: dict, 404: ErrorOut})
@require_permission('ethics.supervision.read')
def get_supervision(request, supervision_id: int):
    supervision = service.get_supervision(supervision_id)
    if not supervision:
        return 404, {'code': 404, 'msg': '监督记录不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _supervision_to_dict(supervision)}


@router.post('/supervisions/{supervision_id}/status', summary='更新监督状态', response={200: dict, 400: ErrorOut})
@require_permission('ethics.supervision.create')
def update_supervision_status(request, supervision_id: int, data: SupervisionStatusUpdateIn):
    supervision = service.update_supervision_status(
        supervision_id=supervision_id,
        new_status=data.status,
        findings=data.findings or '',
        corrective_actions=data.corrective_actions or '',
        corrective_deadline=data.corrective_deadline,
        verification_notes=data.verification_notes or '',
    )
    if not supervision:
        return 400, {'code': 400, 'msg': '更新失败'}
    return {'code': 200, 'msg': '状态已更新', 'data': _supervision_to_dict(supervision)}
