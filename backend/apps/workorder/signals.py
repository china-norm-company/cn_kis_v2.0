"""
工单模块信号处理器

F1 数据变更留痕：
- InstrumentDetection 关键数据字段修改时自动写入 FieldChangeLog
- ExperimentStep.execution_data / result 修改时自动写入 FieldChangeLog
"""
import json
import logging

from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)

# 需要审计追踪的字段
DETECTION_TRACKED_FIELDS = [
    'raw_data', 'processed_data', 'result_values',
    'qc_passed', 'qc_notes', 'status',
]

STEP_TRACKED_FIELDS = [
    'execution_data', 'result', 'status', 'skip_reason',
]

# 保存 pre_save 时捕获的原值
_pre_save_state: dict = {}


def _serialize_value(value) -> str:
    """将字段值序列化为字符串，用于存入 FieldChangeLog"""
    if value is None:
        return ''
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


# ============================================================================
# InstrumentDetection 变更审计
# ============================================================================
@receiver(pre_save, sender='workorder.InstrumentDetection')
def capture_detection_pre_save(sender, instance, **kwargs):
    """在保存前捕获 InstrumentDetection 字段原值"""
    if not instance.pk:
        return
    try:
        old = sender.objects.get(pk=instance.pk)
        _pre_save_state[f'detection_{instance.pk}'] = {
            field: getattr(old, field)
            for field in DETECTION_TRACKED_FIELDS
        }
    except sender.DoesNotExist:
        pass


@receiver(post_save, sender='workorder.InstrumentDetection')
def on_detection_saved(sender, instance, created, **kwargs):
    """InstrumentDetection 保存后写入变更日志"""
    if created:
        return

    key = f'detection_{instance.pk}'
    old_state = _pre_save_state.pop(key, None)
    if not old_state:
        return

    _write_change_logs(
        model_name='InstrumentDetection',
        record_id=instance.pk,
        old_state=old_state,
        instance=instance,
        tracked_fields=DETECTION_TRACKED_FIELDS,
        changed_by_id=getattr(instance, '_changed_by_id', None),
        changed_by_name=getattr(instance, '_changed_by_name', ''),
        reason=getattr(instance, '_change_reason', ''),
    )


# ============================================================================
# ExperimentStep 变更审计
# ============================================================================
@receiver(pre_save, sender='workorder.ExperimentStep')
def capture_step_pre_save(sender, instance, **kwargs):
    """在保存前捕获 ExperimentStep 字段原值"""
    if not instance.pk:
        return
    try:
        old = sender.objects.get(pk=instance.pk)
        _pre_save_state[f'step_{instance.pk}'] = {
            field: getattr(old, field)
            for field in STEP_TRACKED_FIELDS
        }
    except sender.DoesNotExist:
        pass


@receiver(post_save, sender='workorder.ExperimentStep')
def on_step_saved(sender, instance, created, **kwargs):
    """ExperimentStep 保存后写入变更日志"""
    if created:
        return

    key = f'step_{instance.pk}'
    old_state = _pre_save_state.pop(key, None)
    if not old_state:
        return

    _write_change_logs(
        model_name='ExperimentStep',
        record_id=instance.pk,
        old_state=old_state,
        instance=instance,
        tracked_fields=STEP_TRACKED_FIELDS,
        changed_by_id=getattr(instance, '_changed_by_id', None),
        changed_by_name=getattr(instance, '_changed_by_name', ''),
        reason=getattr(instance, '_change_reason', ''),
    )


# ============================================================================
# 通用：写入 FieldChangeLog
# ============================================================================
def _write_change_logs(
    model_name: str,
    record_id: int,
    old_state: dict,
    instance,
    tracked_fields: list,
    changed_by_id=None,
    changed_by_name: str = '',
    reason: str = '',
):
    try:
        from apps.lab_personnel.models_compliance import FieldChangeLog

        logs = []
        for field in tracked_fields:
            old_val = old_state.get(field)
            new_val = getattr(instance, field, None)
            old_str = _serialize_value(old_val)
            new_str = _serialize_value(new_val)
            if old_str != new_str:
                logs.append(FieldChangeLog(
                    model_name=model_name,
                    record_id=record_id,
                    field_name=field,
                    old_value=old_str,
                    new_value=new_str,
                    changed_by_id=changed_by_id,
                    changed_by_name=changed_by_name,
                    reason=reason,
                ))

        if logs:
            FieldChangeLog.objects.bulk_create(logs)
            logger.debug(f'写入变更日志 {model_name}#{record_id}: {len(logs)} 条')
    except Exception as e:
        logger.error(f'写入 FieldChangeLog 失败: {e}')


# ============================================================================
# 工单状态变更 → 实时通知（支撑 workorder-automation Claw）
# ============================================================================
@receiver(pre_save, sender='workorder.WorkOrder')
def cache_workorder_old_status(sender, instance, **kwargs):
    """保存前缓存工单旧状态"""
    if instance.pk:
        try:
            old = sender.objects.get(pk=instance.pk)
            instance._old_wo_status = old.status
            instance._old_wo_assigned = old.assigned_to
        except sender.DoesNotExist:
            instance._old_wo_status = None
            instance._old_wo_assigned = None
    else:
        instance._old_wo_status = None
        instance._old_wo_assigned = None


@receiver(post_save, sender='workorder.WorkOrder')
def on_workorder_status_changed(sender, instance, created, **kwargs):
    """
    工单状态变更 → 推送通知

    - 新建 → 通知被分配人
    - 分配/重分配 → 通知新执行人
    - 完成/拒绝 → 通知创建人
    - 逾期检测由 Celery 定时任务处理（notification/tasks.py）
    """
    old_status = getattr(instance, '_old_wo_status', None)
    old_assigned = getattr(instance, '_old_wo_assigned', None)

    if created:
        if instance.assigned_to:
            _notify_workorder_event(
                title=f'新工单: {instance.title}',
                content=f'工单 #{instance.id}（{instance.get_status_display()}）已分配给您',
                recipient_id=instance.assigned_to,
                workorder=instance,
                priority='normal',
            )
        return

    assignee_changed = old_assigned != instance.assigned_to
    status_changed = old_status and old_status != instance.status

    if assignee_changed and instance.assigned_to:
        _notify_workorder_event(
            title=f'工单分配: {instance.title}',
            content=f'工单 #{instance.id} 已分配给您，请及时处理',
            recipient_id=instance.assigned_to,
            workorder=instance,
            priority='normal',
        )

    if status_changed:
        if instance.status in ('completed', 'approved') and instance.created_by_id:
            _notify_workorder_event(
                title=f'工单完成: {instance.title}',
                content=f'工单 #{instance.id} 已{instance.get_status_display()}',
                recipient_id=instance.created_by_id,
                workorder=instance,
                priority='low',
            )
        elif instance.status == 'rejected' and instance.created_by_id:
            _notify_workorder_event(
                title=f'工单被拒: {instance.title}',
                content=f'工单 #{instance.id} 已被拒绝，请检查并处理',
                recipient_id=instance.created_by_id,
                workorder=instance,
                priority='high',
            )


def _notify_workorder_event(title, content, recipient_id, workorder, priority='normal'):
    """发送工单相关通知"""
    try:
        from apps.notification.services import send_notification
        send_notification(
            recipient_id=recipient_id,
            title=title,
            content=content,
            channel='feishu_card',
            priority=priority,
            source_type='workorder',
            source_id=workorder.id,
        )
    except Exception as e:
        logger.warning(f'工单通知发送失败: {e}')
