"""
质量合规 API

端点：
- GET  /quality/deviations/list      偏差列表
- POST /quality/deviations/create    创建偏差
- GET  /quality/deviations/{id}      偏差详情
- PUT  /quality/deviations/{id}      更新偏差
- DELETE /quality/deviations/{id}    删除偏差
- GET  /quality/deviations/stats     偏差统计
- GET  /quality/capas/list           CAPA 列表
- POST /quality/capas/create         创建 CAPA
- GET  /quality/capas/{id}           CAPA 详情
- PUT  /quality/capas/{id}           更新 CAPA
- DELETE /quality/capas/{id}         删除 CAPA
- GET  /quality/capas/stats          CAPA 统计
- GET  /quality/sops/list            SOP 列表
- POST /quality/sops/create          创建 SOP
- GET  /quality/sops/{id}            SOP 详情
- PUT  /quality/sops/{id}            更新 SOP
- DELETE /quality/sops/{id}          删除 SOP
- GET  /quality/sops/review-due      待审查 SOP 列表（QP2-3）
- POST /quality/sops/{id}/new-version  创建新版本（QP2-3）
- POST /quality/sops/{id}/submit-review  提交审核（QP2-3）
- POST /quality/sops/{id}/approve   批准 SOP（QP2-3）
- GET  /quality/sops/{id}/training-matrix  培训矩阵（QP2-3）
- POST /quality/sops/{id}/training  添加培训记录（QP2-3）
- POST /quality/sop-training/{id}/complete  完成培训（QP2-3）
"""
from ninja import Router, Schema, Query, Body
from typing import Optional
from datetime import date

from . import services
from .models import Deviation, CAPA, SOP
from apps.identity.decorators import _get_account_from_request, require_permission
from apps.identity.filters import get_visible_object

router = Router()


# ============================================================================
# Schema
# ============================================================================
class DeviationQueryParams(Schema):
    status: Optional[str] = None
    severity: Optional[str] = None
    project: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    page: int = 1
    page_size: int = 20


class DeviationCreateIn(Schema):
    code: str
    title: str
    category: str
    severity: str
    reporter: str
    reported_at: date
    project: str
    description: Optional[str] = ''
    project_id: Optional[int] = None


class DeviationUpdateIn(Schema):
    title: Optional[str] = None
    status: Optional[str] = None
    severity: Optional[str] = None
    root_cause: Optional[str] = None
    resolution: Optional[str] = None
    closed_at: Optional[date] = None


class CAPAQueryParams(Schema):
    status: Optional[str] = None
    type: Optional[str] = None
    deviation_id: Optional[int] = None
    is_overdue: Optional[bool] = None
    page: int = 1
    page_size: int = 20


class CAPACreateIn(Schema):
    code: str
    deviation_id: int
    type: str
    title: str
    responsible: str
    due_date: date
    action_detail: Optional[str] = ''


class CAPAUpdateIn(Schema):
    title: Optional[str] = None
    status: Optional[str] = None
    effectiveness: Optional[str] = None
    verification_note: Optional[str] = None
    due_date: Optional[date] = None


class SOPQueryParams(Schema):
    status: Optional[str] = None
    category: Optional[str] = None
    page: int = 1
    page_size: int = 20


class SOPCreateIn(Schema):
    code: str
    title: str
    version: str
    category: str
    owner: str
    effective_date: Optional[date] = None
    next_review: Optional[date] = None
    feishu_doc_url: Optional[str] = ''


class SOPUpdateIn(Schema):
    title: Optional[str] = None
    version: Optional[str] = None
    status: Optional[str] = None
    effective_date: Optional[date] = None
    next_review: Optional[date] = None
    feishu_doc_url: Optional[str] = None


# QP2-3: SOP 生命周期
class SOPNewVersionIn(Schema):
    new_version: str
    title: Optional[str] = None
    feishu_doc_url: Optional[str] = None
    description: Optional[str] = None
    change_request_id: Optional[int] = None


class SOPApproveIn(Schema):
    effective_date: Optional[date] = None


class SOPTrainingAddIn(Schema):
    trainee_id: int
    trainee_name: str
    due_date: Optional[date] = None


# ============================================================================
# 辅助函数
# ============================================================================
def _deviation_to_dict(d) -> dict:
    return {
        'id': d.id, 'code': d.code, 'title': d.title,
        'category': d.category, 'severity': d.severity, 'status': d.status,
        'reporter': d.reporter, 'reported_at': d.reported_at.isoformat(),
        'project': d.project, 'description': d.description,
        'root_cause': d.root_cause, 'resolution': d.resolution,
        'closed_at': d.closed_at.isoformat() if d.closed_at else None,
        'source': getattr(d, 'source', ''),
        'source_workstation': getattr(d, 'source_workstation', ''),
        'source_record_id': getattr(d, 'source_record_id', ''),
        'create_time': d.create_time.isoformat(),
        'update_time': d.update_time.isoformat(),
    }


def _capa_to_dict(c) -> dict:
    return {
        'id': c.id, 'code': c.code,
        'deviation_id': c.deviation_id,
        'deviation_code': c.deviation.code if c.deviation else '',
        'type': c.type, 'title': c.title,
        'responsible': c.responsible, 'due_date': c.due_date.isoformat(),
        'status': c.status, 'effectiveness': c.effectiveness,
        'action_detail': c.action_detail, 'verification_note': c.verification_note,
        'create_time': c.create_time.isoformat(),
        'update_time': c.update_time.isoformat(),
    }


def _sop_to_dict(s) -> dict:
    return {
        'id': s.id, 'code': s.code, 'title': s.title,
        'version': s.version, 'category': s.category, 'status': s.status,
        'effective_date': s.effective_date.isoformat() if s.effective_date else '',
        'next_review': s.next_review.isoformat() if s.next_review else '',
        'owner': s.owner, 'feishu_doc_url': s.feishu_doc_url,
        'previous_version_id': s.previous_version_id,
        'change_request_id': s.change_request_id,
        'create_time': s.create_time.isoformat(),
    }


# ============================================================================
# 仪表盘 API
# ============================================================================
@router.get('/dashboard', summary='质量仪表盘')
@require_permission('quality.deviation.read')
def quality_dashboard(request):
    from .services.dashboard_service import get_quality_dashboard
    data = get_quality_dashboard()
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# 偏差管理 API
# ============================================================================
@router.get('/deviations/list', summary='偏差列表')
@require_permission('quality.deviation.read')
def list_deviations(request, params: DeviationQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_deviations(
        status=params.status, severity=params.severity,
        project=params.project, date_from=params.date_from, date_to=params.date_to,
        page=params.page, page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_deviation_to_dict(d) for d in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/deviations/stats', summary='偏差统计')
@require_permission('quality.deviation.read')
def deviation_stats(request):
    stats = services.get_deviation_stats()
    return {'code': 200, 'msg': 'OK', 'data': stats}


@router.post('/deviations/create', summary='创建偏差')
@require_permission('quality.deviation.create')
def create_deviation(request, data: DeviationCreateIn):
    account = _get_account_from_request(request)
    dev = services.create_deviation(
        code=data.code, title=data.title, category=data.category,
        severity=data.severity, reporter=data.reporter,
        reported_at=data.reported_at, project=data.project,
        description=data.description or '',
        reporter_id=account.id if account else None,
        project_id=data.project_id,
        reporter_open_id=getattr(account, 'feishu_open_id', '') if account else '',
    )
    return {'code': 200, 'msg': 'OK', 'data': _deviation_to_dict(dev)}


@router.get('/deviations/{deviation_id}', summary='偏差详情')
@require_permission('quality.deviation.read')
def get_deviation(request, deviation_id: int):
    account = _get_account_from_request(request)
    dev = get_visible_object(Deviation.objects.filter(id=deviation_id), account)
    if not dev:
        return 404, {'code': 404, 'msg': '偏差不存在'}
    result = _deviation_to_dict(dev)

    capas = CAPA.objects.filter(deviation_id=deviation_id, is_deleted=False).order_by('-create_time')
    result['capas'] = [_capa_to_dict(c) for c in capas]

    try:
        from apps.audit.models import AuditLog
        logs = AuditLog.objects.filter(
            resource_type='deviation', resource_id=str(deviation_id)
        ).order_by('create_time')[:50]
        result['timeline'] = [
            {
                'action': log.action,
                'operator': log.operator_name,
                'time': log.create_time.isoformat(),
                'detail': log.detail or '',
            }
            for log in logs
        ]
    except Exception:
        result['timeline'] = []

    return {'code': 200, 'msg': 'OK', 'data': result}


@router.put('/deviations/{deviation_id}', summary='更新偏差')
@require_permission('quality.deviation.create')
def update_deviation(request, deviation_id: int, data: DeviationUpdateIn):
    account = _get_account_from_request(request)
    if not get_visible_object(Deviation.objects.filter(id=deviation_id), account):
        return 404, {'code': 404, 'msg': '偏差不存在'}
    dev = services.update_deviation(deviation_id, **data.dict(exclude_unset=True))
    if not dev:
        return 404, {'code': 404, 'msg': '偏差不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _deviation_to_dict(dev)}


@router.delete('/deviations/{deviation_id}', summary='删除偏差')
@require_permission('quality.deviation.create')
def delete_deviation(request, deviation_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(Deviation.objects.filter(id=deviation_id), account):
        return 404, {'code': 404, 'msg': '偏差不存在'}
    ok = services.delete_deviation(deviation_id)
    if not ok:
        return 404, {'code': 404, 'msg': '偏差不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


@router.post('/deviations/{deviation_id}/create-capa-draft', summary='数字员工：从偏差自动创建 CAPA 草稿')
@require_permission('quality.capa.create')
def create_capa_draft_from_deviation(request, deviation_id: int):
    """
    数字员工流程内嵌：质量守护员根据偏差信息自动生成 CAPA 草稿。
    前端动作卡片点击"自动创建 CAPA 草稿"时调用。
    """
    import json
    from datetime import date, timedelta

    account = _get_account_from_request(request)
    dev = get_visible_object(Deviation.objects.filter(id=deviation_id, is_deleted=False), account)
    if not dev:
        return 404, {'code': 404, 'msg': '偏差不存在'}

    body = {}
    try:
        body = json.loads(request.body) if request.body else {}
    except Exception:
        pass

    ai_title = body.get('title') or f'针对偏差 {dev.code} 的纠正与预防措施'
    ai_action = body.get('action_detail') or f'根据偏差「{dev.title}」的根因分析，建议采取纠正措施并防止再发。'
    ai_responsible = body.get('responsible') or dev.reporter or '待指定'
    due_days = int(body.get('due_days', 30))

    existing_count = CAPA.objects.filter(deviation_id=deviation_id, is_deleted=False).count()
    capa_code = f'CAPA-{dev.code}-{existing_count + 1:02d}'

    capa = services.create_capa(
        code=capa_code,
        deviation_id=deviation_id,
        type='corrective',
        title=ai_title,
        responsible=ai_responsible,
        due_date=date.today() + timedelta(days=due_days),
        action_detail=ai_action,
    )

    try:
        from apps.secretary.runtime_plane import create_execution_task, finalize_execution_task
        task_id = create_execution_task(
            runtime_type='service',
            name='create-capa-draft',
            target='quality.create_capa_draft_from_deviation',
            account_id=getattr(account, 'id', None),
            input_payload={'deviation_id': deviation_id, 'capa_code': capa_code},
            role_code='quality_reviewer',
            workstation_key='quality',
            business_object_type='deviation',
            business_object_id=str(deviation_id),
        )
        finalize_execution_task(task_id, ok=True, output={'capa_id': capa.id, 'capa_code': capa_code})
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': _capa_to_dict(capa)}


# ============================================================================
# CAPA API
# ============================================================================
@router.get('/capas/list', summary='CAPA列表')
@require_permission('quality.capa.read')
def list_capas(request, params: CAPAQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_capas(
        status=params.status, type=params.type,
        deviation_id=params.deviation_id,
        is_overdue=params.is_overdue,
        page=params.page, page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_capa_to_dict(c) for c in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/capas/stats', summary='CAPA统计')
@require_permission('quality.capa.read')
def capa_stats(request):
    stats = services.get_capa_stats()
    return {'code': 200, 'msg': 'OK', 'data': stats}


@router.post('/capas/create', summary='创建CAPA')
@require_permission('quality.capa.create')
def create_capa(request, data: CAPACreateIn):
    if not Deviation.objects.filter(id=data.deviation_id, is_deleted=False).exists():
        return {'code': 404, 'msg': f'偏差 ID {data.deviation_id} 不存在或已删除', 'data': None}
    capa = services.create_capa(
        code=data.code, deviation_id=data.deviation_id, type=data.type,
        title=data.title, responsible=data.responsible, due_date=data.due_date,
        action_detail=data.action_detail or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': _capa_to_dict(capa)}


@router.get('/capas/{capa_id}', summary='CAPA详情')
@require_permission('quality.capa.read')
def get_capa(request, capa_id: int):
    from .models import CAPAActionItem
    account = _get_account_from_request(request)
    capa = get_visible_object(CAPA.objects.filter(id=capa_id), account)
    if not capa:
        return 404, {'code': 404, 'msg': 'CAPA不存在'}
    result = _capa_to_dict(capa)
    items = CAPAActionItem.objects.filter(capa_id=capa_id).order_by('sequence')
    result['action_items'] = [
        {
            'id': item.id, 'sequence': item.sequence, 'title': item.title,
            'responsible_name': item.responsible_name, 'due_date': item.due_date.isoformat() if item.due_date else '',
            'status': item.status, 'completion_note': item.completion_note,
            'completed_at': item.completed_at.isoformat() if item.completed_at else None,
        }
        for item in items
    ]
    total_items = items.count()
    completed_items = items.filter(status='completed').count()
    result['progress'] = {
        'total': total_items,
        'completed': completed_items,
        'percentage': round(completed_items / total_items * 100) if total_items > 0 else 0,
    }
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.put('/capas/{capa_id}', summary='更新CAPA')
@require_permission('quality.capa.create')
def update_capa(request, capa_id: int, data: CAPAUpdateIn):
    account = _get_account_from_request(request)
    if not get_visible_object(CAPA.objects.filter(id=capa_id), account):
        return 404, {'code': 404, 'msg': 'CAPA不存在'}
    capa = services.update_capa(capa_id, **data.dict(exclude_unset=True))
    if not capa:
        return 404, {'code': 404, 'msg': 'CAPA不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _capa_to_dict(capa)}


@router.delete('/capas/{capa_id}', summary='删除CAPA')
@require_permission('quality.capa.create')
def delete_capa(request, capa_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(CAPA.objects.filter(id=capa_id), account):
        return 404, {'code': 404, 'msg': 'CAPA不存在'}
    ok = services.delete_capa(capa_id)
    if not ok:
        return 404, {'code': 404, 'msg': 'CAPA不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# SOP API
# ============================================================================
@router.get('/sops/list', summary='SOP列表')
@require_permission('quality.sop.read')
def list_sops(request, params: SOPQueryParams = Query(...)):
    account = _get_account_from_request(request)
    result = services.list_sops(
        status=params.status, category=params.category,
        page=params.page, page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200, 'msg': 'OK',
        'data': {
            'items': [_sop_to_dict(s) for s in result['items']],
            'total': result['total'], 'page': result['page'], 'page_size': result['page_size'],
        },
    }


@router.get('/sops/stats', summary='SOP统计')
@require_permission('quality.sop.read')
def sop_stats(request):
    stats = services.get_sop_stats()
    return {'code': 200, 'msg': 'OK', 'data': stats}


@router.get('/sops/review-due', summary='待审查SOP列表')
@require_permission('quality.sop.read')
def list_sops_review_due(request):
    """返回 next_review 在 30 天内的 SOP"""
    from .services.sop_lifecycle_service import check_review_due
    sops = check_review_due(days=30)
    return {'code': 200, 'msg': 'OK', 'data': [_sop_to_dict(s) for s in sops]}


@router.post('/sops/create', summary='创建SOP')
@require_permission('quality.sop.manage')
def create_sop(request, data: SOPCreateIn):
    sop = services.create_sop(
        code=data.code, title=data.title, version=data.version,
        category=data.category, owner=data.owner,
        effective_date=data.effective_date, next_review=data.next_review,
        feishu_doc_url=data.feishu_doc_url or '',
    )
    return {'code': 200, 'msg': 'OK', 'data': _sop_to_dict(sop)}


@router.get('/sops/{sop_id}', summary='SOP详情')
@require_permission('quality.sop.read')
def get_sop(request, sop_id: int):
    account = _get_account_from_request(request)
    sop = get_visible_object(SOP.objects.filter(id=sop_id), account)
    if not sop:
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _sop_to_dict(sop)}


@router.put('/sops/{sop_id}', summary='更新SOP')
@require_permission('quality.sop.manage')
def update_sop(request, sop_id: int, data: SOPUpdateIn):
    account = _get_account_from_request(request)
    if not get_visible_object(SOP.objects.filter(id=sop_id), account):
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    sop = services.update_sop(sop_id, **data.dict(exclude_unset=True))
    if not sop:
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _sop_to_dict(sop)}


@router.delete('/sops/{sop_id}', summary='删除SOP')
@require_permission('quality.sop.manage')
def delete_sop(request, sop_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(SOP.objects.filter(id=sop_id), account):
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    ok = services.delete_sop(sop_id)
    if not ok:
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    return {'code': 200, 'msg': 'OK', 'data': None}


# ============================================================================
# QP2-3：SOP 生命周期
# ============================================================================
@router.post('/sops/{sop_id}/new-version', summary='创建新版本')
@require_permission('quality.sop.manage')
def create_sop_new_version(request, sop_id: int, data: SOPNewVersionIn):
    account = _get_account_from_request(request)
    if not get_visible_object(SOP.objects.filter(id=sop_id), account):
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    from .services.sop_lifecycle_service import create_new_version
    new_sop = create_new_version(
        sop_id=sop_id,
        new_version=data.new_version,
        title=data.title,
        feishu_doc_url=data.feishu_doc_url,
        description=data.description,
        change_request_id=data.change_request_id,
    )
    if not new_sop:
        return 400, {'code': 400, 'msg': '创建新版本失败：SOP不存在或新版本code已存在'}
    return {'code': 200, 'msg': '新版本已创建', 'data': _sop_to_dict(new_sop)}


@router.post('/sops/{sop_id}/submit-review', summary='提交审核')
@require_permission('quality.sop.manage')
def submit_sop_for_review(request, sop_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(SOP.objects.filter(id=sop_id), account):
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    from .services.sop_lifecycle_service import submit_for_review
    sop = submit_for_review(sop_id)
    if not sop:
        return 400, {'code': 400, 'msg': '提交失败：仅草稿状态可提交审核'}
    return {'code': 200, 'msg': '已提交审核', 'data': _sop_to_dict(sop)}


@router.post('/sops/{sop_id}/approve', summary='批准SOP')
@require_permission('quality.sop.manage')
def approve_sop(request, sop_id: int, data: Optional[SOPApproveIn] = Body(default=None)):
    account = _get_account_from_request(request)
    if not get_visible_object(SOP.objects.filter(id=sop_id), account):
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    from .services.sop_lifecycle_service import approve_sop as svc_approve_sop
    effective_date = data.effective_date if data else None
    sop = svc_approve_sop(sop_id, effective_date=effective_date)
    if not sop:
        return 400, {'code': 400, 'msg': '批准失败：仅审核中状态可批准'}
    return {'code': 200, 'msg': 'SOP已批准生效', 'data': _sop_to_dict(sop)}


@router.get('/sops/{sop_id}/training-matrix', summary='培训矩阵')
@require_permission('quality.sop.read')
def get_sop_training_matrix(request, sop_id: int):
    account = _get_account_from_request(request)
    if not get_visible_object(SOP.objects.filter(id=sop_id), account):
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    from .services.sop_lifecycle_service import get_training_matrix
    matrix = get_training_matrix(sop_id)
    return {'code': 200, 'msg': 'OK', 'data': matrix}


@router.post('/sops/{sop_id}/training', summary='添加培训记录')
@require_permission('quality.sop.manage')
def add_sop_training(request, sop_id: int, data: SOPTrainingAddIn):
    account = _get_account_from_request(request)
    if not get_visible_object(SOP.objects.filter(id=sop_id), account):
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    from .services.sop_lifecycle_service import add_training_record
    training = add_training_record(
        sop_id=sop_id,
        trainee_id=data.trainee_id,
        trainee_name=data.trainee_name,
        due_date=data.due_date,
    )
    if not training:
        return 404, {'code': 404, 'msg': 'SOP不存在'}
    return {'code': 200, 'msg': '培训记录已添加', 'data': {
        'id': training.id,
        'trainee_id': training.trainee_id,
        'trainee_name': training.trainee_name,
        'status': training.status,
        'due_date': training.due_date.isoformat() if training.due_date else None,
    }}


@router.post('/sop-training/{training_id}/complete', summary='完成培训')
@require_permission('quality.sop.manage')
def complete_sop_training(request, training_id: int):
    from .services.sop_lifecycle_service import complete_training
    from .models import SOPTraining
    training = SOPTraining.objects.filter(id=training_id).first()
    if not training:
        return 404, {'code': 404, 'msg': '培训记录不存在'}
    completed = complete_training(training_id)
    if not completed:
        return 400, {'code': 400, 'msg': '完成失败'}
    return {'code': 200, 'msg': '培训已完成', 'data': {
        'id': completed.id,
        'status': completed.status,
        'completed_at': completed.completed_at.isoformat() if completed.completed_at else None,
    }}


# ============================================================================
# S2-6：偏差状态推进 + CAPA 行动项管理
# ============================================================================
class DeviationAdvanceIn(Schema):
    new_status: str


class ActionItemCreateIn(Schema):
    title: str
    due_date: date
    responsible_name: Optional[str] = ''
    responsible_id: Optional[int] = None


class ActionItemCompleteIn(Schema):
    completion_note: Optional[str] = ''


class CAPAVerifyIn(Schema):
    effectiveness: Optional[str] = '有效'
    verification_note: Optional[str] = ''


@router.post('/deviations/{deviation_id}/advance', summary='偏差状态推进')
@require_permission('quality.deviation.manage')
def advance_deviation(request, deviation_id: int, data: DeviationAdvanceIn):
    dev = services.advance_deviation_status(deviation_id, data.new_status)
    if not dev:
        return 400, {'code': 400, 'msg': '状态推进失败：不存在或不允许的状态转换'}
    return {'code': 200, 'msg': f'偏差状态已更新为 {dev.status}', 'data': _deviation_to_dict(dev)}


@router.post('/capas/{capa_id}/action-items/create', summary='添加CAPA行动项')
@require_permission('quality.capa.manage')
def add_action_item(request, capa_id: int, data: ActionItemCreateIn):
    item = services.add_capa_action_item(
        capa_id, title=data.title, due_date=data.due_date,
        responsible_name=data.responsible_name or '',
        responsible_id=data.responsible_id,
    )
    if not item:
        return 400, {'code': 400, 'msg': 'CAPA不存在'}
    return {'code': 200, 'msg': '行动项已添加', 'data': {
        'id': item.id, 'sequence': item.sequence, 'title': item.title,
        'status': item.status,
    }}


@router.get('/capas/{capa_id}/action-items', summary='CAPA行动项列表')
@require_permission('quality.capa.read')
def list_action_items(request, capa_id: int):
    from .models import CAPAActionItem
    items = CAPAActionItem.objects.filter(capa_id=capa_id).order_by('sequence')
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': i.id, 'sequence': i.sequence, 'title': i.title,
            'responsible_name': i.responsible_name, 'due_date': str(i.due_date),
            'status': i.status,
            'completed_at': i.completed_at.isoformat() if i.completed_at else None,
        } for i in items],
    }}


@router.post('/action-items/{item_id}/complete', summary='完成行动项')
@require_permission('quality.capa.manage')
def complete_action(request, item_id: int, data: ActionItemCompleteIn):
    item = services.complete_action_item(item_id, completion_note=data.completion_note or '')
    if not item:
        return 400, {'code': 400, 'msg': '完成失败'}
    return {'code': 200, 'msg': '行动项已完成', 'data': {
        'id': item.id, 'status': item.status,
    }}


@router.post('/capas/{capa_id}/verify', summary='验证并关闭CAPA')
@require_permission('quality.capa.manage')
def verify_capa(request, capa_id: int, data: CAPAVerifyIn):
    capa = services.verify_and_close_capa(
        capa_id, effectiveness=data.effectiveness or '有效',
        verification_note=data.verification_note or '',
    )
    if not capa:
        return 400, {'code': 400, 'msg': '验证失败：CAPA不存在或状态不正确'}
    return {'code': 200, 'msg': 'CAPA已验证关闭', 'data': _capa_to_dict(capa)}


# ============================================================================
# 跨台质量事件 API
# ============================================================================
class CrossWsDeviationIn(Schema):
    source: str
    source_workstation: str
    source_record_id: str
    title: str
    description: str = ''
    severity: str = 'major'
    reporter: str = '系统自动'
    project: str = ''
    project_id: Optional[int] = None


@router.post('/deviations/from-external', summary='外部来源创建偏差')
@require_permission('quality.deviation.create')
def create_deviation_from_external(request, data: CrossWsDeviationIn):
    from .services.cross_workstation_service import create_deviation_from_source
    dev = create_deviation_from_source(
        source=data.source, source_workstation=data.source_workstation,
        source_record_id=data.source_record_id, title=data.title,
        description=data.description, severity=data.severity,
        reporter=data.reporter, project=data.project,
        project_id=data.project_id,
    )
    return {'code': 200, 'msg': '偏差已创建', 'data': _deviation_to_dict(dev)}


# ============================================================================
# 质量门禁 API
# ============================================================================
@router.get('/gates/{protocol_id}', summary='质量门禁检查')
@require_permission('quality.deviation.read')
def check_quality_gates(request, protocol_id: int):
    from .services.quality_gate_service import check_all_gates
    result = check_all_gates(protocol_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.get('/gates/{protocol_id}/{gate_type}', summary='单个门禁检查')
@require_permission('quality.deviation.read')
def check_single_gate(request, protocol_id: int, gate_type: str):
    from .services import quality_gate_service as qg
    gate_funcs = {
        'project_start': qg.check_project_start_gate,
        'data_lock': qg.check_data_lock_gate,
        'closeout': qg.check_closeout_gate,
    }
    func = gate_funcs.get(gate_type)
    if not func:
        return 400, {'code': 400, 'msg': f'未知门禁类型: {gate_type}'}
    result = func(protocol_id)
    return {'code': 200, 'msg': 'OK', 'data': result}


# ============================================================================
# 项目质量报告 API
# ============================================================================
@router.get('/report/{protocol_id}', summary='项目质量报告')
@require_permission('quality.deviation.read')
def get_quality_report(request, protocol_id: int):
    from .services.closeout_report_service import generate_project_quality_report
    report = generate_project_quality_report(protocol_id)
    return {'code': 200, 'msg': 'OK', 'data': report}


# ============================================================================
# 质量分析 API
# ============================================================================
class AnalyticsParams(Schema):
    months: int = 12
    project_id: Optional[int] = None


@router.get('/analytics/deviation-trend', summary='偏差月度趋势')
@require_permission('quality.deviation.read')
def deviation_trend(request, params: AnalyticsParams = Query(...)):
    from .services.analytics_service import get_deviation_trend
    data = get_deviation_trend(months=params.months, project_id=params.project_id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/analytics/capa-closure-rate', summary='CAPA按时关闭率')
@require_permission('quality.capa.read')
def capa_closure_rate(request, params: AnalyticsParams = Query(...)):
    from .services.analytics_service import get_capa_closure_rate
    data = get_capa_closure_rate(months=params.months)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/analytics/deviation-recurrence', summary='偏差复发分析')
@require_permission('quality.deviation.read')
def deviation_recurrence(request):
    from .services.analytics_service import get_deviation_recurrence
    data = get_deviation_recurrence()
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/analytics/management-review', summary='管理评审数据包')
@require_permission('quality.deviation.read')
def management_review(request):
    from .services.analytics_service import get_management_review_data
    data = get_management_review_data()
    return {'code': 200, 'msg': 'OK', 'data': data}
