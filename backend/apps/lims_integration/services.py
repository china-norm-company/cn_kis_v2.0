"""
LIMS 集成服务

提供与外部 LIMS 系统的数据同步能力：
- 仪器校准数据同步
- 环境监控数据同步
- 连接状态管理
- 自动重试机制
"""
import logging
from typing import Optional
from datetime import datetime, date
from django.utils import timezone
from django.db import transaction

from .models import LIMSConnection, LIMSSyncLog, SyncStatus

logger = logging.getLogger(__name__)

MAX_RETRY = 3


class LIMSService:
    """LIMS 数据同步服务"""

    @classmethod
    def get_active_connection(cls) -> Optional[LIMSConnection]:
        return LIMSConnection.objects.filter(is_active=True).first()

    @classmethod
    def check_connection(cls, connection_id: int) -> dict:
        """检查 LIMS 连接状态"""
        conn = LIMSConnection.objects.filter(id=connection_id).first()
        if not conn:
            return {'status': 'not_found', 'message': '连接不存在'}

        try:
            # 实际实现中会调用 LIMS API 的健康检查端点
            # 这里提供接口框架
            import requests
            resp = requests.get(
                f'{conn.api_base_url}/health',
                headers={'Authorization': f'ApiKey {conn.api_key}'},
                timeout=10,
            )
            if resp.status_code == 200:
                conn.status = SyncStatus.CONNECTED
                conn.save(update_fields=['status', 'update_time'])
                return {'status': 'connected', 'message': '连接正常'}
        except Exception as e:
            conn.status = SyncStatus.ERROR
            conn.save(update_fields=['status', 'update_time'])
            return {'status': 'error', 'message': str(e)}

        conn.status = SyncStatus.DISCONNECTED
        conn.save(update_fields=['status', 'update_time'])
        return {'status': 'disconnected', 'message': '无法连接'}

    @classmethod
    @transaction.atomic
    def sync_calibration_data(cls, connection_id: int) -> dict:
        """
        从 LIMS 同步仪器校准数据

        将 LIMS 中的校准记录同步到 ResourceItem 的校准日期字段。
        """
        conn = LIMSConnection.objects.filter(id=connection_id, is_active=True).first()
        if not conn:
            return {'success': False, 'message': 'LIMS连接不存在或已禁用'}

        log = LIMSSyncLog.objects.create(
            connection=conn,
            sync_type='calibration',
            status=SyncStatus.SYNCING,
        )

        try:
            # 实际实现：从 LIMS API 获取校准数据
            # calibrations = _fetch_lims_calibrations(conn)
            # for cal in calibrations:
            #     ResourceItem.objects.filter(code=cal['equipment_code']).update(
            #         last_calibration_date=cal['calibration_date'],
            #         next_calibration_date=cal['next_due_date'],
            #     )

            log.status = SyncStatus.CONNECTED
            log.records_synced = 0  # 替换为实际数量
            log.finish_time = timezone.now()
            log.save()

            conn.last_sync_at = timezone.now()
            conn.status = SyncStatus.CONNECTED
            conn.save(update_fields=['last_sync_at', 'status', 'update_time'])

            return {'success': True, 'records_synced': log.records_synced}

        except Exception as e:
            log.status = SyncStatus.ERROR
            log.error_message = str(e)
            log.retry_count += 1
            log.finish_time = timezone.now()
            log.save()

            # 自动重试
            if log.retry_count < MAX_RETRY:
                logger.warning(f'LIMS校准同步失败，将重试 ({log.retry_count}/{MAX_RETRY}): {e}')
                return cls.sync_calibration_data(connection_id)
            else:
                # 发送飞书通知
                cls._notify_sync_failure(conn, 'calibration', str(e))
                return {'success': False, 'message': str(e)}

    @classmethod
    @transaction.atomic
    def sync_environment_data(cls, connection_id: int) -> dict:
        """
        从 LIMS 同步环境监控数据

        将温湿度数据同步到 VenueEnvironmentLog。
        """
        conn = LIMSConnection.objects.filter(id=connection_id, is_active=True).first()
        if not conn:
            return {'success': False, 'message': 'LIMS连接不存在或已禁用'}

        log = LIMSSyncLog.objects.create(
            connection=conn,
            sync_type='environment',
            status=SyncStatus.SYNCING,
        )

        try:
            # 实际实现：从 LIMS API 获取环境数据
            # env_data = _fetch_lims_environment(conn)
            # for data in env_data:
            #     VenueEnvironmentLog.objects.create(...)

            log.status = SyncStatus.CONNECTED
            log.records_synced = 0
            log.finish_time = timezone.now()
            log.save()

            return {'success': True, 'records_synced': log.records_synced}

        except Exception as e:
            log.status = SyncStatus.ERROR
            log.error_message = str(e)
            log.retry_count += 1
            log.finish_time = timezone.now()
            log.save()

            if log.retry_count < MAX_RETRY:
                return cls.sync_environment_data(connection_id)
            else:
                cls._notify_sync_failure(conn, 'environment', str(e))
                return {'success': False, 'message': str(e)}

    @classmethod
    def get_sync_logs(cls, connection_id: int, limit: int = 20) -> list:
        """获取同步日志"""
        logs = LIMSSyncLog.objects.filter(connection_id=connection_id)[:limit]
        return [{
            'id': log.id,
            'sync_type': log.sync_type,
            'status': log.status,
            'records_synced': log.records_synced,
            'error_message': log.error_message,
            'retry_count': log.retry_count,
            'create_time': log.create_time.isoformat(),
            'finish_time': log.finish_time.isoformat() if log.finish_time else None,
        } for log in logs]

    @classmethod
    def _notify_sync_failure(cls, conn: LIMSConnection, sync_type: str, error: str):
        """同步失败时发送飞书通知"""
        try:
            from libs.notification import send_admin_alert
            send_admin_alert(
                title=f'LIMS 同步失败: {conn.name}',
                message=f'同步类型: {sync_type}\n错误: {error}\n重试次数已达上限({MAX_RETRY}次)',
            )
        except Exception as e:
            logger.error(f'LIMS同步失败通知发送失败: {e}')
