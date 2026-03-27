"""
质量模块信号处理

Phase 1: Deviation/CAPA 状态变更时自动推送通知
"""
import logging
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='protocol.Protocol')
def on_protocol_saved_for_supervision(sender, instance, created, **kwargs):
    """新建协议时自动创建项目监察行并写入解析得到的执行周期。"""
    try:
        if getattr(instance, 'is_deleted', False):
            return
        from apps.quality.services.project_supervision_service import ensure_supervision_row

        ensure_supervision_row(instance)
    except Exception as e:
        logger.warning('协议创建监察行失败 protocol_id=%s: %s', getattr(instance, 'id', None), e)


@receiver(post_save, sender='protocol.Protocol')
def on_protocol_saved_for_quality_registry(sender, instance, **kwargs):
    """维周/其他工作台新建协议 → 登记质量台项目来源（项目管理页签数据源，每次保存同步 parsed_data 中的 manual 标记）。"""
    try:
        if getattr(instance, 'is_deleted', False):
            return
        from apps.quality.models import QualityProjectRegistry

        pd = instance.parsed_data or {}
        src = (
            QualityProjectRegistry.Source.QUALITY_MANUAL
            if isinstance(pd, dict) and pd.get('quality_origin') == 'manual_test'
            else QualityProjectRegistry.Source.WEIZHOU
        )
        QualityProjectRegistry.objects.update_or_create(
            protocol=instance,
            defaults={'source': src},
        )
    except Exception as e:
        logger.warning(
            '质量台项目来源登记失败 protocol_id=%s: %s',
            getattr(instance, 'id', None),
            e,
        )


@receiver(post_save, sender='quality.Deviation')
def on_deviation_saved(sender, instance, created, **kwargs):
    """偏差创建或状态变更时通知 QA 经理"""
    if created:
        _notify_quality_event(
            title=f'新偏差登记: {instance.code}',
            content=f'严重度: {getattr(instance, "severity", "N/A")}\n'
                    f'描述: {getattr(instance, "description", "")[:100]}',
            source_type='deviation_created',
            source_id=instance.id,
            priority='high' if getattr(instance, 'severity', '') == 'critical' else 'normal',
        )


@receiver(post_save, sender='quality.CAPA')
def on_capa_saved(sender, instance, created, **kwargs):
    """CAPA 创建或状态变更时通知"""
    if created:
        _notify_quality_event(
            title=f'新 CAPA 创建: {getattr(instance, "title", f"CAPA#{instance.id}")}',
            content=f'类型: {getattr(instance, "capa_type", "N/A")}\n'
                    f'截止: {getattr(instance, "due_date", "N/A")}',
            source_type='capa_created',
            source_id=instance.id,
            priority='normal',
        )
    else:
        status = getattr(instance, 'status', '')
        if status == 'overdue':
            _notify_quality_event(
                title=f'CAPA 逾期: {getattr(instance, "title", f"CAPA#{instance.id}")}',
                content=f'截止日期已过，请尽快处理',
                source_type='capa_overdue',
                source_id=instance.id,
                priority='high',
            )


def _notify_quality_event(title, content, source_type, source_id, priority='normal'):
    """向 QA 管理员推送质量事件通知"""
    try:
        from apps.identity.models import Account
        from apps.notification.services import send_notification

        qa_managers = Account.objects.filter(
            role__in=['admin', 'qa_manager'],
            is_active=True,
        )
        for account in qa_managers:
            try:
                send_notification(
                    recipient_id=account.id,
                    title=title,
                    content=content,
                    channel='feishu_card',
                    priority=priority,
                    source_type=source_type,
                    source_id=source_id,
                )
            except Exception as e:
                logger.warning(f'质量通知推送失败 → {account}: {e}')
    except Exception as e:
        logger.error(f'质量通知发送失败: {e}')
