"""
监管沟通 API (REG003)
"""
from ninja import Router, Query
from apps.identity.decorators import require_permission, _get_account_from_request
from .schemas import CorrespondenceCreateIn, CorrespondenceQueryParams, ErrorOut
from .services import correspondence_service as service

router = Router()


def _corr_to_dict(c) -> dict:
    return {
        'id': c.id,
        'correspondence_no': c.correspondence_no,
        'direction': c.direction,
        'direction_display': c.get_direction_display(),
        'subject': c.subject,
        'content': c.content,
        'counterpart': c.counterpart,
        'contact_person': c.contact_person,
        'correspondence_date': str(c.correspondence_date) if c.correspondence_date else None,
        'reply_deadline': str(c.reply_deadline) if c.reply_deadline else None,
        'status': c.status,
        'status_display': c.get_status_display(),
        'parent_id': c.parent_id,
        'protocol_id': c.protocol_id,
        'attachment_urls': c.attachment_urls,
        'created_at': c.create_time.isoformat(),
    }


@router.post('/correspondences', summary='创建监管沟通')
@require_permission('ethics.correspondence.create')
def create_correspondence(request, data: CorrespondenceCreateIn):
    account = _get_account_from_request(request)
    corr = service.create_correspondence(
        direction=data.direction,
        subject=data.subject,
        content=data.content or '',
        counterpart=data.counterpart or '',
        contact_person=data.contact_person or '',
        correspondence_date=data.correspondence_date,
        reply_deadline=data.reply_deadline,
        parent_id=data.parent_id,
        protocol_id=data.protocol_id,
        attachment_urls=data.attachment_urls or [],
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '沟通记录创建成功', 'data': _corr_to_dict(corr)}


@router.get('/correspondences', summary='监管沟通列表')
@require_permission('ethics.correspondence.read')
def list_correspondences(request, params: CorrespondenceQueryParams = Query(...)):
    result = service.list_correspondences(
        direction=params.direction,
        status=params.status,
        protocol_id=params.protocol_id,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_corr_to_dict(c) for c in result['items']],
            'total': result['total'],
        },
    }


@router.get('/correspondences/{corr_id}', summary='沟通详情', response={200: dict, 404: ErrorOut})
@require_permission('ethics.correspondence.read')
def get_correspondence(request, corr_id: int):
    corr = service.get_correspondence(corr_id)
    if not corr:
        return 404, {'code': 404, 'msg': '记录不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _corr_to_dict(corr)}
