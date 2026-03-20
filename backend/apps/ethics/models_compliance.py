"""
合规检查模型 (REG002)

核心流程：
创建检查计划 → 执行检查 → 记录发现 → 关联偏差/CAPA → 验证关闭
"""
from django.db import models


class CheckType(models.TextChoices):
    INTERNAL = 'internal', '内部自查'
    EXTERNAL = 'external', '外部检查'
    JOINT = 'joint', '联合检查'
    MOCK = 'mock', '模拟检查'


class CheckStatus(models.TextChoices):
    PLANNED = 'planned', '已计划'
    IN_PROGRESS = 'in_progress', '进行中'
    COMPLETED = 'completed', '已完成'


class FindingSeverity(models.TextChoices):
    CRITICAL = 'critical', '严重'
    MAJOR = 'major', '主要'
    MINOR = 'minor', '次要'
    OBSERVATION = 'observation', '观察项'


class FindingStatus(models.TextChoices):
    OPEN = 'open', '待整改'
    IN_PROGRESS = 'in_progress', '整改中'
    CLOSED = 'closed', '已关闭'
    VERIFIED = 'verified', '已验证'


class ComplianceCheck(models.Model):
    """合规检查"""

    class Meta:
        db_table = 't_ethics_compliance_check'
        verbose_name = '合规检查'
        ordering = ['-check_date', '-create_time']
        indexes = [
            models.Index(fields=['check_type', 'status']),
            models.Index(fields=['check_no']),
        ]

    check_no = models.CharField('检查编号', max_length=50, unique=True, db_index=True)
    check_type = models.CharField(
        '检查类型', max_length=20,
        choices=CheckType.choices,
    )
    status = models.CharField(
        '状态', max_length=20,
        choices=CheckStatus.choices,
        default=CheckStatus.PLANNED,
    )

    scope = models.TextField('检查范围')
    check_date = models.DateField('检查日期', null=True, blank=True)
    completed_date = models.DateField('完成日期', null=True, blank=True)

    lead_auditor = models.CharField('主审', max_length=100, blank=True, default='')
    team_members = models.JSONField('检查组成员', default=list)

    finding_count = models.IntegerField('发现数量', default=0)
    critical_count = models.IntegerField('严重问题数', default=0)
    notes = models.TextField('备注', blank=True, default='')

    protocol = models.ForeignKey(
        'protocol.Protocol',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='compliance_checks',
        verbose_name='关联项目',
    )

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.check_no} ({self.get_status_display()})'

    def update_finding_counts(self):
        """从关联 findings 更新统计数字"""
        findings = self.findings.all()
        self.finding_count = findings.count()
        self.critical_count = findings.filter(severity=FindingSeverity.CRITICAL).count()
        self.save(update_fields=['finding_count', 'critical_count', 'update_time'])


class ComplianceFinding(models.Model):
    """合规检查发现"""

    class Meta:
        db_table = 't_ethics_compliance_finding'
        verbose_name = '合规检查发现'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['compliance_check', 'severity']),
            models.Index(fields=['status']),
            models.Index(fields=['finding_no']),
        ]

    compliance_check = models.ForeignKey(
        ComplianceCheck,
        on_delete=models.CASCADE,
        related_name='findings',
        verbose_name='关联检查',
        db_column='check_id',
    )
    finding_no = models.CharField('发现编号', max_length=50, unique=True, db_index=True)
    severity = models.CharField(
        '严重程度', max_length=20,
        choices=FindingSeverity.choices,
    )
    description = models.TextField('问题描述')
    evidence = models.TextField('证据', blank=True, default='')
    root_cause = models.TextField('根本原因', blank=True, default='')

    corrective_action = models.TextField('整改措施', blank=True, default='')
    corrective_deadline = models.DateField('整改截止日期', null=True, blank=True)
    status = models.CharField(
        '状态', max_length=20,
        choices=FindingStatus.choices,
        default=FindingStatus.OPEN,
    )

    related_deviation_id = models.IntegerField('关联偏差ID', null=True, blank=True)
    related_capa_id = models.IntegerField('关联CAPA ID', null=True, blank=True)

    verified_by = models.CharField('验证人', max_length=100, blank=True, default='')
    verified_at = models.DateTimeField('验证时间', null=True, blank=True)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.finding_no} ({self.get_severity_display()})'
