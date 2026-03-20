"""受试者/招募定时任务"""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='apps.subject.tasks.send_recruitment_daily_summary')
def send_recruitment_daily_summary():
    """每日 18:00 发送招募摘要"""
    try:
        from apps.subject.services.recruitment_notify import notify_daily_summary
        notify_daily_summary()
        logger.info('招募每日摘要已发送')
    except Exception as e:
        logger.error(f'招募每日摘要任务失败: {e}')
