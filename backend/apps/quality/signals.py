"""
质量模块信号处理

Phase 1: Deviation/CAPA 状态变更时自动推送通知
"""
import logging

from django.db import connection, transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


def _rollback_db_if_needed() -> None:
    """PostgreSQL 等库在语句失败后可能将连接置于需回滚状态；避免影响同一请求内后续 ORM。"""
    try:
        if connection.needs_rollback():
            connection.rollback()
    except Exception:
        pass


@receiver(post_save, sender='protocol.Protocol')
def on_protocol_saved_for_supervision(sender, instance, created, **kwargs):
    """协议保存后同步项目监察行（提交后再跑，避免与 create_protocol 内后续 save 抢连接状态）。"""
    try:
        from apps.protocol.services.protocol_service import quality_manual_sidecars_deferred

        if quality_manual_sidecars_deferred.get():
            return
    except Exception:
        pass
    if getattr(instance, 'is_deleted', False):
        return
    pk = getattr(instance, 'pk', None)
    if not pk:
        return

    def _ensure_row():
        try:
            from apps.protocol.models import Protocol
            from apps.quality.services.project_supervision_service import ensure_supervision_row

            p = Protocol.objects.filter(pk=pk).first()
            if p and not getattr(p, 'is_deleted', False):
                ensure_supervision_row(p)
        except BaseException as e:
            logger.error('协议创建监察行 on_commit 失败 protocol_id=%s: %s', pk, e, exc_info=True)
            _rollback_db_if_needed()

    transaction.on_commit(_ensure_row)


@receiver(post_save, sender='protocol.Protocol')
def on_protocol_saved_for_quality_registry(sender, instance, **kwargs):
    """维周/其他工作台新建协议 → 登记质量台项目来源（项目管理页签数据源）。"""
    try:
        from apps.protocol.services.protocol_service import quality_manual_sidecars_deferred

        if quality_manual_sidecars_deferred.get():
            return
    except Exception:
        pass
    if getattr(instance, 'is_deleted', False):
        return
    pk = getattr(instance, 'pk', None)
    if not pk:
        return

    def _register():
        try:
            from apps.protocol.models import Protocol
            from apps.quality.models import QualityProjectRegistry

            p = Protocol.objects.filter(pk=pk).first()
            if not p or getattr(p, 'is_deleted', False):
                return
            pd = p.parsed_data or {}
            src = (
                QualityProjectRegistry.Source.QUALITY_MANUAL
                if isinstance(pd, dict) and pd.get('quality_origin') == 'manual_test'
                else QualityProjectRegistry.Source.WEIZHOU
            )
            QualityProjectRegistry.objects.update_or_create(
                protocol=p,
                defaults={'source': src},
            )
        except BaseException as e:
            logger.error(
                '质量台项目来源 on_commit 失败 protocol_id=%s: %s',
                pk,
                e,
                exc_info=True,
            )
            _rollback_db_if_needed()

    transaction.on_commit(_register)


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
