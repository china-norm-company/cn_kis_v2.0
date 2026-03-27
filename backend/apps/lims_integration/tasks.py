"""
LIMS 集成 Celery 任务

设备台账等字段依赖 fetch_lims_data 注入；定时任务需显式开启环境变量，避免误连生产 LIMS。
"""
import logging
import os

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name='apps.lims_integration.tasks.sync_lims_equipment')
def sync_lims_equipment():
    """
    定时从 LIMS 采集「设备」模块并注入业务库（含名称分类、校准/核查/维护计划等）。

    环境变量 LIMS_EQUIPMENT_SYNC_ENABLED=true 时执行；否则立即返回，避免未配置环境误跑。
    """
    if os.getenv('LIMS_EQUIPMENT_SYNC_ENABLED', '').lower() != 'true':
        logger.info('sync_lims_equipment: LIMS_EQUIPMENT_SYNC_ENABLED 未开启，跳过')
        return {'skipped': True, 'reason': 'LIMS_EQUIPMENT_SYNC_ENABLED not true'}

    from django.core.management import call_command

    call_command(
        'fetch_lims_data',
        module='equipment',
        resolve_conflicts_mode='upsert',
        no_report=True,
    )
    logger.info('sync_lims_equipment: fetch_lims_data module=equipment 已完成')
    return {'ok': True}
