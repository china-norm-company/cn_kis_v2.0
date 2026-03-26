"""
初筛管理 API

路由前缀：/pre-screening/
覆盖：初筛发起、列表、详情、草稿保存、完成判定、PI 复核、今日摘要、漏斗统计。
"""
from ninja import Router, Schema, Query
from typing import Optional, List
from datetime import date
from apps.identity.decorators import require_permission, _get_account_from_request
from .services import prescreening_service as svc

router = Router()


# ============================================================================
# Schema
# ============================================================================
class PreScreeningStartIn(Schema):
    registration_id: int
    protocol_id: int


class PreScreeningDraftIn(Schema):
    hard_exclusion_checks: Optional[list] = None
    skin_visual_assessment: Optional[dict] = None
    instrument_summary: Optional[dict] = None
    medical_summary: Optional[dict] = None
    lifestyle_summary: Optional[dict] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class PreScreeningCompleteIn(Schema):
    result: str
    fail_reasons: Optional[List[str]] = None
    notes: Optional[str] = None


class PreScreeningReviewIn(Schema):
    decision: str
    notes: str


class PreScreeningQueryParams(Schema):
    pre_screening_date: Optional[date] = None
    pre_screening_date_from: Optional[date] = None
    pre_screening_date_to: Optional[date] = None
    result: Optional[str] = None
    plan_id: Optional[int] = None
    screener_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


class PreScreeningSyncFromAppointmentsIn(Schema):
    """可选：指定预约日期；默认按服务器本地「今日」的初筛预约同步。"""
    target_date: Optional[date] = None


# ============================================================================
# 初筛 API
# ============================================================================
@router.post('/start', summary='发起初筛')
@require_permission('subject.recruitment.create')
def start_pre_screening(request, payload: PreScreeningStartIn):
    account = _get_account_from_request(request)
    try:
        result = svc.start_pre_screening(
            registration_id=payload.registration_id,
            protocol_id=payload.protocol_id,
            screener_id=account.id,
            created_by_id=account.id,
        )
        return {'code': 200, 'msg': 'OK', 'data': result}
    except (ValueError, Exception) as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.post('/sync-from-appointments', summary='从预约同步初筛名单')
@require_permission('subject.recruitment.create')
def sync_from_appointments(request, payload: PreScreeningSyncFromAppointmentsIn):
    """处理预约日为目标日（默认今日）的全部访视点预约。"""
    account = _get_account_from_request(request)
    result = svc.sync_prescreening_from_appointments(
        target_date=payload.target_date,
        screener_id=account.id,
        created_by_id=account.id,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/', summary='初筛记录列表')
@require_permission('subject.recruitment.read')
def list_pre_screenings(request, params: Query[PreScreeningQueryParams]):
    result = svc.list_pre_screenings(
        pre_screening_date=params.pre_screening_date,
        pre_screening_date_from=params.pre_screening_date_from,
        pre_screening_date_to=params.pre_screening_date_to,
        result=params.result,
        plan_id=params.plan_id,
        screener_id=params.screener_id,
        page=params.page,
        page_size=params.page_size,
    )
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.put('/records/{record_id}', summary='保存初筛草稿')
@require_permission('subject.recruitment.update')
def save_draft(request, record_id: int, payload: PreScreeningDraftIn):
    try:
        data = payload.dict(exclude_none=True)
        result = svc.save_pre_screening_draft(record_id, data)
        return {'code': 200, 'msg': 'OK', 'data': result}
    except (ValueError, Exception) as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.post('/records/{record_id}/complete', summary='完成初筛判定')
@require_permission('subject.recruitment.update')
def complete_pre_screening(request, record_id: int, payload: PreScreeningCompleteIn):
    try:
        result = svc.complete_pre_screening(
            record_id=record_id,
            result=payload.result,
            fail_reasons=payload.fail_reasons,
            notes=payload.notes,
        )
        return {'code': 200, 'msg': 'OK', 'data': result}
    except (ValueError, Exception) as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.post('/records/{record_id}/review', summary='PI 复核判定')
@require_permission('subject.recruitment.approve')
def review_pre_screening(request, record_id: int, payload: PreScreeningReviewIn):
    account = _get_account_from_request(request)
    try:
        result = svc.review_pre_screening(
            record_id=record_id,
            decision=payload.decision,
            notes=payload.notes,
            reviewer_id=account.id,
        )
        return {'code': 200, 'msg': 'OK', 'data': result}
    except (ValueError, Exception) as e:
        return {'code': 400, 'msg': str(e), 'data': None}


@router.get('/today-summary', summary='今日初筛摘要')
@require_permission('subject.recruitment.read')
def today_summary(request):
    result = svc.get_today_summary()
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/funnel', summary='初筛漏斗数据')
@require_permission('subject.recruitment.read')
def funnel(request, plan_id: Optional[int] = None):
    result = svc.get_pre_screening_funnel(plan_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/records/{record_id}', summary='初筛记录详情')
@require_permission('subject.recruitment.read')
def get_pre_screening(request, record_id: int):
    try:
        result = svc.get_pre_screening_detail(record_id)
        return {'code': 200, 'msg': 'OK', 'data': result}
    except Exception as e:
        return {'code': 404, 'msg': str(e), 'data': None}
