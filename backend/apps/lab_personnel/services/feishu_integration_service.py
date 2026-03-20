"""
实验室人员管理飞书集成服务

集成能力：
- Phase 4A: 排班→飞书日历 + 排班确认→飞书任务
- Phase 4B: 资质预警/风险告警→飞书消息卡片 + 工单派发→飞书互动卡片
- Phase 4C: 换班→飞书审批 + 培训材料→飞书知识库/云文档
"""
import os
import json
import logging
from datetime import datetime, date
from typing import Optional

from apps.hr.models import Staff
from apps.lab_personnel.models import StaffCertificate
from apps.lab_personnel.models_scheduling import ShiftSchedule, ShiftSlot
from apps.lab_personnel.models_risk import RiskAlert

logger = logging.getLogger(__name__)

FEISHU_CALENDAR_SHIFT_ID = os.getenv('FEISHU_CALENDAR_SHIFT_ID', '')


def _get_feishu_client():
    """获取飞书客户端（延迟导入避免循环引用）"""
    from libs.feishu_client import feishu_client
    return feishu_client


def _get_staff_open_id(staff: Staff) -> Optional[str]:
    """获取人员的飞书 Open ID"""
    return staff.feishu_open_id if staff.feishu_open_id else None


# ============================================================================
# Phase 4A: 排班 → 飞书日历
# ============================================================================

def sync_shift_to_calendar(shift_slot: ShiftSlot) -> Optional[str]:
    """
    排班发布后，创建飞书日历事件

    Returns:
        飞书日历事件 ID
    """
    if not FEISHU_CALENDAR_SHIFT_ID:
        logger.warning('FEISHU_CALENDAR_SHIFT_ID 未配置，跳过日历同步')
        return None

    try:
        client = _get_feishu_client()
        staff = shift_slot.staff

        shift_date = shift_slot.shift_date
        start_dt = datetime.combine(shift_date, shift_slot.start_time)
        end_dt = datetime.combine(shift_date, shift_slot.end_time)
        start_ts = int(start_dt.timestamp())
        end_ts = int(end_dt.timestamp())

        summary = f'[排班] {staff.name} - {shift_slot.project_name or "日常工作"}'
        description = (
            f'人员：{staff.name}\n'
            f'日期：{shift_date}\n'
            f'时间：{shift_slot.start_time.strftime("%H:%M")}-{shift_slot.end_time.strftime("%H:%M")}\n'
            f'计划工时：{shift_slot.planned_hours}h\n'
        )
        if shift_slot.tasks_description:
            description += f'任务：{shift_slot.tasks_description}\n'

        open_id = _get_staff_open_id(staff)
        attendee_ids = [open_id] if open_id else []

        if shift_slot.feishu_calendar_event_id:
            # 更新已有事件
            client.update_calendar_event(
                calendar_id=FEISHU_CALENDAR_SHIFT_ID,
                event_id=shift_slot.feishu_calendar_event_id,
                summary=summary,
                start_time=start_ts,
                end_time=end_ts,
                description=description,
            )
            logger.info(f'排班槽#{shift_slot.id} 日历事件已更新')
            return shift_slot.feishu_calendar_event_id
        else:
            # 创建新事件
            data = client.create_calendar_event(
                calendar_id=FEISHU_CALENDAR_SHIFT_ID,
                summary=summary,
                start_time=start_ts,
                end_time=end_ts,
                description=description,
                attendee_ids=attendee_ids,
            )
            event_id = data.get('event', {}).get('event_id', '')
            if event_id:
                shift_slot.feishu_calendar_event_id = event_id
                shift_slot.save(update_fields=['feishu_calendar_event_id', 'update_time'])
                logger.info(f'排班槽#{shift_slot.id} 日历事件已创建: {event_id}')
            return event_id

    except Exception as e:
        logger.error(f'排班槽#{shift_slot.id} 日历同步失败: {e}')
        return None


def cancel_shift_calendar(shift_slot: ShiftSlot) -> None:
    """排班取消时，删除飞书日历事件"""
    if not FEISHU_CALENDAR_SHIFT_ID or not shift_slot.feishu_calendar_event_id:
        return

    try:
        client = _get_feishu_client()
        client.delete_calendar_event(
            calendar_id=FEISHU_CALENDAR_SHIFT_ID,
            event_id=shift_slot.feishu_calendar_event_id,
        )
        shift_slot.feishu_calendar_event_id = ''
        shift_slot.save(update_fields=['feishu_calendar_event_id', 'update_time'])
        logger.info(f'排班槽#{shift_slot.id} 日历事件已删除')
    except Exception as e:
        logger.error(f'排班槽#{shift_slot.id} 日历事件删除失败: {e}')


def sync_schedule_to_calendar(schedule: ShiftSchedule) -> int:
    """发布排班计划时，批量同步所有排班槽到日历"""
    count = 0
    for slot in schedule.slots.select_related('staff').all():
        event_id = sync_shift_to_calendar(slot)
        if event_id:
            count += 1
    return count


# ============================================================================
# Phase 4A: 排班确认 → 飞书任务
# ============================================================================

def create_shift_confirm_task(shift_slot: ShiftSlot) -> Optional[str]:
    """
    排班发布后，为排班槽创建飞书确认任务

    Returns:
        飞书任务 GUID
    """
    try:
        client = _get_feishu_client()
        staff = shift_slot.staff
        open_id = _get_staff_open_id(staff)
        if not open_id:
            logger.warning(f'人员 {staff.name} 无飞书 Open ID，跳过任务创建')
            return None

        summary = f'请确认排班：{shift_slot.shift_date} {shift_slot.start_time.strftime("%H:%M")}-{shift_slot.end_time.strftime("%H:%M")}'
        description = (
            f'项目：{shift_slot.project_name or "日常工作"}\n'
            f'任务：{shift_slot.tasks_description or "无"}\n'
            f'计划工时：{shift_slot.planned_hours}h\n\n'
            f'请在飞书中确认此排班安排。'
        )

        due_dt = datetime.combine(shift_slot.shift_date, shift_slot.start_time)
        due_ts = int(due_dt.timestamp())

        data = client.create_task(
            summary=summary,
            description=description,
            due_timestamp=due_ts,
            member_open_ids=[open_id],
            extra=json.dumps({'type': 'shift_confirm', 'slot_id': shift_slot.id}),
        )

        task_guid = data.get('task', {}).get('guid', '')
        if task_guid:
            shift_slot.feishu_task_id = task_guid
            shift_slot.save(update_fields=['feishu_task_id', 'update_time'])
            logger.info(f'排班槽#{shift_slot.id} 确认任务已创建: {task_guid}')
        return task_guid

    except Exception as e:
        logger.error(f'排班槽#{shift_slot.id} 确认任务创建失败: {e}')
        return None


def create_schedule_confirm_tasks(schedule: ShiftSchedule) -> int:
    """发布排班计划时，批量创建确认任务"""
    count = 0
    for slot in schedule.slots.select_related('staff').all():
        task_id = create_shift_confirm_task(slot)
        if task_id:
            count += 1
    return count


# ============================================================================
# Phase 4B: 资质预警 → 飞书消息卡片
# ============================================================================

def send_cert_expiry_alert(cert: StaffCertificate) -> Optional[str]:
    """发送资质到期预警消息（互动卡片）"""
    try:
        client = _get_feishu_client()
        staff = cert.staff
        open_id = _get_staff_open_id(staff)
        if not open_id:
            return None

        days_left = (cert.expiry_date - date.today()).days if cert.expiry_date else 0
        urgency = '紧急' if days_left <= 7 else ('注意' if days_left <= 30 else '提醒')
        color = 'red' if days_left <= 7 else ('yellow' if days_left <= 30 else 'blue')

        card = {
            'config': {'wide_screen_mode': True},
            'header': {
                'title': {'tag': 'plain_text', 'content': f'[{urgency}] 资质到期预警'},
                'template': color,
            },
            'elements': [
                {
                    'tag': 'div',
                    'fields': [
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**人员**\n{staff.name}'}},
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**证书**\n{cert.cert_name}'}},
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**到期日**\n{cert.expiry_date}'}},
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**剩余天数**\n{days_left}天'}},
                    ],
                },
                {
                    'tag': 'action',
                    'actions': [
                        {
                            'tag': 'button',
                            'text': {'tag': 'plain_text', 'content': '查看详情'},
                            'type': 'primary',
                            'url': f'/lab-personnel/staff/{staff.id}',
                        },
                    ],
                },
            ],
        }

        data = client.send_card_message(
            receive_id=open_id,
            card=card,
        )
        message_id = data.get('message_id', '')
        logger.info(f'资质预警消息已发送给 {staff.name}: {message_id}')
        return message_id

    except Exception as e:
        logger.error(f'资质预警消息发送失败: {e}')
        return None


# ============================================================================
# Phase 4B: 风险告警 → 飞书消息
# ============================================================================

def send_risk_alert(risk: RiskAlert) -> Optional[str]:
    """发送风险告警消息"""
    try:
        client = _get_feishu_client()

        # 发送给相关人员
        if risk.related_staff:
            open_id = _get_staff_open_id(risk.related_staff)
            if not open_id:
                return None
        else:
            return None

        color_map = {'red': 'red', 'yellow': 'orange', 'blue': 'blue'}
        color = color_map.get(risk.level, 'blue')

        card = {
            'config': {'wide_screen_mode': True},
            'header': {
                'title': {'tag': 'plain_text', 'content': f'[风险预警] {risk.title}'},
                'template': color,
            },
            'elements': [
                {
                    'tag': 'div',
                    'text': {
                        'tag': 'lark_md',
                        'content': risk.description,
                    },
                },
                {
                    'tag': 'div',
                    'fields': [
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**类型**\n{risk.get_risk_type_display()}'}},
                        {'is_short': True, 'text': {'tag': 'lark_md', 'content': f'**等级**\n{risk.get_level_display()}'}},
                    ],
                },
            ],
        }

        data = client.send_card_message(
            receive_id=open_id,
            card=card,
        )
        message_id = data.get('message_id', '')
        if message_id:
            risk.feishu_message_id = message_id
            risk.save(update_fields=['feishu_message_id', 'update_time'])
        return message_id

    except Exception as e:
        logger.error(f'风险告警消息发送失败: {e}')
        return None


# ============================================================================
# Phase 4B: 排班发布通知
# ============================================================================

def send_shift_published_notification(schedule: ShiftSchedule) -> Optional[str]:
    """发布排班后发送通知给所有被排班人员"""
    try:
        client = _get_feishu_client()
        notified = 0

        for slot in schedule.slots.select_related('staff').all():
            open_id = _get_staff_open_id(slot.staff)
            if not open_id:
                continue

            text = (
                f'您的排班已发布：\n'
                f'日期：{slot.shift_date}\n'
                f'时间：{slot.start_time.strftime("%H:%M")}-{slot.end_time.strftime("%H:%M")}\n'
                f'项目：{slot.project_name or "日常工作"}\n'
                f'请及时确认。'
            )

            client.send_message(
                receive_id=open_id,
                msg_type='text',
                content=json.dumps({'text': text}),
            )
            notified += 1

        logger.info(f'排班 {schedule.week_start_date} 发布通知已发送给 {notified} 人')
        return f'notified_{notified}'

    except Exception as e:
        logger.error(f'排班发布通知发送失败: {e}')
        return None


# ============================================================================
# Phase 4B: 工单派发 → 飞书任务
# ============================================================================

def create_workorder_task(workorder_id: int, staff: Staff) -> Optional[str]:
    """工单派发后，创建飞书执行任务"""
    try:
        client = _get_feishu_client()
        open_id = _get_staff_open_id(staff)
        if not open_id:
            return None

        from apps.workorder.models import WorkOrder
        workorder = WorkOrder.objects.filter(id=workorder_id).first()
        if not workorder:
            return None

        summary = f'[工单] {workorder.title}'
        description = (
            f'工单ID：{workorder.id}\n'
            f'类型：{workorder.work_order_type}\n'
            f'描述：{workorder.description[:200]}\n'
        )

        due_ts = None
        if workorder.scheduled_date:
            due_ts = int(datetime.combine(workorder.scheduled_date, datetime.min.time()).timestamp()) + 64800

        data = client.create_task(
            summary=summary,
            description=description,
            due_timestamp=due_ts,
            member_open_ids=[open_id],
            extra=json.dumps({'type': 'workorder', 'workorder_id': workorder_id}),
        )

        task_guid = data.get('task', {}).get('guid', '')
        logger.info(f'工单#{workorder_id} 飞书任务已创建: {task_guid}')
        return task_guid

    except Exception as e:
        logger.error(f'工单#{workorder_id} 飞书任务创建失败: {e}')
        return None


# ============================================================================
# Phase 4B: 证书续期提醒任务
# ============================================================================

def create_cert_renewal_task(cert: StaffCertificate) -> Optional[str]:
    """资质到期前，创建飞书续期提醒任务"""
    try:
        client = _get_feishu_client()
        staff = cert.staff
        open_id = _get_staff_open_id(staff)
        if not open_id:
            return None

        summary = f'请续期证书：{cert.cert_name}'
        description = (
            f'证书类型：{cert.get_cert_type_display()}\n'
            f'证书编号：{cert.cert_number}\n'
            f'到期日期：{cert.expiry_date}\n'
            f'请尽快办理续期手续。'
        )

        due_ts = int(datetime.combine(cert.expiry_date, datetime.min.time()).timestamp()) if cert.expiry_date else None

        data = client.create_task(
            summary=summary,
            description=description,
            due_timestamp=due_ts,
            member_open_ids=[open_id],
            extra=json.dumps({'type': 'cert_renewal', 'cert_id': cert.id}),
        )

        task_guid = data.get('task', {}).get('guid', '')
        if task_guid:
            cert.feishu_reminder_task_id = task_guid
            cert.save(update_fields=['feishu_reminder_task_id', 'update_time'])
            logger.info(f'证书#{cert.id} 续期提醒任务已创建: {task_guid}')
        return task_guid

    except Exception as e:
        logger.error(f'证书#{cert.id} 续期提醒任务创建失败: {e}')
        return None


# ============================================================================
# Phase 4C: 换班 → 飞书审批
# ============================================================================

def create_swap_approval(swap_request) -> Optional[str]:
    """换班审批流"""
    try:
        client = _get_feishu_client()
        approval_code = os.getenv('FEISHU_APPROVAL_SHIFT_SWAP', '')
        if not approval_code:
            logger.warning('FEISHU_APPROVAL_SHIFT_SWAP 未配置，跳过审批创建')
            return None

        requester = swap_request.requester
        open_id = _get_staff_open_id(requester)
        if not open_id:
            return None

        slot = swap_request.original_slot
        form = json.dumps([
            {'id': 'requester', 'type': 'input', 'value': requester.name},
            {'id': 'target', 'type': 'input', 'value': swap_request.target_staff.name},
            {'id': 'date', 'type': 'input', 'value': str(slot.shift_date)},
            {'id': 'time', 'type': 'input', 'value': f'{slot.start_time}-{slot.end_time}'},
            {'id': 'reason', 'type': 'textarea', 'value': swap_request.reason},
        ])

        data = client.create_approval_instance(
            approval_code=approval_code,
            open_id=open_id,
            form=form,
        )

        instance_code = data.get('instance_code', '')
        if instance_code:
            swap_request.feishu_approval_instance_id = instance_code
            swap_request.save(update_fields=['feishu_approval_instance_id', 'update_time'])
            logger.info(f'换班申请#{swap_request.id} 审批已创建: {instance_code}')
        return instance_code

    except Exception as e:
        logger.error(f'换班审批创建失败: {e}')
        return None
