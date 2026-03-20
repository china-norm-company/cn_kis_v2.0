from django.db import models


class WorkerMemoryProfile(models.Model):
    """数字员工记忆画像。"""

    worker_code = models.CharField(max_length=80, db_index=True)
    worker_name = models.CharField(max_length=120, default='')
    domain_code = models.CharField(max_length=50, default='', db_index=True)
    account_id = models.IntegerField(null=True, blank=True, db_index=True)
    project_key = models.CharField(max_length=100, blank=True, default='', db_index=True)
    customer_key = models.CharField(max_length=100, blank=True, default='', db_index=True)
    subject_key = models.CharField(max_length=100, blank=True, default='', db_index=True)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_worker_memory_profile'
        verbose_name = '数字员工记忆画像'
        verbose_name_plural = '数字员工记忆画像'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['worker_code', 'domain_code']),
            models.Index(fields=['account_id', 'worker_code']),
        ]

    def __str__(self):
        return f'{self.worker_code} ({self.domain_code})'


class WorkerMemoryRecord(models.Model):
    """四层记忆的统一存储。"""

    class MemoryType(models.TextChoices):
        WORKING = 'working', '工作记忆'
        EPISODIC = 'episodic', '情景记忆'
        SEMANTIC = 'semantic', '语义记忆'
        KNOWLEDGE = 'knowledge', '知识记忆'
        POLICY = 'policy', '策略记忆'

    profile = models.ForeignKey(
        WorkerMemoryProfile,
        on_delete=models.CASCADE,
        related_name='memories',
        null=True,
        blank=True,
    )
    memory_type = models.CharField(max_length=20, choices=MemoryType.choices, db_index=True)
    worker_code = models.CharField(max_length=80, db_index=True)
    subject_type = models.CharField(max_length=50, default='', db_index=True)
    subject_key = models.CharField(max_length=100, default='', db_index=True)
    content = models.TextField()
    summary = models.CharField(max_length=255, blank=True, default='')
    evidence = models.JSONField(default=dict, blank=True)
    source_task_id = models.CharField(max_length=80, blank=True, default='', db_index=True)
    importance_score = models.IntegerField(default=50)
    ttl_days = models.IntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)
    is_core = models.BooleanField('核心记忆', default=False,
        help_text='核心记忆始终注入 system prompt，不受 limit 限制')
    compressed = models.BooleanField('已压缩', default=False,
        help_text='被压缩合并后标记，不再参与召回但保留供审计')
    visibility = models.CharField('可见范围', max_length=20, default='private',
        choices=[('private', '仅自己'), ('team', '协作组'), ('global', '全局')],
        db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_worker_memory_record'
        verbose_name = '数字员工记忆'
        verbose_name_plural = '数字员工记忆'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['worker_code', 'memory_type']),
            models.Index(fields=['subject_type', 'subject_key']),
            models.Index(fields=['expires_at', 'memory_type']),
            models.Index(fields=['is_core', 'worker_code']),
            models.Index(fields=['visibility', 'source_task_id']),
            models.Index(fields=['compressed', 'worker_code']),
        ]

    def __str__(self):
        return f'{self.worker_code}/{self.memory_type}/{self.subject_key}'


class WorkerPolicyUpdate(models.Model):
    """学习闭环生成的策略升级记录。"""

    class Status(models.TextChoices):
        DRAFT = 'draft', '草稿'
        EVALUATING = 'evaluating', '评测中'
        ACTIVE = 'active', '生效中'
        RETIRED = 'retired', '已退役'

    worker_code = models.CharField(max_length=80, db_index=True)
    domain_code = models.CharField(max_length=50, default='', db_index=True)
    policy_key = models.CharField(max_length=80, db_index=True)
    outcome = models.TextField(blank=True, default='')
    root_cause = models.TextField(blank=True, default='')
    better_policy = models.TextField(blank=True, default='')
    evidence = models.JSONField(default=dict, blank=True)
    replay_score = models.FloatField(default=0.0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    activated_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_worker_policy_update'
        verbose_name = '数字员工策略升级'
        verbose_name_plural = '数字员工策略升级'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['worker_code', 'policy_key']),
            models.Index(fields=['status', 'created_at']),
        ]

    def __str__(self):
        return f'{self.worker_code}/{self.policy_key} [{self.status}]'
