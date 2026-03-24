"""
访视管理 API

端点：
- GET  /visit/plans              访视计划列表
- GET  /visit/plans/{id}         访视计划详情（含节点）
- POST /visit/plans/create       创建访视计划
- POST /visit/plans/generate     从协议自动生成访视计划（S1-2）
- POST /visit/plans/{id}/activate 激活访视计划
- GET  /visit/plans/{id}/activities-with-bom  查看活动及其BOM（S1-2）
- GET  /visit/nodes              访视节点列表
- POST /visit/nodes/create       创建访视节点
"""
from ninja import Router, Schema, Query
from typing import Optional, List
from datetime import datetime
from . import services
from .models import VisitPlan
from apps.identity.decorators import require_permission, _get_account_from_request
from apps.identity.filters import get_visible_object

router = Router()


# ============================================================================
# Schema
# ============================================================================
class VisitPlanOut(Schema):
    id: int
    protocol_id: int
    name: str
    description: Optional[str] = None
    status: str
    create_time: datetime
    update_time: datetime


class VisitPlanCreateIn(Schema):
    protocol_id: int
    name: str
    description: Optional[str] = None


class VisitPlanQueryParams(Schema):
    protocol_id: Optional[int] = None
    status: Optional[str] = None
    page: int = 1
    page_size: int = 20


class VisitNodeOut(Schema):
    id: int
    plan_id: int
    name: str
    baseline_day: int
    window_before: int
    window_after: int
    status: str
    order: int
    create_time: datetime


class VisitNodeCreateIn(Schema):
    plan_id: int
    name: str
    baseline_day: int = 0
    window_before: int = 0
    window_after: int = 0
    order: int = 0


class VisitPlanGenerateIn(Schema):
    protocol_id: int


def _node_to_dict(node) -> dict:
    return {
        'id': node.id,
        'plan_id': node.plan_id,
        'name': node.name,
        'code': getattr(node, 'code', ''),
        'baseline_day': node.baseline_day,
        'window_before': node.window_before,
        'window_after': node.window_after,
        'status': node.status,
        'order': node.order,
        'create_time': node.create_time.isoformat(),
    }


def _activity_to_dict(act) -> dict:
    return {
        'id': act.id,
        'node_id': act.node_id,
        'name': act.name,
        'activity_type': act.activity_type,
        'description': act.description,
        'is_required': act.is_required,
        'order': act.order,
        'activity_template_id': act.activity_template_id,
        'create_time': act.create_time.isoformat(),
    }


# ============================================================================
# 端点
# ============================================================================
@router.get('/plans', summary='访视计划列表')
@require_permission('visit.plan.read')
def list_visit_plans(request, params: VisitPlanQueryParams = Query(...)):
    """分页查询访视计划列表"""
    account = _get_account_from_request(request)
    result = services.list_visit_plans(
        protocol_id=params.protocol_id,
        status=params.status,
        page=params.page,
        page_size=params.page_size,
        account=account,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'items': [
                {
                    'id': item.id,
                    'protocol_id': item.protocol_id,
                    'name': item.name,
                    'description': item.description,
                    'status': item.status,
                    'create_time': item.create_time.isoformat(),
                    'update_time': item.update_time.isoformat(),
                }
                for item in result['items']
            ],
            'total': result['total'],
            'page': result['page'],
            'page_size': result['page_size'],
        },
    }


@router.post('/plans/create', summary='创建访视计划')
@require_permission('visit.plan.create')
def create_visit_plan(request, data: VisitPlanCreateIn):
    """创建新访视计划"""
    account = _get_account_from_request(request)
    plan = services.create_visit_plan(
        protocol_id=data.protocol_id,
        name=data.name,
        description=data.description or '',
        account=account,
    )
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'id': plan.id, 'name': plan.name, 'status': plan.status},
    }


@router.get('/plans/{plan_id}', summary='访视计划详情')
@require_permission('visit.plan.read')
def get_visit_plan(request, plan_id: int):
    """获取访视计划详细信息（包含节点）；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    plan = get_visible_object(VisitPlan.objects.filter(id=plan_id, is_deleted=False), account)
    if not plan:
        return 404, {'code': 404, 'msg': '访视计划不存在'}

    data = services.get_plan_with_nodes(plan_id)
    plan = data['plan']
    nodes = data['nodes']
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': plan.id,
            'protocol_id': plan.protocol_id,
            'name': plan.name,
            'description': plan.description,
            'status': plan.status,
            'nodes': [_node_to_dict(node) for node in nodes],
            'create_time': plan.create_time.isoformat(),
            'update_time': plan.update_time.isoformat(),
        },
    }


@router.post('/plans/generate', summary='从协议自动生成访视计划')
@require_permission('visit.plan.create')
def generate_visit_plan(request, data: VisitPlanGenerateIn):
    """
    从已解析的协议自动生成访视计划（S1-2）

    协议 parsed_data 必须包含 visits 数组。
    自动创建 VisitPlan + VisitNode + VisitActivity，并匹配已有 ActivityTemplate。
    """
    from apps.visit.services.generation_service import VisitGenerationService

    account = _get_account_from_request(request)
    created_by_id = account.id if account else None
    try:
        result = VisitGenerationService.generate_from_protocol(
            protocol_id=data.protocol_id,
            created_by_id=created_by_id,
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}

    plan = result['plan']
    return {
        'code': 200, 'msg': '访视计划生成成功',
        'data': {
            'plan_id': plan.id,
            'plan_name': plan.name,
            'stats': result['stats'],
            'nodes': [_node_to_dict(n) for n in result['nodes']],
        },
    }


@router.get('/plans/{plan_id}/activities-with-bom', summary='查看活动及其BOM')
@require_permission('visit.plan.read')
def get_activities_with_bom(request, plan_id: int):
    """
    获取访视计划下所有活动及其关联的 BOM 清单（S1-2）
    """
    from apps.visit.models import VisitNode, VisitActivity
    from apps.resource.models import ActivityBOM

    account = _get_account_from_request(request)
    plan = get_visible_object(VisitPlan.objects.filter(id=plan_id, is_deleted=False), account)
    if not plan:
        return 404, {'code': 404, 'msg': '访视计划不存在'}

    nodes = VisitNode.objects.filter(plan=plan).order_by('order')
    result_nodes = []
    for node in nodes:
        activities = VisitActivity.objects.filter(node=node).order_by('order').select_related('activity_template')
        act_list = []
        for act in activities:
            act_dict = _activity_to_dict(act)
            # 附加 BOM 信息
            if act.activity_template_id:
                bom_items = ActivityBOM.objects.filter(
                    template_id=act.activity_template_id
                ).select_related('resource_category')
                act_dict['bom'] = [
                    {
                        'resource_category_name': b.resource_category.name,
                        'resource_type': b.resource_category.resource_type,
                        'quantity': b.quantity,
                        'is_mandatory': b.is_mandatory,
                    }
                    for b in bom_items
                ]
            else:
                act_dict['bom'] = []
            act_list.append(act_dict)

        result_nodes.append({
            **_node_to_dict(node),
            'activities': act_list,
        })

    return {
        'code': 200, 'msg': 'OK',
        'data': {'plan_id': plan.id, 'plan_name': plan.name, 'nodes': result_nodes},
    }


@router.post('/plans/{plan_id}/activate', summary='激活访视计划')
@require_permission('visit.plan.create')
def activate_visit_plan(request, plan_id: int):
    """激活访视计划；按数据权限校验可见性"""
    account = _get_account_from_request(request)
    plan = get_visible_object(VisitPlan.objects.filter(id=plan_id, is_deleted=False), account)
    if not plan:
        return 404, {'code': 404, 'msg': '访视计划不存在'}
    plan = services.activate_visit_plan(plan_id)
    return {'code': 200, 'msg': 'OK', 'data': {'id': plan.id, 'status': plan.status}}


@router.get('/nodes', summary='访视节点列表')
@require_permission('visit.node.read')
def list_visit_nodes(request, plan_id: Optional[int] = None):
    """查询访视节点列表"""
    account = _get_account_from_request(request)
    nodes = services.list_visit_nodes(plan_id=plan_id, account=account)
    return {
        'code': 200,
        'msg': 'OK',
        'data': {'items': [_node_to_dict(node) for node in nodes]},
    }


@router.post('/nodes/create', summary='创建访视节点')
@require_permission('visit.node.update')
def create_visit_node(request, data: VisitNodeCreateIn):
    """创建访视节点"""
    node = services.create_visit_node(
        plan_id=data.plan_id,
        name=data.name,
        baseline_day=data.baseline_day,
        window_before=data.window_before,
        window_after=data.window_after,
        order=data.order,
    )
    return {'code': 200, 'msg': 'OK', 'data': _node_to_dict(node)}


# ============================================================================
# 访视执行视角端点
# ============================================================================
@router.get('/execution-list', summary='访视执行列表')
@require_permission('visit.plan.read')
def visit_execution_list(
    request,
    protocol_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """
    执行视角的访视节点列表，关联排程状态和工单完成率。
    """
    from apps.visit.models import VisitNode, VisitPlan
    from apps.scheduling.models import ScheduleSlot
    from apps.workorder.models import WorkOrder
    from django.db.models import Count, Q

    qs = VisitNode.objects.select_related('plan', 'plan__protocol').order_by('plan__protocol__title', 'order')
    if protocol_id:
        qs = qs.filter(plan__protocol_id=protocol_id)
    if status:
        qs = qs.filter(plan__status=status)

    total = qs.count()
    offset = (page - 1) * page_size
    nodes = list(qs[offset:offset + page_size])

    items = []
    for node in nodes:
        # Schedule slot status
        slot = ScheduleSlot.objects.filter(visit_node=node).first()
        slot_status = slot.status if slot else 'unscheduled'
        slot_date = str(slot.scheduled_date) if slot else None

        # Work order stats for this node
        wo_total = WorkOrder.objects.filter(visit_node=node, is_deleted=False).count()
        wo_completed = WorkOrder.objects.filter(
            visit_node=node, is_deleted=False, status__in=['completed', 'approved']
        ).count()

        items.append({
            'id': node.id,
            'plan_id': node.plan_id,
            'protocol_id': node.plan.protocol_id if node.plan else None,
            'protocol_title': node.plan.protocol.title if node.plan and hasattr(node.plan, 'protocol') and node.plan.protocol else '',
            'name': node.name,
            'code': getattr(node, 'code', ''),
            'baseline_day': node.baseline_day,
            'window_before': node.window_before,
            'window_after': node.window_after,
            'order': node.order,
            'slot_status': slot_status,
            'slot_date': slot_date,
            'workorder_total': wo_total,
            'workorder_completed': wo_completed,
            'completion_rate': round(wo_completed / wo_total * 100, 1) if wo_total > 0 else 0,
        })

    return {'code': 200, 'msg': 'OK', 'data': {
        'items': items,
        'total': total,
        'page': page,
        'page_size': page_size,
    }}


@router.get('/window-alerts', summary='访视窗口期告警')
@require_permission('visit.plan.read')
def visit_window_alerts(request):
    """
    返回即将超窗或已超窗的访视节点。
    逻辑：slot.scheduled_date 与 baseline_day +/- window 对比当前日期。
    """
    from apps.scheduling.models import ScheduleSlot, SlotStatus
    from django.utils import timezone

    today = timezone.now().date()
    alerts = []

    # 查找所有未完成的已排程槽位
    active_slots = ScheduleSlot.objects.filter(
        status__in=[SlotStatus.PLANNED, SlotStatus.CONFIRMED],
    ).select_related('visit_node', 'schedule_plan')

    for slot in active_slots:
        node = slot.visit_node
        if not node:
            continue

        window_start = slot.scheduled_date
        window_end = slot.scheduled_date

        # 如果排程计划有开始日期，计算理论窗口
        from datetime import timedelta
        plan = slot.schedule_plan
        if plan:
            baseline_date = plan.start_date + timedelta(days=node.baseline_day)
            window_start = baseline_date - timedelta(days=node.window_before)
            window_end = baseline_date + timedelta(days=node.window_after)

        # 判断是否即将超窗或已超窗
        days_to_window_end = (window_end - today).days
        severity = None
        if days_to_window_end < 0:
            severity = 'overdue'
        elif days_to_window_end <= 3:
            severity = 'critical'
        elif days_to_window_end <= 7:
            severity = 'warning'

        if severity:
            alerts.append({
                'slot_id': slot.id,
                'visit_node_id': node.id,
                'visit_node_name': node.name,
                'plan_name': plan.name if plan else '',
                'scheduled_date': str(slot.scheduled_date),
                'window_start': str(window_start),
                'window_end': str(window_end),
                'days_remaining': days_to_window_end,
                'severity': severity,
                'status': slot.status,
            })

    # Sort by severity
    severity_order = {'overdue': 0, 'critical': 1, 'warning': 2}
    alerts.sort(key=lambda a: severity_order.get(a['severity'], 99))

    return {'code': 200, 'msg': 'OK', 'data': {
        'items': alerts,
        'total': len(alerts),
    }}


# ============================================================================
# 资源需求计划端点（S1-3）
# ============================================================================
class ResourceDemandSubmitIn(Schema):
    open_id: Optional[str] = ''


def _demand_to_dict(d) -> dict:
    return {
        'id': d.id,
        'visit_plan_id': d.visit_plan_id,
        'status': d.status,
        'summary': d.summary,
        'demand_details': d.demand_details,
        'feishu_approval_instance_id': d.feishu_approval_instance_id or '',
        'create_time': d.create_time.isoformat(),
        'update_time': d.update_time.isoformat(),
    }


class ResourceDemandRejectIn(Schema):
    reject_reason: Optional[str] = None


@router.get('/demands/list', summary='资源需求列表（执行台审核）')
@require_permission('visit.demand.read')
def list_resource_demands_for_approval(request, page: int = 1, page_size: int = 20):
    """分页返回待审核等资源需求行，字段与执行台 ResourceApprovalRow 对齐。"""
    from django.core.paginator import Paginator
    from apps.visit.models import ResourceDemand, ResourceDemandStatus

    qs = ResourceDemand.objects.filter(
        status=ResourceDemandStatus.SUBMITTED,
    ).select_related('visit_plan', 'visit_plan__protocol').order_by('-create_time')
    paginator = Paginator(qs, page_size)
    page_obj = paginator.get_page(page)
    items = []
    for d in page_obj.object_list:
        plan = d.visit_plan
        proto = plan.protocol if plan else None
        node_count = plan.nodes.count() if plan else 0
        items.append({
            'demand_id': d.id,
            'visit_plan_id': plan.id if plan else 0,
            'visit_plan_name': plan.name if plan else '',
            'status': d.status,
            'protocol_id': proto.id if proto else 0,
            'protocol_code': (proto.code if proto else '') or '',
            'protocol_title': proto.title if proto else '',
            'client': '',
            'sample_size': proto.sample_size if proto and proto.sample_size is not None else 0,
            'visit_node_count': node_count,
            'window_summary': '',
            'execution_period': '',
            'schedule_progress': '',
        })
    return {'code': 200, 'msg': 'OK', 'data': {'items': items, 'total': paginator.count}}


@router.post('/demands/generate', summary='生成资源需求计划')
@require_permission('visit.demand.create')
def generate_resource_demand(request, plan_id: int):
    """从访视计划自动汇总 BOM 生成资源需求"""
    from apps.identity.filters import get_visible_object
    from apps.visit.models import VisitPlan
    account = _get_account_from_request(request)
    if not get_visible_object(VisitPlan.objects.filter(id=plan_id), account):
        return 404, {'code': 404, 'msg': '访视计划不存在', 'data': None}
    from apps.visit.services.resource_demand_service import ResourceDemandService
    try:
        demand = ResourceDemandService.generate_resource_demand(plan_id)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    return {'code': 200, 'msg': '资源需求生成成功', 'data': _demand_to_dict(demand)}


@router.get('/demands/{demand_id}', summary='资源需求详情')
@require_permission('visit.demand.read')
def get_resource_demand(request, demand_id: int):
    """获取资源需求计划详情"""
    from apps.visit.models import ResourceDemand
    demand = ResourceDemand.objects.filter(id=demand_id).first()
    if not demand:
        return 404, {'code': 404, 'msg': '资源需求不存在'}
    return {'code': 200, 'msg': 'OK', 'data': _demand_to_dict(demand)}


@router.post('/demands/{demand_id}/submit', summary='提交资源需求审核')
@require_permission('visit.demand.create')
def submit_resource_demand(request, demand_id: int, data: ResourceDemandSubmitIn):
    """提交资源需求到飞书审批"""
    from apps.visit.services.resource_demand_service import ResourceDemandService
    try:
        demand = ResourceDemandService.submit_demand(demand_id, open_id=data.open_id or '')
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    return {'code': 200, 'msg': '资源需求已提交', 'data': _demand_to_dict(demand)}


@router.post('/demands/{demand_id}/approve', summary='审批通过资源需求')
@require_permission('visit.demand.approve')
def approve_resource_demand(request, demand_id: int):
    """审批通过资源需求（也可由飞书审批回调触发）"""
    from apps.visit.services.resource_demand_service import ResourceDemandService
    try:
        demand = ResourceDemandService.approve_demand(demand_id)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    return {'code': 200, 'msg': '资源需求审批通过', 'data': _demand_to_dict(demand)}


@router.post('/demands/{demand_id}/reject', summary='拒绝资源需求')
@require_permission('visit.demand.approve')
def reject_resource_demand(request, demand_id: int, data: ResourceDemandRejectIn):
    from apps.visit.services.resource_demand_service import ResourceDemandService
    try:
        demand = ResourceDemandService.reject_demand(demand_id)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    _ = (data.reject_reason or '')
    return {'code': 200, 'msg': '资源需求已拒绝', 'data': _demand_to_dict(demand)}


# ============================================================================
# S4-5：合规分析 + 访视完整性
# ============================================================================
@router.get('/plans/{plan_id}/compliance', summary='访视完整性分析')
@require_permission('visit.plan.read')
def analyze_compliance(request, plan_id: int):
    from apps.identity.filters import get_visible_object
    from apps.visit.models import VisitPlan
    account = _get_account_from_request(request)
    if not get_visible_object(VisitPlan.objects.filter(id=plan_id), account):
        return 404, {'code': 404, 'msg': '访视计划不存在'}
    from apps.visit.services.compliance_service import ComplianceAnalysisService
    result = ComplianceAnalysisService.analyze_visit_completeness(plan_id)
    if not result:
        return 404, {'code': 404, 'msg': '访视计划不存在'}
    return {'code': 200, 'msg': 'OK', 'data': result}
