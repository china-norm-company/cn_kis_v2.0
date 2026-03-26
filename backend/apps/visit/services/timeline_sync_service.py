"""
时间槽排程 -> 访视管理 同步服务

目标：在不修改现有排程业务判断的前提下，把已完成排程的数据桥接到访视管理模型。
"""
from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional

from django.db import transaction

from apps.protocol.models import Protocol
from apps.scheduling.models import SchedulePlan, SchedulePlanStatus, ScheduleSlot, SlotStatus
from apps.visit.models import VisitNode, VisitPlan, VisitPlanStatus


def _first_row_from_order(order) -> Dict:
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


def _parse_iso_date(value: str) -> Optional[date]:
    if not value or not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    candidate = raw[:10]
    try:
        return date.fromisoformat(candidate)
    except ValueError:
        return None


def _select_block_date(block: Dict) -> Optional[date]:
    dates: List[date] = []
    for proc in (block.get('processes') or []):
        for raw in (proc.get('exec_dates') or []):
            d = _parse_iso_date(raw)
            if d:
                dates.append(d)
    if not dates:
        return None
    return min(dates)


def _resolve_protocol(project_code: str, project_name: str) -> Optional[Protocol]:
    code = (project_code or '').strip()
    title = (project_name or '').strip() or code or '自动同步协议'

    if code:
        existed = Protocol.objects.filter(code=code, is_deleted=False).first()
        if existed:
            return existed

    existed_by_title = Protocol.objects.filter(title=title, is_deleted=False).first()
    if existed_by_title:
        return existed_by_title

    # 回退：若业务库中不存在匹配协议，使用任一在库协议占位以满足 VisitPlan 外键约束。
    # 仅用于桥接展示，不改变现有排程业务逻辑。
    return Protocol.objects.filter(is_deleted=False).order_by('id').first()


@transaction.atomic
def sync_visit_from_timeline_schedule(schedule) -> Dict:
    """
    将 TimelineSchedule.payload.visit_blocks 同步到 VisitPlan/VisitNode/ScheduleSlot。
    幂等：同 execution_order_id 多次执行仅更新，不重复创建节点与时间槽。
    """
    if not schedule or not getattr(schedule, 'execution_order_upload_id', None):
        return {'ok': False, 'msg': 'schedule 无效'}

    payload = schedule.payload if isinstance(schedule.payload, dict) else {}
    visit_blocks = payload.get('visit_blocks') or []

    order = getattr(schedule, 'execution_order_upload', None)
    first = _first_row_from_order(order)
    project_code = (first.get('项目编号') or '').strip()
    project_name = (first.get('项目名称') or first.get('项目名') or '').strip()
    created_by_id = getattr(schedule, 'created_by_id', None)

    protocol = _resolve_protocol(project_code, project_name)
    if not protocol:
        return {'ok': False, 'msg': '无可用协议，无法同步访视计划'}

    plan_name = f'AUTO_SYNC_EO_{schedule.execution_order_upload_id}'
    plan_defaults = {
        'description': f'自动同步自排程核心 timeline_schedule={schedule.id}',
        'status': VisitPlanStatus.ACTIVE,
        'created_by_id': created_by_id,
    }
    visit_plan, created = VisitPlan.objects.get_or_create(
        protocol=protocol,
        name=plan_name,
        defaults=plan_defaults,
    )
    if not created and visit_plan.status != VisitPlanStatus.ACTIVE:
        visit_plan.status = VisitPlanStatus.ACTIVE
        visit_plan.save(update_fields=['status', 'update_time'])

    node_ids: List[int] = []
    node_dates: List[date] = []

    for idx, block in enumerate(visit_blocks):
        visit_point = (block.get('visit_point') or '').strip() or f'访视 {idx + 1}'
        node, _ = VisitNode.objects.get_or_create(
            plan=visit_plan,
            order=idx,
            defaults={
                'name': visit_point,
                'baseline_day': idx,
                'window_before': 0,
                'window_after': 0,
                'status': VisitPlanStatus.ACTIVE,
                'code': f'V{idx + 1}',
            },
        )
        changed = False
        if node.name != visit_point:
            node.name = visit_point
            changed = True
        if node.status != VisitPlanStatus.ACTIVE:
            node.status = VisitPlanStatus.ACTIVE
            changed = True
        if changed:
            node.save(update_fields=['name', 'status', 'update_time'])
        node_ids.append(node.id)

        slot_date = _select_block_date(block)
        if slot_date:
            node_dates.append(slot_date)

    # 清理本同步计划下已删除节点
    VisitNode.objects.filter(plan=visit_plan).exclude(id__in=node_ids).delete()

    start_date = min(node_dates) if node_dates else date.today()
    end_date = max(node_dates) if node_dates else start_date
    schedule_plan, _ = SchedulePlan.objects.get_or_create(
        visit_plan=visit_plan,
        name=f'{visit_plan.name}-AUTO',
        defaults={
            'start_date': start_date,
            'end_date': end_date,
            'status': SchedulePlanStatus.GENERATED,
            'created_by_id': created_by_id,
        },
    )
    sp_changed = False
    if schedule_plan.start_date != start_date:
        schedule_plan.start_date = start_date
        sp_changed = True
    if schedule_plan.end_date != end_date:
        schedule_plan.end_date = end_date
        sp_changed = True
    if schedule_plan.status != SchedulePlanStatus.GENERATED:
        schedule_plan.status = SchedulePlanStatus.GENERATED
        sp_changed = True
    if sp_changed:
        schedule_plan.save(update_fields=['start_date', 'end_date', 'status', 'update_time'])

    # 同步时间槽：每个节点保留 1 条主时间槽（取该访视点最早执行日）
    slot_ids: List[int] = []
    node_map = {n.id: n for n in VisitNode.objects.filter(plan=visit_plan)}
    for idx, block in enumerate(visit_blocks):
        node = next((n for n in node_map.values() if n.order == idx), None)
        if not node:
            continue
        slot_date = _select_block_date(block)
        if not slot_date:
            continue
        slot, _ = ScheduleSlot.objects.get_or_create(
            schedule_plan=schedule_plan,
            visit_node=node,
            defaults={
                'scheduled_date': slot_date,
                'status': SlotStatus.PLANNED,
            },
        )
        changed = False
        if slot.scheduled_date != slot_date:
            slot.scheduled_date = slot_date
            changed = True
        if slot.status not in (SlotStatus.PLANNED, SlotStatus.CONFIRMED, SlotStatus.COMPLETED):
            slot.status = SlotStatus.PLANNED
            changed = True
        if changed:
            slot.save(update_fields=['scheduled_date', 'status', 'update_time'])
        slot_ids.append(slot.id)

    # 清理该同步计划下多余时间槽
    ScheduleSlot.objects.filter(schedule_plan=schedule_plan).exclude(id__in=slot_ids).delete()

    return {
        'ok': True,
        'visit_plan_id': visit_plan.id,
        'schedule_plan_id': schedule_plan.id,
        'visit_node_count': len(node_ids),
        'slot_count': len(slot_ids),
    }

