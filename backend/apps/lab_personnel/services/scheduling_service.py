"""
排班管理服务

封装排班计划 CRUD、时间槽管理、冲突检测、发布、确认、换班逻辑。
"""
import logging
from typing import Optional
from datetime import date, time, timedelta, datetime

from django.utils import timezone
from django.db.models import Sum

from apps.hr.models import Staff
from apps.lab_personnel.models import LabStaffProfile
from apps.lab_personnel.models_scheduling import (
    ShiftSchedule, ShiftSlot, ShiftSwapRequest,
    ShiftStatus, SlotConfirmStatus,
)

logger = logging.getLogger(__name__)


def list_schedules(page: int = 1, page_size: int = 20) -> dict:
    """排班计划列表"""
    qs = ShiftSchedule.objects.all().order_by('-week_start_date')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])
    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def create_schedule(week_start_date: date, notes: str = '', created_by_id: int = None) -> ShiftSchedule:
    """创建排班计划（自动计算周结束日期）"""
    week_end_date = week_start_date + timedelta(days=6)
    schedule = ShiftSchedule.objects.create(
        week_start_date=week_start_date,
        week_end_date=week_end_date,
        notes=notes,
        created_by_id=created_by_id,
    )
    return schedule


def get_schedule(schedule_id: int) -> Optional[ShiftSchedule]:
    """获取排班计划详情"""
    return ShiftSchedule.objects.filter(id=schedule_id).first()


def publish_schedule(schedule_id: int) -> dict:
    """发布排班计划"""
    schedule = ShiftSchedule.objects.filter(id=schedule_id).first()
    if not schedule:
        return {'success': False, 'msg': '排班计划不存在'}
    if schedule.status == ShiftStatus.PUBLISHED:
        return {'success': False, 'msg': '排班计划已发布'}
    if schedule.slots.count() == 0:
        return {'success': False, 'msg': '排班计划无时间槽，无法发布'}

    schedule.status = ShiftStatus.PUBLISHED
    schedule.published_at = timezone.now()
    schedule.save(update_fields=['status', 'published_at', 'update_time'])

    # 飞书集成：日历同步 + 确认任务 + 发布通知
    from .feishu_integration_service import (
        sync_schedule_to_calendar,
        create_schedule_confirm_tasks,
        send_shift_published_notification,
    )
    try:
        calendar_count = sync_schedule_to_calendar(schedule)
        task_count = create_schedule_confirm_tasks(schedule)
        send_shift_published_notification(schedule)
        logger.info(f'排班#{schedule_id} 飞书同步完成: 日历{calendar_count}条, 任务{task_count}条')
    except Exception as e:
        logger.error(f'排班#{schedule_id} 飞书同步失败（排班已发布）: {e}')

    return {'success': True, 'msg': 'OK', 'schedule': schedule}


def list_slots(
    schedule_id: int = None,
    staff_id: int = None,
    shift_date: date = None,
    date_from: date = None,
    date_to: date = None,
    confirm_status: str = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """排班时间槽查询"""
    qs = ShiftSlot.objects.select_related('staff', 'schedule').all()

    if schedule_id:
        qs = qs.filter(schedule_id=schedule_id)
    if staff_id:
        qs = qs.filter(staff_id=staff_id)
    if shift_date:
        qs = qs.filter(shift_date=shift_date)
    if date_from:
        qs = qs.filter(shift_date__gte=date_from)
    if date_to:
        qs = qs.filter(shift_date__lte=date_to)
    if confirm_status:
        qs = qs.filter(confirm_status=confirm_status)

    qs = qs.order_by('shift_date', 'start_time')
    total = qs.count()
    offset = (page - 1) * page_size
    items = list(qs[offset:offset + page_size])

    return {'items': items, 'total': total, 'page': page, 'page_size': page_size}


def _check_slot_conflicts(staff_id: int, shift_date: date, start_time_str: str, end_time_str: str, exclude_slot_id: int = None) -> list:
    """检测排班冲突"""
    conflicts = []
    start_time = time.fromisoformat(start_time_str)
    end_time = time.fromisoformat(end_time_str)

    # 获取人员 profile
    profile = LabStaffProfile.objects.filter(staff_id=staff_id).first()

    # 1. 时间冲突：同一人同一天有重叠时间
    existing_slots = ShiftSlot.objects.filter(
        staff_id=staff_id,
        shift_date=shift_date,
    )
    if exclude_slot_id:
        existing_slots = existing_slots.exclude(id=exclude_slot_id)

    for slot in existing_slots:
        if start_time < slot.end_time and end_time > slot.start_time:
            conflicts.append({
                'type': 'time_overlap',
                'severity': 'error',
                'message': f'与现有排班冲突：{slot.start_time.strftime("%H:%M")}-{slot.end_time.strftime("%H:%M")}',
                'existing_slot_id': slot.id,
            })

    if profile:
        # 2. 不可用日期
        unavailable = profile.unavailable_dates or []
        if shift_date.isoformat() in unavailable:
            conflicts.append({
                'type': 'unavailable_date',
                'severity': 'error',
                'message': f'{shift_date.isoformat()} 该人员不可用',
            })

        # 3. 可用工作日检查（兼职约束）
        weekday = shift_date.isoweekday()
        available_weekdays = profile.available_weekdays or [1, 2, 3, 4, 5]
        if weekday not in available_weekdays:
            conflicts.append({
                'type': 'weekday_constraint',
                'severity': 'error',
                'message': f'该人员不在可排班工作日范围内（周{weekday}）',
            })

        # 4. 单日工时上限
        from decimal import Decimal
        new_hours = Decimal(str((datetime.combine(shift_date, end_time) - datetime.combine(shift_date, start_time)).seconds / 3600))
        existing_hours = ShiftSlot.objects.filter(
            staff_id=staff_id, shift_date=shift_date,
        ).exclude(id=exclude_slot_id or 0).aggregate(
            total=Sum('planned_hours')
        )['total'] or Decimal('0')

        total_day_hours = existing_hours + new_hours
        if total_day_hours > profile.max_daily_hours:
            conflicts.append({
                'type': 'max_hours_exceeded',
                'severity': 'warning',
                'message': f'单日排班工时 {total_day_hours}h 超过上限 {profile.max_daily_hours}h',
            })

    return conflicts


def create_slot(
    schedule_id: int,
    staff_id: int,
    shift_date: date,
    start_time: str,
    end_time: str,
    planned_hours: float = None,
    project_name: str = '',
    protocol_id: int = None,
    tasks_description: str = '',
) -> dict:
    """创建排班时间槽（含冲突检测）"""
    schedule = ShiftSchedule.objects.filter(id=schedule_id).first()
    if not schedule:
        return {'success': False, 'msg': '排班计划不存在'}

    staff = Staff.objects.filter(id=staff_id, is_deleted=False).first()
    if not staff:
        return {'success': False, 'msg': '人员不存在'}

    # 冲突检测
    conflicts = _check_slot_conflicts(staff_id, shift_date, start_time, end_time)
    errors = [c for c in conflicts if c['severity'] == 'error']
    if errors:
        return {'success': False, 'msg': '排班冲突', 'conflicts': conflicts}

    # 计算工时
    st = time.fromisoformat(start_time)
    et = time.fromisoformat(end_time)
    if planned_hours is None:
        delta = datetime.combine(shift_date, et) - datetime.combine(shift_date, st)
        planned_hours = round(delta.seconds / 3600, 1)

    slot = ShiftSlot.objects.create(
        schedule=schedule,
        staff=staff,
        shift_date=shift_date,
        start_time=st,
        end_time=et,
        planned_hours=planned_hours,
        project_name=project_name,
        protocol_id=protocol_id,
        tasks_description=tasks_description,
    )

    slot = ShiftSlot.objects.select_related('staff', 'schedule').get(pk=slot.pk)
    result = {'success': True, 'msg': 'OK', 'slot': slot}
    if conflicts:
        result['warnings'] = conflicts
    return result


def update_slot(slot_id: int, **kwargs) -> dict:
    """更新排班时间槽"""
    slot = ShiftSlot.objects.select_related('staff', 'schedule').filter(id=slot_id).first()
    if not slot:
        return {'success': False, 'msg': '排班时间槽不存在'}

    for k, v in kwargs.items():
        if v is not None:
            if k in ('start_time', 'end_time') and isinstance(v, str):
                v = time.fromisoformat(v)
            if hasattr(slot, k):
                setattr(slot, k, v)
    slot.save()
    return {'success': True, 'msg': 'OK', 'slot': slot}


def delete_slot(slot_id: int) -> bool:
    """删除排班时间槽"""
    slot = ShiftSlot.objects.filter(id=slot_id).first()
    if not slot:
        return False
    slot.delete()
    return True


def confirm_slot(slot_id: int) -> dict:
    """确认排班"""
    slot = ShiftSlot.objects.select_related('staff', 'schedule').filter(id=slot_id).first()
    if not slot:
        return {'success': False, 'msg': '排班时间槽不存在'}
    if slot.confirm_status == SlotConfirmStatus.CONFIRMED:
        return {'success': False, 'msg': '排班已确认'}

    slot.confirm_status = SlotConfirmStatus.CONFIRMED
    slot.save(update_fields=['confirm_status', 'update_time'])
    return {'success': True, 'msg': 'OK', 'slot': slot}


def reject_slot(slot_id: int, reason: str = '') -> dict:
    """拒绝排班"""
    slot = ShiftSlot.objects.select_related('staff', 'schedule').filter(id=slot_id).first()
    if not slot:
        return {'success': False, 'msg': '排班时间槽不存在'}

    slot.confirm_status = SlotConfirmStatus.REJECTED
    slot.reject_reason = reason
    slot.save(update_fields=['confirm_status', 'reject_reason', 'update_time'])
    return {'success': True, 'msg': 'OK', 'slot': slot}


def detect_conflicts(schedule_id: int = None, week_start_date: date = None) -> dict:
    """检测排班冲突"""
    qs = ShiftSlot.objects.select_related('staff').all()
    if schedule_id:
        qs = qs.filter(schedule_id=schedule_id)
    if week_start_date:
        qs = qs.filter(shift_date__gte=week_start_date, shift_date__lte=week_start_date + timedelta(days=6))

    conflicts = []
    slots_by_staff_date = {}
    for slot in qs:
        key = (slot.staff_id, slot.shift_date)
        if key not in slots_by_staff_date:
            slots_by_staff_date[key] = []
        slots_by_staff_date[key].append(slot)

    for (staff_id, shift_date_val), slots in slots_by_staff_date.items():
        if len(slots) < 2:
            continue
        sorted_slots = sorted(slots, key=lambda s: s.start_time)
        for i in range(len(sorted_slots) - 1):
            for j in range(i + 1, len(sorted_slots)):
                a, b = sorted_slots[i], sorted_slots[j]
                if a.start_time < b.end_time and a.end_time > b.start_time:
                    conflicts.append({
                        'staff_id': staff_id,
                        'staff_name': a.staff.name,
                        'date': shift_date_val.isoformat(),
                        'slot_a': {'id': a.id, 'time': f'{a.start_time.strftime("%H:%M")}-{a.end_time.strftime("%H:%M")}'},
                        'slot_b': {'id': b.id, 'time': f'{b.start_time.strftime("%H:%M")}-{b.end_time.strftime("%H:%M")}'},
                        'type': 'time_overlap',
                    })

    return {'conflicts': conflicts, 'total': len(conflicts)}


def create_swap_request(
    original_slot_id: int,
    requester_id: int,
    target_staff_id: int,
    reason: str,
) -> dict:
    """创建换班申请"""
    slot = ShiftSlot.objects.filter(id=original_slot_id).first()
    if not slot:
        return {'success': False, 'msg': '排班时间槽不存在'}

    target_staff = Staff.objects.filter(id=target_staff_id, is_deleted=False).first()
    if not target_staff:
        return {'success': False, 'msg': '接替人不存在'}

    swap = ShiftSwapRequest.objects.create(
        original_slot=slot,
        requester_id=slot.staff_id,
        target_staff=target_staff,
        reason=reason,
    )

    # 飞书集成：创建换班审批流
    from .feishu_integration_service import create_swap_approval
    try:
        create_swap_approval(swap)
    except Exception as e:
        logger.error(f'换班申请#{swap.id} 飞书审批创建失败（申请已创建）: {e}')

    return {
        'success': True, 'msg': 'OK',
        'data': {
            'id': swap.id,
            'original_slot_id': swap.original_slot_id,
            'requester_id': swap.requester_id,
            'target_staff_id': swap.target_staff_id,
            'reason': swap.reason,
            'status': swap.status,
        },
    }


def approve_swap_request(swap_id: int, approved: bool = True, approved_by_id: int = None) -> dict:
    """审批换班"""
    swap = ShiftSwapRequest.objects.select_related('original_slot').filter(id=swap_id).first()
    if not swap:
        return {'success': False, 'msg': '换班申请不存在'}

    if approved:
        swap.status = 'approved'
        swap.approved_by_id = approved_by_id
        swap.save()

        # 更新原排班槽人员
        slot = swap.original_slot
        slot.staff = swap.target_staff
        slot.confirm_status = SlotConfirmStatus.PENDING
        slot.save(update_fields=['staff', 'confirm_status', 'update_time'])
    else:
        swap.status = 'rejected'
        swap.approved_by_id = approved_by_id
        swap.save()

    return {
        'success': True, 'msg': 'OK',
        'data': {
            'id': swap.id,
            'status': swap.status,
        },
    }
