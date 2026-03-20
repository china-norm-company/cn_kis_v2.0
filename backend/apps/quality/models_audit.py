"""
审计管理模型

包含：审计计划、检查表、审计发现项
"""
from django.db import models


class AuditType(models.TextChoices):
    INTERNAL = 'internal', '内部审计'
    EXTERNAL = 'external', '外部审计'
    CLIENT = 'client', '客户审计'
    INSPECTION = 'inspection', '飞行检查'


class AuditStatus(models.TextChoices):
    PLANNED = 'planned', '计划中'
    IN_PROGRESS = 'in_progress', '执行中'
    COMPLETED = 'completed', '已完成'
    CLOSED = 'closed', '已关闭'


class FindingSeverity(models.TextChoices):
    CRITICAL = 'critical', '严重'
    MAJOR = 'major', '重大'
    MINOR = 'minor', '轻微'
    OBSERVATION = 'observation', '观察项'


class FindingStatus(models.TextChoices):
    OPEN = 'open', '开放'
    CORRECTING = 'correcting', '整改中'
    CLOSED = 'closed', '已关闭'


class QualityAudit(models.Model):
    """
    审计计划

    记录内审、外审、客户审计、飞行检查等质量审计活动。
    """

    class Meta:
        db_table = 't_quality_audit'
        verbose_name = '质量审计'
        ordering = ['-planned_date']

    code = models.CharField('审计编号', max_length=50, unique=True)
    title = models.CharField('审计名称', max_length=200)
    audit_type = models.CharField('审计类型', max_length=20, choices=AuditType.choices)
    scope = models.TextField('审计范围', blank=True, default='')
    auditor = models.CharField('审计员', max_length=100)
    auditor_org = models.CharField('审计机构', max_length=200, blank=True, default='')
    planned_date = models.DateField('计划日期')
    actual_date = models.DateField('实际日期', null=True, blank=True)
    status = models.CharField('状态', max_length=20, choices=AuditStatus.choices,
                              default=AuditStatus.PLANNED)
    checklist = models.JSONField('检查表', default=list, blank=True)
    summary = models.TextField('审计总结', blank=True, default='')

    feishu_calendar_event_id = models.CharField('飞书日历事件ID', max_length=100, blank=True, default='')

    is_deleted = models.BooleanField(default=False)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.code}: {self.title}'


# 审计发现项：与 models.py 中定义一致，避免同一 app 内重复注册导致 RuntimeError
# 迁移 0006 已创建 t_audit_finding，FK 指向 quality.Audit（t_audit）
from .models import AuditFinding  # noqa: E402, F401
