"""
岗位定义模型 — 数字员工岗位说明书（ROLE_MATRIX 的 DB 化）。

与 DomainWorkerBlueprint（领域样板）分离：领域是技术抽象层，岗位是业务语言层。
一个岗位可映射多个 Agent/Skill，一个领域可对应多个岗位。
"""
from django.db import models


class AutomationLevel(models.TextChoices):
    """自动化等级 L1-L4"""
    L1_INFO = 'L1', 'L1 信息辅助'
    L2_ASSIST = 'L2', 'L2 助理执行'
    L3_CONTROLLED = 'L3', 'L3 受控执行'
    L4_HUMAN_CONFIRM = 'L4', 'L4 人工确认'


class WorkerRoleDefinition(models.Model):
    """岗位定义：岗位矩阵九要素 + 与 Agent/Skill 的映射"""

    role_code = models.CharField(
        '岗位编码', max_length=80, unique=True, db_index=True,
        help_text='如：customer_demand_analyst, solution_designer',
    )
    role_name = models.CharField('岗位名称', max_length=120)
    role_cluster = models.CharField(
        '岗位簇', max_length=80, blank=True, default='',
        help_text='如：客户与需求簇、项目准备与启动簇',
    )
    service_targets = models.JSONField(
        '服务对象', default=list, blank=True,
        help_text='主要服务的内部或外部角色，如 ["销售","客户经理"]',
    )
    core_scenarios = models.JSONField(
        '核心场景', default=list, blank=True,
        help_text='主要发生的业务场景',
    )
    input_contract = models.JSONField(
        '关键输入', default=list, blank=True,
        help_text='岗位依赖的数据、文档、事件',
    )
    output_contract = models.JSONField(
        '关键输出', default=list, blank=True,
        help_text='岗位交付的内容、清单、建议、状态或证据',
    )
    automation_level = models.CharField(
        '自动化等级', max_length=10, choices=AutomationLevel.choices,
        blank=True, default='',
        help_text='L1-L4',
    )
    human_confirmation_points = models.JSONField(
        '必须人工确认事项', default=list, blank=True,
        help_text='哪些动作必须人类确认',
    )
    kpi_metrics = models.JSONField(
        '价值指标', default=list, blank=True,
        help_text='如何评估岗位成效',
    )
    mapped_agent_ids = models.JSONField(
        '映射 Agent', default=list, blank=True,
        help_text='承担该岗位能力的 agent_id 列表',
    )
    mapped_skill_ids = models.JSONField(
        '映射技能', default=list, blank=True,
        help_text='该岗位可调用的 skill_id 列表',
    )
    workstation_scope = models.JSONField(
        '工作台范围', default=list, blank=True,
        help_text='该岗位可见/可用的工作台 key 列表，空表示全部',
    )
    baseline_manual_minutes = models.IntegerField(
        '人工替代基准（分钟/次）', null=True, blank=True,
        help_text='用于价值看板估算，单次执行约等于替代多少分钟人工',
    )
    enabled = models.BooleanField('启用', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_worker_role_definition'
        verbose_name = '数字员工岗位定义'
        verbose_name_plural = '数字员工岗位定义'
        ordering = ['role_cluster', 'role_code']

    def __str__(self):
        return f'{self.role_code}: {self.role_name}'


class RoleKPISnapshot(models.Model):
    """岗位 KPI 快照 — 定时固化的岗位指标，避免全量请求时现算。"""

    role_code = models.CharField('岗位编码', max_length=80, db_index=True)
    snapshot_date = models.DateField('快照日期', db_index=True)
    period_days = models.IntegerField('统计周期（天）', default=7)
    kpis = models.JSONField('指标集合', default=dict, help_text='{"metric_key": value, ...}')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_role_kpi_snapshot'
        verbose_name = '岗位 KPI 快照'
        verbose_name_plural = '岗位 KPI 快照'
        unique_together = [('role_code', 'snapshot_date', 'period_days')]
        ordering = ['-snapshot_date', 'role_code']

    def __str__(self):
        return f'{self.role_code} @ {self.snapshot_date}'
