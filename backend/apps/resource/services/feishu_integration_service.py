"""设备台飞书集成服务 - 校准日历 + 维护任务"""
import logging
from datetime import timedelta, datetime
from django.utils import timezone

logger = logging.getLogger(__name__)


class EquipmentFeishuService:
    """设备台飞书集成"""

    @staticmethod
    def sync_calibration_to_calendar(resource_item):
        """校准计划 -> 飞书日历事件"""
        from libs.feishu_client import FeishuClient

        client = FeishuClient()

        cal_date = getattr(
            resource_item, 'calibration_due_date', None
        ) or getattr(resource_item, 'next_calibration_date', None)
        if not cal_date:
            return

        start_dt = datetime.combine(cal_date, datetime.min.time())
        start_ts = int(start_dt.timestamp())
        end_ts = start_ts + 3600

        try:
            from django.conf import settings

            calendar_id = getattr(settings, 'FEISHU_CALENDAR_EQUIPMENT_ID', None)
            if calendar_id:
                client.create_calendar_event(
                    calendar_id=calendar_id,
                    summary=f'[校准提醒] {resource_item.name} 校准到期',
                    start_time=start_ts,
                    end_time=end_ts,
                    description=f'设备: {resource_item.name}\n编号: {resource_item.code}\n校准到期日: {cal_date}',
                )
                logger.info(f'校准日历事件已创建: {resource_item.name}')
        except Exception as e:
            logger.error(f'创建校准日历事件失败: {e}')

    @staticmethod
    def create_maintenance_task(resource_item, assigned_to_open_id, description=''):
        """维护工单 -> 飞书任务"""
        from libs.feishu_task import create_workorder_task

        try:
            create_workorder_task(
                title=f'[维护] {resource_item.name} 维护工单',
                assignee_open_id=assigned_to_open_id,
                due_date=str(timezone.now().date() + timedelta(days=7)),
                description=description
                or f'设备 {resource_item.name}({resource_item.code}) 需要维护',
            )
            logger.info(f'维护任务已创建: {resource_item.name}')
        except Exception as e:
            logger.error(f'创建维护任务失败: {e}')

    @staticmethod
    def send_calibration_expiry_alert(resource_item, days_remaining):
        """校准到期预警 -> 飞书消息"""
        from django.conf import settings
        from apps.notification.services import send_notification

        cal_date = getattr(
            resource_item, 'calibration_due_date', None
        ) or getattr(resource_item, 'next_calibration_date', None)
        recipient_id = getattr(settings, 'FEISHU_ALERT_RECIPIENT_ID', None)
        if not recipient_id:
            logger.warning('未配置 FEISHU_ALERT_RECIPIENT_ID，跳过校准预警推送')
            return
        level = (
            'urgent'
            if days_remaining <= 1
            else ('warning' if days_remaining <= 3 else 'info')
        )
        send_notification(
            recipient_id=recipient_id,
            title=f'设备校准到期预警 ({days_remaining}天)',
            content=f'设备 {resource_item.name}({resource_item.code}) 将于 {cal_date} 到期，请及时安排校准。',
            channel='feishu_card',
            source_type='equipment_calibration_alert',
            source_id=resource_item.id,
        )
