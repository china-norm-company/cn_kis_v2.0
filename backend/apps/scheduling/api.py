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
from ninja import Router, Schema
from typing import Optional
from datetime import date, time as time_type
from apps.identity.decorators import require_permission, _get_account_from_request

from . import services as sched_services

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
@require_permission('scheduling.plan.read')
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
        'items': [_plan_to_dict(p) for p in result['items']],
        'total': result['total'],
        'page': result['page'],
        'page_size': result['page_size'],
    }}


# ============================================================================
# 时间槽查询与更新
# ============================================================================
@router.get('/slots', summary='按日期范围查询时间槽')
@require_permission('scheduling.plan.read')
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
@require_permission('scheduling.plan.create')
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


@router.post('/plans/{plan_id}/apply-suggestion', summary='数字员工：采纳排程优化建议')
@require_permission('scheduling.plan.create')
def apply_schedule_suggestion(request, plan_id: int):
    """
    数字员工流程内嵌：排程优化员生成的排程建议写入 ScheduleSlot。
    前端动作卡片点击"采纳方案"时调用。
    """
    import json
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
        for field in ('scheduled_date', 'start_time', 'end_time', 'room', 'notes'):
            if field in su:
                setattr(slot, field, su[field])
        slot.save()
        updated += 1

    try:
        from apps.secretary.runtime_plane import create_execution_task, finalize_execution_task
        account = _get_account_from_request(request)
        task_id = create_execution_task(
            runtime_type='service',
            name='apply-schedule-suggestion',
            target='scheduling.apply_schedule_suggestion',
            account_id=getattr(account, 'id', None),
            input_payload={'plan_id': plan_id, 'slots_count': updated},
            role_code='scheduling_optimizer',
            workstation_key='execution',
            business_object_type='project',
            business_object_id=str(plan.protocol_id) if hasattr(plan, 'protocol_id') else '',
        )
        finalize_execution_task(task_id, ok=True, output={'updated': updated})
    except Exception:
        pass

    return {'code': 200, 'msg': 'OK', 'data': {'updated': updated}}


@router.get('/plans/{plan_id}', summary='排程详情')
@require_permission('scheduling.plan.read')
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
