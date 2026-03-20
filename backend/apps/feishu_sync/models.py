"""
飞书数据同步模型

记录飞书多维表格与后端数据库之间的同步配置和日志
"""
from django.db import models


class SyncDirection(models.TextChoices):
    """同步方向"""
    TO_FEISHU = 'to_feishu', '数据库 -> 飞书'
    FROM_FEISHU = 'from_feishu', '飞书 -> 数据库'
    BIDIRECTIONAL = 'bidirectional', '双向同步'


class SyncLogStatus(models.TextChoices):
    """同步日志状态"""
    PENDING = 'pending', '待执行'
    RUNNING = 'running', '执行中'
    SUCCESS = 'success', '成功'
    FAILED = 'failed', '失败'


class SyncConfig(models.Model):
    """同步配置"""

    class Meta:
        db_table = 't_sync_config'
        verbose_name = '同步配置'
        indexes = [
            models.Index(fields=['table_name']),
            models.Index(fields=['enabled']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['table_name', 'bitable_app_token', 'bitable_table_id'],
                name='uniq_sync_target_binding',
            ),
        ]

    # 同步目标
    table_name = models.CharField('表名', max_length=100, db_index=True, help_text='Django模型表名，如：t_subject, t_protocol')
    bitable_app_token = models.CharField('飞书多维表格App Token', max_length=100)
    bitable_table_id = models.CharField('飞书多维表格Table ID', max_length=100)
    
    # 同步方向
    direction = models.CharField('同步方向', max_length=20, choices=SyncDirection.choices, default=SyncDirection.BIDIRECTIONAL)
    
    # 字段映射（JSON格式：{"db_field": "feishu_field_id"}）
    field_mapping = models.JSONField('字段映射', default=dict, help_text='数据库字段到飞书字段的映射关系')
    unique_key_fields = models.JSONField(
        '业务唯一键字段', default=list,
        help_text='用于 from_feishu 幂等入库的字段列表，如 [\"feishu_open_id\"]',
    )
    
    # 状态
    enabled = models.BooleanField('是否启用', default=True)
    sync_interval_minutes = models.IntegerField('同步间隔（分钟）', default=60, help_text='自动同步间隔，0表示不自动同步')
    
    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    last_sync_time = models.DateTimeField('最后同步时间', null=True, blank=True)

    def __str__(self):
        return f'{self.table_name} -> {self.bitable_table_id}'


class SyncLog(models.Model):
    """同步日志"""

    class Meta:
        db_table = 't_sync_log'
        verbose_name = '同步日志'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['config', 'status']),
            models.Index(fields=['started_at']),
            models.Index(fields=['idempotency_key']),
        ]

    config = models.ForeignKey(SyncConfig, on_delete=models.CASCADE, related_name='logs')
    status = models.CharField('状态', max_length=20, choices=SyncLogStatus.choices, default=SyncLogStatus.PENDING)
    records_synced = models.IntegerField('同步记录数', default=0)
    error_message = models.TextField('错误信息', blank=True, default='')
    idempotency_key = models.CharField(
        '幂等键', max_length=120, blank=True, default='',
        help_text='单次同步请求幂等标识（可选）',
    )
    started_at = models.DateTimeField('开始时间', auto_now_add=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)

    def __str__(self):
        return f'{self.config.table_name} - {self.status} ({self.started_at})'
