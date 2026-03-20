"""
文档管理（eTMF）API

端点：
- POST /document/create            创建文档
- GET  /document/list               文档列表
- GET  /document/{id}               文档详情
- POST /document/{id}/submit-review 提交审核
- POST /document/reviews/{id}/approve 审核通过
- POST /document/reviews/{id}/reject  审核驳回
- POST /document/{id}/publish        发布文档
- POST /document/trainings/{id}/confirm 培训确认
"""
from ninja import Router, Schema, Query
from typing import Optional, List
from datetime import date
from apps.identity.decorators import require_permission, _get_account_from_request

from . import services

router = Router()


class DocCreateIn(Schema):
    document_no: str
    title: str
    category_id: int
    version: Optional[str] = '1.0'
    description: Optional[str] = ''
    content: Optional[str] = ''


class DocQueryParams(Schema):
    category_id: Optional[int] = None
    status: Optional[str] = None
    keyword: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ReviewActionIn(Schema):
    comments: Optional[str] = ''


class PublishIn(Schema):
    publish_notes: Optional[str] = ''
    training_required: Optional[bool] = False
    training_deadline: Optional[date] = None
    training_user_ids: Optional[List[int]] = None


def _doc_to_dict(d) -> dict:
    return {
        'id': d.id, 'document_no': d.document_no, 'title': d.title,
        'category_id': d.category_id, 'version': d.version,
        'status': d.status, 'description': d.description,
        'feishu_doc_token': d.feishu_doc_token,
        'effective_date': str(d.effective_date) if d.effective_date else None,
        'create_time': d.create_time.isoformat(),
    }


@router.post('/create', summary='创建文档')
@require_permission('document.doc.create')
def create_doc(request, data: DocCreateIn):
    account = _get_account_from_request(request)
    doc = services.create_document(
        document_no=data.document_no, title=data.title,
        category_id=data.category_id, version=data.version or '1.0',
        description=data.description or '', content=data.content or '',
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '文档创建成功', 'data': _doc_to_dict(doc)}


@router.get('/list', summary='文档列表')
@require_permission('document.doc.read')
def list_docs(request, params: DocQueryParams = Query(...)):
    result = services.list_documents(
        category_id=params.category_id, status=params.status,
        keyword=params.keyword, page=params.page, page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {'items': [_doc_to_dict(d) for d in result['items']], 'total': result['total']},
    }


@router.get('/{doc_id}', summary='文档详情')
@require_permission('document.doc.read')
def get_doc(request, doc_id: int):
    doc = services.get_document(doc_id)
    if not doc:
        return 404, {'code': 404, 'msg': '文档不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _doc_to_dict(doc)}


@router.post('/{doc_id}/submit-review', summary='提交审核')
@require_permission('document.doc.create')
def submit_review(request, doc_id: int):
    account = _get_account_from_request(request)
    review = services.submit_for_review(doc_id, submitted_by_id=account.id if account else None)
    if not review:
        return 400, {'code': 400, 'msg': '无法提交：文档不存在或状态不允许'}
    return {'code': 200, 'msg': '已提交审核', 'data': {'review_id': review.id, 'status': review.status}}


@router.post('/reviews/{review_id}/approve', summary='审核通过')
@require_permission('document.doc.review')
def approve(request, review_id: int, data: ReviewActionIn):
    account = _get_account_from_request(request)
    review = services.approve_review(review_id, reviewed_by_id=account.id if account else None,
                                     comments=data.comments or '')
    if not review:
        return 400, {'code': 400, 'msg': '审核失败'}
    return {'code': 200, 'msg': '审核通过', 'data': {'review_id': review.id, 'status': review.status}}


@router.post('/reviews/{review_id}/reject', summary='审核驳回')
@require_permission('document.doc.review')
def reject(request, review_id: int, data: ReviewActionIn):
    account = _get_account_from_request(request)
    review = services.reject_review(review_id, reviewed_by_id=account.id if account else None,
                                    comments=data.comments or '')
    if not review:
        return 400, {'code': 400, 'msg': '驳回失败'}
    return {'code': 200, 'msg': '已驳回', 'data': {'review_id': review.id, 'status': review.status}}


@router.post('/{doc_id}/publish', summary='发布文档')
@require_permission('document.doc.publish')
def publish_doc(request, doc_id: int, data: PublishIn):
    account = _get_account_from_request(request)
    pub = services.publish_document(
        doc_id, published_by_id=account.id if account else None,
        publish_notes=data.publish_notes or '',
        training_required=data.training_required or False,
        training_deadline=data.training_deadline,
        training_user_ids=data.training_user_ids,
    )
    if not pub:
        return 400, {'code': 400, 'msg': '发布失败：文档不存在或未通过审核'}
    return {'code': 200, 'msg': '文档已发布', 'data': {'publish_id': pub.id}}


@router.post('/trainings/{training_id}/confirm', summary='培训确认')
@require_permission('document.training.create')
def confirm_training(request, training_id: int):
    t = services.confirm_training(training_id)
    if not t:
        return 400, {'code': 400, 'msg': '确认失败'}
    return {'code': 200, 'msg': '培训已确认', 'data': {'training_id': t.id, 'status': t.status}}
