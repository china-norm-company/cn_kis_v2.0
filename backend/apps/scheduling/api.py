"""
排程管理 API

端点：
- GET  /scheduling/plans/list           排程计划列表（分页 + 筛选）
- POST /scheduling/plans/create         创建排程计划
- POST /scheduling/plans/{id}/generate  生成时间槽
- GET  /scheduling/plans/{id}/conflicts 冲突检测
- POST /scheduling/plans/{id}/publish   发布排程
- GET  /scheduling/plans/{id}           排程详情
- GET  /scheduling/slots                按日期范围查询时间槽
- PUT  /scheduling/slots/{id}           更新时间槽
"""
import logging
from collections import defaultdict
from django.http import JsonResponse
from django.db.models import Q
from ninja import Router, Schema
from typing import Optional, List, Any
from datetime import date, time as time_type
from apps.identity.decorators import (
    require_permission,
    require_permission_or_anon_in_debug,
    require_any_permission_or_anon_in_debug,
    _get_account_from_request,
)

# 实验室排期只读：与执行台上传数据同源。scheduling.lab_schedule.read 赋予除受试者自助外全员（见 seed_roles）；其余为历史/岗位兼容
_LAB_SCHEDULE_READ_PERMS = [
    'scheduling.lab_schedule.read',
    'scheduling.plan.read',
    'evaluator.schedule.read',
    'visit.plan.read',
]

from . import services as sched_services

logger = logging.getLogger(__name__)

router = Router()


# ============================================================================
# Schema
# ============================================================================
class SchedulePlanCreateIn(Schema):
    visit_plan_id: int
    start_date: date
    end_date: date
    name: Optional[str] = ''


class GenerateSlotsIn(Schema):
    default_start_time: Optional[str] = '09:00'
    default_end_time: Optional[str] = '17:00'


class SlotUpdateIn(Schema):
    scheduled_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    assigned_to_id: Optional[int] = None


def _plan_to_dict(p) -> dict:
    return {
        'id': p.id,
        'visit_plan_id': p.visit_plan_id,
        'resource_demand_id': p.resource_demand_id,
        'name': p.name,
        'start_date': str(p.start_date),
        'end_date': str(p.end_date),
        'status': p.status,
        'create_time': p.create_time.isoformat(),
    }


def _plan_to_list_item(p) -> dict:
    """排程计划列表项，字段与资源待审核一致，便于执行台统一展示。"""
    from apps.visit.models import VisitNode

    base = _plan_to_dict(p)
    plan = getattr(p, 'visit_plan', None)
    protocol = getattr(plan, 'protocol', None) if plan else None

    # 协议/项目信息（客户：数据来源于研究台，取项目编号的第4、5、6位字符）
    if protocol:
        base['protocol_id'] = protocol.id
        code = protocol.code or ''
        base['protocol_code'] = code
        base['protocol_title'] = protocol.title or ''
        base['client'] = code[3:6] if len(code) >= 6 else code[3:]
        base['sample_size'] = getattr(protocol, 'sample_size', None) or 0
    else:
        base['protocol_id'] = 0
        base['protocol_code'] = ''
        base['protocol_title'] = ''
        base['client'] = ''
        base['sample_size'] = 0

    # 访视点/窗口期
    if plan:
        nodes = list(VisitNode.objects.filter(plan=plan).order_by('order', 'baseline_day'))
        base['visit_node_count'] = len(nodes)
        if nodes:
            n = nodes[0]
            base['window_summary'] = f'±{n.window_before}' if n.window_before == n.window_after else f'±{n.window_before}/{n.window_after}'
        else:
            base['window_summary'] = '-'
    else:
        base['visit_node_count'] = 0
        base['window_summary'] = '-'

    # 执行周期、排程进度（与资源待审核一致：待排程/已排程/已发布）
    base['execution_period'] = f'{p.start_date} ~ {p.end_date}' if p.start_date and p.end_date else ''
    _progress = {'draft': '待排程', 'generated': '已排程', 'published': '已发布', 'cancelled': '已取消'}
    base['schedule_progress_display'] = _progress.get(p.status, p.status)

    return base


def _slot_to_dict(s) -> dict:
    return {
        'id': s.id,
        'schedule_plan_id': s.schedule_plan_id,
        'visit_node_id': s.visit_node_id,
        'visit_node_name': s.visit_node.name if s.visit_node else '',
        'scheduled_date': str(s.scheduled_date),
        'start_time': str(s.start_time) if s.start_time else '',
        'end_time': str(s.end_time) if s.end_time else '',
        'status': s.status,
        'assigned_to_id': s.assigned_to_id,
        'feishu_calendar_event_id': s.feishu_calendar_event_id,
        'conflict_reason': s.conflict_reason,
    }


# ============================================================================
# 排程计划列表
# ============================================================================
@router.get('/plans/list', summary='排程计划列表')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def list_schedule_plans(
    request,
    status: Optional[str] = None,
    visit_plan_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
):
    """分页查询排程计划"""
    from .services import SchedulingQueryService
    result = SchedulingQueryService.list_plans(
        status=status,
        visit_plan_id=visit_plan_id,
        page=page,
        page_size=page_size,
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_plan_to_list_item(p) for p in result['items']],
        'total': result['total'],
        'page': result['page'],
        'page_size': result['page_size'],
    }}


# ============================================================================
# 开发环境：清空排程计划（路径避开 /plans/ 以免与 /plans/{plan_id} 冲突导致 405）
# ============================================================================
@router.get('/clear-demo-plans', summary='[仅DEBUG]校验清空接口是否存在')
def clear_demo_plans_get(request):
    """GET 仅返回提示，用于浏览器直接打开校验路由；实际清空请用 POST。"""
    from django.conf import settings
    if not getattr(settings, 'DEBUG', False):
        return 403, {'code': 403, 'msg': '仅开发环境可用', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': {'endpoint': 'clear-demo-plans', 'hint': '请使用 POST 请求清空演示数据'}}

@router.post('/clear-demo-plans', summary='[仅DEBUG]清空全部排程计划并可选重置已审批资源需求')
def clear_all_schedule_plans(request, also_reset_approved_demands: bool = True):
    """仅当 DEBUG=True 时可用，清空当前库中全部排程计划，可选将已审批资源需求重置为已提交。"""
    from django.conf import settings
    if not getattr(settings, 'DEBUG', False):
        return 403, {'code': 403, 'msg': '仅开发环境可用', 'data': None}
    from .models import SchedulePlan
    from apps.visit.models import ResourceDemand, ResourceDemandStatus
    deleted, detail = SchedulePlan.objects.all().delete()
    reset_count = 0
    if also_reset_approved_demands:
        reset_count = ResourceDemand.objects.filter(status=ResourceDemandStatus.APPROVED).update(
            status=ResourceDemandStatus.SUBMITTED
        )
    return {'code': 200, 'msg': 'OK', 'data': {
        'deleted': deleted,
        'detail': detail,
        'resource_demands_reset': reset_count,
    }}


# ============================================================================
# 时间槽查询与更新
# ============================================================================
@router.get('/slots', summary='按日期范围查询时间槽')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def list_slots(
    request,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    assigned_to_id: Optional[int] = None,
    plan_id: Optional[int] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
):
    """按日期范围、执行人、排程计划筛选时间槽"""
    from .services import SchedulingQueryService
    from datetime import date as dt_date
    sd = dt_date.fromisoformat(start_date) if start_date else None
    ed = dt_date.fromisoformat(end_date) if end_date else None
    result = SchedulingQueryService.list_slots_by_range(
        start_date=sd,
        end_date=ed,
        assigned_to_id=assigned_to_id,
        plan_id=plan_id,
        status=status,
        page=page,
        page_size=page_size,
    )
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [_slot_to_dict(s) for s in result['items']],
        'total': result['total'],
        'page': result['page'],
        'page_size': result['page_size'],
    }}


@router.put('/slots/{slot_id}', summary='更新时间槽')
@require_permission('scheduling.plan.create')
def update_slot(request, slot_id: int, data: SlotUpdateIn):
    """调整时间槽的日期、时间或执行人"""
    from .services import SchedulingQueryService
    from datetime import date as dt_date
    try:
        sd = dt_date.fromisoformat(data.scheduled_date) if data.scheduled_date else None
        st = None
        et = None
        if data.start_time:
            h, m = map(int, data.start_time.split(':'))
            st = time_type(h, m)
        if data.end_time:
            h, m = map(int, data.end_time.split(':'))
            et = time_type(h, m)
        slot = SchedulingQueryService.update_slot(
            slot_id=slot_id,
            scheduled_date=sd,
            start_time=st,
            end_time=et,
            assigned_to_id=data.assigned_to_id,
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    return {'code': 200, 'msg': '时间槽已更新', 'data': _slot_to_dict(slot)}


# ============================================================================
# 排程计划 CRUD
# ============================================================================
@router.post('/plans/create', summary='创建排程计划')
@require_permission('scheduling.plan.create')
def create_schedule_plan(request, data: SchedulePlanCreateIn):
    """从已审批的资源需求创建排程计划"""
    from .services import IntelligentSchedulingService
    account = _get_account_from_request(request)
    try:
        plan = IntelligentSchedulingService.create_schedule_plan(
            visit_plan_id=data.visit_plan_id,
            start_date=data.start_date,
            end_date=data.end_date,
            name=data.name or '',
            created_by_id=account.id if account else None,
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    return {'code': 200, 'msg': '排程计划创建成功', 'data': _plan_to_dict(plan)}


@router.post('/plans/{plan_id}/generate', summary='生成时间槽')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def generate_slots(request, plan_id: int, data: GenerateSlotsIn):
    """自动生成排程时间槽"""
    from .services import IntelligentSchedulingService
    try:
        slots = IntelligentSchedulingService.generate_schedule_slots(
            plan_id=plan_id,
            default_start_time=data.default_start_time or '09:00',
            default_end_time=data.default_end_time or '17:00',
        )
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    return {
        'code': 200, 'msg': f'生成 {len(slots)} 个时间槽',
        'data': [_slot_to_dict(s) for s in slots],
    }


@router.get('/plans/{plan_id}/conflicts', summary='冲突检测')
@require_permission('scheduling.plan.read')
def detect_conflicts(request, plan_id: int):
    """检测排程冲突"""
    from .services import IntelligentSchedulingService
    try:
        conflicts = IntelligentSchedulingService.detect_conflicts(plan_id)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    return {
        'code': 200, 'msg': f'检测到 {len(conflicts)} 个冲突',
        'data': conflicts,
    }


@router.post('/plans/{plan_id}/publish', summary='发布排程')
@require_permission('scheduling.plan.create')
def publish_plan(request, plan_id: int):
    """发布排程（创建飞书日历事件 + 触发工单生成）"""
    from .services import IntelligentSchedulingService
    try:
        plan = IntelligentSchedulingService.publish_plan(plan_id)
    except ValueError as e:
        return 400, {'code': 400, 'msg': str(e), 'data': None}
    data = _plan_to_dict(plan)
    data['calendar_synced_count'] = getattr(plan, '_calendar_synced_count', 0)
    return {'code': 200, 'msg': '排程已发布', 'data': data}


@router.get('/plans/{plan_id}', summary='排程详情')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def get_schedule_plan(request, plan_id: int):
    """获取排程计划详情（含时间槽）"""
    from .models import SchedulePlan, ScheduleSlot
    plan = SchedulePlan.objects.filter(id=plan_id).first()
    if not plan:
        return 404, {'code': 404, 'msg': '排程计划不存在'}

    slots = ScheduleSlot.objects.filter(
        schedule_plan=plan
    ).select_related('visit_node').order_by('scheduled_date', 'start_time')

    plan_dict = _plan_to_dict(plan)
    plan_dict['slots'] = [_slot_to_dict(s) for s in slots]
    return {'code': 200, 'msg': 'OK', 'data': plan_dict}


# ============================================================================
# S5-1：跨项目排程概览（CRC主管视图）
# ============================================================================
@router.get('/cross-project-overview', summary='跨项目排程概览')
@require_permission('scheduling.plan.read')
def cross_project_overview(request):
    """
    跨项目排程概览：所有活跃排程计划的汇总统计

    CRC主管/排程专员可查看所有项目的排程状态、完成率、冲突数
    """
    from .models import SchedulePlan, ScheduleSlot
    from django.db.models import Count, Q

    plans = SchedulePlan.objects.filter(
        status__in=['draft', 'published'],
    ).select_related('visit_plan').order_by('-create_time')

    result = []
    for plan in plans:
        slots = ScheduleSlot.objects.filter(schedule_plan=plan)
        total_slots = slots.count()
        completed_slots = slots.filter(status='completed').count()
        conflict_slots = slots.filter(status='conflict').count()

        protocol_title = ''
        try:
            if plan.visit_plan and plan.visit_plan.protocol:
                protocol_title = plan.visit_plan.protocol.title
        except Exception:
            pass

        result.append({
            'plan_id': plan.id,
            'plan_name': plan.name,
            'status': plan.status,
            'start_date': str(plan.start_date),
            'end_date': str(plan.end_date),
            'protocol_title': protocol_title,
            'total_slots': total_slots,
            'completed_slots': completed_slots,
            'conflict_slots': conflict_slots,
            'completion_rate': round(completed_slots / total_slots * 100, 1) if total_slots else 0,
        })

    return {'code': 200, 'msg': 'OK', 'data': {
        'plans': result,
        'total_plans': len(result),
        'total_conflicts': sum(p['conflict_slots'] for p in result),
    }}


# ============================================================================
# S4-2：里程碑管理 + 排程预测
# ============================================================================
class MilestoneCreateIn(Schema):
    milestone_type: str
    name: str
    target_date: str
    notes: Optional[str] = ''


@router.post('/plans/{plan_id}/milestones/create', summary='添加里程碑')
@require_permission('scheduling.plan.create')
def add_milestone(request, plan_id: int, data: MilestoneCreateIn):
    from .models import SchedulePlan, ScheduleMilestone
    from datetime import date as dt_date
    plan = SchedulePlan.objects.filter(id=plan_id).first()
    if not plan:
        return 404, {'code': 404, 'msg': '排程计划不存在'}
    ms = ScheduleMilestone.objects.create(
        schedule_plan=plan,
        milestone_type=data.milestone_type,
        name=data.name,
        target_date=dt_date.fromisoformat(data.target_date),
        notes=data.notes or '',
    )
    # 创建飞书日历事件
    try:
        from libs.feishu_client import feishu_client
        import os
        from datetime import datetime as dt_cls, timedelta
        cal_id = os.getenv('FEISHU_PRIMARY_CALENDAR_ID', '')
        if cal_id:
            target_dt = dt_cls.combine(ms.target_date, dt_cls.min.time())
            start_ts = int(target_dt.timestamp())
            end_ts = int((target_dt + timedelta(hours=1)).timestamp())
            event = feishu_client.create_calendar_event(
                calendar_id=cal_id,
                summary=f'[里程碑] {ms.name}',
                start_time=start_ts,
                end_time=end_ts,
                description=f'排程计划: {plan.name}\n{ms.notes}',
            )
            if event:
                eid = event.get('event', {}).get('event_id', '')
                if eid:
                    ms.feishu_calendar_event_id = eid
                    ms.save(update_fields=['feishu_calendar_event_id'])
    except Exception:
        pass
    return {'code': 200, 'msg': '里程碑已添加', 'data': {
        'id': ms.id, 'name': ms.name, 'target_date': str(ms.target_date),
    }}


@router.get('/plans/{plan_id}/milestones', summary='里程碑列表')
@require_permission('scheduling.plan.read')
def list_milestones(request, plan_id: int):
    from .models import ScheduleMilestone
    items = ScheduleMilestone.objects.filter(schedule_plan_id=plan_id)
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': [{
            'id': m.id, 'milestone_type': m.milestone_type,
            'name': m.name, 'target_date': str(m.target_date),
            'actual_date': str(m.actual_date) if m.actual_date else None,
            'is_achieved': m.is_achieved,
        } for m in items],
    }}


@router.get('/plans/{plan_id}/predict', summary='排程进度预测')
@require_permission('scheduling.plan.read')
def predict_progress(request, plan_id: int):
    """基于当前完成率预测项目完成日期"""
    from .models import SchedulePlan, ScheduleSlot, SlotStatus
    from django.utils import timezone
    from datetime import timedelta

    plan = SchedulePlan.objects.filter(id=plan_id).first()
    if not plan:
        return 404, {'code': 404, 'msg': '排程计划不存在'}

    slots = ScheduleSlot.objects.filter(schedule_plan=plan)
    total = slots.count()
    completed = slots.filter(status=SlotStatus.COMPLETED).count()

    if total == 0:
        return {'code': 200, 'msg': 'OK', 'data': {'completion_rate': 0}}

    rate = completed / total
    today = timezone.now().date()
    elapsed = (today - plan.start_date).days if today > plan.start_date else 0

    predicted_end = None
    if rate > 0 and elapsed > 0:
        estimated_total_days = int(elapsed / rate)
        predicted_end = plan.start_date + timedelta(days=estimated_total_days)

    return {'code': 200, 'msg': 'OK', 'data': {
        'total_slots': total,
        'completed_slots': completed,
        'completion_rate': round(rate * 100, 1),
        'elapsed_days': elapsed,
        'planned_end': str(plan.end_date),
        'predicted_end': str(predicted_end) if predicted_end else None,
        'on_track': predicted_end <= plan.end_date if predicted_end else None,
    }}


# ============================================================================
# 时间线上传（执行台「创建排程」上传的 Timeline 明细表持久化）
# ============================================================================
@router.get('/timeline-upload', summary='获取最新时间线上传数据')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def get_timeline_upload(request):
    """返回最近一次上传的时间线行数据，用于列表/甘特图展示。"""
    from .models import TimelineUpload
    rec = TimelineUpload.objects.order_by('-create_time').first()
    data = (rec.data if rec and rec.data is not None else []) or []
    return {'code': 200, 'msg': 'OK', 'data': {'items': data}}


class TimelineUploadIn(Schema):
    """时间线上传请求体"""
    rows: List[Any] = []


def _snapshot_from_upload_row(row: dict) -> dict:
    """从线下上传的一行时间线数据构建 TimelinePublishedPlan.snapshot。"""
    if not row or not isinstance(row, dict):
        return {}
    segs = row.get('segments') or []
    start_dates = []
    end_dates = []
    for s in segs:
        if isinstance(s, dict):
            if s.get('startDate'):
                start_dates.append(s['startDate'])
            if s.get('endDate'):
                end_dates.append(s['endDate'])
    execution_period = ''
    if start_dates and end_dates:
        execution_period = f"{min(start_dates)} ~ {max(end_dates)}"
    else:
        execution_period = f"{row.get('项目开始时间') or ''} ~ {row.get('项目结束时间') or ''}"
    return {
        '项目编号': row.get('项目编号') or '',
        '询期编号': row.get('询期编号') or '',
        '项目名称': row.get('项目名称') or '',
        '申办方': row.get('申办方') or '',
        '组别': row.get('组别') or '',
        '样本量': row.get('样本量') or 0,
        '督导': row.get('督导') or '',
        '访视时间点': row.get('回访时间点') or row.get('访视时间点') or '',
        '项目开始时间': row.get('项目开始时间') or '',
        '项目结束时间': row.get('项目结束时间') or '',
        '实际执行周期': execution_period.strip(),
        'segments': segs,
    }


@router.post('/timeline-upload', summary='保存时间线上传数据')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def save_timeline_upload(request, payload: TimelineUploadIn):
    """保存上传解析后的时间线行数据（前端 mapParsedToTimelineRows 的结果）。
    同时为每行创建一条 TimelinePublishedPlan（数据来源=线下），进入排程计划/时间槽列表。"""
    from .models import TimelineUpload, TimelinePublishedPlan
    rows = list(payload.rows) if payload.rows else []
    account = _get_account_from_request(request)
    rec = TimelineUpload.objects.create(
        data=rows,
        created_by_id=account.id if account else None,
    )
    created_count = 0
    for row in rows:
        snapshot = _snapshot_from_upload_row(row)
        if not snapshot:
            continue
        TimelinePublishedPlan.objects.create(
            snapshot=snapshot,
            source_type='offline',
            timeline_schedule=None,
            created_by_id=account.id if account else None,
        )
        created_count += 1
    return {
        'code': 200,
        'msg': f'已保存 {len(rows)} 条时间线数据，已生成 {created_count} 条排程计划',
        'data': {'id': rec.id, 'count': len(rows), 'plan_count': created_count},
    }


# ============================================================================
# 实验室排期（过渡功能）：线下「实验室项目运营安排」上传，独立于排程计划/时间槽
# ============================================================================
class LabScheduleUploadIn(Schema):
    """实验室排期上传请求体"""
    source_file_name: Optional[str] = ''
    items: List[Any] = []


def _lab_schedule_row_to_dict(row) -> dict:
    """LabScheduleRow 转为 API 返回结构（兼容 LabScheduleRow 字段）"""
    return {
        'group': getattr(row, 'group', '') or '',
        'equipment_code': getattr(row, 'equipment_code', '') or '',
        'equipment': getattr(row, 'equipment', '') or '',
        'date': str(getattr(row, 'date', '') or '')[:10] if getattr(row, 'date', None) else '',
        'protocol_code': getattr(row, 'protocol_code', '') or '',
        'sample_size': getattr(row, 'sample_size', '') or '',
        'person_role': getattr(row, 'person_role', '') or '',
        'room': getattr(row, 'room', '') or '',
        'day_group': getattr(row, 'day_group', '') or '',
    }


def _lab_schedule_protocol_exclude_q():
    """项目编号含「外借」「内部使用」「内部借用」的行不参与列表与日历统计。"""
    from django.db.models import Q

    return (
        Q(protocol_code__icontains='外借')
        | Q(protocol_code__icontains='内部使用')
        | Q(protocol_code__icontains='内部借用')
    )


# 人员日历取数：group 或 day_group 完全等于下列组别时排除（ORM 与 JSON 回退一致）
_LAB_SCHEDULE_CALENDAR_EXCLUDED_GROUP_NAMES = ('行政', '评估', '操作')


def _lab_schedule_drop_json_row(row: Any) -> bool:
    """JSON 回退行是否应丢弃（与 ORM exclude 一致）。"""
    if not isinstance(row, dict):
        return True
    pc = str(row.get('protocol_code') or '')
    return ('外借' in pc) or ('内部使用' in pc) or ('内部借用' in pc)


def _lab_schedule_json_row_excluded_admin_eval(row: Any) -> bool:
    """JSON 行是否因行政/评估/操作组别排除（与 _lab_schedule_exclude_admin_eval_group_q 一致）。"""
    if not isinstance(row, dict):
        return True
    g = str(row.get('group') or '').strip()
    dg = str(row.get('day_group') or '').strip()
    return g in _LAB_SCHEDULE_CALENDAR_EXCLUDED_GROUP_NAMES or dg in _LAB_SCHEDULE_CALENDAR_EXCLUDED_GROUP_NAMES


def _lab_schedule_json_row_to_api_dict(row: dict) -> dict:
    """JSON 行转为与 _lab_schedule_row_to_dict 相同结构。"""
    d = str(row.get('date') or '')
    return {
        'group': str(row.get('group') or ''),
        'equipment_code': str(row.get('equipment_code') or ''),
        'equipment': str(row.get('equipment') or ''),
        'date': d[:10] if d else '',
        'protocol_code': str(row.get('protocol_code') or ''),
        'sample_size': str(row.get('sample_size') or '') if row.get('sample_size') is not None else '',
        'person_role': str(row.get('person_role') or ''),
        'room': str(row.get('room') or ''),
        'day_group': str(row.get('day_group') or ''),
    }


def _lab_schedule_exclude_admin_eval_group_q():
    """组别（固定列 group 或日期块内 day_group）完全等于 行政 / 评估 / 操作 时排除。"""
    return Q(group__in=_LAB_SCHEDULE_CALENDAR_EXCLUDED_GROUP_NAMES) | Q(
        day_group__in=_LAB_SCHEDULE_CALENDAR_EXCLUDED_GROUP_NAMES
    )


def _person_role_valid_for_calendar(person_role: Optional[str]) -> bool:
    s = (person_role or '').strip()
    if not s or s == '/':
        return False
    return True


def _parse_sample_size_float(val) -> float:
    if val is None:
        return 0.0
    s = str(val).strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _lab_schedule_date_key_ymd(date_str: str) -> str:
    t = (date_str or '').strip()
    if len(t) >= 10:
        return t[:10]
    return t


def _lab_schedule_year_month_filter_q(year_month: str):
    """
    匹配 yyyy-MM 所在自然月；兼容 date 存为 2026-03-15、2026/3/15、2026.03.15 等。
    单独使用 date__icontains=2026-03 无法匹配含斜杠的日期串。
    """
    ym = (year_month or '').strip()
    if len(ym) < 7:
        return Q(pk__in=[])
    parts = ym.split('-')
    if len(parts) < 2:
        return Q(date__icontains=ym)
    y, mm = parts[0], parts[1]
    try:
        mm_int = int(mm)
    except ValueError:
        return Q(date__icontains=ym)
    mm_pad = mm.zfill(2)
    return (
        Q(date__icontains=ym)
        | Q(date__icontains=f'{y}/{mm_pad}')
        | Q(date__icontains=f'{y}/{mm_int}/')
        | Q(date__icontains=f'{y}-{mm_int}-')
        | Q(date__icontains=f'{y}.{mm_pad}.')
        | Q(date__icontains=f'{y}.{mm_int}.')
    )


def _lab_schedule_date_str_in_year_month(date_str: str, year_month: str) -> bool:
    """与 _lab_schedule_year_month_filter_q 等价的 Python 判断（用于 JSON 行过滤）。"""
    ym = (year_month or '').strip()
    if len(ym) < 7:
        return False
    s = (date_str or '').strip()
    if not s:
        return False
    parts = ym.split('-')
    if len(parts) < 2:
        return ym in s
    y, mm = parts[0], parts[1]
    try:
        mm_int = int(mm)
    except ValueError:
        return ym in s
    mm_pad = mm.zfill(2)
    patterns = (
        ym,
        f'{y}/{mm_pad}',
        f'{y}/{mm_int}/',
        f'{y}-{mm_int}-',
        f'{y}.{mm_pad}.',
        f'{y}.{mm_int}.',
    )
    return any(p in s for p in patterns)


@router.get('/lab-schedule/list', summary='实验室排期列表（分页+筛选）')
@require_any_permission_or_anon_in_debug(_LAB_SCHEDULE_READ_PERMS)
def lab_schedule_list(
    request,
    page: int = 1,
    page_size: int = 20,
    person_role: Optional[str] = None,
    equipment: Optional[str] = None,
    date_filter: Optional[str] = None,
):
    """返回最近一次实验室排期上传数据，从数据表查询，支持分页与筛选。"""
    from .models import LabScheduleUpload, LabScheduleRow
    rec = LabScheduleUpload.objects.order_by('-create_time').first()
    if not rec:
        return {'code': 200, 'msg': 'OK', 'data': {
            'items': [], 'total': 0, 'source_file_name': '',
            'page': 1, 'page_size': page_size, 'filter_options': {'person_roles': [], 'equipments': []}
        }}

    # 优先从数据表查询（排除外借/内部使用/内部借用项目编号）
    qs = LabScheduleRow.objects.filter(upload=rec).exclude(_lab_schedule_protocol_exclude_q())
    person_val = (person_role or '').strip()
    equip_val = (equipment or '').strip()
    date_val = (date_filter or '').strip()
    if person_val:
        qs = qs.filter(person_role__icontains=person_val)
    if equip_val:
        qs = qs.filter(equipment__icontains=equip_val)
    if date_val:
        qs = qs.filter(date__icontains=date_val)

    total = qs.count()
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    start = (page - 1) * page_size
    rows = list(qs.order_by('id')[start:start + page_size])

    # 首页时返回筛选选项
    filter_options = {'person_roles': [], 'equipments': []}
    if page == 1 and total > 0:
        base_opt = LabScheduleRow.objects.filter(upload=rec).exclude(_lab_schedule_protocol_exclude_q())
        persons = list(
            base_opt.exclude(person_role='')
            .values_list('person_role', flat=True).distinct().order_by('person_role')
        )
        equipments = list(
            base_opt.exclude(equipment='')
            .values_list('equipment', flat=True).distinct().order_by('equipment')
        )
        filter_options['person_roles'] = [str(p) for p in persons if p]
        filter_options['equipments'] = [str(e) for e in equipments if e]

    items = [_lab_schedule_row_to_dict(r) for r in rows]

    # 兼容旧数据：数据表无记录时回退 JSON
    if total == 0 and rec.data:
        data = (rec.data if isinstance(rec.data, list) else []) or []
        data = [r for r in data if not _lab_schedule_drop_json_row(r)]
        person_val = (person_role or '').strip()
        equip_val = (equipment or '').strip()
        date_val = (date_filter or '').strip()
        if person_val or equip_val or date_val:
            filtered = []
            for row in data:
                if not isinstance(row, dict):
                    continue
                if person_val and person_val not in str(row.get('person_role') or ''):
                    continue
                if equip_val and equip_val not in str(row.get('equipment') or ''):
                    continue
                if date_val and date_val not in str(row.get('date') or ''):
                    continue
                filtered.append(row)
            data = filtered
        total = len(data)
        start = (page - 1) * page_size
        items = [dict(r) if isinstance(r, dict) else {} for r in data[start:start + page_size]]
        if page == 1 and total > 0:
            full = (rec.data if isinstance(rec.data, list) else []) or []
            full = [r for r in full if not _lab_schedule_drop_json_row(r)]
            persons = sorted({str(r.get('person_role') or '').strip() for r in full if isinstance(r, dict) and r.get('person_role')})
            equipments = sorted({str(r.get('equipment') or '').strip() for r in full if isinstance(r, dict) and r.get('equipment')})
            filter_options = {'person_roles': persons, 'equipments': equipments}

    return {'code': 200, 'msg': 'OK', 'data': {
        'items': items, 'total': total, 'source_file_name': (rec.source_file_name or ''),
        'page': page, 'page_size': page_size, 'filter_options': filter_options,
    }}


@router.get('/lab-schedule/month', summary='实验室排期整月数据（单次请求，用于接待台日历）')
@require_any_permission_or_anon_in_debug(_LAB_SCHEDULE_READ_PERMS)
def lab_schedule_month(
    request,
    year_month: str,
    person_role: Optional[str] = None,
):
    """一次返回指定月份的全部实验室排期，不分页。year_month 格式如 2026-03。"""
    from .models import LabScheduleUpload, LabScheduleRow
    date_val = (year_month or '').strip()
    if not date_val or len(date_val) < 6:
        return {'code': 200, 'msg': 'OK', 'data': {'items': [], 'total': 0, 'source_file_name': ''}}

    rec = LabScheduleUpload.objects.order_by('-create_time').first()
    if not rec:
        return {'code': 200, 'msg': 'OK', 'data': {'items': [], 'total': 0, 'source_file_name': ''}}

    qs = (
        LabScheduleRow.objects.filter(upload=rec)
        .exclude(_lab_schedule_protocol_exclude_q())
        .filter(_lab_schedule_year_month_filter_q(date_val))
    )
    person_val = (person_role or '').strip()
    if person_val:
        qs = qs.filter(person_role__icontains=person_val)

    # 整月日历需返回该月全部行；[:2000] 会在数据较多时只覆盖月初约三周，导致下旬日期无数据
    rows = list(qs.order_by('date', 'id'))
    items = [_lab_schedule_row_to_dict(r) for r in rows]
    return {'code': 200, 'msg': 'OK', 'data': {
        'items': items, 'total': len(items), 'source_file_name': (rec.source_file_name or ''),
    }}


@router.get('/lab-schedule/person-calendar', summary='人员日历（实验室排期：按人汇总、导出明细不合并）')
@require_any_permission_or_anon_in_debug(_LAB_SCHEDULE_READ_PERMS)
def lab_schedule_person_calendar(
    request,
    year_month: str,
    person_role: Optional[str] = None,
    equipment: Optional[str] = None,
    all_data: bool = False,
):
    """
    人员日历数据：排除「行政」「评估」「操作」组别（group/day_group 完全等于）、
    仅含有效「人员/岗位」（非空且非 /）。
    返回 calendar_by_date（按日、每人每台设备一行，同人不同设备多行）与 detail_rows（明细行，导出不合并）。
    """
    from .models import LabScheduleUpload, LabScheduleRow

    ym = (year_month or '').strip()
    all_flag = bool(all_data)
    if (not all_flag) and (not ym or len(ym) < 6):
        return {'code': 200, 'msg': 'OK', 'data': {
            'calendar_by_date': {}, 'detail_rows': [], 'source_file_name': '',
            'filter_options': {'person_roles': [], 'equipments': []},
        }}

    rec = LabScheduleUpload.objects.order_by('-create_time').first()
    if not rec:
        return {'code': 200, 'msg': 'OK', 'data': {
            'calendar_by_date': {}, 'detail_rows': [], 'source_file_name': '',
            'filter_options': {'person_roles': [], 'equipments': []},
        }}

    ym_q = _lab_schedule_year_month_filter_q(ym) if not all_flag else None
    has_orm_rows = (
        LabScheduleRow.objects.filter(upload=rec)
        .exclude(_lab_schedule_protocol_exclude_q())
        .exists()
    )
    person_val = (person_role or '').strip()
    equip_val = (equipment or '').strip()

    person_opts: list = []
    equip_opts: list = []
    detail_rows: list = []
    # 按日 → (人员, 设备) → 合并样本量（同人同设备多行来源相加）
    cal_pe: dict[str, dict[tuple, float]] = defaultdict(lambda: defaultdict(float))

    if has_orm_rows:
        base_qs = (
            LabScheduleRow.objects.filter(upload=rec)
            .exclude(_lab_schedule_protocol_exclude_q())
            .exclude(_lab_schedule_exclude_admin_eval_group_q())
        )
        if ym_q is not None:
            base_qs = base_qs.filter(ym_q)
        base_for_options = (
            LabScheduleRow.objects.filter(upload=rec)
            .exclude(_lab_schedule_protocol_exclude_q())
            .exclude(_lab_schedule_exclude_admin_eval_group_q())
        )
        if ym_q is not None:
            base_for_options = base_for_options.filter(ym_q)
        person_opts = sorted(
            {
                str(p).strip()
                for p in base_for_options.exclude(person_role='')
                .values_list('person_role', flat=True).distinct()
                if _person_role_valid_for_calendar(str(p))
            }
        )
        equip_opts = sorted(
            {
                str(e).strip()
                for e in base_for_options.exclude(equipment='')
                .values_list('equipment', flat=True).distinct()
                if str(e).strip()
            }
        )

        qs = base_qs
        if person_val:
            qs = qs.filter(person_role__icontains=person_val)
        if equip_val:
            qs = qs.filter(equipment__icontains=equip_val)

        rows = list(qs.order_by('date', 'person_role', 'equipment', 'id'))
        rows = [r for r in rows if _person_role_valid_for_calendar(getattr(r, 'person_role', None))]

        detail_rows = [_lab_schedule_row_to_dict(r) for r in rows]

        for r in rows:
            dk = _lab_schedule_date_key_ymd(getattr(r, 'date', '') or '')
            if not dk:
                continue
            p = (getattr(r, 'person_role', None) or '').strip()
            eq = (getattr(r, 'equipment', None) or '').strip()
            cal_pe[dk][(p, eq)] += _parse_sample_size_float(getattr(r, 'sample_size', None))
    else:
        data = (rec.data if isinstance(rec.data, list) else []) or []
        json_all = []
        for row in data:
            if not isinstance(row, dict):
                continue
            if _lab_schedule_drop_json_row(row):
                continue
            if _lab_schedule_json_row_excluded_admin_eval(row):
                continue
            ds = str(row.get('date') or '')
            if (not all_flag) and (not _lab_schedule_date_str_in_year_month(ds, ym)):
                continue
            if not _person_role_valid_for_calendar(str(row.get('person_role') or '')):
                continue
            json_all.append(row)

        person_opts = sorted(
            {str(r.get('person_role') or '').strip() for r in json_all if _person_role_valid_for_calendar(str(r.get('person_role') or ''))}
        )
        equip_opts = sorted(
            {str(r.get('equipment') or '').strip() for r in json_all if str(r.get('equipment') or '').strip()}
        )

        json_rows = []
        for row in json_all:
            if person_val and person_val not in str(row.get('person_role') or ''):
                continue
            if equip_val and equip_val not in str(row.get('equipment') or ''):
                continue
            json_rows.append(row)

        detail_rows = [_lab_schedule_json_row_to_api_dict(r) for r in json_rows]

        for row in json_rows:
            dk = _lab_schedule_date_key_ymd(str(row.get('date') or ''))
            if not dk:
                continue
            p = str(row.get('person_role') or '').strip()
            eq = str(row.get('equipment') or '').strip()
            cal_pe[dk][(p, eq)] += _parse_sample_size_float(row.get('sample_size'))

    calendar_by_date: dict[str, list] = {}
    for dk in sorted(cal_pe.keys()):
        rows_out = []
        for (person, eq) in sorted(cal_pe[dk].keys(), key=lambda t: (t[0], t[1])):
            total = cal_pe[dk][(person, eq)]
            if total == int(total):
                total_out = int(total)
            else:
                total_out = round(total, 2)
            rows_out.append({
                'person_role': person,
                'equipment': eq,
                'sample_size': total_out,
            })
        calendar_by_date[dk] = rows_out

    return {'code': 200, 'msg': 'OK', 'data': {
        'calendar_by_date': calendar_by_date,
        'detail_rows': detail_rows,
        'source_file_name': (rec.source_file_name or ''),
        'filter_options': {'person_roles': person_opts, 'equipments': equip_opts},
    }}


@router.post('/lab-schedule/upload', summary='上传实验室排期')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def lab_schedule_upload(request, payload: LabScheduleUploadIn):
    """保存「实验室项目运营安排」解析结果，写入数据表，支持高效分页与筛选。"""
    from .models import LabScheduleUpload, LabScheduleRow
    items = list(payload.items) if payload.items else []
    account = _get_account_from_request(request)
    rec = LabScheduleUpload.objects.create(
        source_file_name=payload.source_file_name or '',
        data=[],  # 数据表存储，不再写 JSON
        created_by_id=account.id if account else None,
    )
    rows = []
    for it in items:
        if not isinstance(it, dict):
            continue
        rows.append(LabScheduleRow(
            upload=rec,
            group=str(it.get('group') or '')[:100],
            equipment_code=str(it.get('equipment_code') or '')[:100],
            equipment=str(it.get('equipment') or '')[:200],
            date=str(it.get('date') or '')[:20],
            protocol_code=str(it.get('protocol_code') or '')[:100],
            sample_size=str(it.get('sample_size') or '')[:50] if it.get('sample_size') is not None else '',
            person_role=str(it.get('person_role') or '')[:200],
            room=str(it.get('room') or '')[:100],
            day_group=str(it.get('day_group') or '')[:100],
        ))
    if rows:
        LabScheduleRow.objects.bulk_create(rows)
    return {'code': 200, 'msg': f'已保存 {len(rows)} 条实验室排期', 'data': {'count': len(rows)}}


@router.post('/lab-schedule/clear', summary='清空实验室排期数据')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def lab_schedule_clear(request):
    """删除全部实验室排期上传记录（过渡功能，与排程计划无关）。"""
    from .models import LabScheduleUpload
    deleted, _ = LabScheduleUpload.objects.all().delete()
    return {'code': 200, 'msg': '已清空实验室排期数据', 'data': {'deleted': deleted}}


# ============================================================================
# 时间线发布（时间槽一条记录 → 详情页编辑 → 发布 → 排程计划一条记录）
# ============================================================================
class TimelinePublishIn(Schema):
    """发布一条时间线记录，在排程计划列表中展示"""
    row: dict = {}


def _slot_dates_from_plan(rec) -> list:
    """从已发布计划中提取所有执行日期，供周/月视图按日期展示槽位。"""
    dates = []
    visit_blocks = []
    if getattr(rec, 'timeline_schedule_id', None) and rec.timeline_schedule_id and getattr(rec, 'timeline_schedule', None):
        payload = (rec.timeline_schedule.payload or {}) if rec.timeline_schedule else {}
        visit_blocks = payload.get('visit_blocks') or []
    if not visit_blocks:
        s = rec.snapshot or {}
        visit_blocks = s.get('visit_blocks') or []
    for block in visit_blocks:
        if not isinstance(block, dict):
            continue
        for proc in (block.get('processes') or []):
            if not isinstance(proc, dict):
                continue
            for d in (proc.get('exec_dates') or []):
                if d and isinstance(d, str) and len(d) >= 10:
                    try:
                        date.fromisoformat(d[:10])
                        dates.append(d[:10])
                    except ValueError:
                        pass
    if not dates and rec.snapshot:
        s = rec.snapshot
        for seg in (s.get('segments') or []):
            if not isinstance(seg, dict):
                continue
            for d in (seg.get('dates') or []):
                if d and isinstance(d, str) and len(d) >= 10:
                    dates.append(d[:10])
            if not seg.get('dates') and seg.get('startDate'):
                dates.append(str(seg.get('startDate'))[:10])
        if not dates and s.get('项目开始时间'):
            dates.append(str(s.get('项目开始时间'))[:10])
    return list(dict.fromkeys(dates))


def _segments_from_plan(rec) -> list:
    """从已发布计划中提取访视段（供甘特图多段展示）。每段含 visit_point, startDate, endDate, dates。"""
    out = []
    visit_blocks = []
    if getattr(rec, 'timeline_schedule_id', None) and rec.timeline_schedule_id and getattr(rec, 'timeline_schedule', None):
        payload = (rec.timeline_schedule.payload or {}) if rec.timeline_schedule else {}
        visit_blocks = payload.get('visit_blocks') or []
    if not visit_blocks and rec.snapshot:
        for seg in (rec.snapshot.get('segments') or []):
            if isinstance(seg, dict):
                out.append({
                    'visit_point': seg.get('label') or seg.get('visit_point') or '',
                    'startDate': (seg.get('startDate') or '')[:10] if seg.get('startDate') else '',
                    'endDate': (seg.get('endDate') or '')[:10] if seg.get('endDate') else '',
                    'dates': list(seg.get('dates') or []) if seg.get('dates') else [],
                })
        return out
    for block in visit_blocks:
        if not isinstance(block, dict):
            continue
        block_dates = []
        for proc in (block.get('processes') or []):
            if isinstance(proc, dict):
                for d in (proc.get('exec_dates') or []):
                    if d and isinstance(d, str) and len(d) >= 10:
                        try:
                            date.fromisoformat(d[:10])
                            block_dates.append(d[:10])
                        except ValueError:
                            pass
        block_dates = list(dict.fromkeys(block_dates))
        if block_dates:
            block_dates.sort()
            out.append({
                'visit_point': (block.get('visit_point') or '').strip(),
                'startDate': block_dates[0],
                'endDate': block_dates[-1],
                'dates': block_dates,
            })
    return out


def _timeline_published_to_list_item(rec) -> dict:
    """将时间线发布记录转为与排程计划/时间槽列表项兼容的展示结构。支持旧版 snapshot 与排程核心发布的 7 字段。"""
    s = rec.snapshot or {}
    project_code = (s.get('项目编号') or '').strip()
    project_name = (s.get('项目名称') or '').strip()
    if project_name == project_code:
        project_name = ''  # 避免在列表里用项目编号充当项目名称
    if not project_name and getattr(rec, 'timeline_schedule_id', None) and rec.timeline_schedule_id:
        try:
            order = getattr(rec, 'timeline_schedule', None) and rec.timeline_schedule.execution_order_upload
            if order:
                first = _first_row_from_order(order)
                code_val = (first.get('项目编号') or '').strip()
                for key in ('项目名称', '项目名', '名称', '询期名称'):
                    cand = (first.get(key) or '').strip()
                    if cand and cand != code_val:
                        project_name = cand
                        break
        except Exception:
            pass
    display_name = project_name or (s.get('询期编号') or '').strip()
    # 实际执行周期：优先排程核心字段「实际执行周期」，否则用项目开始/结束时间
    execution_period = (s.get('实际执行周期') or '').strip()
    if not execution_period:
        execution_period = f"{s.get('项目开始时间') or ''} ~ {s.get('项目结束时间') or ''}"
    execution_order_id = None
    if getattr(rec, 'timeline_schedule_id', None) and rec.timeline_schedule_id and getattr(rec, 'timeline_schedule', None):
        execution_order_id = rec.timeline_schedule.execution_order_upload_id
    source_type = getattr(rec, 'source_type', 'online') or 'online'
    sample_size = s.get('样本量') or 0
    if (not sample_size or sample_size == 0) and getattr(rec, 'timeline_schedule_id', None) and rec.timeline_schedule_id:
        try:
            order = getattr(rec, 'timeline_schedule', None) and rec.timeline_schedule.execution_order_upload
            if order:
                first = _first_row_from_order(order)
                sample_size = _sample_total_from_first(first)
        except Exception:
            pass
    schedule_core_status = None
    post_publish_edit_count = 0
    if getattr(rec, 'timeline_schedule_id', None) and getattr(rec, 'timeline_schedule', None):
        try:
            sch = rec.timeline_schedule
            schedule_core_status = getattr(sch, 'status', None)
            post_publish_edit_count = int(getattr(sch, 'post_publish_edit_count', 0) or 0)
        except Exception:
            schedule_core_status = None
            post_publish_edit_count = 0
    return {
        'id': f'tp-{rec.id}',
        'visit_plan_id': None,
        'resource_demand_id': None,
        'name': display_name,
        'start_date': s.get('项目开始时间') or '',
        'end_date': s.get('项目结束时间') or '',
        'status': 'published',
        'create_time': rec.create_time.isoformat(),
        'protocol_id': 0,
        'protocol_code': project_code or s.get('项目编号') or '',
        'protocol_title': project_name or display_name or '',
        'client': s.get('申办方') or '',
        'sample_size': sample_size,
        'research_group': s.get('组别') or '',
        'supervisor': s.get('督导') or '',
        'visit_points_display': s.get('访视时间点') or '',
        'visit_node_count': len(s.get('segments') or []),
        'window_summary': '-',
        'execution_period': execution_period.strip(),
        'schedule_progress_display': '已发布',
        'source': 'timeline',
        'timeline_schedule_id': rec.timeline_schedule_id if hasattr(rec, 'timeline_schedule_id') else None,
        'execution_order_id': execution_order_id,
        '数据来源': '线上' if source_type == 'online' else '线下',
        'source_type': source_type,
        'slot_dates': _slot_dates_from_plan(rec),
        'segments': _segments_from_plan(rec),
        # 排程核心状态：completed 时前端「排程计划」Tab 不展示，仅「时间槽」等视图展示
        'schedule_core_status': schedule_core_status,
        # 发布后撤回再编辑次数；与 status 配合区分「排程变更 / 排程撤回」
        'post_publish_edit_count': post_publish_edit_count,
    }


@router.post('/timeline-publish', summary='发布时间线记录')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def publish_timeline_row(request, payload: TimelinePublishIn):
    """从时间线详情页发布一条记录，在排程计划列表中展示。"""
    from .models import TimelinePublishedPlan
    row = payload.row if isinstance(payload.row, dict) else {}
    account = _get_account_from_request(request)
    rec = TimelinePublishedPlan.objects.create(
        snapshot=row,
        created_by_id=account.id if account else None,
    )
    return {'code': 200, 'msg': '已发布', 'data': {'id': rec.id}}


@router.get('/timeline-published', summary='已发布时间线记录列表')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def list_timeline_published(request):
    """返回已发布的时间线记录，用于排程计划/时间槽列表展示。按项目编号去重，每个项目编号仅保留最新一条。"""
    from .models import TimelinePublishedPlan
    recs = TimelinePublishedPlan.objects.select_related('timeline_schedule').order_by('-create_time')[:500]
    items = []
    seen_project_codes = set()
    for rec in recs:
        s = rec.snapshot or {}
        project_code = (s.get('项目编号') or '').strip()
        if project_code and project_code in seen_project_codes:
            continue
        if project_code:
            seen_project_codes.add(project_code)
        items.append(_timeline_published_to_list_item(rec))
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.get('/timeline-published/{plan_id}', summary='时间槽详情（项目字段+行政/评估/技术排期）')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def get_timeline_published_detail(request, plan_id: int):
    """返回单条时间线发布记录详情，用于时间槽详情页。若有 timeline_schedule 则带出订单+排程核心（访视点、流程、行政/评估/技术排期）。"""
    from .models import TimelinePublishedPlan
    rec = TimelinePublishedPlan.objects.filter(id=plan_id).first()
    if not rec:
        return {'code': 404, 'msg': '未找到该记录', 'data': None}
    out = {
        'id': rec.id,
        'snapshot': rec.snapshot or {},
        'create_time': rec.create_time.isoformat(),
        'timeline_schedule_id': None,
        'order': None,
        'schedule': None,
    }
    source_type = getattr(rec, 'source_type', 'online') or 'online'
    out['source_type'] = source_type

    if getattr(rec, 'timeline_schedule_id', None) and rec.timeline_schedule_id:
        schedule = rec.timeline_schedule
        if schedule:
            out['timeline_schedule_id'] = schedule.id
            order = schedule.execution_order_upload
            if order and order.data:
                d = order.data if isinstance(order.data, dict) else {}
                out['order'] = {
                    'id': order.id,
                    'headers': d.get('headers') or [],
                    'rows': d.get('rows') or [],
                }
            out['schedule'] = {
                'id': schedule.id,
                'execution_order_id': schedule.execution_order_upload_id,
                'supervisor': schedule.supervisor or '',
                'research_group': schedule.research_group or '',
                't0_date': schedule.t0_date.isoformat() if schedule.t0_date else None,
                'split_days': schedule.split_days,
                'status': schedule.status,
                'admin_published': schedule.admin_published,
                'eval_published': schedule.eval_published,
                'tech_published': schedule.tech_published,
                'payload': schedule.payload or {},
            }
    else:
        # 线下：无 timeline_schedule，用 snapshot 拼出 schedule.payload 供时间槽详情页使用
        s = rec.snapshot or {}
        out['schedule'] = {
            'id': None,
            'execution_order_id': None,
            'supervisor': s.get('督导') or '',
            'research_group': s.get('组别') or '',
            't0_date': None,
            'split_days': 1,
            'status': 'timeline_published',
            'admin_published': False,
            'eval_published': False,
            'tech_published': False,
            'payload': {'visit_blocks': s.get('visit_blocks') or []},
        }
    return {'code': 200, 'msg': 'OK', 'data': out}


class TimelinePublishedUpdateIn(Schema):
    """线下排程计划更新：仅更新 snapshot 中的 visit_blocks 等"""
    visit_blocks: List[Any] = []
    snapshot: Optional[dict] = None  # 可选：整份 snapshot 覆盖（用于保存流程后同步）


@router.patch('/timeline-published/{plan_id}', summary='更新时间线发布记录（线下流程保存）')
@require_permission_or_anon_in_debug('scheduling.plan.update')
def update_timeline_published(request, plan_id: int, payload: TimelinePublishedUpdateIn):
    """仅支持数据来源=线下的记录：更新 snapshot.visit_blocks 或整份 snapshot。"""
    from .models import TimelinePublishedPlan
    rec = TimelinePublishedPlan.objects.filter(id=plan_id).first()
    if not rec:
        return {'code': 404, 'msg': '未找到该记录', 'data': None}
    source_type = getattr(rec, 'source_type', 'online') or 'online'
    if source_type != 'offline':
        return {'code': 400, 'msg': '仅支持线下来源的排程计划更新', 'data': None}
    snapshot = dict(rec.snapshot or {})
    if payload.snapshot is not None and isinstance(payload.snapshot, dict):
        snapshot = payload.snapshot
    else:
        if payload.visit_blocks is not None:
            snapshot['visit_blocks'] = list(payload.visit_blocks)
    rec.snapshot = snapshot
    rec.save(update_fields=['snapshot', 'update_time'])
    return {'code': 200, 'msg': '已保存', 'data': {'id': rec.id}}


# ============================================================================
# 测试执行订单上传（资源需求 Tab + 排程计划中一条待排程任务）
# ============================================================================
class ExecutionOrderUploadIn(Schema):
    """执行订单解析结果：表头 + 行数据"""
    headers: List[str] = []
    rows: List[Any] = []


class ParseEvaluationBlockIn(Schema):
    """评估计划表格块（由前端按锚点截取的行×列二维数组）"""
    block: List[List[str]] = []


def _normalize_execution_order_data(rec) -> tuple:
    """从 ExecutionOrderUpload 取 headers 与 rows；兼容 data 为 dict(headers/rows) 或 list(仅行)。"""
    if not rec or rec.data is None:
        return None
    if isinstance(rec.data, dict):
        headers = list(rec.data.get('headers') or [])
        rows = list(rec.data.get('rows') or [])
        return (headers, rows)
    if isinstance(rec.data, list):
        rows = list(rec.data)
        return ([], rows)  # 旧格式：仅行，无表头
    return None


def _execution_order_to_plan_item(rec) -> dict:
    """将执行订单上传转为排程计划列表项（待排程）。兼容 data 为 dict 或 list。"""
    out = _normalize_execution_order_data(rec)
    if out is None:
        headers, rows = [], []
    else:
        headers, rows = out
    first_row = rows[0] if rows else {}
    if isinstance(first_row, list) and headers:
        first_row = dict(zip(headers, first_row))
    if not isinstance(first_row, dict):
        first_row = {}
    name = (first_row.get('项目名称') or first_row.get('项目编号') or first_row.get('订单编号') or f'执行订单 #{rec.id}')
    # 执行周期：优先用解析结果中的「执行周期」/「执行时间周期」，否则用项目开始~结束日期
    execution_period = (
        first_row.get('执行周期') or first_row.get('执行时间周期') or ''
    ).strip()
    if not execution_period:
        execution_period = (
            f"{first_row.get('项目开始时间') or ''} ~ {first_row.get('项目结束时间') or ''}"
        ).strip().strip('~').strip()
    create_time = rec.create_time.isoformat() if getattr(rec, 'create_time', None) else ''
    return {
        'id': f'eo-{rec.id}',
        'visit_plan_id': None,
        'resource_demand_id': None,
        'name': name,
        'start_date': first_row.get('项目开始时间') or first_row.get('开始日期') or '',
        'end_date': first_row.get('项目结束时间') or first_row.get('结束日期') or '',
        'status': 'draft',
        'create_time': create_time,
        'protocol_id': 0,
        'protocol_code': first_row.get('项目编号') or '',
        'protocol_title': first_row.get('项目名称') or name,
        'client': first_row.get('申办方') or first_row.get('客户') or '',
        'sample_size': _sample_total_from_first(first_row),
        'visit_node_count': 0,
        'window_summary': '-',
        'execution_period': execution_period or '-',
        'schedule_progress_display': '待排程',
        'source': 'execution_order',
    }


def _project_code_from_payload(headers, rows):
    """从 headers + rows 中解析出项目编号（第一行、表头为「项目编号」的列）。"""
    if not headers or not rows:
        return None
    try:
        idx = next(i for i, h in enumerate(headers) if (h or '').strip() == '项目编号')
    except StopIteration:
        return None
    row0 = rows[0] if rows else []
    if isinstance(row0, (list, tuple)) and idx < len(row0):
        return (row0[idx] or '').strip() or None
    if isinstance(row0, dict):
        return (row0.get(headers[idx]) or '').strip() or None
    return None


# 执行订单结构化摘要：中文表头 -> 对外接口字段名（供其他工作台只读调用）
EXECUTION_ORDER_SUMMARY_FIELDS = {
    '项目编号': 'project_code',
    '项目名称': 'project_name',
    '组别': 'group',
    '样本数量': 'sample_size',
    '样本量': 'sample_size',
    '最低样本量': 'sample_size',
    '备份数量': 'backup_sample_size',
    '备份样本量': 'backup_sample_size',
    '访视时间点': 'visit_timepoints',
    '执行周期': 'execution_period',
    '执行时间周期': 'execution_period',
    '排期时间': 'execution_period',
    'Field work': 'execution_period',
    '业务类型': 'business_type',
    '申办方': 'client',
    '客户': 'client',
}


def _first_row_dict(rec):
    """从 ExecutionOrderUpload 取 data 中第一行转为 dict（key 为表头）。兼容 data 为 dict 或 list。"""
    out = _normalize_execution_order_data(rec)
    if out is None:
        return {}
    headers, rows = out
    first = rows[0] if rows else []
    if isinstance(first, list) and headers:
        return dict(zip(headers, first))
    return first if isinstance(first, dict) else {}


def _execution_order_to_summary(rec) -> dict:
    """将执行订单转为结构化摘要（供其他工作台只读接口使用）。"""
    first = _first_row_dict(rec)
    out = {
        'id': rec.id,
        'project_code': '',
        'project_name': '',
        'group': '',
        'sample_size': '',
        'backup_sample_size': '',
        'visit_timepoints': '',
        'execution_period': '',
        'business_type': '',
        'client': '',
        'create_time': rec.create_time.isoformat() if rec.create_time else '',
    }
    for label, key in EXECUTION_ORDER_SUMMARY_FIELDS.items():
        val = first.get(label)
        if val is None or (isinstance(val, str) and not val.strip()):
            continue
        if isinstance(val, str):
            val = val.strip()
        if key not in out or out[key] == '':
            out[key] = val
    return out


# 详情页内部表头，不放入 fields，单独解析为数组
_FULL_DETAIL_TABLE_KEYS = ('__equipmentTable', '__evaluationTable', '__auxiliaryTable', '__consumableTable')


def _execution_order_to_full_detail(rec) -> dict:
    """将执行订单转为整份详情页结构化数据（供其他工作台只读接口使用）。含 fields（所有表头→值）+ 设备/评估/辅助/耗材表。"""
    import json
    first = _first_row_dict(rec)
    # 所有非内部表的列作为 fields，保证可序列化
    fields = {}
    for k, v in first.items():
        if not k or (isinstance(k, str) and k.startswith('__')):
            continue
        fields[str(k)] = _ensure_json_serializable(v) if v is not None else ''
    # 解析四张表（与详情页一致：JSON 字符串 → list[dict]）
    def parse_table(key):
        raw = first.get(key)
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            return []
        if isinstance(raw, list):
            return raw
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except (TypeError, ValueError):
            return []
    return {
        'id': rec.id,
        'create_time': rec.create_time.isoformat() if rec.create_time else '',
        'fields': fields,
        'equipment_table': parse_table('__equipmentTable'),
        'evaluation_table': parse_table('__evaluationTable'),
        'auxiliary_table': parse_table('__auxiliaryTable'),
        'consumable_table': parse_table('__consumableTable'),
    }


def _ensure_json_serializable(obj):
    """将 payload 转为可安全写入 JSONField 的 dict/list（避免 datetime 等不可序列化类型）。"""
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, (list, tuple)):
        return [_ensure_json_serializable(x) for x in obj]
    if isinstance(obj, dict):
        return {str(k): _ensure_json_serializable(v) for k, v in obj.items()}
    return str(obj)


EVAL_TABLE_KEYS = ('评估人员类别', '评估指标类别', '评估指标', '访视时间点', '比如特殊人员资质')
# 仅属辅助测量计划，不得进入评估计划表（与前端 EVAL_EXCLUDE_CATEGORIES 一致）
EVAL_EXCLUDE_CATEGORIES = ('产品上妆',)


def _parse_evaluation_block_with_ai(block: List[List[str]]) -> Optional[List[dict]]:
    """
    将「评估计划」表格块交给 AI 解析为结构化列表。
    返回 list[dict]，每项含 评估人员类别、评估指标类别、评估指标、访视时间点、比如特殊人员资质；
    失败返回 None。
    """
    if not block or not any(any(cell and str(cell).strip() for cell in row) for row in block):
        return None
    try:
        from apps.agent_gateway.services import get_kimi_client
        client = get_kimi_client()
    except Exception as e:
        logger.warning('parse_evaluation_block: get_kimi_client failed: %s', e)
        return None
    # 表格转文本：每行用制表符连接，行与行换行
    lines = []
    for row in block:
        cells = [str(c or '').strip() for c in row]
        lines.append('\t'.join(cells))
    table_text = '\n'.join(lines)
    system_prompt = (
        '你是表格解析助手。用户会给你一段从 Excel 中截取的「评估计划」表格的文本（每行用制表符分隔列）。'
        '请将其解析为 JSON 数组，每个元素为一条评估记录，必须包含且仅包含以下 5 个字段（字符串）：'
        '评估人员类别、评估指标类别、评估指标、访视时间点、比如特殊人员资质。'
        '访视时间点格式为逗号分隔的时间点名称，如 "T0, T2w, T4w"。'
        '只输出一个 JSON 数组，不要 markdown 代码块包裹，不要其他说明。'
    )
    try:
        response = client.chat.completions.create(
            model='moonshot-v1-32k',
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': table_text[:16000]},
            ],
            temperature=0.2,
            max_tokens=2048,
        )
        content = (response.choices[0].message.content or '').strip()
        if not content:
            return None
        # 去掉可能的 markdown 代码块
        if content.startswith('```'):
            for prefix in ('```json\n', '```\n'):
                if content.startswith(prefix):
                    content = content[len(prefix):]
                    break
            if content.endswith('```'):
                content = content[:-3].strip()
        import json
        raw = json.loads(content)
        if not isinstance(raw, list):
            return None
        result = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            row = {k: str(item.get(k, '')).strip() for k in EVAL_TABLE_KEYS}
            cat = (row.get('评估人员类别') or '').strip()
            if any(exc in cat for exc in EVAL_EXCLUDE_CATEGORIES):
                continue
            result.append(row)
        return result if result else None
    except Exception as e:
        logger.warning('parse_evaluation_block: LLM or JSON parse failed: %s', e)
        return None


@router.post('/parse-evaluation-block', summary='AI 解析评估计划表格块')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def parse_evaluation_block(request, payload: ParseEvaluationBlockIn):
    """
    接收前端按锚点截取的「评估计划」表格块，交给 AI 解析为 __evaluationTable 格式。
    若 AI 调用失败或返回无效，前端应回退到规则解析。
    """
    block = list(payload.block or [])
    if not block:
        return {'code': 400, 'msg': 'block 为空', 'data': None}
    table = _parse_evaluation_block_with_ai(block)
    if table is None:
        return JsonResponse(
            {'code': 500, 'msg': 'AI 解析失败或返回无效，请使用规则解析', 'data': None},
            status=500,
            json_dumps_params={'ensure_ascii': False},
        )
    return {'code': 200, 'msg': 'OK', 'data': {'evaluationTable': table}}


def _notify_workstations_new_project(execution_order_id: int, project_code: str, project_name: str):
    """维周落库后通知其他工作台：有新项目信息可查看。优先按飞书登录邮箱发飞书消息，否则按 SCHEDULING_PROJECT_PUBLISH_RECIPIENT_IDS（账号 ID）发。"""
    from django.conf import settings
    from apps.notification.services import send_notification
    from apps.notification.models import NotificationChannel

    title = f'新项目信息已发布：{project_code or "—"} {project_name or ""}'.strip()
    content = '维周·执行台已上传并解析项目信息，请前往各自工作台查看或调用接口获取详情。'
    source_type = 'execution_project_published'
    target_url = f'/execution/#/project-management/resource-demand/detail?id={execution_order_id}'

    # 优先：按飞书登录邮箱解析 open_id，发送飞书 IM 通知（不发邮件）
    recipient_emails = getattr(settings, 'SCHEDULING_PROJECT_PUBLISH_RECIPIENT_EMAILS', None) or []
    if recipient_emails:
        try:
            from libs.feishu_client import feishu_client
            logger.info('新项目发布通知: 按邮箱解析 open_id, emails=%s', recipient_emails)
            open_ids = feishu_client.batch_get_id_by_emails(recipient_emails)
            resolved = sum(1 for o in open_ids if o)
            logger.info('新项目发布通知: 解析到 %s/%s 个 open_id', resolved, len(recipient_emails))
            for email, open_id in zip(recipient_emails, open_ids):
                if not open_id:
                    logger.warning('未解析到飞书 open_id，跳过: %s（请确认该邮箱为飞书登录账号且在同企业）', email)
                    continue
                try:
                    send_notification(
                        recipient_id=0,
                        title=title,
                        content=content,
                        channel=NotificationChannel.FEISHU_CARD,
                        source_type=source_type,
                        source_id=execution_order_id,
                        target_url=target_url,
                        source_workstation='execution',
                        recipient_open_id=open_id,
                    )
                    logger.info('新项目发布通知: 已发飞书卡片给 %s', email)
                except Exception as e:
                    logger.warning('飞书通知 %s (open_id=%s) 失败: %s', email, open_id[:8] if open_id else '', e)
        except Exception as e:
            logger.warning('按邮箱解析飞书 open_id 失败: %s', e)
        return

    # 备选：按账号 ID 发（需 Staff 绑定 feishu_open_id），同样发飞书消息
    recipient_ids = getattr(settings, 'SCHEDULING_PROJECT_PUBLISH_RECIPIENT_IDS', None) or []
    if not recipient_ids:
        logger.debug('SCHEDULING_PROJECT_PUBLISH_RECIPIENT_EMAILS 与 RECIPIENT_IDS 均未配置或为空，跳过通知')
        return
    seen = set()
    for rid in recipient_ids:
        try:
            uid = int(rid) if rid is not None else 0
            if uid <= 0 or uid in seen:
                continue
            seen.add(uid)
            send_notification(
                recipient_id=uid,
                title=title,
                content=content,
                channel=NotificationChannel.FEISHU_CARD,
                source_type=source_type,
                source_id=execution_order_id,
                target_url=target_url,
                source_workstation='execution',
            )
        except Exception as e:
            logger.warning('通知接收人 %s 失败: %s', rid, e)


@router.post('/execution-order', summary='上传测试执行订单')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def save_execution_order(request, payload: ExecutionOrderUploadIn):
    """保存解析后的执行订单数据；项目编号与已保存最新一条相同时覆盖该条，否则追加为新记录。资源需求 Tab 展示取最新一条。落库成功后通知其他工作台。"""
    from .models import ExecutionOrderUpload
    try:
        account = _get_account_from_request(request)
        new_headers = list(payload.headers or [])
        new_rows = list(payload.rows or [])
        new_code = _project_code_from_payload(new_headers, new_rows)
        new_name = ''
        if new_headers and new_rows:
            first = new_rows[0] if new_rows else []
            if isinstance(first, list) and new_headers:
                first_d = dict(zip(new_headers, first))
            else:
                first_d = first if isinstance(first, dict) else {}
            new_name = (first_d.get('项目名称') or first_d.get('项目编号') or '').strip()
        data = {
            'headers': _ensure_json_serializable(new_headers),
            'rows': _ensure_json_serializable(new_rows),
        }

        # 相同项目编号以最新为准：查找任意已存在同项目编号的记录（按创建时间取最新一条），若有则更新
        if new_code:
            for rec in ExecutionOrderUpload.objects.order_by('-create_time'):
                out = _normalize_execution_order_data(rec)
                if out is None:
                    continue
                h, r = out
                old_code = _project_code_from_payload(h, r)
                if old_code and old_code == new_code:
                    rec.data = data
                    rec.created_by_id = account.id if account else None
                    rec.save(update_fields=['data', 'created_by_id', 'update_time'])
                    try:
                        _notify_workstations_new_project(rec.id, new_code, new_name)
                    except Exception as e:
                        logger.warning('落库后通知其他工作台失败: %s', e)
                    try:
                        from .workorder_sync import sync_workorders_to_workstations
                        sync_workorders_to_workstations(rec)
                    except Exception as e:
                        logger.warning('工单同步到招招/和序失败: %s', e)
                    return {'code': 200, 'msg': f'已覆盖同项目编号，共 {len(new_rows)} 条', 'data': {'id': rec.id, 'count': len(new_rows)}}

        rec = ExecutionOrderUpload.objects.create(
            data=data,
            created_by_id=account.id if account else None,
        )
        try:
            _notify_workstations_new_project(rec.id, new_code, new_name)
        except Exception as e:
            logger.warning('落库后通知其他工作台失败: %s', e)
        try:
            from .workorder_sync import sync_workorders_to_workstations
            sync_workorders_to_workstations(rec)
        except Exception as e:
            logger.warning('工单同步到招招/和序失败: %s', e)
        return {'code': 200, 'msg': f'已保存，共 {len(new_rows)} 条', 'data': {'id': rec.id, 'count': len(new_rows)}}
    except Exception as e:
        logger.exception('save_execution_order failed')
        return JsonResponse(
            {'code': 500, 'msg': f'上传失败：{str(e)}', 'data': None},
            status=500,
            json_dumps_params={'ensure_ascii': False},
        )


@router.get('/execution-order', summary='获取最新执行订单解析结果')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def get_execution_order(request):
    """返回最近一次上传的执行订单数据（排程待办等用）。兼容 data 为 dict 或 list。"""
    from .models import ExecutionOrderUpload
    rec = ExecutionOrderUpload.objects.order_by('-create_time').first()
    if not rec:
        return {'code': 200, 'msg': 'OK', 'data': {'headers': [], 'rows': []}}
    out = _normalize_execution_order_data(rec)
    if out is None:
        return {'code': 200, 'msg': 'OK', 'data': {'id': rec.id, 'headers': [], 'rows': []}}
    headers, rows = out
    return {'code': 200, 'msg': 'OK', 'data': {'id': rec.id, 'headers': headers, 'rows': rows}}


@router.get('/execution-orders', summary='执行订单列表（资源需求 Tab 展示多条）')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def list_execution_orders(request):
    """返回执行订单上传记录，按项目编号去重，每个项目编号仅保留最新一条。按创建时间倒序。"""
    from .models import ExecutionOrderUpload
    recs = ExecutionOrderUpload.objects.order_by('-create_time').all()
    items = []
    seen_project_codes = set()
    for rec in recs:
        out = _normalize_execution_order_data(rec)
        if out is None:
            continue
        headers, rows = out
        project_code = _project_code_from_payload(headers, rows)
        if project_code and project_code in seen_project_codes:
            continue
        if project_code:
            seen_project_codes.add(project_code)
        items.append({'id': rec.id, 'headers': headers, 'rows': rows})
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.get('/execution-order/{order_id}', summary='按 id 获取单条执行订单')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def get_execution_order_by_id(request, order_id: int):
    """按 id 获取一条执行订单，详情页用。兼容 data 为 dict 或 list。"""
    from .models import ExecutionOrderUpload
    rec = ExecutionOrderUpload.objects.filter(id=order_id).first()
    if not rec:
        return {'code': 404, 'msg': '未找到该执行订单', 'data': None}
    out = _normalize_execution_order_data(rec)
    if out is None:
        return {'code': 200, 'msg': 'OK', 'data': {'id': rec.id, 'headers': [], 'rows': []}}
    headers, rows = out
    return {'code': 200, 'msg': 'OK', 'data': {'id': rec.id, 'headers': headers, 'rows': rows}}


@router.get('/execution-orders-summary', summary='执行订单结构化列表（供其他工作台只读）')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def list_execution_orders_summary(request):
    """返回所有执行订单的结构化摘要，供和序/共济/衡技/招招等工作台只读调用。按项目编号去重，每个项目编号仅保留最新一条。字段：id, project_code, project_name, group, sample_size, backup_sample_size, visit_timepoints, execution_period, business_type, client, create_time。"""
    from .models import ExecutionOrderUpload
    recs = ExecutionOrderUpload.objects.order_by('-create_time').all()
    items = []
    seen_project_codes = set()
    for rec in recs:
        if not rec or not rec.data:
            continue
        s = _execution_order_to_summary(rec)
        code = (s.get('project_code') or '').strip()
        if code and code in seen_project_codes:
            continue
        if code:
            seen_project_codes.add(code)
        items.append(s)
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.get('/execution-order/{order_id}/summary', summary='单条执行订单结构化摘要（供其他工作台只读）')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def get_execution_order_summary(request, order_id: int):
    """返回单条执行订单的结构化摘要，供其他工作台只读调用。字段同上。"""
    from .models import ExecutionOrderUpload
    rec = ExecutionOrderUpload.objects.filter(id=order_id).first()
    if not rec or not rec.data:
        return {'code': 404, 'msg': '未找到该执行订单', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _execution_order_to_summary(rec)}


@router.get('/execution-order/{order_id}/full-detail', summary='单条执行订单整份详情（供其他工作台只读）')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def get_execution_order_full_detail(request, order_id: int):
    """返回单条执行订单的整份详情页结构化数据，供和序/共济/衡技/招招等工作台只读调用。含 fields（所有表头→值）、equipment_table、evaluation_table、auxiliary_table、consumable_table。不修改任何现有接口逻辑。"""
    from .models import ExecutionOrderUpload
    rec = ExecutionOrderUpload.objects.filter(id=order_id).first()
    if not rec or not rec.data:
        return {'code': 404, 'msg': '未找到该执行订单', 'data': None}
    return {'code': 200, 'msg': 'OK', 'data': _execution_order_to_full_detail(rec)}


@router.patch('/execution-order/{order_id}', summary='更新单条执行订单')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def update_execution_order(request, order_id: int, payload: ExecutionOrderUploadIn):
    """更新指定 id 的执行订单（表头 + 行数据），用于详情页编辑后保存。"""
    from .models import ExecutionOrderUpload
    rec = ExecutionOrderUpload.objects.filter(id=order_id).first()
    if not rec:
        return {'code': 404, 'msg': '未找到该执行订单', 'data': None}
    new_headers = list(payload.headers or [])
    new_rows = list(payload.rows or [])
    rec.data = {'headers': new_headers, 'rows': new_rows}
    account = _get_account_from_request(request)
    rec.created_by_id = account.id if account else None
    rec.save(update_fields=['data', 'created_by_id', 'update_time'])
    try:
        from .workorder_sync import sync_workorders_to_workstations
        sync_workorders_to_workstations(rec)
    except Exception as e:
        logger.warning('工单同步到招招/和序失败: %s', e)
    return {'code': 200, 'msg': '已更新', 'data': {'id': rec.id, 'count': len(new_rows)}}


@router.get('/execution-order-pending', summary='执行订单待排程列表')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def list_execution_order_pending(request):
    """返回执行订单上传对应的待排程项。排程已完成的（TimelineSchedule.status=completed）不展示。按项目编号去重，每个项目编号仅保留最新一条。"""
    from .models import ExecutionOrderUpload, TimelineSchedule, TimelineScheduleStatus
    recs = ExecutionOrderUpload.objects.order_by('-create_time').all()
    completed_order_ids = set(
        TimelineSchedule.objects.filter(status=TimelineScheduleStatus.COMPLETED)
        .values_list('execution_order_upload_id', flat=True)
    )
    items = []
    seen_project_codes = set()
    for rec in recs:
        if not rec or not rec.data or rec.id in completed_order_ids:
            continue
        out = _normalize_execution_order_data(rec)
        if out is None:
            continue
        headers, rows = out
        project_code = _project_code_from_payload(headers, rows)
        if project_code and project_code in seen_project_codes:
            continue
        if project_code:
            seen_project_codes.add(project_code)
        items.append(_execution_order_to_plan_item(rec))
    return {'code': 200, 'msg': 'OK', 'data': {'items': items}}


@router.get('/integration/schedule-tasks', summary='对接层：排程任务聚合列表（待排程/已排程）')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def list_integration_schedule_tasks(request, tab: str = 'all'):
    """
    对接友好的排程任务聚合视图，不改变现有业务逻辑：
    - pending: 执行订单待排程（复用 /execution-order-pending 口径）
    - completed: 已排程任务（复用 /timeline-published 且仅保留 schedule_core_status=completed）
    - all: 二者合并
    """
    from .models import ExecutionOrderUpload, TimelineSchedule, TimelineScheduleStatus, TimelinePublishedPlan

    tab_norm = (tab or 'all').strip().lower()
    if tab_norm not in ('pending', 'completed', 'all'):
        return {'code': 400, 'msg': 'tab 仅支持 pending/completed/all', 'data': None}

    pending_items = []
    completed_items = []

    if tab_norm in ('pending', 'all'):
        recs = ExecutionOrderUpload.objects.order_by('-create_time').all()
        completed_order_ids = set(
            TimelineSchedule.objects.filter(status=TimelineScheduleStatus.COMPLETED)
            .values_list('execution_order_upload_id', flat=True)
        )
        seen_project_codes = set()
        for rec in recs:
            if not rec or not rec.data or rec.id in completed_order_ids:
                continue
            out = _normalize_execution_order_data(rec)
            if out is None:
                continue
            headers, rows = out
            project_code = _project_code_from_payload(headers, rows)
            if project_code and project_code in seen_project_codes:
                continue
            if project_code:
                seen_project_codes.add(project_code)
            item = _execution_order_to_plan_item(rec)
            item['task_type'] = 'pending'
            pending_items.append(item)

    if tab_norm in ('completed', 'all'):
        recs = TimelinePublishedPlan.objects.select_related('timeline_schedule').order_by('-create_time')[:500]
        seen_project_codes = set()
        for rec in recs:
            item = _timeline_published_to_list_item(rec)
            if (item.get('schedule_core_status') or '') != 'completed':
                continue
            project_code = (item.get('protocol_code') or '').strip()
            if project_code and project_code in seen_project_codes:
                continue
            if project_code:
                seen_project_codes.add(project_code)
            item['task_type'] = 'completed'
            completed_items.append(item)

    if tab_norm == 'pending':
        items = pending_items
    elif tab_norm == 'completed':
        items = completed_items
    else:
        items = pending_items + completed_items

    return {'code': 200, 'msg': 'OK', 'data': {
        'tab': tab_norm,
        'items': items,
        'counts': {
            'pending': len(pending_items),
            'completed': len(completed_items),
            'all': len(items),
        },
    }}


@router.get('/integration/schedule-task/{task_id}', summary='对接层：排程任务详情与入口')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def get_integration_schedule_task_detail(request, task_id: str):
    """
    task_id 支持：
    - eo-{execution_order_id}: 待排程任务
    - tp-{timeline_published_id}: 已排程任务
    返回统一详情结构与推荐入口路由，不改变现有排程逻辑。
    """
    from .models import ExecutionOrderUpload, TimelinePublishedPlan

    task = (task_id or '').strip()
    if task.startswith('eo-'):
        try:
            order_id = int(task.split('-', 1)[1])
        except Exception:
            return {'code': 400, 'msg': '无效 task_id', 'data': None}
        rec = ExecutionOrderUpload.objects.filter(id=order_id).first()
        if not rec:
            return {'code': 404, 'msg': '未找到该待排程任务', 'data': None}
        summary = _execution_order_to_summary(rec)
        return {'code': 200, 'msg': 'OK', 'data': {
            'task_id': task,
            'task_type': 'pending',
            'execution_order_id': rec.id,
            'timeline_published_id': None,
            'project_code': summary.get('project_code') or '',
            'project_name': summary.get('project_name') or '',
            'status': 'pending',
            'summary': summary,
            'entry': {
                'schedule_core': f'/execution/#/scheduling/schedule-core/{rec.id}',
                'personnel': f'/execution/#/scheduling/schedule-core/{rec.id}/personnel',
                'timeslot': '',
            },
        }}

    if task.startswith('tp-'):
        try:
            plan_id = int(task.split('-', 1)[1])
        except Exception:
            return {'code': 400, 'msg': '无效 task_id', 'data': None}
        rec = TimelinePublishedPlan.objects.select_related('timeline_schedule').filter(id=plan_id).first()
        if not rec:
            return {'code': 404, 'msg': '未找到该已排程任务', 'data': None}
        item = _timeline_published_to_list_item(rec)
        execution_order_id = item.get('execution_order_id')
        return {'code': 200, 'msg': 'OK', 'data': {
            'task_id': task,
            'task_type': 'completed',
            'execution_order_id': execution_order_id,
            'timeline_published_id': rec.id,
            'project_code': item.get('protocol_code') or '',
            'project_name': item.get('protocol_title') or '',
            'status': item.get('schedule_core_status') or 'completed',
            'summary': item,
            'entry': {
                'schedule_core': f'/execution/#/scheduling/schedule-core/{execution_order_id}' if execution_order_id else '',
                'personnel': f'/execution/#/scheduling/schedule-core/{execution_order_id}/personnel' if execution_order_id else '',
                'timeslot': f'/execution/#/scheduling/timeslot/{rec.id}',
            },
        }}

    return {'code': 400, 'msg': 'task_id 仅支持 eo-* 或 tp-*', 'data': None}


# ============================================================================
# 排程核心：时间线排程 + 行政/评估/技术排程（不修改项目管理模块）
# ============================================================================
class TimelineScheduleUpdateIn(Schema):
    supervisor: Optional[str] = ''
    research_group: Optional[str] = ''
    t0_date: Optional[str] = None  # YYYY-MM-DD
    split_days: Optional[int] = 1
    payload: Optional[dict] = None


@router.get('/execution-order/{order_id}/schedule-core', summary='获取排程核心（无则创建草稿）')
@require_permission_or_anon_in_debug('scheduling.plan.read')
def get_schedule_core(request, order_id: int):
    """获取该执行订单的排程核心记录；若不存在则创建一条草稿后返回。"""
    from .models import ExecutionOrderUpload, TimelineSchedule, TimelineScheduleStatus
    order = ExecutionOrderUpload.objects.filter(id=order_id).first()
    if not order or not order.data:
        return {'code': 404, 'msg': '未找到该执行订单', 'data': None}
    schedule, created = TimelineSchedule.objects.get_or_create(
        execution_order_upload_id=order_id,
        defaults={
            'status': TimelineScheduleStatus.DRAFT,
            'payload': {},
        },
    )
    if created:
        account = _get_account_from_request(request)
        schedule.created_by_id = account.id if account else None
        schedule.save(update_fields=['created_by_id'])
    return {
        'code': 200,
        'msg': 'OK',
        'data': {
            'id': schedule.id,
            'execution_order_id': order_id,
            'supervisor': schedule.supervisor or '',
            'research_group': schedule.research_group or '',
            't0_date': schedule.t0_date.isoformat() if schedule.t0_date else None,
            'split_days': schedule.split_days,
            'status': schedule.status,
            'admin_published': schedule.admin_published,
            'eval_published': schedule.eval_published,
            'tech_published': schedule.tech_published,
            'post_publish_edit_count': getattr(schedule, 'post_publish_edit_count', 0) or 0,
            'payload': schedule.payload or {},
        },
    }


@router.patch('/execution-order/{order_id}/schedule-core', summary='更新排程核心')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def update_schedule_core(request, order_id: int, payload: TimelineScheduleUpdateIn):
    """更新时间线排程或 payload（草稿或时间线已发布时可更新 payload 中的行政/评估/技术）。"""
    from .models import ExecutionOrderUpload, TimelineSchedule, TimelineScheduleStatus
    order = ExecutionOrderUpload.objects.filter(id=order_id).first()
    if not order:
        return {'code': 404, 'msg': '未找到该执行订单', 'data': None}
    schedule = TimelineSchedule.objects.filter(execution_order_upload_id=order_id).first()
    if not schedule:
        return {'code': 404, 'msg': '未找到排程核心，请先进入排程页', 'data': None}
    if payload.supervisor is not None:
        schedule.supervisor = payload.supervisor
    if payload.research_group is not None:
        schedule.research_group = payload.research_group
    if payload.t0_date is not None:
        if payload.t0_date:
            try:
                schedule.t0_date = date.fromisoformat(payload.t0_date)
            except ValueError:
                pass
        else:
            schedule.t0_date = None
    if payload.split_days is not None and payload.split_days >= 1:
        schedule.split_days = payload.split_days
    if payload.payload is not None:
        schedule.payload = _ensure_json_serializable(payload.payload)
        pl = schedule.payload if isinstance(schedule.payload, dict) else {}
        _sanitize_personnel_tabs_saved(pl)
    account = _get_account_from_request(request)
    update_fields = ['supervisor', 'research_group', 't0_date', 'split_days', 'payload', 'update_time']

    # 时间线已发布且三模块人员尚未全部发布时：三模块人员均填齐且三模块均已分别保存后，自动发布三模块并完成排程
    if payload.payload is not None:
        pl = schedule.payload or {}
        visit_blocks = pl.get('visit_blocks') or []
        personnel = pl.get('personnel') or {}
        if (
            schedule.status == TimelineScheduleStatus.TIMELINE_PUBLISHED
            and visit_blocks
            and not (schedule.admin_published and schedule.eval_published and schedule.tech_published)
            and _personnel_all_complete(personnel, visit_blocks)
            and _personnel_tabs_all_saved(pl)
        ):
            schedule.admin_published = True
            schedule.eval_published = True
            schedule.tech_published = True
            _maybe_set_completed(schedule)
            update_fields.extend(['admin_published', 'eval_published', 'tech_published', 'status'])

    schedule.save(update_fields=list(dict.fromkeys(update_fields)))
    _sync_timeline_published_snapshot(schedule)
    try:
        from .workorder_sync import sync_workorders_to_workstations

        sync_workorders_to_workstations(order)
    except Exception as e:
        logger.warning('排程核心保存后工单同步到接待台失败: %s', e)
    return {
        'code': 200,
        'msg': '已更新',
        'data': {
            'id': schedule.id,
            'admin_published': schedule.admin_published,
            'eval_published': schedule.eval_published,
            'tech_published': schedule.tech_published,
            'status': schedule.status,
        },
    }


def _first_row_from_order(order) -> dict:
    """从执行订单解析出第一行为 dict（表头+行）。"""
    if not order or not order.data:
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


def _safe_int_from_first(first: dict, *keys, default: int = 0) -> int:
    """从 first 中按多个键依次取值，转为 int；兼容表头为「样本数量/样本量/最低样本量」等。"""
    for k in keys:
        v = first.get(k)
        if v is None or (isinstance(v, str) and not v.strip()):
            continue
        try:
            return int(float(str(v).strip()))
        except (ValueError, TypeError):
            continue
    return default


def _sample_total_from_first(first: dict) -> int:
    """排程计划列表中的样本量 = 最低样本量 + 备份样本量（兼容同义表头）。"""
    main = _safe_int_from_first(first, '最低样本量', '样本数量', '样本量', '样本数')
    backup = _safe_int_from_first(first, '备份样本量', '备份数量')
    return main + backup


def _personnel_process_tab_class(process_name: str) -> str:
    """流程归属 Tab：含「评估」→ eval；含前台/知情/产品/问卷/清洁→ admin；其余→ tech（评估优先于行政关键词）。"""
    n = (process_name or '').strip()
    if '评估' in n:
        return 'eval'
    for kw in ('前台', '知情', '产品', '问卷', '清洁'):
        if kw in n:
            return 'admin'
    return 'tech'


def _personnel_expected_indices_for_tab(block: dict, tab_key: str) -> list:
    """该访视点下属于 tab_key 的流程下标列表（与排期顺序一致）。"""
    out = []
    for j, p in enumerate(block.get('processes') or []):
        if not isinstance(p, dict):
            continue
        name = (p.get('process') or p.get('code') or '') or ''
        if _personnel_process_tab_class(name) == tab_key:
            out.append(j)
    return out


def _personnel_tab_complete(tab_data, visit_blocks, tab_key: str) -> bool:
    """人员 Tab 是否与 visit_blocks 中属于该 Tab 的流程条数一致且每条均已填写执行/备份/房间。"""
    if not visit_blocks:
        return True
    if not tab_data or not isinstance(tab_data, list):
        return False
    if len(tab_data) != len(visit_blocks):
        return False
    for i, block in enumerate(visit_blocks):
        if not isinstance(block, dict):
            return False
        tv = tab_data[i] if isinstance(tab_data[i], dict) else {}
        processes = tv.get('processes') or []
        expected_indices = _personnel_expected_indices_for_tab(block, tab_key)
        if len(processes) != len(expected_indices):
            return False
        for pos in range(len(expected_indices)):
            row = processes[pos] if pos < len(processes) else {}
            if not isinstance(row, dict):
                return False
            ex = (row.get('executor') or '').strip()
            bu = (row.get('backup') or '').strip()
            rm = (row.get('room') or '').strip()
            if not ex or not bu or not rm:
                return False
    return True


def _personnel_all_complete(personnel: dict, visit_blocks) -> bool:
    if not personnel or not isinstance(personnel, dict):
        return False
    for k in ('admin', 'eval', 'tech'):
        if not _personnel_tab_complete(personnel.get(k), visit_blocks, k):
            return False
    return True


def _sanitize_personnel_tabs_saved(pl: dict) -> None:
    """未填齐的模块不得标记为已保存（防止前端状态不一致）。"""
    pts = pl.get('personnel_tabs_saved')
    if not isinstance(pts, dict):
        return
    personnel = pl.get('personnel') or {}
    visit_blocks = pl.get('visit_blocks') or []
    for k in ('admin', 'eval', 'tech'):
        if pts.get(k) and not _personnel_tab_complete(personnel.get(k), visit_blocks, k):
            pts[k] = False


def _personnel_tabs_all_saved(pl: dict) -> bool:
    """三个模块是否均已分别保存过（personnel_tabs_saved 全为 True）。"""
    pts = pl.get('personnel_tabs_saved') or {}
    if not isinstance(pts, dict):
        return False
    for k in ('admin', 'eval', 'tech'):
        if not pts.get(k):
            return False
    return True


def _sync_timeline_published_snapshot(schedule) -> None:
    """时间线已发布且存在 TimelinePublishedPlan 时，将快照与排程核心对齐。"""
    from .models import TimelinePublishedPlan, TimelineScheduleStatus
    plan = TimelinePublishedPlan.objects.filter(timeline_schedule=schedule).first()
    if not plan:
        return
    plan.snapshot = _build_timeslot_snapshot_from_schedule(schedule)
    plan.save(update_fields=['snapshot', 'update_time'])
    # 旁路桥接：仅在排程完成后同步到访视管理，不改变原有排程业务判断
    if schedule.status == TimelineScheduleStatus.COMPLETED:
        try:
            from apps.visit.services.timeline_sync_service import sync_visit_from_timeline_schedule
            sync_visit_from_timeline_schedule(schedule)
        except Exception as e:
            logger.warning('排程完成后同步访视管理失败 schedule_id=%s: %s', getattr(schedule, 'id', None), e)


def _build_timeslot_snapshot_from_schedule(schedule) -> dict:
    """从排程核心 + 执行订单构建时间槽列表用快照：项目编号、项目名称、组别、样本量、督导、访视时间点、实际执行周期。"""
    first = _first_row_from_order(schedule.execution_order_upload)
    sample = _sample_total_from_first(first)
    visit_points = []
    all_dates = []
    payload = schedule.payload or {}
    for block in (payload.get('visit_blocks') or []):
        vp = (block.get('visit_point') or '').strip()
        if vp:
            visit_points.append(vp)
        for proc in (block.get('processes') or []):
            for d in (proc.get('exec_dates') or []):
                if d and isinstance(d, str) and len(d) >= 10:
                    try:
                        all_dates.append(date.fromisoformat(d[:10]))
                    except ValueError:
                        pass
    execution_period = ''
    if all_dates:
        execution_period = f"{min(all_dates).isoformat()} ~ {max(all_dates).isoformat()}"
    project_code = (first.get('项目编号') or '').strip()
    project_name = (first.get('项目名称') or first.get('项目名') or first.get('名称') or '').strip()
    if project_name == project_code:
        project_name = ''  # 避免把项目编号当项目名称写入快照
    out = {
        '项目编号': project_code,
        '项目名称': project_name,
        '组别': (schedule.research_group or '').strip(),
        '样本量': sample,
        '督导': (schedule.supervisor or '').strip(),
        '访视时间点': '，'.join(visit_points),
        '实际执行周期': execution_period,
        'personnel': payload.get('personnel') or {},
    }
    return out


@router.post('/execution-order/{order_id}/schedule-core/publish-timeline', summary='发布时间线')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def publish_timeline(request, order_id: int):
    """将排程核心状态改为时间线已发布，并同步到时间槽（TimelinePublishedPlan）。"""
    from .models import TimelineSchedule, TimelineScheduleStatus, TimelinePublishedPlan
    schedule = TimelineSchedule.objects.filter(execution_order_upload_id=order_id).first()
    if not schedule:
        return {'code': 404, 'msg': '未找到排程核心', 'data': None}
    if schedule.status != TimelineScheduleStatus.DRAFT:
        return {'code': 400, 'msg': '当前状态不可发布时间线', 'data': None}
    schedule.status = TimelineScheduleStatus.TIMELINE_PUBLISHED
    schedule.save(update_fields=['status', 'update_time'])

    # 同步到时间槽：创建或更新 TimelinePublishedPlan
    snapshot = _build_timeslot_snapshot_from_schedule(schedule)
    account = _get_account_from_request(request)
    plan, created = TimelinePublishedPlan.objects.get_or_create(
        timeline_schedule=schedule,
        defaults={
            'snapshot': snapshot,
            'source_type': 'online',
            'created_by_id': account.id if account else None,
        },
    )
    if not created:
        plan.snapshot = snapshot
        plan.save(update_fields=['snapshot', 'update_time'])
    return {'code': 200, 'msg': '时间线已发布', 'data': {'status': schedule.status}}


@router.post('/execution-order/{order_id}/schedule-core/publish-admin', summary='发布行政排程')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def publish_admin(request, order_id: int):
    """标记行政排程已发布。"""
    from .models import TimelineSchedule, TimelineScheduleStatus
    schedule = TimelineSchedule.objects.filter(execution_order_upload_id=order_id).first()
    if not schedule:
        return {'code': 404, 'msg': '未找到排程核心', 'data': None}
    if schedule.status != TimelineScheduleStatus.TIMELINE_PUBLISHED:
        return {'code': 400, 'msg': '请先发布时间线', 'data': None}
    pl = schedule.payload or {}
    visit_blocks = pl.get('visit_blocks') or []
    personnel = pl.get('personnel') or {}
    if visit_blocks and not _personnel_tab_complete(personnel.get('admin'), visit_blocks, 'admin'):
        return {'code': 400, 'msg': '行政排程：请为每个访视流程填写执行人员、备份人员、房间', 'data': None}
    schedule.admin_published = True
    _maybe_set_completed(schedule)
    schedule.save()
    _sync_timeline_published_snapshot(schedule)
    return {'code': 200, 'msg': '行政排程已发布', 'data': {'admin_published': True, 'status': schedule.status}}


@router.post('/execution-order/{order_id}/schedule-core/publish-eval', summary='发布评估排程')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def publish_eval(request, order_id: int):
    """标记评估排程已发布。"""
    from .models import TimelineSchedule, TimelineScheduleStatus
    schedule = TimelineSchedule.objects.filter(execution_order_upload_id=order_id).first()
    if not schedule:
        return {'code': 404, 'msg': '未找到排程核心', 'data': None}
    if schedule.status != TimelineScheduleStatus.TIMELINE_PUBLISHED:
        return {'code': 400, 'msg': '请先发布时间线', 'data': None}
    pl = schedule.payload or {}
    visit_blocks = pl.get('visit_blocks') or []
    personnel = pl.get('personnel') or {}
    if visit_blocks and not _personnel_tab_complete(personnel.get('eval'), visit_blocks, 'eval'):
        return {'code': 400, 'msg': '评估排程：请为每个访视流程填写执行人员、备份人员、房间', 'data': None}
    schedule.eval_published = True
    _maybe_set_completed(schedule)
    schedule.save()
    _sync_timeline_published_snapshot(schedule)
    return {'code': 200, 'msg': '评估排程已发布', 'data': {'eval_published': True, 'status': schedule.status}}


@router.post('/execution-order/{order_id}/schedule-core/publish-tech', summary='发布技术排程')
@require_permission_or_anon_in_debug('scheduling.plan.create')
def publish_tech(request, order_id: int):
    """标记技术排程已发布。"""
    from .models import TimelineSchedule, TimelineScheduleStatus
    schedule = TimelineSchedule.objects.filter(execution_order_upload_id=order_id).first()
    if not schedule:
        return {'code': 404, 'msg': '未找到排程核心', 'data': None}
    if schedule.status != TimelineScheduleStatus.TIMELINE_PUBLISHED:
        return {'code': 400, 'msg': '请先发布时间线', 'data': None}
    pl = schedule.payload or {}
    visit_blocks = pl.get('visit_blocks') or []
    personnel = pl.get('personnel') or {}
    if visit_blocks and not _personnel_tab_complete(personnel.get('tech'), visit_blocks, 'tech'):
        return {'code': 400, 'msg': '技术排程：请为每个访视流程填写执行人员、备份人员、房间', 'data': None}
    schedule.tech_published = True
    _maybe_set_completed(schedule)
    schedule.save()
    _sync_timeline_published_snapshot(schedule)
    return {'code': 200, 'msg': '技术排程已发布', 'data': {'tech_published': True, 'status': schedule.status}}


@router.post(
    '/execution-order/{order_id}/schedule-core/personnel-withdraw',
    summary='发布后撤回再编辑（最多3次）',
)
@require_permission_or_anon_in_debug('scheduling.plan.create')
def personnel_withdraw_for_reedit(request, order_id: int):
    """排程全部完成后，撤回行政/评估/技术发布标记以便再编辑；合计最多 3 次。"""
    from .models import TimelineSchedule, TimelineScheduleStatus
    schedule = TimelineSchedule.objects.filter(execution_order_upload_id=order_id).first()
    if not schedule:
        return {'code': 404, 'msg': '未找到排程核心', 'data': None}
    if schedule.status != TimelineScheduleStatus.COMPLETED:
        return {'code': 400, 'msg': '仅当排程已全部完成时可撤回再编辑', 'data': None}
    cnt = getattr(schedule, 'post_publish_edit_count', 0) or 0
    if cnt >= 3:
        return {'code': 400, 'msg': '发布后撤回再编辑次数已用尽（最多3次）', 'data': None}
    schedule.post_publish_edit_count = cnt + 1
    schedule.admin_published = False
    schedule.eval_published = False
    schedule.tech_published = False
    schedule.status = TimelineScheduleStatus.TIMELINE_PUBLISHED
    pl = dict(schedule.payload or {})
    pl['personnel_tabs_saved'] = {'admin': False, 'eval': False, 'tech': False}
    schedule.payload = _ensure_json_serializable(pl)
    schedule.save(
        update_fields=[
            'post_publish_edit_count',
            'admin_published',
            'eval_published',
            'tech_published',
            'status',
            'payload',
            'update_time',
        ]
    )
    _sync_timeline_published_snapshot(schedule)
    return {
        'code': 200,
        'msg': '已撤回，可继续编辑人员排程',
        'data': {
            'post_publish_edit_count': schedule.post_publish_edit_count,
            'status': schedule.status,
        },
    }


def _maybe_set_completed(schedule):
    """若行政/评估/技术均已发布，则 status 设为 completed。"""
    from .models import TimelineScheduleStatus
    if schedule.admin_published and schedule.eval_published and schedule.tech_published:
        schedule.status = TimelineScheduleStatus.COMPLETED


# ============================================================================
# V2：数字员工采纳排程建议（与 secretary/runtime_plane 联动）
# ============================================================================
@router.post('/plans/{plan_id}/apply-suggestion', summary='数字员工：采纳排程优化建议')
@require_permission('scheduling.plan.create')
def apply_schedule_suggestion(request, plan_id: int):
    import json
    from datetime import date as dt_date
    from datetime import time as dt_time
    from .models import SchedulePlan, ScheduleSlot

    plan = SchedulePlan.objects.filter(id=plan_id).first()
    if not plan:
        return 404, {'code': 404, 'msg': '排程计划不存在'}

    body = {}
    try:
        body = json.loads(request.body) if request.body else {}
    except Exception:
        pass

    slot_updates = body.get('slots', [])
    updated = 0
    for su in slot_updates:
        slot_id = su.get('slot_id')
        if not slot_id:
            continue
        slot = ScheduleSlot.objects.filter(id=slot_id, schedule_plan=plan).first()
        if not slot:
            continue
        if 'scheduled_date' in su and su['scheduled_date']:
            try:
                slot.scheduled_date = dt_date.fromisoformat(str(su['scheduled_date'])[:10])
            except ValueError:
                pass
        for field in ('start_time', 'end_time'):
            if field in su and su[field]:
                raw = str(su[field])
                try:
                    parts = raw.split(':')
                    if len(parts) >= 2:
                        h, m = int(parts[0]), int(parts[1])
                        setattr(slot, field, dt_time(h, m))
                except (ValueError, TypeError):
                    pass
        slot.save()
        updated += 1

    try:
        from apps.secretary.runtime_plane import create_execution_task, finalize_execution_task
        account = _get_account_from_request(request)
        bo_id = ''
        try:
            vp = getattr(plan, 'visit_plan', None)
            if vp and getattr(vp, 'protocol_id', None):
                bo_id = str(vp.protocol_id)
        except Exception:
            pass
        task_id = create_execution_task(
            runtime_type='service',
            name='apply-schedule-suggestion',
            target='scheduling.apply_schedule_suggestion',
            account_id=getattr(account, 'id', None),
            input_payload={'plan_id': plan_id, 'slots_count': updated},
            role_code='scheduling_optimizer',
            workstation_key='execution',
            business_object_type='project',
            business_object_id=bo_id,
        )
        finalize_execution_task(task_id, ok=True, output={'updated': updated})
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': {'updated': updated}}
