"""
编排系统持久化模型

OrchestrationRun  — 编排执行记录（一次 orchestrate() 调用）
OrchestrationSubTask — 编排子任务记录
SkillExecutionLog — 技能脚本执行日志
"""
from django.db import models


class OrchestrationRun(models.Model):
    """编排执行记录"""
    task_id = models.CharField(max_length=80, unique=True, db_index=True)
    business_run_id = models.CharField(max_length=80, blank=True, default='', db_index=True)
    role_code = models.CharField(max_length=80, blank=True, default='')
    domain_code = models.CharField(max_length=80, blank=True, default='', db_index=True)
    workstation_key = models.CharField(max_length=80, blank=True, default='', db_index=True)
    business_object_type = models.CharField(max_length=80, blank=True, default='', db_index=True)
    business_object_id = models.CharField(max_length=120, blank=True, default='', db_index=True)
    account_id = models.IntegerField(db_index=True)
    query = models.TextField()
    context_json = models.JSONField(default=dict)
    status = models.CharField(
        max_length=20,
        choices=[
            ('pending', '待执行'),
            ('running', '执行中'),
            ('success', '成功'),
            ('partial', '部分成功'),
            ('failed', '失败'),
            ('pending_review', '待审核'),
            ('approved', '已批准'),
            ('rejected', '已拒绝'),
        ],
    )
    sub_task_count = models.IntegerField(default=0)
    aggregated_output = models.TextField(default='')
    duration_ms = models.IntegerField(default=0)
    errors_json = models.JSONField(default=list)
    dispatched_claws = models.JSONField(default=list)
    structured_artifacts = models.JSONField(default=dict, blank=True)
    gate_run_id = models.CharField('关联门禁运行 ID', max_length=80, blank=True, default='', db_index=True)
    checkpoint = models.JSONField('断点快照', default=dict, blank=True,
        help_text='{"completed_indices":[0,1],"phase_index":1,"sub_task_outputs":{}}')
    resumable = models.BooleanField('可恢复', default=True)
    resumed_from = models.CharField('恢复自 task_id', max_length=80, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = 'secretary'
        ordering = ['-created_at']
        verbose_name = '编排执行记录'
        verbose_name_plural = '编排执行记录'

    def __str__(self):
        return f'{self.task_id} [{self.status}]'


class OrchestrationSubTask(models.Model):
    """编排子任务记录"""
    run = models.ForeignKey(
        OrchestrationRun,
        on_delete=models.CASCADE,
        related_name='sub_tasks_set',
    )
    index = models.IntegerField()
    domain = models.CharField(max_length=50)
    agent_id = models.CharField(max_length=80)
    task_text = models.TextField()
    status = models.CharField(max_length=20)
    output = models.TextField(default='')
    error = models.TextField(default='')
    duration_ms = models.IntegerField(default=0)
    token_usage = models.JSONField(default=dict)
    retry_count = models.IntegerField(default=0)
    checkpoint_output = models.JSONField('子任务产出快照', default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'secretary'
        ordering = ['run', 'index']
        verbose_name = '编排子任务'
        verbose_name_plural = '编排子任务'

    def __str__(self):
        return f'{self.run.task_id}[{self.index}] {self.domain}'


class SkillExecutionLog(models.Model):
    """技能脚本执行日志"""
    skill_id = models.CharField(max_length=80, db_index=True)
    script_name = models.CharField(max_length=100)
    params_json = models.JSONField(default=dict)
    status = models.CharField(max_length=20)
    output_json = models.JSONField(default=dict)
    error = models.TextField(default='')
    duration_ms = models.IntegerField(default=0)
    triggered_by = models.CharField(max_length=80, default='')
    orchestration_run_id = models.CharField(max_length=80, default='', db_index=True)
    execution_task_id = models.CharField(max_length=80, default='', db_index=True)
    account_id = models.IntegerField(null=True, blank=True, db_index=True)
    data_scope = models.CharField(max_length=20, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'secretary'
        ordering = ['-created_at']
        verbose_name = '技能执行日志'
        verbose_name_plural = '技能执行日志'

    def __str__(self):
        return f'{self.skill_id}/{self.script_name} [{self.status}]'
