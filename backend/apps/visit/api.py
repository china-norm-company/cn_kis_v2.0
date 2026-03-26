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
from datetime import datetime, date
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
    执行视角的访视项目列表（项目级一条）：
    仅展示排程核心已完成发布（TimelineSchedule.status=completed）的项目，
    返回字段用于访视管理：项目编号、项目名称、访视时间点、执行日期、排程状态、工单完成率。
    """
    from apps.scheduling.models import TimelineSchedule, TimelineScheduleStatus
    from apps.workorder.models import WorkOrder
    from apps.product_distribution.models import ProductDistributionWorkOrder, ProductDistributionExecution, ProductSampleRequest
    from apps.subject.models_recruitment import RecruitmentPlan

    def _first_row(order) -> dict:
        if not order or not getattr(order, 'data', None):
            return {}
        d = order.data if isinstance(order.data, dict) else {}
        headers = list(d.get('headers') or [])
        rows = list(d.get('rows') or [])
        if not rows:
            return {}
        first = rows[0]
        if isinstance(first, list) and headers:
            return dict(zip(headers, first))
        if isinstance(first, dict):
            return first
        return {}

    def _collect_visit_points(payload: dict) -> str:
        points = []
        for block in (payload.get('visit_blocks') or []):
            vp = (block.get('visit_point') or '').strip()
            if vp:
                points.append(vp)
        uniq = []
        for p in points:
            if p not in uniq:
                uniq.append(p)
        return '，'.join(uniq)

    def _collect_execution_period(first: dict) -> str:
        """
        执行日期：与项目详情「排期计划」表头一致。
        优先订单行「执行开始日期」「执行结束日期」（独立列或导入结果）；
        若无或不全，则用「执行排期」全文解析整体起止（与前端 getSchedulePlanOverallStartEnd / workorder_sync 一致）。
        不再使用执行日期1～4、visit_blocks.exec_dates，避免与排期计划展示不一致。
        """
        from apps.scheduling.workorder_sync import _parse_date_to_iso, _parse_schedule_overall_start_end

        start = _parse_date_to_iso(first.get('执行开始日期'))
        end = _parse_date_to_iso(first.get('执行结束日期'))
        if start and end:
            return f'{start} ~ {end}'
        if start:
            return start
        if end:
            return end

        raw = (first.get('执行排期') or first.get('测试具体排期') or '').strip()
        if raw:
            os, oe = _parse_schedule_overall_start_end(raw)
            if os and oe:
                return f'{os} ~ {oe}'
            if os:
                return os
            if oe:
                return oe

        return ''

    def _fmt_visit_phase_label(visit_point: str, cell_date: date) -> str:
        """排期计划矩阵单元格：访视时间点 + 该格具体日期（与表格中执行日期列展示一致，如 2026年4月25日）。"""
        vp = (visit_point or '').strip()
        ds = f'{cell_date.year}年{cell_date.month}月{cell_date.day}日'
        if vp:
            return f'{vp}（{ds}）'
        return ds

    def _phase_current_next(payload: dict, first: dict) -> tuple[str, str]:
        """
        本次/下次访视阶段：按排期计划表格计算——
        行=访视时间点，列=执行日期1～4（与详情页 parseExecutionScheduleText 一致）；
        将每个单元格 (访视点, 执行日期N) 展开为带日期的时点，按日期排序后：
        本次 = 最后一个日期 <= 今天的单元格；下次 = 第一个日期 > 今天的单元格。
        无「执行排期」文本时，回退订单首行独立列「执行日期1」～「执行日期4」（单行四格场景）。
        """
        from apps.scheduling.workorder_sync import _parse_date_to_iso, _parse_schedule_visit_point_dates

        today = date.today()
        # (日期, 访视时间点, 列号1..4 表示执行日期N)
        events: list[tuple[date, str, int]] = []

        raw = (first.get('执行排期') or first.get('测试具体排期') or '').strip()
        parsed_rows = _parse_schedule_visit_point_dates(raw) if raw else []
        for vp, dlist in parsed_rows:
            vp = (vp or '').strip()
            for col_idx, d in enumerate(dlist):
                events.append((d, vp, col_idx + 1))

        if not events:
            blocks = payload.get('visit_blocks') or []
            vp0 = (blocks[0].get('visit_point') or '').strip() if blocks else ''
            for i, col in enumerate(('执行日期1', '执行日期2', '执行日期3', '执行日期4')):
                iso = _parse_date_to_iso(first.get(col))
                if not iso:
                    continue
                try:
                    d = date.fromisoformat(iso)
                except ValueError:
                    continue
                events.append((d, vp0, i + 1))

        if not events:
            return '-', '-'

        events.sort(key=lambda x: (x[0], x[1], x[2]))
        past_or_today = [x for x in events if x[0] <= today]
        future = [x for x in events if x[0] > today]
        if past_or_today:
            d_cur, vp, _col = past_or_today[-1]
            current_phase = _fmt_visit_phase_label(vp, d_cur)
        else:
            current_phase = '-'
        if future:
            d_nxt, vp, _col = future[0]
            next_phase = _fmt_visit_phase_label(vp, d_nxt)
        else:
            next_phase = '-'
        return current_phase, next_phase

    def _to_int(v) -> int:
        try:
            if v is None:
                return 0
            s = str(v).strip()
            if not s:
                return 0
            return int(float(s))
        except Exception:
            return 0

    def _sample_total(first: dict) -> int:
        sample = _to_int(first.get('样本数量') or first.get('样本量') or first.get('最低样本量') or 0)
        backup = _to_int(first.get('备份数量') or first.get('备份样本量') or 0)
        return sample + backup

    def _station_completion(project_code: str, protocol_id: int | None) -> dict:
        """
        四工作台完成率口径（固定分母=4）：
        - 接待台：存在 project_work_order 且存在执行记录
        - 物料台：存在 sample_request 记录
        - 招募台：存在 recruitment_plan，且达到目标人数（或状态 completed）
        - 评估台：存在 work_order，且已完成/已批准占比 100%
        """
        # 1) 接待台
        reception_workorders = ProductDistributionWorkOrder.objects.filter(
            project_no=project_code,
            is_delete=0,
        ).count()
        reception_executions = ProductDistributionExecution.objects.filter(
            related_project_no=project_code,
            is_delete=0,
        ).count()
        reception_done = reception_workorders > 0 and reception_executions > 0

        # 2) 物料台
        material_records = ProductSampleRequest.objects.filter(
            related_project_no=project_code,
            is_delete=0,
        ).count()
        material_done = material_records > 0

        # 3) 招募台
        recruitment_target = 0
        recruitment_enrolled = 0
        recruitment_done = False
        if protocol_id:
            rp = RecruitmentPlan.objects.filter(protocol_id=protocol_id).order_by('-create_time').first()
            if rp:
                recruitment_target = int(rp.target_count or 0)
                recruitment_enrolled = int(rp.enrolled_count or 0)
                recruitment_done = (
                    (recruitment_target > 0 and recruitment_enrolled >= recruitment_target)
                    or (rp.status == 'completed')
                )

        # 4) 评估台
        evaluator_total = 0
        evaluator_completed = 0
        evaluator_done = False
        if protocol_id:
            qs = WorkOrder.objects.filter(
                is_deleted=False,
                visit_node__plan__protocol_id=protocol_id,
            )
            evaluator_total = qs.count()
            evaluator_completed = qs.filter(status__in=['completed', 'approved']).count()
            evaluator_done = evaluator_total > 0 and evaluator_completed >= evaluator_total

        total = 4
        completed = (
            (1 if reception_done else 0)
            + (1 if material_done else 0)
            + (1 if recruitment_done else 0)
            + (1 if evaluator_done else 0)
        )
        return {
            'total': total,
            'completed': completed,
            'reception': {
                'total': reception_workorders,
                'completed': reception_executions,
                'done': reception_done,
            },
            'material': {
                'total': material_records,
                'completed': material_records,
                'done': material_done,
            },
            'recruitment': {
                'total': recruitment_target,
                'completed': recruitment_enrolled,
                'done': recruitment_done,
            },
            'evaluator': {
                'total': evaluator_total,
                'completed': evaluator_completed,
                'done': evaluator_done,
            },
        }

    qs = TimelineSchedule.objects.select_related('execution_order_upload').filter(
        status=TimelineScheduleStatus.COMPLETED,
    ).order_by('-update_time')

    items_all = []
    for sch in qs:
        order = sch.execution_order_upload
        first = _first_row(order)
        project_code = (first.get('项目编号') or '').strip()
        project_name = (first.get('项目名称') or first.get('项目名') or '').strip() or project_code
        payload = sch.payload if isinstance(sch.payload, dict) else {}

        # protocol_id 仅用于招募/评估完成数据对齐
        protocol_id_val = None
        try:
            from apps.protocol.models import Protocol
            if project_code:
                protocol = Protocol.objects.filter(code=project_code, is_deleted=False).first()
                protocol_id_val = protocol.id if protocol else None
        except Exception:
            protocol_id_val = None

        if protocol_id and protocol_id_val != protocol_id:
            continue

        completion = _station_completion(project_code, protocol_id_val)
        current_phase, next_phase = _phase_current_next(payload, first)
        items_all.append({
            'id': sch.id,
            'plan_id': None,
            'protocol_id': protocol_id_val,
            'protocol_code': project_code,
            'protocol_title': project_name,
            'sample_size': _sample_total(first),
            'visit_count': int(payload.get('visit_count') or len(payload.get('visit_blocks') or []) or 0),
            'visit_timepoints': _collect_visit_points(payload),
            'execution_date': _collect_execution_period(first),
            'slot_status': 'completed',
            'current_visit_phase': current_phase,
            'next_visit_phase': next_phase,
            'slot_date': _collect_execution_period(first),
            'workorder_total': completion['total'],
            'workorder_completed': completion['completed'],
            'completion_rate': round(completion['completed'] / completion['total'] * 100, 1) if completion['total'] > 0 else 0,
            'delivery_progress': '-',  # 预留：后续由交付模块接口回填
            'workstation_completion': {
                'reception': completion['reception'],
                'material': completion['material'],
                'recruitment': completion['recruitment'],
                'evaluator': completion['evaluator'],
            },
        })

    total = len(items_all)
    offset = (page - 1) * page_size
    items = items_all[offset:offset + page_size]

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
