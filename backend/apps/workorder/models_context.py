"""
项目执行上下文模型（S5-3）

CRC在执行过程中为每个项目维护的执行上下文，包括：
- 关键要求摘要（从协议提取，CRC维护）
- 特殊注意事项
- CRC决策日志（自主决策记录及依据）
- 变更响应记录
"""
from django.db import models


class ProjectExecutionContext(models.Model):
    """
    项目执行上下文

    CRC为每个项目维护的执行要求和决策记录。
    关联 Protocol，一个项目一条上下文记录。
    """

    class Meta:
        db_table = 't_project_execution_context'
        verbose_name = '项目执行上下文'
        unique_together = ['protocol']
        indexes = [
            models.Index(fields=['protocol']),
            models.Index(fields=['updated_by']),
        ]

    protocol = models.OneToOneField(
        'protocol.Protocol', on_delete=models.CASCADE,
        related_name='execution_context', verbose_name='关联协议'
    )

    key_requirements = models.JSONField(
        '关键要求摘要', default=list, blank=True,
        help_text='[{"category": "检测要求", "content": "...", "priority": "high"}]'
    )
    special_notes = models.TextField(
        '特殊注意事项', blank=True, default='',
        help_text='CRC维护的项目特殊要求和注意事项'
    )
    execution_guidelines = models.JSONField(
        '执行指南', default=dict, blank=True,
        help_text='{"sample_handling": "...", "scheduling_notes": "..."}'
    )

    created_by = models.IntegerField('创建人 Account ID', null=True, blank=True)
    updated_by = models.IntegerField('最后更新人 Account ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'ExecutionContext Protocol#{self.protocol_id}'


class CRCDecisionLog(models.Model):
    """
    CRC决策日志

    记录CRC在项目执行过程中做出的自主决策，
    包括决策内容、依据、影响范围和结果。
    """

    class DecisionScope(models.TextChoices):
        MINOR = 'minor', '轻微（范围内自主决策）'
        MODERATE = 'moderate', '中等（需CRC主管确认）'
        MAJOR = 'major', '重大（需PM确认）'

    class Meta:
        db_table = 't_crc_decision_log'
        verbose_name = 'CRC决策日志'
        ordering = ['-decision_time']
        indexes = [
            models.Index(fields=['context']),
            models.Index(fields=['decided_by']),
            models.Index(fields=['decision_time']),
        ]

    context = models.ForeignKey(
        ProjectExecutionContext, on_delete=models.CASCADE,
        related_name='decision_logs', verbose_name='项目执行上下文'
    )
    work_order = models.ForeignKey(
        'workorder.WorkOrder', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='decision_logs',
        verbose_name='关联工单'
    )

    decision_type = models.CharField(
        '决策类型', max_length=50,
        help_text='schedule_adjustment/personnel_swap/exception_handling/process_deviation/other'
    )
    scope = models.CharField(
        '决策范围', max_length=20,
        choices=DecisionScope.choices, default=DecisionScope.MINOR
    )
    title = models.CharField('决策标题', max_length=200)
    description = models.TextField('决策内容')
    rationale = models.TextField('决策依据', blank=True, default='')
    impact = models.TextField('影响分析', blank=True, default='')
    outcome = models.TextField('决策结果', blank=True, default='')

    decided_by = models.IntegerField('决策人 Account ID')
    approved_by = models.IntegerField('审批人 Account ID', null=True, blank=True)
    decision_time = models.DateTimeField('决策时间', auto_now_add=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'Decision#{self.id}: {self.title}'


class ChangeResponseRecord(models.Model):
    """
    变更响应记录

    记录CRC对上游变更（协议变更、排程调整等）的响应。
    """

    class ResponseStatus(models.TextChoices):
        RECEIVED = 'received', '已接收'
        ASSESSING = 'assessing', '评估中'
        IMPLEMENTING = 'implementing', '执行中'
        COMPLETED = 'completed', '已完成'

    class Meta:
        db_table = 't_change_response_record'
        verbose_name = '变更响应记录'
        ordering = ['-received_at']
        indexes = [
            models.Index(fields=['context']),
            models.Index(fields=['status']),
        ]

    context = models.ForeignKey(
        ProjectExecutionContext, on_delete=models.CASCADE,
        related_name='change_responses', verbose_name='项目执行上下文'
    )

    change_source = models.CharField(
        '变更来源', max_length=50,
        help_text='protocol_amendment/schedule_adjustment/resource_change/other'
    )
    change_description = models.TextField('变更内容描述')
    impact_assessment = models.TextField('影响评估', blank=True, default='')
    response_actions = models.JSONField(
        '响应措施', default=list, blank=True,
        help_text='[{"action": "...", "assignee_id": 1, "deadline": "2026-01-01", "status": "pending"}]'
    )

    status = models.CharField(
        '响应状态', max_length=20,
        choices=ResponseStatus.choices, default=ResponseStatus.RECEIVED
    )

    received_at = models.DateTimeField('接收时间', auto_now_add=True)
    received_by = models.IntegerField('接收人 Account ID')
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'ChangeResponse#{self.id}: {self.change_source}'
