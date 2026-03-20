"""
排程模块信号

ScheduleSlot / SchedulePlan 变更 → 实时通知执行人和项目经理。
支撑 visit-scheduler Claw 和 scheduling-alerts Celery 任务。
"""
import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

logger = logging.getLogger('cn_kis.scheduling')


@receiver(pre_save, sender='scheduling.ScheduleSlot')
def cache_slot_old_status(sender, instance, **kwargs):
    """保存前缓存旧状态，用于变更对比"""
    if instance.pk:
        try:
            old = sender.objects.get(pk=instance.pk)
            instance._old_status = old.status
            instance._old_assigned = old.assigned_to_id
        except sender.DoesNotExist:
            instance._old_status = None
            instance._old_assigned = None
    else:
        instance._old_status = None
        instance._old_assigned = None


@receiver(post_save, sender='scheduling.ScheduleSlot')
def on_slot_changed(sender, instance, created, **kwargs):
    """
    时间槽创建或状态/执行人变更 → 推送通知

    覆盖场景：
    - 新建排程槽 → 通知执行人
    - 执行人变更 → 通知新旧执行人
    - 状态变更（取消/冲突） → 通知执行人和项目经理
    """
    old_status = getattr(instance, '_old_status', None)
    old_assigned = getattr(instance, '_old_assigned', None)

    if created:
        if instance.assigned_to_id:
            _notify_slot_event(
                title=f'新排程: {_slot_display(instance)}',
                content=f'您被分配到 {_slot_display(instance)}，日期 {instance.scheduled_date}',
                recipient_id=instance.assigned_to_id,
                slot=instance,
                priority='normal',
            )
        return

    status_changed = old_status and old_status != instance.status
    assignee_changed = old_assigned != instance.assigned_to_id

    if assignee_changed and instance.assigned_to_id:
        _notify_slot_event(
            title=f'排程变更: 您被分配到 {_slot_display(instance)}',
            content=f'日期 {instance.scheduled_date}，请查看并确认',
            recipient_id=instance.assigned_to_id,
            slot=instance,
            priority='normal',
        )
        if old_assigned:
            _notify_slot_event(
                title=f'排程变更: {_slot_display(instance)} 已重新分配',
                content=f'该时间槽已转交给其他人员',
                recipient_id=old_assigned,
                slot=instance,
                priority='low',
            )

    if status_changed:
        if instance.status in ('cancelled', 'conflict'):
            severity = 'high' if instance.status == 'conflict' else 'normal'
            label = '冲突' if instance.status == 'conflict' else '已取消'
            if instance.assigned_to_id:
                _notify_slot_event(
                    title=f'排程{label}: {_slot_display(instance)}',
                    content=f'{instance.scheduled_date} 的排程{label}' +
                            (f'，原因: {instance.conflict_reason}' if instance.conflict_reason else ''),
                    recipient_id=instance.assigned_to_id,
                    slot=instance,
                    priority=severity,
                )
            _notify_scheduling_managers(
                title=f'排程{label}: {_slot_display(instance)}',
                content=f'日期 {instance.scheduled_date}' +
                        (f'，冲突原因: {instance.conflict_reason}' if instance.conflict_reason else ''),
                slot=instance,
                priority=severity,
            )


@receiver(post_save, sender='scheduling.SchedulePlan')
def on_plan_status_changed(sender, instance, created, **kwargs):
    """排程计划发布 → 通知全体关联人员"""
    if created:
        return

    if instance.status == 'published':
        _notify_scheduling_managers(
            title=f'排程计划已发布: {instance.name}',
            content=f'{instance.start_date} ~ {instance.end_date}，时间槽已生成',
            slot=None,
            priority='normal',
            source_type='schedule_plan',
            source_id=instance.id,
        )


def _slot_display(slot):
    """时间槽的简洁展示"""
    try:
        node_name = slot.visit_node.name if slot.visit_node else '未知访视'
    except Exception:
        node_name = '未知访视'
    return node_name


def _notify_slot_event(title, content, recipient_id, slot, priority='normal'):
    """发送排程相关通知"""
    try:
        from apps.notification.services import send_notification
        send_notification(
            recipient_id=recipient_id,
            title=title,
            content=content,
            channel='feishu_card',
            priority=priority,
            source_type='schedule_slot',
            source_id=slot.id,
        )
    except Exception as e:
        logger.warning(f'排程通知发送失败: {e}')


def _notify_scheduling_managers(title, content, slot=None, priority='normal',
                                source_type='schedule_slot', source_id=None):
    """通知排程管理者（项目经理/管理员）"""
    try:
        from apps.identity.models import Account
        from apps.notification.services import send_notification

        managers = Account.objects.filter(
            role__in=['admin', 'project_manager'],
            is_active=True,
        ).values_list('id', flat=True)

        for manager_id in managers:
            send_notification(
                recipient_id=manager_id,
                title=title,
                content=content,
                channel='feishu_card',
                priority=priority,
                source_type=source_type,
                source_id=source_id or (slot.id if slot else None),
            )
    except Exception as e:
        logger.warning(f'排程管理者通知发送失败: {e}')
