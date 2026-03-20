"""
审查意见 API (ETH002)
"""
from ninja import Router, Query
from apps.identity.decorators import require_permission, _get_account_from_request
from .schemas import ReviewOpinionCreateIn, ReviewOpinionRespondIn, ReviewOpinionQueryParams, ErrorOut
from .services import ethics_review_service as service

router = Router()


def _opinion_to_dict(op) -> dict:
    return {
        'id': op.id,
        'application_id': op.application_id,
        'application_no': op.application.application_number if op.application else '',
        'opinion_no': op.opinion_no,
        'opinion_type': op.opinion_type,
        'opinion_type_display': op.get_opinion_type_display(),
        'review_date': str(op.review_date) if op.review_date else None,
        'summary': op.summary,
        'detailed_opinion': op.detailed_opinion,
        'modification_requirements': op.modification_requirements,
        'reviewer_names': op.reviewer_names,
        'response_required': op.response_required,
        'response_deadline': str(op.response_deadline) if op.response_deadline else None,
        'response_received': op.response_received,
        'response_text': op.response_text,
        'response_date': str(op.response_date) if op.response_date else None,
        'created_at': op.create_time.isoformat(),
    }


@router.post('/review-opinions', summary='创建审查意见', response={200: dict, 400: ErrorOut})
@require_permission('ethics.review.create')
def create_review_opinion(request, data: ReviewOpinionCreateIn):
    account = _get_account_from_request(request)
    opinion = service.create_review_opinion(
        application_id=data.application_id,
        opinion_type=data.opinion_type,
        review_date=data.review_date,
        summary=data.summary,
        detailed_opinion=data.detailed_opinion,
        modification_requirements=data.modification_requirements or '',
        reviewer_names=data.reviewer_names or [],
        response_required=data.response_required or False,
        response_deadline=data.response_deadline,
        created_by_id=account.id if account else None,
    )
    if not opinion:
        return 400, {'code': 400, 'msg': '创建失败：申请不存在'}
    return {'code': 200, 'msg': '审查意见创建成功', 'data': _opinion_to_dict(opinion)}


@router.get('/review-opinions', summary='审查意见列表')
@require_permission('ethics.review.read')
def list_review_opinions(request, params: ReviewOpinionQueryParams = Query(...)):
    result = service.list_review_opinions(
        application_id=params.application_id,
        opinion_type=params.opinion_type,
        page=params.page,
        page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_opinion_to_dict(o) for o in result['items']],
            'total': result['total'],
        },
    }


@router.get('/review-opinions/{opinion_id}', summary='审查意见详情', response={200: dict, 404: ErrorOut})
@require_permission('ethics.review.read')
def get_review_opinion(request, opinion_id: int):
    opinion = service.get_review_opinion(opinion_id)
    if not opinion:
        return 404, {'code': 404, 'msg': '审查意见不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _opinion_to_dict(opinion)}


@router.post('/review-opinions/{opinion_id}/respond', summary='回复审查意见', response={200: dict, 400: ErrorOut})
@require_permission('ethics.review.create')
def respond_to_opinion(request, opinion_id: int, data: ReviewOpinionRespondIn):
    opinion = service.respond_to_opinion(opinion_id, data.response_text)
    if not opinion:
        return 400, {'code': 400, 'msg': '回复失败：意见不存在或已回复'}
    return {'code': 200, 'msg': '回复成功', 'data': _opinion_to_dict(opinion)}
