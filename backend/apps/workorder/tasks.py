"""
工单相关 Celery 定时任务

P4-4: 进展报告定时自动发送
"""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='apps.workorder.tasks.send_daily_progress_reports')
def send_daily_progress_reports():
    """
    每日自动发送进展报告

    遍历所有启用自动通报的项目，生成并发送日报到飞书。
    """
    from .models import AutoReportConfig
    from .services.progress_report_service import ProgressReportService

    configs = AutoReportConfig.objects.filter(enabled=True)
    sent_count = 0

    for config in configs:
        try:
            report = ProgressReportService.generate_daily_report(config.protocol_id)
            if report:
                ProgressReportService.send_to_feishu(config.protocol_id, report)
                sent_count += 1
                logger.info(f'自动通报已发送: protocol_id={config.protocol_id}')
        except Exception as e:
            logger.error(f'自动通报发送失败: protocol_id={config.protocol_id}, error={e}')

    logger.info(f'每日自动通报完成: 共 {configs.count()} 个项目, 成功 {sent_count} 个')
    return {'total': configs.count(), 'sent': sent_count}
