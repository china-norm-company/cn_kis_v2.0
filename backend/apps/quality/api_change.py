"""
变更控制 API

端点：
- GET  /quality/changes/list        变更列表
- POST /quality/changes/create      创建变更
- GET  /quality/changes/{id}        变更详情
- POST /quality/changes/{id}/submit 提交变更
- POST /quality/changes/{id}/approve 批准变更
- POST /quality/changes/{id}/reject  驳回变更
- POST /quality/changes/{id}/implement 开始实施
- POST /quality/changes/{id}/verify  验证变更
- POST /quality/changes/{id}/close   关闭变更
- GET  /quality/changes/stats        变更统计
"""
from ninja import Router, Schema, Query
from typing import Optional

from apps.identity.decorators import require_permission, _get_account_from_request
from .services import change_control_service as svc

router = Router()


# ============================================================================
# Schema
# ============================================================================
class ChangeQueryParams(Schema):
    change_type: Optional[str] = None
    status: Optional[str] = None
    risk_level: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ChangeCreateIn(Schema):
    code: str
    title: str
    change_type: str
    description: str = ''
    risk_level: str = 'medium'
    impact_assessment: str = ''


class ImplementIn(Schema):
    implementation_plan: str = ''


class VerifyIn(Schema):
    verification_note: str = ''


# ============================================================================
# Serializer
# ============================================================================
def _change_to_dict(cr) -> dict:
    return {
        'id': cr.id, 'code': cr.code, 'title': cr.title,
        'change_type': cr.change_type, 'description': cr.description,
        'impact_assessment': cr.impact_assessment,
        'risk_level': cr.risk_level, 'status': cr.status,
        'applicant': cr.applicant, 'reviewer': cr.reviewer,
        'implementation_plan': cr.implementation_plan,
        'verification_note': cr.verification_note,
        'feishu_approval_instance_id': cr.feishu_approval_instance_id,
        'create_time': cr.create_time.isoformat(),
        'update_time': cr.update_time.isoformat(),
    }


# ============================================================================
# API
# ============================================================================
@router.get('/changes/list', summary='变更列表')
@require_permission('quality.change.read')
def list_changes(request, params: ChangeQueryParams = Query(...)):
    result = svc.list_change_requests(
        change_type=params.change_type, status=params.status,
        risk_level=params.risk_level,
        page=params.page, page_size=params.page_size,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_change_to_dict(cr) for cr in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.post('/changes/create', summary='创建变更')
@require_permission('quality.change.manage')
def create_change(request, data: ChangeCreateIn):
    account = _get_account_from_request(request)
    cr = svc.create_change_request(
        code=data.code, title=data.title, change_type=data.change_type,
        description=data.description, risk_level=data.risk_level,
        applicant=account.name if account else '',
        applicant_id=account.id if account else None,
        impact_assessment=data.impact_assessment,
    )
    return {'code': 200, 'msg': 'OK', 'data': _change_to_dict(cr)}


@router.get('/changes/{cr_id}', summary='变更详情')
@require_permission('quality.change.read')
def get_change(request, cr_id: int):
    cr = svc.get_change_request(cr_id)
    if not cr:
        return 404, {'code': 404, 'msg': '变更不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _change_to_dict(cr)}


@router.post('/changes/{cr_id}/submit', summary='提交变更')
@require_permission('quality.change.manage')
def submit_change(request, cr_id: int):
    cr = svc.submit_change_request(cr_id)
    if not cr:
        return 400, {'code': 400, 'msg': '提交失败'}
    return {'code': 200, 'msg': '变更已提交', 'data': _change_to_dict(cr)}


@router.post('/changes/{cr_id}/approve', summary='批准变更')
@require_permission('quality.change.manage')
def approve_change(request, cr_id: int):
    account = _get_account_from_request(request)
    cr = svc.approve_change_request(
        cr_id,
        reviewer=account.name if account else '',
        reviewer_id=account.id if account else None,
    )
    if not cr:
        return 400, {'code': 400, 'msg': '批准失败'}
    return {'code': 200, 'msg': '变更已批准', 'data': _change_to_dict(cr)}


@router.post('/changes/{cr_id}/reject', summary='驳回变更')
@require_permission('quality.change.manage')
def reject_change(request, cr_id: int):
    account = _get_account_from_request(request)
    cr = svc.reject_change_request(
        cr_id,
        reviewer=account.name if account else '',
        reviewer_id=account.id if account else None,
    )
    if not cr:
        return 400, {'code': 400, 'msg': '驳回失败'}
    return {'code': 200, 'msg': '变更已驳回', 'data': _change_to_dict(cr)}


@router.post('/changes/{cr_id}/implement', summary='开始实施')
@require_permission('quality.change.manage')
def implement_change(request, cr_id: int, data: ImplementIn):
    cr = svc.start_implementation(cr_id, implementation_plan=data.implementation_plan)
    if not cr:
        return 400, {'code': 400, 'msg': '操作失败'}
    return {'code': 200, 'msg': '已开始实施', 'data': _change_to_dict(cr)}


@router.post('/changes/{cr_id}/verify', summary='验证变更')
@require_permission('quality.change.manage')
def verify_change(request, cr_id: int, data: VerifyIn):
    cr = svc.verify_change(cr_id, verification_note=data.verification_note)
    if not cr:
        return 400, {'code': 400, 'msg': '操作失败'}
    return {'code': 200, 'msg': '变更已验证', 'data': _change_to_dict(cr)}


@router.post('/changes/{cr_id}/close', summary='关闭变更')
@require_permission('quality.change.manage')
def close_change(request, cr_id: int):
    cr = svc.close_change(cr_id)
    if not cr:
        return 400, {'code': 400, 'msg': '操作失败'}
    return {'code': 200, 'msg': '变更已关闭', 'data': _change_to_dict(cr)}


@router.get('/changes/stats', summary='变更统计')
@require_permission('quality.change.read')
def change_stats(request):
    stats = svc.get_change_stats()
    return {'code': 200, 'msg': 'OK', 'data': stats}
