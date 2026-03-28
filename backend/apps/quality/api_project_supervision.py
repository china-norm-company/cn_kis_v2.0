"""
项目监察 API

GET  /quality/project-supervision/list
GET  /quality/project-supervision/{protocol_id}
POST /quality/project-supervision/create-protocol  创建协议（质量台权限）
POST /quality/project-supervision/{protocol_id}/submit-plan
POST /quality/project-supervision/{protocol_id}/submit-actual
"""
import logging
from typing import List, Optional

from django.conf import settings as django_settings
from django.db import IntegrityError, connection
from ninja import Router, Schema, Query
from django.http import JsonResponse

from apps.identity.decorators import _get_account_from_request, require_permission
from apps.protocol import services as protocol_services
from apps.protocol.api import ProtocolCreateIn
from apps.quality.services import project_supervision_service as svc

router = Router()
logger = logging.getLogger(__name__)


class PlanEntryIn(Schema):
    """单条监察计划：缺省空串由服务层校验并返回中文提示，避免 Pydantic 英文 field required"""

    entry_id: Optional[str] = None
    visit_phase: str = ''
    planned_date: str = ''
    content: str = ''
    supervisor: str = ''


class SubmitPlanIn(Schema):
    """一个项目可包含多条监察计划"""

    plan_entries: List[PlanEntryIn]


class ActualEntryIn(Schema):
    """单条监察记录：缺省空串由服务层校验"""

    entry_id: Optional[str] = None
    visit_phase: str = ''
    supervision_at: str = ''
    content: str = ''
    conclusion: str = ''


class SubmitActualIn(Schema):
    actual_entries: List[ActualEntryIn]


@router.get('/project-supervision/list', summary='项目监察/项目管理列表')
@require_permission('quality.deviation.read')
def supervision_list(
    request,
    year_month: Optional[str] = Query(None, description='按执行开始时间筛选所在月，如 2026-03'),
    keyword: Optional[str] = Query(None),
    researcher_keyword: Optional[str] = Query(
        None, description='按研究员姓名等（匹配 team_members / parsed_data 文本）'
    ),
    list_mode: str = Query(
        'supervision',
        description='supervision=项目监察主表 | management=项目管理（仅维周登记项目）',
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    account = _get_account_from_request(request)
    data = svc.list_project_supervision(
        account,
        year_month=year_month,
        keyword=keyword,
        researcher_keyword=researcher_keyword,
        list_mode=list_mode,
        page=page,
        page_size=page_size,
    )
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post(
    '/project-supervision/create-protocol',
    summary='项目监察：创建协议',
)
@require_permission('quality.deviation.create')
def supervision_create_protocol(request, data: ProtocolCreateIn):
    """
    质量台「手动补录」专用：与 POST /protocol/create 同一套 create_protocol 逻辑，但固定 quality_manual_test=True，
    不触发维周/飞书侧同步；项目编号全局唯一（与维周推送无关）。
    权限：quality.deviation.create（与提交监察计划同级），无需 protocol.protocol.create。
    """
    account = _get_account_from_request(request)
    created_by_id = getattr(account, 'id', None) if account else None

    sched = None
    if getattr(data, 'screening_schedule', None):
        from apps.subject.services.consent_service import (
            _normalize_screening_schedule_for_stats as _norm_ss,
            validate_screening_schedule_test_rules,
        )

        sched = _norm_ss(
            [
                x.model_dump() if hasattr(x, 'model_dump') else x.dict()
                for x in data.screening_schedule
            ]
        )
        verr = validate_screening_schedule_test_rules(sched)
        if verr:
            return {'code': 400, 'msg': verr, 'data': None}
        if any((x.get('signing_staff_name') or '').strip() for x in (sched or [])):
            return {
                'code': 400,
                'msg': '请先在「知情配置」中添加双签工作人员并保存后，再指定各现场日知情签署人员',
                'data': None,
            }
    try:
        protocol = protocol_services.create_protocol(
            title=data.title,
            code=data.code or '',
            efficacy_type=data.efficacy_type or '',
            sample_size=data.sample_size,
            screening_schedule=sched,
            consent_config_account_id=getattr(data, 'consent_config_account_id', None),
            consent_signing_staff_name=getattr(data, 'consent_signing_staff_name', None),
            group_label=getattr(data, 'group_label', None),
            backup_sample_label=getattr(data, 'backup_sample_label', None),
            visits_summary=getattr(data, 'visits_summary', None),
            execution_start=getattr(data, 'execution_start', None),
            execution_end=getattr(data, 'execution_end', None),
            principal_investigator=getattr(data, 'principal_investigator', None),
            created_by_id=created_by_id,
            quality_manual_test=True,
        )
    except ValueError as e:
        return {'code': 400, 'msg': str(e), 'data': None}
    except IntegrityError as e:
        logger.warning('项目监察创建协议唯一约束冲突: %s', e)
        return {'code': 400, 'msg': '项目编号可能已被占用，请更换后重试', 'data': None}
    except Exception as e:
        logger.exception('项目监察创建协议失败: %s', e)
        try:
            if connection.needs_rollback():
                connection.rollback()
        except Exception:
            pass
        # 统一 HTTP 200 + body.code，前端 axios 才能稳定展示 msg，避免仅见「请求失败 (500)」
        detail = str(e)[:500] if getattr(django_settings, 'DEBUG', False) else '创建失败，请稍后重试或联系管理员；若持续出现请提供时间便于查日志'
        return {'code': 500, 'msg': detail, 'data': None}
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'id': protocol.id, 'title': protocol.title, 'status': protocol.status},
    }


@router.get('/project-supervision/{protocol_id}', summary='项目监察详情')
@require_permission('quality.deviation.read')
def supervision_detail(request, protocol_id: int):
    account = _get_account_from_request(request)
    row = svc.get_supervision_detail(account, protocol_id)
    if row is None:
        return JsonResponse({'code': 404, 'msg': '记录不存在或无权访问', 'data': None}, status=404)
    return {'code': 200, 'msg': 'OK', 'data': row}


@router.post('/project-supervision/{protocol_id}/submit-plan', summary='提交监察计划')
@require_permission('quality.deviation.create')
def supervision_submit_plan(request, protocol_id: int, payload: SubmitPlanIn):
    account = _get_account_from_request(request)
    try:
        rows = [
            x.model_dump() if hasattr(x, 'model_dump') else x.dict()
            for x in payload.plan_entries
        ]
        data = svc.submit_plan(account, protocol_id, rows)
        return {'code': 200, 'msg': 'OK', 'data': data}
    except ValueError as e:
        return JsonResponse({'code': 400, 'msg': str(e), 'data': None}, status=400)


@router.post('/project-supervision/{protocol_id}/submit-actual', summary='提交实际监察')
@require_permission('quality.deviation.create')
def supervision_submit_actual(request, protocol_id: int, payload: SubmitActualIn):
    account = _get_account_from_request(request)
    try:
        rows = [
            x.model_dump() if hasattr(x, 'model_dump') else x.dict()
            for x in payload.actual_entries
        ]
        data = svc.submit_actual(account, protocol_id, rows)
        return {'code': 200, 'msg': 'OK', 'data': data}
    except ValueError as e:
        return JsonResponse({'code': 400, 'msg': str(e), 'data': None}, status=400)
