"""质量管理定时任务"""
import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='apps.quality.tasks.check_sop_review_alerts')
def check_sop_review_alerts():
    """每日检查 SOP 即将到期复审，发送预警"""
    try:
        from apps.quality.models import SOPDocument
        from datetime import date, timedelta

        today = date.today()
        alert_threshold = today + timedelta(days=14)

        sops = SOPDocument.objects.filter(
            status='effective',
            next_review__isnull=False,
            next_review__lte=alert_threshold,
        )
        for sop in sops:
            days_left = (sop.next_review - today).days
            if days_left > 0:
                logger.info(f'SOP {sop.code} 将在 {days_left} 天后需要复审')
            else:
                logger.warning(f'SOP {sop.code} 已过复审期限 {abs(days_left)} 天')
        logger.info(f'SOP 复审检查完成，共 {sops.count()} 条需关注')
    except Exception as e:
        logger.error(f'SOP 复审检查失败: {e}')
