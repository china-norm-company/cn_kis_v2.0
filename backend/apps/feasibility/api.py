"""
可行性评估 API

端点：
- POST /feasibility/create         — 创建评估
- GET  /feasibility/list           — 评估列表
- GET  /feasibility/{id}           — 评估详情
- POST /feasibility/{id}/auto-check — 触发自动检查
- POST /feasibility/{id}/submit    — 提交审批
- POST /feasibility/{id}/approve   — 批准
- POST /feasibility/{id}/reject    — 驳回
"""
from ninja import Router, Schema, Query
from typing import Optional, List

from . import services
from .models import FeasibilityAssessment, AssessmentItem
from apps.identity.decorators import _get_account_from_request, require_permission

router = Router(tags=['feasibility'])


# ============================================================================
# Schema
# ============================================================================
class AssessmentCreateIn(Schema):
    opportunity_id: int
    title: str
    protocol_id: Optional[int] = None


class AssessmentQueryParams(Schema):
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class AssessmentItemOut(Schema):
    id: int
    dimension: str
    score: int
    weight: float
    auto_check_passed: Optional[bool] = None
    auto_check_detail: dict = {}
    manual_notes: str = ''
    create_time: str


class AssessmentOut(Schema):
    id: int
    opportunity_id: int
    opportunity_title: str
    protocol_id: Optional[int] = None
    protocol_title: Optional[str] = None
    title: str
    status: str
    overall_score: Optional[float] = None
    auto_check_result: dict = {}
    notes: str
    created_by_id: Optional[int] = None
    create_time: str
    update_time: str
    items: List[AssessmentItemOut] = []


# ============================================================================
# 辅助函数
# ============================================================================
def _item_to_dict(item: AssessmentItem) -> dict:
    return {
        'id': item.id,
        'dimension': item.dimension,
        'score': item.score,
        'weight': item.weight,
        'auto_check_passed': item.auto_check_passed,
        'auto_check_detail': item.auto_check_detail or {},
        'manual_notes': item.manual_notes,
        'create_time': item.create_time.isoformat(),
    }


def _assessment_to_dict(a: FeasibilityAssessment, include_items: bool = False) -> dict:
    data = {
        'id': a.id,
        'opportunity_id': a.opportunity_id,
        'opportunity_title': a.opportunity.title if a.opportunity else '',
        'protocol_id': a.protocol_id,
        'protocol_title': a.protocol.title if a.protocol else None,
        'title': a.title,
        'status': a.status,
        'overall_score': a.overall_score,
        'auto_check_result': a.auto_check_result or {},
        'notes': a.notes,
        'created_by_id': a.created_by_id,
        'create_time': a.create_time.isoformat(),
        'update_time': a.update_time.isoformat(),
    }
    if include_items:
        items = AssessmentItem.objects.filter(assessment=a).order_by('dimension')
        data['items'] = [_item_to_dict(item) for item in items]
    else:
        data['items'] = []
    return data


# ============================================================================
# API 端点
# ============================================================================
@router.post('/create', summary='创建可行性评估')
@require_permission('feasibility.assessment.create')
def create_assessment(request, data: AssessmentCreateIn):
    account = _get_account_from_request(request)
    try:
        assessment = services.create_assessment(
            opportunity_id=data.opportunity_id,
            title=data.title,
            created_by_id=account.id if account else None,
        )
        # 关联协议（如果提供）
        if data.protocol_id:
            assessment.protocol_id = data.protocol_id
            assessment.save(update_fields=['protocol_id', 'update_time'])
        return {'code': 200, 'msg': 'OK', 'data': _assessment_to_dict(assessment, include_items=True)}
    except ValueError as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.get('/list', summary='评估列表')
@require_permission('feasibility.assessment.read')
def list_assessments(request, params: AssessmentQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_assessments(
        page=params.page,
        page_size=params.page_size,
        status=params.status,
        account=account,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_assessment_to_dict(a) for a in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


def _check_assessment_access(request, assessment_id: int):
    """验证用户有权限访问该评估记录（数据权限过滤）"""
    from apps.identity.filters import filter_queryset_by_scope
    account = _get_account_from_request(request)
    qs = FeasibilityAssessment.objects.filter(id=assessment_id, is_deleted=False)
    if account:
        qs = filter_queryset_by_scope(qs, account)
    return qs.select_related('opportunity', 'protocol').first()


@router.get('/{assessment_id}', summary='评估详情')
@require_permission('feasibility.assessment.read')
def get_assessment(request, assessment_id: int):
    a = _check_assessment_access(request, assessment_id)
    if not a:
        return {'code': 404, 'msg': '评估不存在', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _assessment_to_dict(a, include_items=True)}


@router.post('/{assessment_id}/auto-check', summary='触发自动检查')
@require_permission('feasibility.assessment.update')
def auto_check(request, assessment_id: int):
    a = _check_assessment_access(request, assessment_id)
    if not a:
        return {'code': 404, 'msg': '评估不存在', 'data': None}
    try:
        assessment = services.run_auto_checks(assessment_id)
        return {'code': 200, 'msg': '自动检查完成', 'data': _assessment_to_dict(assessment, include_items=True)}
    except ValueError as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.post('/{assessment_id}/submit', summary='提交审批')
@require_permission('feasibility.assessment.submit')
def submit_assessment(request, assessment_id: int):
    a = _check_assessment_access(request, assessment_id)
    if not a:
        return {'code': 404, 'msg': '评估不存在', 'data': None}
    try:
        assessment = services.submit_assessment(assessment_id)
        return {'code': 200, 'msg': '已提交审批', 'data': _assessment_to_dict(assessment)}
    except ValueError as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.post('/{assessment_id}/approve', summary='批准评估')
@require_permission('feasibility.assessment.approve')
def approve_assessment(request, assessment_id: int):
    a = _check_assessment_access(request, assessment_id)
    if not a:
        return {'code': 404, 'msg': '评估不存在', 'data': None}
    try:
        assessment = services.approve_assessment(assessment_id)
        return {'code': 200, 'msg': '已批准', 'data': _assessment_to_dict(assessment)}
    except ValueError as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.post('/{assessment_id}/reject', summary='驳回评估')
@require_permission('feasibility.assessment.approve')
def reject_assessment(request, assessment_id: int):
    a = _check_assessment_access(request, assessment_id)
    if not a:
        return {'code': 404, 'msg': '评估不存在', 'data': None}
    try:
        assessment = services.reject_assessment(assessment_id)
        return {'code': 200, 'msg': '已驳回', 'data': _assessment_to_dict(assessment)}
    except ValueError as e:
        return {'code': 400, 'msg': str(e), 'data': None}
