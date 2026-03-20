"""
审计日志模型

符合 GCP / 21 CFR Part 11 标准。
记录所有数据变更操作，不可篡改、不可删除。
"""
from django.db import models


class AuditAction(models.TextChoices):
    CREATE = 'CREATE', '创建'
    UPDATE = 'UPDATE', '更新'
    DELETE = 'DELETE', '删除'
    LOGIN = 'LOGIN', '登录'
    LOGOUT = 'LOGOUT', '登出'
    APPROVE = 'APPROVE', '审批'
    REJECT = 'REJECT', '拒绝'
    SIGN = 'SIGN', '签名'
    EXPORT = 'EXPORT', '导出'
    VIEW = 'VIEW', '查看'


class AuditLog(models.Model):
    """审计日志（不可删除、不可修改）"""

    class Meta:
        db_table = 't_audit_log'
        verbose_name = '审计日志'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['account_id', 'create_time']),
            models.Index(fields=['action', 'create_time']),
        ]

    # 操作人
    account_id = models.IntegerField('操作人ID')
    account_name = models.CharField('操作人名称', max_length=100)
    account_type = models.CharField('操作人类型', max_length=20, blank=True, default='')

    # 操作
    action = models.CharField('操作类型', max_length=20, choices=AuditAction.choices)
    description = models.TextField('操作描述', blank=True, default='')

    # 资源
    resource_type = models.CharField('资源类型', max_length=50)
    resource_id = models.CharField('资源ID', max_length=100)
    resource_name = models.CharField('资源名称', max_length=200, blank=True, default='')

    # 变更详情
    old_value = models.JSONField('变更前', null=True, blank=True)
    new_value = models.JSONField('变更后', null=True, blank=True)
    changed_fields = models.JSONField('变更字段列表', null=True, blank=True)

    # 环境信息
    ip_address = models.GenericIPAddressField('IP地址', null=True, blank=True)
    user_agent = models.TextField('User Agent', blank=True, default='')
    request_id = models.CharField('请求ID', max_length=50, blank=True, default='')

    # 项目隔离
    project_id = models.IntegerField('项目ID', null=True, blank=True, db_index=True)

    # 时间（不可修改）
    create_time = models.DateTimeField('操作时间', auto_now_add=True)

    def __str__(self):
        return f'[{self.action}] {self.account_name} -> {self.resource_type}:{self.resource_id}'
