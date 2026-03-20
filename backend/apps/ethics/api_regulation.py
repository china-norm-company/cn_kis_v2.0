"""
法规跟踪 API (REG001)
"""
from ninja import Router, Query
from apps.identity.decorators import require_permission, _get_account_from_request
from .schemas import RegulationCreateIn, RegulationUpdateIn, RegulationQueryParams, ErrorOut
from .services import regulation_service as service

router = Router()


def _regulation_to_dict(r) -> dict:
    return {
        'id': r.id,
        'title': r.title,
        'regulation_type': r.regulation_type,
        'regulation_type_display': r.get_regulation_type_display(),
        'issuing_authority': r.issuing_authority,
        'document_number': r.document_number,
        'publish_date': str(r.publish_date) if r.publish_date else None,
        'effective_date': str(r.effective_date) if r.effective_date else None,
        'status': r.status,
        'status_display': r.get_status_display(),
        'summary': r.summary,
        'key_requirements': r.key_requirements,
        'impact_level': r.impact_level,
        'impact_level_display': r.get_impact_level_display(),
        'affected_areas': r.affected_areas,
        'impact_analysis': r.impact_analysis,
        'action_items': r.action_items,
        'action_deadline': str(r.action_deadline) if r.action_deadline else None,
        'action_completed': r.action_completed,
        'created_at': r.create_time.isoformat(),
    }


@router.post('/regulations', summary='创建法规信息')
@require_permission('ethics.regulation.create')
def create_regulation(request, data: RegulationCreateIn):
    account = _get_account_from_request(request)
    regulation = service.create_regulation(
        title=data.title,
        regulation_type=data.regulation_type,
        publish_date=data.publish_date,
        effective_date=data.effective_date,
        issuing_authority=data.issuing_authority or '',
        document_number=data.document_number or '',
        summary=data.summary or '',
        key_requirements=data.key_requirements or '',
        impact_level=data.impact_level or 'medium',
        affected_areas=data.affected_areas or [],
        impact_analysis=data.impact_analysis or '',
        action_items=data.action_items or '',
        action_deadline=data.action_deadline,
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '法规信息创建成功', 'data': _regulation_to_dict(regulation)}


@router.get('/regulations', summary='法规列表')
@require_permission('ethics.regulation.read')
def list_regulations(request, params: RegulationQueryParams = Query(...)):
    result = service.list_regulations(
        regulation_type=params.regulation_type,
        status=params.status,
        impact_level=params.impact_level,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_regulation_to_dict(r) for r in result['items']],
            'total': result['total'],
        },
    }


@router.get('/regulations/{regulation_id}', summary='法规详情', response={200: dict, 404: ErrorOut})
@require_permission('ethics.regulation.read')
def get_regulation(request, regulation_id: int):
    regulation = service.get_regulation(regulation_id)
    if not regulation:
        return 404, {'code': 404, 'msg': '法规不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _regulation_to_dict(regulation)}


@router.put('/regulations/{regulation_id}', summary='更新法规信息', response={200: dict, 400: ErrorOut})
@require_permission('ethics.regulation.create')
def update_regulation(request, regulation_id: int, data: RegulationUpdateIn):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    regulation = service.update_regulation(regulation_id, **update_data)
    if not regulation:
        return 400, {'code': 400, 'msg': '更新失败'}
    return {'code': 200, 'msg': '更新成功', 'data': _regulation_to_dict(regulation)}
