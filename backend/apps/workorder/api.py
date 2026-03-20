"""
工单管理 API

端点：
- GET  /workorder/list              工单列表
- GET  /workorder/{id}              工单详情
- POST /workorder/create            创建工单
- POST /workorder/{id}/assign       分配工单
- POST /workorder/{id}/start        开始处理
- POST /workorder/{id}/complete     完成工单
- POST /workorder/{id}/approve      批准工单
- POST /workorder/{id}/reject       拒绝工单
- POST /workorder/{id}/cancel       取消工单
- GET  /workorder/stats             工单统计
- GET  /workorder/crc-dashboard     CRC主管仪表盘
- GET  /workorder/crc-my-dashboard  CRC协调员仪表盘
- GET  /workorder/scheduler-dashboard 排程专员仪表盘
"""
from ninja import Router, Schema, Query
from typing import Optional, List
from datetime import datetime, date
import logging

from . import services
from .models import WorkOrder
from .query_utils import filter_by_assignee, annotate_effective_assignee
from apps.identity.decorators import _get_account_from_request, require_permission
from apps.identity.filters import get_visible_object

router = Router()
logger = logging.getLogger(__name__)


# ============================================================================
# Schema
# ============================================================================
class WorkOrderOut(Schema):
    id: int
    enrollment_id: int
    visit_node_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    status: str
    assigned_to: Optional[int] = None
    due_date: Optional[datetime] = None
    create_time: datetime
    update_time: datetime
    completed_at: Optional[datetime] = None


class WorkOrderCreateIn(Schema):
    enrollment_id: int
    visit_node_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    assigned_to: Optional[int] = None
    due_date: Optional[datetime] = None


class WorkOrderQueryParams(Schema):
    enrollment_id: Optional[int] = None
    visit_node_id: Optional[int] = None
    assigned_to: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class WorkOrderAssignIn(Schema):
    assigned_to: int
    due_date: Optional[datetime] = None


def _wo_to_dict(wo, include_relations=False) -> dict:
    """
    序列化工单为字典。

    include_relations=True 时追加关联数据（项目、受试者、访视、资源等），
    用于详情页；列表页传 False 以控制查询量。
    """
    data = {
        'id': wo.id,
        'enrollment_id': wo.enrollment_id,
        'visit_node_id': wo.visit_node_id,
        'visit_activity_id': wo.visit_activity_id,
        'schedule_slot_id': getattr(wo, 'schedule_slot_id', None),
        'title': wo.title,
        'description': wo.description,
        'work_order_type': wo.work_order_type,
        'status': wo.status,
        'scheduled_date': str(wo.scheduled_date) if wo.scheduled_date else None,
        'actual_date': str(wo.actual_date) if wo.actual_date else None,
        'assigned_to': wo.effective_assigned_to,  # 兼容旧字段名（值已切换为 effective）
        'created_by_id': wo.effective_created_by,  # 兼容旧字段名（值已切换为 effective）
        'effective_assigned_to': wo.effective_assigned_to,
        'effective_created_by': wo.effective_created_by,
        'legacy_assigned_to': wo.assigned_to,
        'legacy_created_by_id': wo.created_by_id,
        'due_date': wo.due_date.isoformat() if wo.due_date else None,
        'feishu_task_id': wo.feishu_task_id,
        'create_time': wo.create_time.isoformat(),
        'update_time': wo.update_time.isoformat(),
        'completed_at': wo.completed_at.isoformat() if wo.completed_at else None,
        'is_locked': getattr(wo, 'is_locked', False),
        'sop_confirmed': getattr(wo, 'sop_confirmed', False),
    }

    # 双轨阶段一致性观测：仅记录日志，不阻断业务。
    if wo.assigned_to_account_id is not None and wo.assigned_to_account_id != wo.assigned_to:
        logger.warning(
            'WorkOrder assignee mismatch detected: id=%s legacy=%s fk=%s',
            wo.id, wo.assigned_to, wo.assigned_to_account_id,
        )
    if wo.created_by_account_id is not None and wo.created_by_account_id != wo.created_by_id:
        logger.warning(
            'WorkOrder creator mismatch detected: id=%s legacy=%s fk=%s',
            wo.id, wo.created_by_id, wo.created_by_account_id,
        )

    if include_relations:
        _enrich_with_relations(data, wo)

    return data


def _enrich_with_relations(data: dict, wo) -> None:
    """向工单字典追加关联的项目、受试者、访视、资源、SOP、CRF 信息。"""
    try:
        enrollment = wo.enrollment
        if enrollment:
            subject = getattr(enrollment, 'subject', None)
            data['subject_id'] = subject.id if subject else None
            data['subject_name'] = (subject.name[:1] + '**') if subject and subject.name else ''
            data['protocol_id'] = enrollment.protocol_id
            data['protocol_title'] = enrollment.protocol.title if enrollment.protocol else ''
    except Exception:
        pass

    try:
        if wo.visit_node:
            data['visit_node_name'] = wo.visit_node.name
            data['visit_node_code'] = getattr(wo.visit_node, 'code', '')
    except Exception:
        pass

    try:
        if wo.visit_activity_id:
            from apps.visit.models import VisitActivity
            activity = VisitActivity.objects.select_related('activity_template').filter(
                id=wo.visit_activity_id,
            ).first()
            if activity:
                data['activity_name'] = activity.name
                if activity.activity_template:
                    data['activity_template_id'] = activity.activity_template.id
                    data['crf_template_id'] = activity.activity_template.crf_template_id
                    data['sop_id'] = activity.activity_template.sop_id
    except Exception:
        pass

    try:
        from .models import WorkOrderResource
        resources = WorkOrderResource.objects.select_related(
            'resource_category', 'resource_item',
        ).filter(work_order=wo)
        data['resources'] = [{
            'id': r.id,
            'resource_category_name': r.resource_category.name if r.resource_category else '',
            'resource_item_name': r.resource_item.name if r.resource_item else '',
            'resource_item_id': r.resource_item_id,
            'required_quantity': r.required_quantity,
            'is_mandatory': r.is_mandatory,
            'next_calibration_date': str(r.resource_item.next_calibration_date) if r.resource_item and r.resource_item.next_calibration_date else None,
        } for r in resources]
    except Exception:
        data['resources'] = []


# ============================================================================
# 端点
# ============================================================================
@router.get('/list', summary='工单列表')
@require_permission('workorder.workorder.read')
def list_work_orders(request, params: WorkOrderQueryParams = Query(...)):
    """分页查询工单列表（数据权限过滤）"""
    account = _get_account_from_request(request)
    result = services.list_work_orders(
        enrollment_id=params.enrollment_id,
        visit_node_id=params.visit_node_id,
        assigned_to=params.assigned_to,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [_wo_to_dict(item) for item in result['items']],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.get('/my-today', summary='我的今日工单')
@require_permission('workorder.workorder.read')
def my_today_work_orders(request):
    """获取当前用户今日分配的工单，含受试者和项目关联信息"""
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未登录'}
    items = services.get_my_today_work_orders(account.id)
    return {'code': 200, 'msg': 'OK', 'data': items}


@router.get('/{work_order_id}/quality-audits', summary='工单质量审计记录')
@require_permission('workorder.workorder.read')
def get_quality_audits(request, work_order_id: int):
    """获取工单的质量审计记录"""
    account = _get_account_from_request(request)
    if not _get_visible_work_order(work_order_id, account):
        return 404, {'code': 404, 'msg': '工单不存在'}
    from .models import WorkOrderQualityAudit
    audits = WorkOrderQualityAudit.objects.filter(work_order_id=work_order_id).order_by('-create_time')
    return {'code': 200, 'msg': 'OK', 'data': [{
        'id': a.id,
        'work_order_id': a.work_order_id,
        'completeness': a.completeness,
        'has_anomaly': a.has_anomaly,
        'result': a.result,
        'details': a.details,
        'reviewer_id': a.reviewer_id,
        'reviewer_comment': a.reviewer_comment,
        'create_time': a.create_time.isoformat(),
    } for a in audits]}


@router.get('/stats', summary='工单统计')
@require_permission('workorder.workorder.read')
def get_stats(request, enrollment_id: Optional[int] = None, assigned_to: Optional[int] = None):
    """工单统计"""
    stats = services.get_work_order_stats(enrollment_id=enrollment_id, assigned_to=assigned_to)
    return {'code': 200, 'msg': 'OK', 'data': stats}


@router.post('/create', summary='创建工单')
@require_permission('workorder.workorder.create')
def create_work_order(request, data: WorkOrderCreateIn):
    """创建新工单"""
    account = _get_account_from_request(request)
    wo = services.create_work_order(
        enrollment_id=data.enrollment_id,
        title=data.title,
        visit_node_id=data.visit_node_id,
        description=data.description or '',
        assigned_to=data.assigned_to,
        created_by_id=account.id if account else None,
        due_date=data.due_date,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'id': wo.id, 'title': wo.title, 'status': wo.status},
    }


def _get_visible_work_order(work_order_id: int, account) -> Optional[WorkOrder]:
    return get_visible_object(WorkOrder.objects.filter(id=work_order_id), account)


@router.get('/{work_order_id}/subject-context', summary='工单受试者上下文')
@require_permission('workorder.workorder.read')
def get_subject_context(request, work_order_id: int):
    """
    获取工单关联的受试者信息面板数据。
    通过 WorkOrder → Enrollment → Subject 关联链获取。
    """
    account = _get_account_from_request(request)
    wo = _get_visible_work_order(work_order_id, account)
    if not wo:
        return 404, {'code': 404, 'msg': '工单不存在'}

    context = {
        'workorder_id': wo.id,
        'subject': None,
        'enrollment': None,
        'history': [],
    }

    if not wo.enrollment_id:
        return {'code': 200, 'msg': 'OK', 'data': context}

    try:
        enrollment = wo.enrollment
        context['enrollment'] = {
            'id': enrollment.id,
            'enrollment_no': getattr(enrollment, 'enrollment_no', ''),
            'status': getattr(enrollment, 'status', ''),
            'enrolled_at': getattr(enrollment, 'enrolled_at', None),
        }

        subject = getattr(enrollment, 'subject', None)
        if subject:
            context['subject'] = {
                'id': subject.id,
                'subject_no': getattr(subject, 'subject_no', ''),
                'name': getattr(subject, 'name', ''),
                'gender': getattr(subject, 'gender', ''),
                'age': getattr(subject, 'age', None),
                'notes': getattr(subject, 'notes', ''),
            }

        # 历史工单
        from .models import WorkOrder as WO
        history = WO.objects.filter(
            enrollment_id=wo.enrollment_id,
            is_deleted=False,
        ).exclude(id=wo.id).order_by('-scheduled_date')[:10]

        context['history'] = [
            {
                'id': h.id,
                'title': h.title,
                'status': h.status,
                'scheduled_date': h.scheduled_date.isoformat() if h.scheduled_date else None,
            }
            for h in history
        ]
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f'受试者上下文查询失败: {e}')

    return {'code': 200, 'msg': 'OK', 'data': context}


@router.post('/{work_order_id}/assign', summary='分配工单', response={200: dict, 404: dict})
@require_permission('workorder.workorder.update')
def assign_work_order(request, work_order_id: int, data: WorkOrderAssignIn):
    """分配工单给指定人员；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    if not _get_visible_work_order(work_order_id, account):
        return 404, {'code': 404, 'msg': '工单不存在'}
    wo = services.assign_work_order(work_order_id, data.assigned_to, data.due_date)
    if not wo:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': wo.id,
            'assigned_to': wo.effective_assigned_to,
            'effective_assigned_to': wo.effective_assigned_to,
            'legacy_assigned_to': wo.assigned_to,
            'due_date': wo.due_date.isoformat() if wo.due_date else None,
        },
    }


@router.post('/{work_order_id}/start', summary='开始处理', response={200: dict, 400: dict, 404: dict})
@require_permission('workorder.workorder.update')
def start_work_order(request, work_order_id: int):
    """开始处理工单；自动执行仪器校准前置检查"""
    account = _get_account_from_request(request)
    if not _get_visible_work_order(work_order_id, account):
        return 404, {'code': 404, 'msg': '工单不存在'}
    try:
        wo = services.start_work_order(work_order_id)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    if not wo:
        return 400, {'code': 400, 'msg': '无法开始：工单不存在或状态不允许'}
    # 附带校准警告信息
    cal_check = services.check_calibration_before_start(work_order_id)
    data = _wo_to_dict(wo)
    data['calibration_warnings'] = cal_check.get('warnings', [])
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.post('/{work_order_id}/confirm-sop', summary='确认SOP已阅读', response={200: dict, 400: dict, 404: dict})
@require_permission('workorder.workorder.update')
def confirm_sop(request, work_order_id: int):
    """P2-2: 标记工单 SOP 已阅读确认"""
    account = _get_account_from_request(request)
    if not _get_visible_work_order(work_order_id, account):
        return 404, {'code': 404, 'msg': '工单不存在'}
    wo = services.confirm_sop(work_order_id)
    if not wo:
        return 400, {'code': 400, 'msg': '操作失败'}
    return {'code': 200, 'msg': 'SOP已确认', 'data': {'id': wo.id, 'sop_confirmed': wo.sop_confirmed}}


@router.post('/{work_order_id}/complete', summary='完成工单', response={200: dict, 400: dict, 404: dict})
@require_permission('workorder.workorder.update')
def complete_work_order(request, work_order_id: int):
    """完成工单；按数据权限校验可见性；P2-1: 验证电子签名"""
    account = _get_account_from_request(request)
    if not _get_visible_work_order(work_order_id, account):
        return 404, {'code': 404, 'msg': '工单不存在'}
    try:
        wo = services.complete_work_order(work_order_id)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e)}
    if not wo:
        return 400, {'code': 400, 'msg': '无法完成：工单不存在或状态不允许'}
    return {'code': 200, 'msg': 'OK', 'data': _wo_to_dict(wo)}


@router.post('/{work_order_id}/approve', summary='批准工单', response={200: dict, 400: dict, 404: dict})
@require_permission('workorder.workorder.update')
def approve_work_order(request, work_order_id: int):
    """批准工单；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    if not _get_visible_work_order(work_order_id, account):
        return 404, {'code': 404, 'msg': '工单不存在'}
    wo = services.approve_work_order(work_order_id)
    if not wo:
        return 400, {'code': 400, 'msg': '无法批准：工单不存在或状态不允许'}
    return {'code': 200, 'msg': 'OK', 'data': _wo_to_dict(wo)}


@router.post('/{work_order_id}/reject', summary='拒绝工单', response={200: dict, 400: dict, 404: dict})
@require_permission('workorder.workorder.update')
def reject_work_order(request, work_order_id: int):
    """拒绝工单；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    if not _get_visible_work_order(work_order_id, account):
        return 404, {'code': 404, 'msg': '工单不存在'}
    wo = services.reject_work_order(work_order_id)
    if not wo:
        return 400, {'code': 400, 'msg': '无法拒绝：工单不存在或状态不允许'}
    return {'code': 200, 'msg': 'OK', 'data': _wo_to_dict(wo)}


@router.post('/{work_order_id}/cancel', summary='取消工单', response={200: dict, 400: dict, 404: dict})
@require_permission('workorder.workorder.update')
def cancel_work_order(request, work_order_id: int):
    """取消工单；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    if not _get_visible_work_order(work_order_id, account):
        return 404, {'code': 404, 'msg': '工单不存在'}
    wo = services.cancel_work_order(work_order_id)
    if not wo:
        return 400, {'code': 400, 'msg': '无法取消：工单不存在或状态不允许'}
    return {'code': 200, 'msg': 'OK', 'data': _wo_to_dict(wo)}


# ============================================================================
# P3.3: 工单检查清单
# ============================================================================
@router.get('/{work_order_id}/checklists', summary='工单检查清单')
@require_permission('workorder.workorder.read')
def get_checklists(request, work_order_id: int):
    """获取工单的检查清单"""
    from .models import WorkOrderChecklist
    items = WorkOrderChecklist.objects.filter(work_order_id=work_order_id)
    return {'code': 200, 'msg': 'OK', 'data': [{
        'id': c.id,
        'sequence': c.sequence,
        'item_text': c.item_text,
        'is_mandatory': c.is_mandatory,
        'is_checked': c.is_checked,
        'checked_at': c.checked_at.isoformat() if c.checked_at else None,
        'checked_by': c.checked_by,
    } for c in items]}


class ChecklistToggleIn(Schema):
    is_checked: bool


@router.post('/{work_order_id}/checklists/{checklist_id}/toggle', summary='勾选/取消检查项')
@require_permission('workorder.workorder.update')
def toggle_checklist(request, work_order_id: int, checklist_id: int, data: ChecklistToggleIn):
    """勾选或取消勾选检查项"""
    from .models import WorkOrderChecklist
    from django.utils import timezone
    account = _get_account_from_request(request)

    item = WorkOrderChecklist.objects.filter(
        id=checklist_id, work_order_id=work_order_id,
    ).first()
    if not item:
        return 404, {'code': 404, 'msg': '检查项不存在'}

    item.is_checked = data.is_checked
    if data.is_checked:
        item.checked_at = timezone.now()
        item.checked_by = account.id if account else None
    else:
        item.checked_at = None
        item.checked_by = None
    item.save()

    # 记录审计日志
    try:
        from apps.audit.services import create_audit_log
        create_audit_log(
            account_id=account.id if account else 0,
            action='UPDATE',
            resource_type='WorkOrderChecklist',
            resource_id=str(checklist_id),
            description=f'{"勾选" if data.is_checked else "取消勾选"}检查项: {item.item_text}',
        )
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': {
        'id': item.id, 'is_checked': item.is_checked,
        'checked_at': item.checked_at.isoformat() if item.checked_at else None,
    }}


# ============================================================================
# S1-5：工单自动生成与智能派送
# ============================================================================
class GenerateWorkOrdersIn(Schema):
    schedule_plan_id: int


class AutoAssignIn(Schema):
    work_order_ids: list


class ManualAssignIn(Schema):
    user_id: int


@router.post('/generate', summary='从排程计划自动生成工单')
@require_permission('workorder.workorder.create')
def generate_work_orders(request, data: GenerateWorkOrdersIn):
    """排程发布后，为已入组受试者自动生成工单"""
    from apps.workorder.services.generation_service import WorkOrderGenerationService
    try:
        work_orders = WorkOrderGenerationService.generate_for_schedule_plan(
            data.schedule_plan_id
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    return {
        'code': 200,
        'msg': f'生成 {len(work_orders)} 个工单',
        'data': {'count': len(work_orders), 'work_order_ids': [wo.id for wo in work_orders]},
    }


@router.post('/auto-assign', summary='工单批量自动分配')
@require_permission('workorder.workorder.update')
def auto_assign_work_orders(request, data: AutoAssignIn):
    """基于负载均衡的工单自动分配"""
    from apps.workorder.services.dispatch_service import WorkOrderDispatchService
    results = WorkOrderDispatchService.batch_auto_assign(data.work_order_ids)
    return {'code': 200, 'msg': 'OK', 'data': results}


@router.post('/{work_order_id}/auto-assign', summary='单个工单自动分配')
@require_permission('workorder.workorder.update')
def auto_assign_single(request, work_order_id: int):
    """单个工单自动分配"""
    from apps.workorder.services.dispatch_service import WorkOrderDispatchService
    wo = WorkOrderDispatchService.auto_assign(work_order_id)
    if not wo:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _wo_to_dict(wo)}


@router.post('/{work_order_id}/manual-assign', summary='手动分配工单')
@require_permission('workorder.workorder.update')
def manual_assign(request, work_order_id: int, data: ManualAssignIn):
    """手动指定执行人"""
    from apps.workorder.services.dispatch_service import WorkOrderDispatchService
    account = _get_account_from_request(request)
    wo = WorkOrderDispatchService.manual_assign(
        work_order_id, data.user_id,
        assigned_by_id=account.id if account else None,
    )
    if not wo:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _wo_to_dict(wo)}


# ============================================================================
# S5-1：角色化 CRC Dashboard
# ============================================================================
@router.get('/crc-dashboard', summary='CRC主管仪表盘')
@require_permission('workorder.workorder.read')
def crc_supervisor_dashboard(request):
    """CRC主管多项目交付指挥中心：项目进度、团队负载、待处理决策、风险预警"""
    from apps.workorder.services.crc_dashboard_service import CRCDashboardService
    data = CRCDashboardService.get_supervisor_dashboard()
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/crc-my-dashboard', summary='CRC协调员仪表盘')
@require_permission('workorder.workorder.read')
def crc_my_dashboard(request):
    """CRC协调员我的项目工作台：负责的项目、今日任务、个人统计"""
    account = _get_account_from_request(request)
    if not account:
        return 401, {'code': 401, 'msg': '未登录'}
    from apps.workorder.services.crc_dashboard_service import CRCDashboardService
    data = CRCDashboardService.get_crc_dashboard(account.id)
    return {'code': 200, 'msg': 'OK', 'data': data}


@router.get('/scheduler-dashboard', summary='排程专员仪表盘')
@require_permission('workorder.workorder.read')
def scheduler_dashboard(request):
    """排程专员资源调度中心：待分配工单、资源概览、冲突预警、产能"""
    from apps.workorder.services.crc_dashboard_service import CRCDashboardService
    data = CRCDashboardService.get_scheduler_dashboard()
    return {'code': 200, 'msg': 'OK', 'data': data}


# ============================================================================
# S5-3：项目执行上下文
# ============================================================================
class ProjectContextIn(Schema):
    key_requirements: Optional[list] = None
    special_notes: Optional[str] = None
    execution_guidelines: Optional[dict] = None


class DecisionLogIn(Schema):
    work_order_id: Optional[int] = None
    decision_type: str
    scope: str = 'minor'
    title: str
    description: str
    rationale: Optional[str] = ''
    impact: Optional[str] = ''


class ChangeResponseIn(Schema):
    change_source: str
    change_description: str
    impact_assessment: Optional[str] = ''
    response_actions: Optional[list] = None


@router.get('/project-context/{protocol_id}', summary='获取项目执行上下文')
@require_permission('workorder.workorder.read')
def get_project_context(request, protocol_id: int):
    """获取指定项目的执行上下文（含决策日志和变更记录）"""
    from .models_context import ProjectExecutionContext, CRCDecisionLog, ChangeResponseRecord
    ctx = ProjectExecutionContext.objects.filter(protocol_id=protocol_id).first()
    if not ctx:
        return {'code': 200, 'msg': 'OK', 'data': None}

    decisions = CRCDecisionLog.objects.filter(context=ctx).order_by('-decision_time')[:20]
    changes = ChangeResponseRecord.objects.filter(context=ctx).order_by('-received_at')[:20]

    return {'code': 200, 'msg': 'OK', 'data': {
        'id': ctx.id,
        'protocol_id': ctx.protocol_id,
        'key_requirements': ctx.key_requirements,
        'special_notes': ctx.special_notes,
        'execution_guidelines': ctx.execution_guidelines,
        'updated_by': ctx.updated_by,
        'update_time': ctx.update_time.isoformat(),
        'decision_logs': [{
            'id': d.id,
            'decision_type': d.decision_type,
            'scope': d.scope,
            'title': d.title,
            'description': d.description,
            'rationale': d.rationale,
            'impact': d.impact,
            'outcome': d.outcome,
            'decided_by': d.decided_by,
            'decision_time': d.decision_time.isoformat(),
        } for d in decisions],
        'change_responses': [{
            'id': c.id,
            'change_source': c.change_source,
            'change_description': c.change_description,
            'impact_assessment': c.impact_assessment,
            'response_actions': c.response_actions,
            'status': c.status,
            'received_at': c.received_at.isoformat(),
        } for c in changes],
    }}


@router.post('/project-context/{protocol_id}', summary='创建/更新项目执行上下文')
@require_permission('workorder.workorder.update')
def upsert_project_context(request, protocol_id: int, data: ProjectContextIn):
    """创建或更新项目的执行上下文"""
    from .models_context import ProjectExecutionContext
    account = _get_account_from_request(request)
    ctx, created = ProjectExecutionContext.objects.update_or_create(
        protocol_id=protocol_id,
        defaults={
            'key_requirements': data.key_requirements or [],
            'special_notes': data.special_notes or '',
            'execution_guidelines': data.execution_guidelines or {},
            'updated_by': account.id if account else None,
            'created_by': account.id if account and created else None,
        },
    )
    return {'code': 200, 'msg': '已保存' if not created else '已创建', 'data': {
        'id': ctx.id, 'protocol_id': ctx.protocol_id,
    }}


@router.post('/project-context/{protocol_id}/decisions', summary='添加CRC决策日志')
@require_permission('workorder.workorder.update')
def add_decision_log(request, protocol_id: int, data: DecisionLogIn):
    """CRC记录自主决策"""
    from .models_context import ProjectExecutionContext, CRCDecisionLog
    account = _get_account_from_request(request)
    ctx = ProjectExecutionContext.objects.filter(protocol_id=protocol_id).first()
    if not ctx:
        ctx = ProjectExecutionContext.objects.create(
            protocol_id=protocol_id,
            created_by=account.id if account else None,
            updated_by=account.id if account else None,
        )
    log = CRCDecisionLog.objects.create(
        context=ctx,
        work_order_id=data.work_order_id,
        decision_type=data.decision_type,
        scope=data.scope,
        title=data.title,
        description=data.description,
        rationale=data.rationale or '',
        impact=data.impact or '',
        decided_by=account.id if account else 0,
    )
    return {'code': 200, 'msg': '决策已记录', 'data': {
        'id': log.id, 'title': log.title,
    }}


@router.post('/project-context/{protocol_id}/change-responses', summary='添加变更响应记录')
@require_permission('workorder.workorder.update')
def add_change_response(request, protocol_id: int, data: ChangeResponseIn):
    """CRC记录对上游变更的响应"""
    from .models_context import ProjectExecutionContext, ChangeResponseRecord
    account = _get_account_from_request(request)
    ctx = ProjectExecutionContext.objects.filter(protocol_id=protocol_id).first()
    if not ctx:
        ctx = ProjectExecutionContext.objects.create(
            protocol_id=protocol_id,
            created_by=account.id if account else None,
            updated_by=account.id if account else None,
        )
    record = ChangeResponseRecord.objects.create(
        context=ctx,
        change_source=data.change_source,
        change_description=data.change_description,
        impact_assessment=data.impact_assessment or '',
        response_actions=data.response_actions or [],
        received_by=account.id if account else 0,
    )
    return {'code': 200, 'msg': '变更响应已记录', 'data': {
        'id': record.id, 'status': record.status,
    }}


# ============================================================================
# S5-4：进展通报
# ============================================================================
class ProgressReportIn(Schema):
    report_date: Optional[str] = None


class SendReportIn(Schema):
    report_date: Optional[str] = None
    chat_id: Optional[str] = None
    open_id: Optional[str] = None


@router.get('/progress-report/{protocol_id}', summary='生成进展报告')
@require_permission('workorder.workorder.read')
def generate_progress_report(request, protocol_id: int, report_date: Optional[str] = None):
    """自动生成项目日进展报告"""
    from apps.workorder.services.progress_report_service import ProgressReportService
    rd = date.fromisoformat(report_date) if report_date else None
    report = ProgressReportService.generate_daily_report(protocol_id, rd)
    return {'code': 200, 'msg': 'OK', 'data': report}


@router.post('/progress-report/{protocol_id}/send', summary='发送进展报告')
@require_permission('workorder.workorder.update')
def send_progress_report(request, protocol_id: int, data: SendReportIn):
    """生成并通过飞书发送进展报告"""
    from apps.workorder.services.progress_report_service import ProgressReportService
    rd = date.fromisoformat(data.report_date) if data.report_date else None
    report = ProgressReportService.generate_daily_report(protocol_id, rd)

    protocol_title = ''
    try:
        from apps.protocol.models import Protocol
        p = Protocol.objects.filter(id=protocol_id).first()
        if p:
            protocol_title = p.title
    except Exception:
        pass

    success = ProgressReportService.send_to_feishu(
        report, protocol_title,
        chat_id=data.chat_id or '',
        open_id=data.open_id or '',
    )
    return {
        'code': 200 if success else 500,
        'msg': '已发送' if success else '发送失败',
        'data': report,
    }


# ============================================================================
# P4.4：高级分析与报表
# ============================================================================
class AnalyticsQueryIn(Schema):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    protocol_id: Optional[int] = None
    assigned_to: Optional[int] = None


# ============================================================================
# S5-5：KPI 绩效指标
# ============================================================================
class KPIQueryIn(Schema):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    protocol_id: Optional[int] = None
    assigned_to: Optional[int] = None


@router.get('/analytics/kpi', summary='KPI绩效指标')
@require_permission('workorder.workorder.read')
def analytics_kpi(request, date_from: Optional[str] = None, date_to: Optional[str] = None,
                   protocol_id: Optional[int] = None, assigned_to: Optional[int] = None):
    """
    返回6项核心KPI：
    1. 按时完成率
    2. 质量审计通过率
    3. 异常发生率
    4. 设备利用率
    5. 人均工单量
    6. 平均周转时间
    """
    from django.db.models import Count, Q, Avg, F
    from django.db.models.functions import Extract

    qs = WorkOrder.objects.filter(is_deleted=False)
    if protocol_id:
        qs = qs.filter(enrollment__protocol_id=protocol_id)
    if assigned_to:
        qs = filter_by_assignee(qs, assigned_to)
    if date_from:
        qs = qs.filter(create_time__date__gte=date_from)
    if date_to:
        qs = qs.filter(create_time__date__lte=date_to)

    total = qs.count()
    completed_qs = qs.filter(status__in=['completed', 'approved'])
    completed = completed_qs.count()

    # 1. 按时完成率
    on_time = completed_qs.filter(
        Q(due_date__isnull=True) | Q(completed_at__lte=F('due_date'))
    ).count()
    on_time_rate = round(on_time / completed * 100, 1) if completed else 0

    # 2. 质量审计通过率
    try:
        from .models import WorkOrderQualityAudit
        audit_qs = WorkOrderQualityAudit.objects.all()
        if protocol_id:
            audit_qs = audit_qs.filter(work_order__enrollment__protocol_id=protocol_id)
        total_audits = audit_qs.count()
        passed_audits = audit_qs.filter(result='auto_pass').count()
        audit_pass_rate = round(passed_audits / total_audits * 100, 1) if total_audits else 0
    except Exception:
        total_audits = 0
        passed_audits = 0
        audit_pass_rate = 0

    # 3. 异常发生率
    try:
        from .models_extended import WorkOrderException
        exc_qs = WorkOrderException.objects.all()
        if protocol_id:
            exc_qs = exc_qs.filter(work_order__enrollment__protocol_id=protocol_id)
        total_exceptions = exc_qs.count()
        exception_rate = round(total_exceptions / total * 100, 1) if total else 0
    except Exception:
        total_exceptions = 0
        exception_rate = 0

    # 4. 设备利用率（简化：有使用记录的设备/总活跃设备）
    try:
        from apps.resource.models import ResourceItem, EquipmentUsage
        total_equip = ResourceItem.objects.filter(
            is_deleted=False, category__resource_type='equipment', status='active',
        ).count()
        used_equip = EquipmentUsage.objects.values('equipment_id').distinct().count()
        equipment_utilization = round(used_equip / total_equip * 100, 1) if total_equip else 0
    except Exception:
        total_equip = 0
        equipment_utilization = 0

    # 5. 人均工单量
    assignee_count = (
        annotate_effective_assignee(qs)
        .exclude(effective_assignee__isnull=True)
        .values('effective_assignee')
        .distinct()
        .count()
    )
    avg_per_person = round(total / assignee_count, 1) if assignee_count else 0

    # 6. 平均周转时间（完成-创建，小时）
    avg_turnaround = None
    try:
        turnaround = completed_qs.filter(
            completed_at__isnull=False,
        ).annotate(
            turnaround_seconds=Extract(F('completed_at') - F('create_time'), 'epoch'),
        ).aggregate(avg_turnaround=Avg('turnaround_seconds'))
        if turnaround['avg_turnaround']:
            avg_turnaround = round(turnaround['avg_turnaround'] / 3600, 1)
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': {
        'on_time_completion_rate': on_time_rate,
        'quality_audit_pass_rate': audit_pass_rate,
        'exception_rate': exception_rate,
        'equipment_utilization': equipment_utilization,
        'avg_workorders_per_person': avg_per_person,
        'avg_turnaround_hours': avg_turnaround,
        'details': {
            'total_workorders': total,
            'completed_workorders': completed,
            'on_time_completed': on_time,
            'total_audits': total_audits,
            'passed_audits': passed_audits,
            'total_exceptions': total_exceptions,
            'total_equipment': total_equip,
            'assignee_count': assignee_count,
        },
    }}


@router.get('/analytics/summary', summary='分析概览')
@require_permission('workorder.workorder.read')
def analytics_summary(request, query: Query[AnalyticsQueryIn]):
    """返回工单综合分析数据：状态分布、按日趋势、按人员统计、质量概览"""
    from django.db.models import Count, Q, Avg
    from django.db.models.functions import TruncDate

    account = _get_account_from_request(request)
    qs = WorkOrder.objects.filter(is_deleted=False)
    qs = services._apply_data_scope(qs, account)

    if query.protocol_id:
        qs = qs.filter(enrollment__protocol_id=query.protocol_id)
    if query.assigned_to:
        qs = filter_by_assignee(qs, query.assigned_to)
    if query.date_from:
        qs = qs.filter(scheduled_date__gte=query.date_from)
    if query.date_to:
        qs = qs.filter(scheduled_date__lte=query.date_to)

    # 状态分布
    status_dist = list(qs.values('status').annotate(count=Count('id')).order_by('status'))

    # 按日趋势（最近 30 天）
    from datetime import timedelta
    last_30 = date.today() - timedelta(days=30)
    daily_trend = list(
        qs.filter(create_time__date__gte=last_30)
        .annotate(day=TruncDate('create_time'))
        .values('day')
        .annotate(created=Count('id'), completed=Count('id', filter=Q(status__in=['completed', 'approved'])))
        .order_by('day')
    )
    for item in daily_trend:
        item['day'] = item['day'].isoformat() if item.get('day') else None

    # 按人员统计
    by_assignee = list(
        annotate_effective_assignee(qs)
        .exclude(effective_assignee__isnull=True)
        .values('effective_assignee')
        .annotate(
            total=Count('id'),
            completed=Count('id', filter=Q(status__in=['completed', 'approved'])),
        )
        .order_by('-total')[:10]
    )
    by_assignee = [
        {
            'assigned_to': item['effective_assignee'],
            'effective_assigned_to': item['effective_assignee'],
            'total': item['total'],
            'completed': item['completed'],
        }
        for item in by_assignee
    ]

    # 质量概览
    total = qs.count()
    completed = qs.filter(status__in=['completed', 'approved']).count()
    overdue = qs.filter(due_date__lt=date.today()).exclude(status__in=['completed', 'approved', 'cancelled']).count()

    return {'code': 200, 'msg': 'OK', 'data': {
        'status_distribution': status_dist,
        'daily_trend': daily_trend,
        'by_assignee': by_assignee,
        'summary': {
            'total': total,
            'completed': completed,
            'completion_rate': round(completed / total * 100, 1) if total else 0,
            'overdue': overdue,
            'overdue_rate': round(overdue / total * 100, 1) if total else 0,
        },
    }}


@router.get('/analytics/export', summary='导出工单数据')
@require_permission('workorder.workorder.read')
def analytics_export(request, query: Query[AnalyticsQueryIn], format: str = 'csv'):
    """导出工单数据为 CSV 或 Excel 格式"""
    import csv
    import io
    from django.http import HttpResponse

    account = _get_account_from_request(request)
    qs = WorkOrder.objects.filter(is_deleted=False).select_related()
    qs = services._apply_data_scope(qs, account)

    if query.protocol_id:
        qs = qs.filter(enrollment__protocol_id=query.protocol_id)
    if query.assigned_to:
        qs = filter_by_assignee(qs, query.assigned_to)
    if query.date_from:
        qs = qs.filter(scheduled_date__gte=query.date_from)
    if query.date_to:
        qs = qs.filter(scheduled_date__lte=query.date_to)

    rows = annotate_effective_assignee(qs).values_list(
        'id', 'title', 'status', 'work_order_type',
        'scheduled_date', 'due_date', 'effective_assignee', 'assigned_to',
        'create_time', 'completed_at',
    )

    headers = [
        '工单ID', '标题', '状态', '类型', '计划日期', '截止日期',
        '负责人ID(Effective)', '负责人ID(Legacy)',
        '创建时间', '完成时间',
    ]

    if format == 'csv':
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        for row in rows:
            writer.writerow([str(v) if v else '' for v in row])
        response = HttpResponse(output.getvalue(), content_type='text/csv; charset=utf-8-sig')
        response['Content-Disposition'] = 'attachment; filename="workorder_export.csv"'
        return response

    # Excel fallback (simplified CSV with xls extension for compatibility)
    output = io.StringIO()
    writer = csv.writer(output, dialect='excel-tab')
    writer.writerow(headers)
    for row in rows:
        writer.writerow([str(v) if v else '' for v in row])
    response = HttpResponse(output.getvalue(), content_type='application/vnd.ms-excel; charset=utf-8-sig')
    response['Content-Disposition'] = 'attachment; filename="workorder_export.xls"'
    return response


# ============================================================================
# P4-3: 工单评论
# ============================================================================
class CommentIn(Schema):
    content: str


@router.get('/{work_order_id}/comments', summary='工单评论列表')
@require_permission('workorder.workorder.read')
def list_comments(request, work_order_id: int):
    """获取工单的评论列表"""
    from .models import WorkOrderComment
    comments = WorkOrderComment.objects.filter(work_order_id=work_order_id).order_by('create_time')
    result = []
    for c in comments:
        author_name = ''
        try:
            from apps.identity.models import Account
            acc = Account.objects.filter(id=c.author_id).first()
            if acc:
                author_name = acc.display_name or acc.username
        except Exception:
            pass
        result.append({
            'id': c.id,
            'work_order_id': c.work_order_id,
            'author_id': c.author_id,
            'author_name': author_name,
            'content': c.content,
            'create_time': c.create_time.isoformat(),
        })
    return {'code': 200, 'msg': 'OK', 'data': result}


@router.post('/{work_order_id}/comments', summary='添加工单评论')
@require_permission('workorder.workorder.update')
def add_comment(request, work_order_id: int, data: CommentIn):
    """添加工单评论"""
    from .models import WorkOrderComment
    account = _get_account_from_request(request)
    wo = WorkOrder.objects.filter(id=work_order_id).first()
    if not wo:
        return 404, {'code': 404, 'msg': '工单不存在'}

    comment = WorkOrderComment.objects.create(
        work_order_id=work_order_id,
        author_id=account.id if account else 0,
        content=data.content,
    )
    author_name = ''
    if account:
        author_name = getattr(account, 'display_name', '') or getattr(account, 'username', '')
    return {'code': 200, 'msg': '评论已添加', 'data': {
        'id': comment.id,
        'work_order_id': comment.work_order_id,
        'author_id': comment.author_id,
        'author_name': author_name,
        'content': comment.content,
        'create_time': comment.create_time.isoformat(),
    }}


# ============================================================================
# P3-4: 告警配置
# ============================================================================
class AlertConfigIn(Schema):
    alert_type: str
    threshold: float
    level: str = 'warning'
    is_enabled: bool = True


@router.get('/alert-configs', summary='告警配置列表')
@require_permission('workorder.workorder.read')
def list_alert_configs(request):
    """获取告警阈值配置列表"""
    from .models import AlertConfig
    configs = AlertConfig.objects.all().order_by('alert_type')
    return {'code': 200, 'msg': 'OK', 'data': [{
        'id': c.id,
        'alert_type': c.alert_type,
        'threshold': c.threshold,
        'level': c.level,
        'is_enabled': c.is_enabled,
    } for c in configs]}


@router.post('/alert-configs', summary='创建告警配置')
@require_permission('workorder.workorder.update')
def create_alert_config(request, data: AlertConfigIn):
    """创建告警阈值配置"""
    from .models import AlertConfig
    account = _get_account_from_request(request)
    config = AlertConfig.objects.create(
        alert_type=data.alert_type,
        threshold=data.threshold,
        level=data.level,
        is_enabled=data.is_enabled,
        created_by=account.id if account else None,
    )
    return {'code': 200, 'msg': '配置已保存', 'data': {'id': config.id}}


@router.get('/{work_order_id}', summary='工单详情')
@require_permission('workorder.workorder.read')
def get_work_order(request, work_order_id: int):
    """获取工单详细信息（含关联数据）；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    wo = _get_visible_work_order(work_order_id, account)
    if not wo:
        return 404, {'code': 404, 'msg': '工单不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _wo_to_dict(wo, include_relations=True)}


# ============================================================================
# P4-4: 自动通报配置
# ============================================================================
class AutoReportConfigIn(Schema):
    enabled: bool


@router.put('/auto-report-config/{protocol_id}', summary='设置自动通报')
@require_permission('workorder.workorder.update')
def update_auto_report_config(request, protocol_id: int, data: AutoReportConfigIn):
    """按项目启用/禁用自动通报"""
    from .models import AutoReportConfig
    account = _get_account_from_request(request)
    config, created = AutoReportConfig.objects.update_or_create(
        protocol_id=protocol_id,
        defaults={
            'enabled': data.enabled,
            'created_by': account.id if account else None,
        },
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        'protocol_id': config.protocol_id,
        'enabled': config.enabled,
    }}


@router.get('/auto-report-config/{protocol_id}', summary='获取自动通报配置')
@require_permission('workorder.workorder.read')
def get_auto_report_config(request, protocol_id: int):
    """获取项目自动通报配置"""
    from .models import AutoReportConfig
    config = AutoReportConfig.objects.filter(protocol_id=protocol_id).first()
    return {'code': 200, 'msg': 'OK', 'data': {
        'protocol_id': protocol_id,
        'enabled': config.enabled if config else False,
    }}
