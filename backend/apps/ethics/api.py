"""
伦理管理 API

端点：
- POST /ethics/applications/create     创建伦理申请
- GET  /ethics/applications/list        申请列表
- POST /ethics/applications/{id}/submit 提交审批
- POST /ethics/applications/{id}/approve 审批通过
- POST /ethics/applications/{id}/upload-approval 上传批件
- GET  /ethics/check-valid/{protocol_id} 检查有效伦理批件
"""
from ninja import Router, Schema, Query
from typing import Optional
from datetime import date
from apps.identity.decorators import require_permission, _get_account_from_request

from . import services
from .schemas import ErrorOut

router = Router()


class ApplicationCreateIn(Schema):
    protocol_id: int
    committee_id: int
    application_number: str
    version: Optional[str] = 'v1.0'
    remarks: Optional[str] = ''


class SubmitIn(Schema):
    open_id: Optional[str] = ''


class ApprovalDocIn(Schema):
    document_number: str
    approved_date: date
    expiry_date: Optional[date] = None
    file_url: Optional[str] = ''


class AppQueryParams(Schema):
    protocol_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


def _app_to_dict(app) -> dict:
    return {
        'id': app.id, 'protocol_id': app.protocol_id,
        'committee_id': app.committee_id,
        'application_number': app.application_number,
        'version': app.version, 'status': app.status,
        'submission_date': str(app.submission_date) if app.submission_date else None,
        'remarks': app.remarks,
        'create_time': app.create_time.isoformat(),
    }


@router.post('/applications/create', summary='创建伦理申请')
@require_permission('ethics.app.create')
def create_app(request, data: ApplicationCreateIn):
    account = _get_account_from_request(request)
    app = services.create_application(
        protocol_id=data.protocol_id, committee_id=data.committee_id,
        application_number=data.application_number,
        version=data.version or 'v1.0', remarks=data.remarks or '',
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '伦理申请创建成功', 'data': _app_to_dict(app)}


@router.get('/applications/list', summary='伦理申请列表')
@require_permission('ethics.app.read')
def list_apps(request, params: AppQueryParams = Query(...)):
    result = services.list_applications(
        protocol_id=params.protocol_id, status=params.status,
        page=params.page, page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {'items': [_app_to_dict(a) for a in result['items']], 'total': result['total']},
    }


@router.post('/applications/{app_id}/submit', summary='提交伦理审批', response={200: dict, 400: ErrorOut})
@require_permission('ethics.app.create')
def submit_app(request, app_id: int, data: SubmitIn):
    app = services.submit_application(app_id, open_id=data.open_id or '')
    if not app:
        return 400, {'code': 400, 'msg': '提交失败'}
    return {'code': 200, 'msg': '已提交飞书审批', 'data': _app_to_dict(app)}


@router.get('/applications/{app_id}', summary='伦理申请详情', response={200: dict, 404: ErrorOut})
@require_permission('ethics.app.read')
def get_app_detail(request, app_id: int):
    app = services.get_application(app_id)
    if not app:
        return 404, {'code': 404, 'msg': '申请不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _app_to_dict(app)}


@router.post('/applications/{app_id}/approve', summary='审批通过', response={200: dict, 400: ErrorOut})
@require_permission('ethics.app.review')
def approve_app(request, app_id: int):
    app = services.approve_application(app_id)
    if not app:
        return 400, {'code': 400, 'msg': '审批失败'}
    return {'code': 200, 'msg': '审批通过', 'data': _app_to_dict(app)}


class RejectIn(Schema):
    reason: Optional[str] = ''


@router.post('/applications/{app_id}/reject', summary='审批驳回', response={200: dict, 400: ErrorOut})
@require_permission('ethics.app.review')
def reject_app(request, app_id: int, data: RejectIn):
    app = services.reject_application(app_id, reason=data.reason or '')
    if not app:
        return 400, {'code': 400, 'msg': '驳回失败'}
    return {'code': 200, 'msg': '已驳回', 'data': _app_to_dict(app)}


@router.post('/applications/{app_id}/withdraw', summary='撤回申请', response={200: dict, 400: ErrorOut})
@require_permission('ethics.app.create')
def withdraw_app(request, app_id: int):
    app = services.withdraw_application(app_id)
    if not app:
        return 400, {'code': 400, 'msg': '撤回失败'}
    return {'code': 200, 'msg': '已撤回', 'data': _app_to_dict(app)}


@router.post('/applications/{app_id}/upload-approval', summary='上传批件', response={200: dict, 400: ErrorOut})
@require_permission('ethics.app.create')
def upload_approval(request, app_id: int, data: ApprovalDocIn):
    doc = services.upload_approval_document(
        app_id, document_number=data.document_number,
        approved_date=data.approved_date, expiry_date=data.expiry_date,
        file_url=data.file_url or '',
    )
    if not doc:
        return 400, {'code': 400, 'msg': '上传失败：申请不存在或未通过审批'}
    return {'code': 200, 'msg': '批件已上传', 'data': {'doc_id': doc.id, 'document_number': doc.document_number}}


@router.get('/check-valid/{protocol_id}', summary='检查有效伦理批件')
@require_permission('ethics.app.read')
def check_valid(request, protocol_id: int):
    result = services.check_valid_ethics(protocol_id)
    return {'code': 200, 'msg': 'OK', 'data': result}
