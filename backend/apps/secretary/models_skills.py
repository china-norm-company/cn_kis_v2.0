"""
技能定义模型 — 数字员工可调用的技能（Claw 技能）的 DB 化配置。

替代 config/claw_registry.yaml 中的 skill_definitions，支持通过 UI/API CRUD 与热更新。
"""
from django.core.exceptions import ValidationError
from django.db import models


class SkillExecutor(models.TextChoices):
    SCRIPT = 'script', '脚本'
    SERVICE = 'service', '服务'
    AGENT = 'agent', '智能体'


class SkillRiskLevel(models.TextChoices):
    LOW = 'low', '低'
    MEDIUM = 'medium', '中'
    HIGH = 'high', '高'


class SkillDefinition(models.Model):
    """技能定义：执行方式、超时、风险、审批、绑定工作台等"""

    class Meta:
        db_table = 't_skill_definition'
        verbose_name = '技能定义'
        indexes = [
            models.Index(fields=['skill_id']),
            models.Index(fields=['is_active']),
        ]

    skill_id = models.CharField(
        '技能ID', max_length=100, unique=True, db_index=True,
        help_text='如：protocol-parser, crf-validator',
    )
    display_name = models.CharField('展示名称', max_length=200, blank=True, default='')
    description = models.TextField('描述', blank=True, default='')

    executor = models.CharField(
        '执行器类型', max_length=20, choices=SkillExecutor.choices,
        default=SkillExecutor.SCRIPT,
        help_text='script | service | agent',
    )
    agent_id = models.CharField(
        '关联智能体ID', max_length=100, blank=True, default='',
        help_text='executor=agent 时必填',
    )
    script_path = models.CharField(
        '脚本路径', max_length=500, blank=True, default='',
        help_text='相对 openclaw-skills 的路径，如 protocol-parser/scripts/parse_protocol.py',
    )
    service_path = models.CharField(
        '服务模块路径', max_length=500, blank=True, default='',
        help_text='Python 模块路径，executor=service 时使用',
    )
    service_function = models.CharField(
        '服务函数名', max_length=100, blank=True, default='execute',
    )

    timeout = models.IntegerField('超时秒数', default=60)
    requires_llm = models.BooleanField('依赖大模型', default=False)
    risk_level = models.CharField(
        '风险等级', max_length=20, choices=SkillRiskLevel.choices, default=SkillRiskLevel.MEDIUM,
        help_text='low | medium | high',
    )
    requires_approval = models.BooleanField('需审批后执行', default=False)

    agent_tools = models.JSONField(
        'Agent 可用工具列表', default=list, blank=True,
        help_text='executor=agent 时，该 Agent 可调用的工具列表',
    )
    fallback_script = models.CharField(
        '降级脚本路径', max_length=500, blank=True, default='',
        help_text='Agent 失败时的备用脚本路径',
    )

    is_active = models.BooleanField('是否启用', default=True)
    bound_workstations = models.JSONField(
        '绑定工作台', default=list, blank=True,
        help_text='工作台 key 列表，如 ["secretary", "research"]',
    )
    baseline_manual_minutes = models.IntegerField(
        '人工替代基准（分钟/次）', null=True, blank=True,
        help_text='价值看板用：单次成功执行约替代多少分钟人工，空则用全局默认',
    )

    # 协作治理扩展
    required_skills = models.JSONField(
        '前置依赖技能', default=list, blank=True,
        help_text='执行前必须已完成的技能 ID 列表',
    )
    output_contract = models.JSONField(
        '输出契约', default=dict, blank=True,
        help_text='约定输出格式，如 {"fields":["demand_summary","gap_list"],"format":"json"}',
    )
    idempotent = models.BooleanField('幂等性', default=False,
        help_text='幂等技能在同一 business_run 中不重复执行',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.display_name or self.skill_id}({self.skill_id})'

    def to_registry_dict(self):
        """转为 runtime_plane / orchestration 使用的字典格式，与 YAML 结构一致"""
        return {
            'executor': self.executor,
            'agent_id': self.agent_id or '',
            'script_path': self.script_path or '',
            'service_path': self.service_path or '',
            'service_function': self.service_function or 'execute',
            'timeout': self.timeout,
            'requires_llm': self.requires_llm,
            'risk_level': self.risk_level,
            'requires_approval': self.requires_approval,
            'agent_tools': list(self.agent_tools or []),
            'fallback_script': self.fallback_script or '',
            'required_skills': list(self.required_skills or []),
            'idempotent': self.idempotent,
            'bound_workstations': list(self.bound_workstations or []),
            'domain': '',
        }


class SkillTemplate(models.Model):
    """从经验中自动提取的技能模板草稿——技能进化的候选。"""

    class Source(models.TextChoices):
        AUTO_EVOLVED = 'auto_evolved', '自动进化'
        MANUAL = 'manual', '手动创建'
        MIGRATED = 'migrated', '迁移导入'

    class Status(models.TextChoices):
        DRAFT = 'draft', '草稿'
        APPROVED = 'approved', '已批准'
        REJECTED = 'rejected', '已拒绝'

    template_id = models.CharField('模板 ID', max_length=80, unique=True, db_index=True)
    source = models.CharField('来源', max_length=20, choices=Source.choices, default=Source.AUTO_EVOLVED)
    trigger_condition = models.TextField('触发条件', blank=True, default='')
    input_format = models.JSONField('输入格式', default=dict, blank=True)
    processing_steps = models.JSONField('处理步骤', default=list, blank=True)
    output_format = models.JSONField('输出格式', default=dict, blank=True)
    confidence_score = models.FloatField('置信度', default=0.0)
    source_task_ids = models.JSONField('来源任务 ID 列表', default=list, blank=True)
    worker_code = models.CharField('来源岗位', max_length=80, blank=True, default='', db_index=True)
    skill_id_hint = models.CharField('建议技能 ID', max_length=100, blank=True, default='')
    description = models.TextField('描述', blank=True, default='')
    status = models.CharField('状态', max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    promoted_skill_id = models.CharField('已提升为技能 ID', max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = 'secretary'
        db_table = 't_skill_template'
        verbose_name = '技能进化模板'
        verbose_name_plural = '技能进化模板'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.template_id} [{self.status}]'

    def clean(self):
        if self.timeout < 1 or self.timeout > 3600:
            raise ValidationError({'timeout': '超时秒数必须在 1-3600 之间'})
        if self.executor == SkillExecutor.AGENT and not (self.agent_id or '').strip():
            raise ValidationError({'agent_id': 'executor=agent 时 agent_id 必填'})
        if self.agent_tools is not None and not isinstance(self.agent_tools, list):
            raise ValidationError({'agent_tools': 'agent_tools 必须为数组'})
        if self.bound_workstations is not None and not isinstance(self.bound_workstations, list):
            raise ValidationError({'bound_workstations': 'bound_workstations 必须为数组'})

    def to_registry_dict(self):
        """转为 runtime_plane / orchestration 使用的字典格式，与 YAML 结构一致"""
        d = {
            'executor': self.executor,
            'agent_id': self.agent_id or '',
            'script_path': self.script_path or '',
            'service_path': self.service_path or '',
            'service_function': self.service_function or 'execute',
            'timeout': self.timeout,
            'requires_llm': self.requires_llm,
            'risk_level': self.risk_level,
            'requires_approval': self.requires_approval,
            'agent_tools': list(self.agent_tools or []),
            'fallback_script': self.fallback_script or '',
        }
        return d
