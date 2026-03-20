"""HR 定时任务"""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='apps.hr.tasks.check_gcp_expiry_alerts')
def check_gcp_expiry_alerts():
    """每日检查 GCP 证书到期，发送预警消息卡片"""
    try:
        from apps.hr.services.feishu_integration_service import HRFeishuService
        HRFeishuService.check_and_send_gcp_alerts()
        logger.info('GCP 证书到期检查完成')
    except Exception as e:
        logger.error(f'GCP 证书到期检查失败: {e}')
