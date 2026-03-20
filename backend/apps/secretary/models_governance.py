from django.db import models


class EvidenceGateRun(models.Model):
    """数字员工验收门禁运行记录。"""

    class GateType(models.TextChoices):
        KNOWLEDGE = 'knowledge', '专业知识'
        SCENARIO = 'scenario', '业务场景'
        LONG_CHAIN = 'long_chain', '长链运营'
        OPERATIONS = 'operations', '运营指标'
        READINESS = 'readiness', '上线准备度'

    class Status(models.TextChoices):
        PASSED = 'passed', '通过'
        FAILED = 'failed', '失败'
        WARN = 'warn', '警告'

    gate_type = models.CharField(max_length=20, choices=GateType.choices, db_index=True)
    scope = models.CharField(max_length=80, default='', db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, db_index=True)
    score = models.FloatField(default=0.0)
    summary = models.JSONField(default=dict, blank=True)
    raw_report = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_evidence_gate_run'
        verbose_name = '数字员工门禁运行'
        verbose_name_plural = '数字员工门禁运行'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['gate_type', 'scope', 'created_at']),
            models.Index(fields=['status', 'created_at']),
        ]

    def __str__(self):
        return f'{self.gate_type}/{self.scope} [{self.status}]'


class EvergreenWatchReport(models.Model):
    """持续升级哨塔的扫描结果。"""

    class WatchType(models.TextChoices):
        MODEL = 'model', '模型'
        CLAW = 'claw', 'Claw'
        PRACTICE = 'practice', '最佳实践'
        INDUSTRY = 'industry', '行业'

    watch_type = models.CharField(max_length=20, choices=WatchType.choices, db_index=True)
    source_name = models.CharField(max_length=120, db_index=True)
    source_url = models.CharField(max_length=500, blank=True, default='')
    status = models.CharField(max_length=20, default='ok')
    headline = models.CharField(max_length=255, blank=True, default='')
    findings = models.JSONField(default=dict, blank=True)
    candidates = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_evergreen_watch_report'
        verbose_name = '持续升级哨塔报告'
        verbose_name_plural = '持续升级哨塔报告'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['watch_type', 'created_at']),
            models.Index(fields=['source_name', 'created_at']),
        ]

    def __str__(self):
        return f'{self.watch_type}/{self.source_name}'


class GovernanceMetricEvent(models.Model):
    """
    治理指标事件流（路径治理等）
    用于长期趋势、版本对比与审计追溯，替代仅依赖 cache 的聚合。
    """

    class EventType(models.TextChoices):
        ROUTE_APPLIED = 'route_applied', '路径应用'
        ROUTE_SUCCESS = 'route_success', '路径成功'
        ROUTE_FAILED = 'route_failed', '路径失败'
        ROUTE_FALLBACK = 'route_fallback', '路径回退'
        MANUAL_OVERRIDE = 'manual_override', '人工覆盖'
        APPROVAL_REQUIRED = 'approval_required', '需审批'
        APPROVAL_TIMEOUT = 'approval_timeout', '审批超时'
        SCOPE_GAP = 'scope_gap', 'Scope 缺口'
        CONTEXT_GAP = 'context_gap', 'Context 缺口'
        SKILL_SUCCESS = 'skill_success', '技能成功'
        SKILL_FAILED = 'skill_failed', '技能失败'
        RUNTIME_SUCCESS = 'runtime_success', '运行时成功'
        RUNTIME_FAILED = 'runtime_failed', '运行时失败'
        FAILED_STEP = 'failed_step', '失败步骤'

    event_type = models.CharField(max_length=32, choices=EventType.choices, db_index=True)
    source = models.CharField(max_length=32, default='unknown', db_index=True)
    dimension_1 = models.CharField(max_length=120, blank=True, default='', db_index=True)
    dimension_2 = models.CharField(max_length=120, blank=True, default='')
    account_id = models.IntegerField(null=True, blank=True, db_index=True)
    workstation = models.CharField(max_length=64, blank=True, default='')
    payload = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_governance_metric_event'
        verbose_name = '治理指标事件'
        verbose_name_plural = '治理指标事件'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['event_type', 'source', 'created_at']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f'{self.event_type}/{self.source}@{self.created_at}'
