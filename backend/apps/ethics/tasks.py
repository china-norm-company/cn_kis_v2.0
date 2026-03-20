"""
伦理台定时任务

由 Django management command 或 celery beat 调用：
- 每日批件到期扫描 + 飞书消息预警
- 整改逾期检查 + 飞书催办
- 意见回复超期检查 + 飞书催办
- 多维表格每日增量同步
"""
import logging
from .services import notification_service
from .services import feishu_integration_service

logger = logging.getLogger(__name__)


def run_daily_ethics_checks():
    """每日伦理台定时检查（入口函数）"""
    logger.info('[伦理定时任务] 开始执行每日检查...')

    notification_service.send_expiry_warnings()
    notification_service.check_overdue_responses()
    notification_service.check_overdue_corrective_actions()

    try:
        synced = feishu_integration_service.run_daily_bitable_sync()
        logger.info(f'[伦理定时任务] 多维表格同步完成，共 {synced} 条')
    except Exception as e:
        logger.error(f'[伦理定时任务] 多维表格同步异常: {e}')

    logger.info('[伦理定时任务] 每日检查完成')
