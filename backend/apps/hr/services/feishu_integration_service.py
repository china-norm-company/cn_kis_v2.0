"""HR飞书集成服务 - 培训日历 + GCP预警 + 评估任务"""
import logging
from datetime import datetime
from django.utils import timezone

logger = logging.getLogger(__name__)


class HRFeishuService:
    """HR飞书集成"""

    @staticmethod
    def sync_training_to_calendar(training):
        """培训安排 -> 飞书日历事件"""
        from libs.feishu_client import FeishuClient

        client = FeishuClient()
        start_dt = datetime.combine(training.start_date, datetime.min.time())
        start_ts = int(start_dt.timestamp())
        end_date = training.end_date or training.start_date
        end_dt = datetime.combine(end_date, datetime.min.time())
        end_ts = int(end_dt.timestamp()) + 3600

        try:
            from django.conf import settings

            calendar_id = getattr(settings, 'FEISHU_CALENDAR_HR_ID', None)
            if calendar_id:
                client.create_calendar_event(
                    calendar_id=calendar_id,
                    summary=f'[培训] {training.course_name}',
                    start_time=start_ts,
                    end_time=end_ts,
                    description=f'课程: {training.course_name}\n讲师: {training.trainer}\n学时: {training.hours}h',
                )
                logger.info(f'培训日历事件已创建: {training.course_name}')
        except Exception as e:
            logger.error(f'创建培训日历事件失败: {e}')

    @staticmethod
    def send_gcp_expiry_alert(staff, days_remaining):
        """GCP到期预警 -> 飞书消息卡片"""
        from apps.notification.services import send_notification

        if days_remaining <= 7:
            channel = 'feishu_urgent'
        elif days_remaining <= 30:
            channel = 'feishu_card'
        else:
            channel = 'feishu_message'

        send_notification(
            title=f'GCP证书到期预警 ({days_remaining}天)',
            content=f'{staff.name}({staff.employee_no}) 的GCP证书将于 {staff.gcp_expiry} 到期（剩余{days_remaining}天），请及时安排续证。',
            channel=channel,
            recipient_id=0,
            metadata={'staff_id': staff.id, 'days_remaining': days_remaining},
        )
        logger.info(f'GCP预警已发送: {staff.name}, 剩余{days_remaining}天')

    @staticmethod
    def create_assessment_task(assessment, assessor_open_id):
        """评估任务 -> 飞书任务"""
        from libs.feishu_task import create_workorder_task

        try:
            create_workorder_task(
                title=f'[评估] {assessment.staff_name} - {assessment.period}',
                assignee_open_id=assessor_open_id,
                description=f'请完成对 {assessment.staff_name} 的 {assessment.period} 能力评估。',
            )
            logger.info(f'评估任务已创建: {assessment.staff_name}')
        except Exception as e:
            logger.error(f'创建评估任务失败: {e}')

    @classmethod
    def check_and_send_gcp_alerts(cls):
        """批量检查GCP到期并发送预警（可被定时任务调用）"""
        from apps.hr.models import Staff

        today = timezone.now().date()
        thresholds = [90, 30, 7]

        for days in thresholds:
            target_date = today + timezone.timedelta(days=days)
            staff_list = Staff.objects.filter(
                gcp_expiry=target_date,
                gcp_status__in=['valid', 'expiring'],
            )
            for staff in staff_list:
                cls.send_gcp_expiry_alert(staff, days)
