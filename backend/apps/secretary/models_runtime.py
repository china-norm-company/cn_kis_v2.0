from django.db import models


class UnifiedExecutionTask(models.Model):
    """统一执行平面的任务主表。"""

    class RuntimeType(models.TextChoices):
        ORCHESTRATION = 'orchestration', '编排'
        AGENT = 'agent', '智能体'
        CLAW = 'claw', 'Claw 技能'
        PIPELINE = 'pipeline', '流水线'
        SERVICE = 'service', '服务函数'
        SCRIPT = 'script', '脚本'

    class Status(models.TextChoices):
        SUGGESTED = 'suggested', '已建议'
        PENDING = 'pending', '待执行'
        APPROVED = 'approved', '已批准'
        RUNNING = 'running', '执行中'
        SUCCEEDED = 'succeeded', '成功'
        PARTIAL = 'partial', '部分成功'
        FAILED = 'failed', '失败'
        COMPENSATED = 'compensated', '已补偿'
        CANCELLED = 'cancelled', '已取消'

    class RiskLevel(models.TextChoices):
        LOW = 'low', '低'
        MEDIUM = 'medium', '中'
        HIGH = 'high', '高'

    task_id = models.CharField(max_length=80, unique=True, db_index=True)
    parent_task_id = models.CharField(max_length=80, blank=True, default='', db_index=True)
    business_run_id = models.CharField(max_length=80, blank=True, default='', db_index=True)
    role_code = models.CharField(max_length=80, blank=True, default='')
    domain_code = models.CharField(max_length=80, blank=True, default='', db_index=True)
    workstation_key = models.CharField(max_length=80, blank=True, default='', db_index=True)
    business_object_type = models.CharField(max_length=80, blank=True, default='')
    business_object_id = models.CharField(max_length=120, blank=True, default='', db_index=True)
    gate_run_id = models.CharField(max_length=80, blank=True, default='', db_index=True)
    runtime_type = models.CharField(max_length=20, choices=RuntimeType.choices)
    name = models.CharField(max_length=120, default='')
    target = models.CharField(max_length=120, default='', db_index=True)
    account_id = models.IntegerField(null=True, blank=True, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    risk_level = models.CharField(
        max_length=10,
        choices=RiskLevel.choices,
        default=RiskLevel.MEDIUM,
    )
    requires_approval = models.BooleanField(default=False)
    approval_status = models.CharField(max_length=20, default='')
    input_payload = models.JSONField(default=dict, blank=True)
    context_payload = models.JSONField(default=dict, blank=True)
    output_payload = models.JSONField(default=dict, blank=True)
    error_text = models.TextField(blank=True, default='')
    scope_proof = models.JSONField(default=dict, blank=True)
    compensation = models.JSONField(default=list, blank=True)
    receipt = models.JSONField(default=dict, blank=True)
    metrics = models.JSONField(default=dict, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_unified_execution_task'
        verbose_name = '统一执行任务'
        verbose_name_plural = '统一执行任务'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['runtime_type', 'status']),
            models.Index(fields=['account_id', 'created_at']),
            models.Index(fields=['target', 'created_at']),
            models.Index(fields=['parent_task_id', 'created_at']),
        ]

    def __str__(self):
        return f'{self.task_id} {self.runtime_type}/{self.target} [{self.status}]'


class UnifiedExecutionTransition(models.Model):
    """统一执行平面的状态跃迁日志。"""

    task = models.ForeignKey(
        UnifiedExecutionTask,
        on_delete=models.CASCADE,
        related_name='transitions',
    )
    from_status = models.CharField(max_length=20, default='')
    to_status = models.CharField(max_length=20)
    note = models.CharField(max_length=255, blank=True, default='')
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_unified_execution_transition'
        verbose_name = '统一执行状态跃迁'
        verbose_name_plural = '统一执行状态跃迁'
        ordering = ['task', 'created_at']
        indexes = [
            models.Index(fields=['task', 'created_at']),
            models.Index(fields=['to_status', 'created_at']),
        ]

    def __str__(self):
        return f'{self.task.task_id}: {self.from_status}->{self.to_status}'


class HandoffRecord(models.Model):
    """Agent 间任务转交记录——委派/升级/转交的标准化协议。"""

    class HandoffType(models.TextChoices):
        DELEGATE = 'delegate', '委派'
        ESCALATE = 'escalate', '升级'
        TRANSFER = 'transfer', '转交'

    class HandoffStatus(models.TextChoices):
        PENDING = 'pending', '待处理'
        ACCEPTED = 'accepted', '已接收'
        COMPLETED = 'completed', '已完成'
        REJECTED = 'rejected', '已拒绝'

    handoff_id = models.CharField('转交 ID', max_length=80, unique=True, db_index=True)
    from_agent_id = models.CharField('来源 Agent', max_length=80, db_index=True)
    to_agent_id = models.CharField('目标 Agent', max_length=80, db_index=True)
    handoff_type = models.CharField('转交类型', max_length=20, choices=HandoffType.choices)
    reason = models.TextField('转交原因')
    context_snapshot = models.JSONField('上下文快照', default=dict,
        help_text='转交时的完整上下文：原始需求、已完成步骤、待处理项')
    task_id = models.CharField('关联任务 ID', max_length=80, blank=True, default='')
    result = models.JSONField('处理结果', default=dict, blank=True)
    status = models.CharField('状态', max_length=20, choices=HandoffStatus.choices, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_handoff_record'
        verbose_name = 'Agent 转交记录'
        verbose_name_plural = 'Agent 转交记录'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.handoff_id}: {self.from_agent_id}->{self.to_agent_id} [{self.handoff_type}]'
