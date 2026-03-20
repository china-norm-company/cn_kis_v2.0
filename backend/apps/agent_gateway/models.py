"""
智能体网关模型

记录 AI 智能体的定义、会话和调用记录。
支持双通道：火山引擎 ARK（复杂任务）+ Kimi（轻量任务）。
"""
import uuid
from django.core.exceptions import ValidationError
from django.db import models


def generate_uuid():
    return str(uuid.uuid4())


class AgentProvider(models.TextChoices):
    """AI 服务提供商"""
    ARK = 'ark', '火山引擎 ARK'
    KIMI = 'kimi', 'Kimi (Moonshot AI)'
    DEEPSEEK = 'deepseek', 'DeepSeek（文档生成/长文本写作）'


class AgentCallStatus(models.TextChoices):
    """智能体调用状态"""
    PENDING = 'pending', '待处理'
    RUNNING = 'running', '运行中'
    SUCCESS = 'success', '成功'
    FAILED = 'failed', '失败'


class AgentTier(models.TextChoices):
    """数字员工层级（门户分组）"""
    ORCHESTRATION = 'orchestration', '编排中枢'
    DIGITAL_HUMAN = 'digital_human', '数字人'
    AGENT = 'agent', '智能体'
    ENGINE = 'engine', '自动化引擎'


class AgentDefinition(models.Model):
    """智能体定义"""

    class Meta:
        db_table = 't_agent_definition'
        verbose_name = '智能体定义'
        indexes = [
            models.Index(fields=['agent_id']),
            models.Index(fields=['is_active']),
            models.Index(fields=['tier']),
        ]

    agent_id = models.CharField(
        '智能体ID', max_length=100, unique=True, db_index=True,
        help_text='如：solution-designer, protocol-agent',
    )
    name = models.CharField('名称', max_length=200)
    description = models.TextField('描述', blank=True, default='')
    capabilities = models.JSONField(
        '能力列表', default=list,
        help_text='智能体的能力列表，如：["协议解析", "方案设计"]',
    )
    is_active = models.BooleanField('是否激活', default=True)

    # 数字员工管理扩展（中书工作台）
    role_title = models.CharField(
        '岗位名称', max_length=120, blank=True, default='',
        help_text='业务语言展示，如：协议解析专员',
    )
    tier = models.CharField(
        '层级', max_length=32, choices=AgentTier.choices,
        blank=True, default='',
        help_text='orchestration/digital_human/agent/engine',
    )
    avatar_url = models.CharField(
        '头像/图标URL', max_length=500, blank=True, default='',
    )
    phase = models.CharField(
        '成熟阶段', max_length=32, blank=True, default='',
        help_text='数字员工成熟阶段标识',
    )
    knowledge_enabled = models.BooleanField('知识库注入', default=False)
    knowledge_top_k = models.IntegerField('知识库召回条数', default=3)
    is_editable_via_ui = models.BooleanField('允许UI编辑', default=True)

    # AI 通道配置
    provider = models.CharField(
        '服务商', max_length=20, choices=AgentProvider.choices,
        default=AgentProvider.KIMI,
        help_text='ark=火山引擎(复杂任务), kimi=Kimi(轻量任务)',
    )
    model_id = models.CharField(
        '模型ID', max_length=200, blank=True, default='',
        help_text='ARK: endpoint ID (如 ep-xxx); Kimi: 模型名 (如 moonshot-v1-128k)',
    )
    system_prompt = models.TextField(
        '系统提示词', blank=True, default='',
        help_text='定义智能体角色和行为的系统提示词',
    )
    temperature = models.FloatField('温度', default=0.7, help_text='0.0-2.0，越高越随机')
    max_tokens = models.IntegerField('最大 token 数', default=4096)
    tools = models.JSONField(
        '可用工具列表', default=list, blank=True,
        help_text='Agent 可调用的工具名称列表，如 ["databus_snapshot", "knowledge_search"]',
    )

    # 治理与协作（借鉴 Paperclip 组织治理模式）
    paused = models.BooleanField('已暂停', default=False)
    paused_reason = models.CharField('暂停原因', max_length=200, blank=True, default='')
    monthly_budget_usd = models.DecimalField('月预算(USD)', max_digits=8, decimal_places=2, null=True, blank=True)
    current_month_spend_usd = models.DecimalField('当月已用(USD)', max_digits=8, decimal_places=2, default=0)
    parent_agent_id = models.CharField('上级 Agent', max_length=80, blank=True, default='',
        help_text='汇报给谁，如 orchestration-agent')
    boundaries = models.JSONField('能力边界（不做什么）', default=list, blank=True)
    escalation_targets = models.JSONField('升级目标', default=list, blank=True,
        help_text='[{"condition":"超出范围","target":"orchestration-agent"}]')

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.name}({self.agent_id}) [{self.provider}]'

    def clean(self):
        if self.temperature < 0 or self.temperature > 2:
            raise ValidationError({'temperature': '温度必须在 0-2 之间'})
        if self.max_tokens < 1:
            raise ValidationError({'max_tokens': '最大 token 数必须大于 0'})
        if self.knowledge_top_k < 1:
            raise ValidationError({'knowledge_top_k': '知识库召回条数必须大于 0'})
        if self.tools is not None and not isinstance(self.tools, list):
            raise ValidationError({'tools': 'tools 必须为数组'})
        if self.capabilities is not None and not isinstance(self.capabilities, list):
            raise ValidationError({'capabilities': 'capabilities 必须为数组'})


class AgentSession(models.Model):
    """智能体会话"""

    class Meta:
        db_table = 't_agent_session'
        verbose_name = '智能体会话'
        indexes = [
            models.Index(fields=['session_id']),
            models.Index(fields=['account_id', 'agent_id']),
            models.Index(fields=['created_at']),
        ]

    session_id = models.CharField(
        '会话ID', max_length=100, unique=True, db_index=True,
        default=generate_uuid,
    )
    account_id = models.IntegerField('账号ID', db_index=True, help_text='用户账号ID')
    agent_id = models.CharField('智能体ID', max_length=100, db_index=True)
    context = models.JSONField('上下文', default=dict, help_text='会话上下文信息')
    # 保存对话历史，用于多轮对话
    messages = models.JSONField(
        '消息历史', default=list,
        help_text='OpenAI 格式: [{"role": "user", "content": "..."}, ...]',
    )
    created_at = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.agent_id} - {self.account_id} ({self.session_id[:8]})'


class AgentCall(models.Model):
    """智能体调用记录"""

    class Meta:
        db_table = 't_agent_call'
        verbose_name = '智能体调用'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['session', 'status']),
            models.Index(fields=['agent_id', 'status']),
            models.Index(fields=['created_at']),
        ]

    session = models.ForeignKey(
        AgentSession, on_delete=models.CASCADE, related_name='calls',
        null=True, blank=True,
    )
    agent_id = models.CharField('智能体ID', max_length=100, db_index=True)
    provider = models.CharField(
        '服务商', max_length=20, choices=AgentProvider.choices,
        default=AgentProvider.KIMI,
    )
    model_id = models.CharField('模型ID', max_length=200, blank=True, default='')
    input_text = models.TextField('输入文本', blank=True, default='')
    output_text = models.TextField('输出文本', blank=True, default='')
    status = models.CharField(
        '状态', max_length=20, choices=AgentCallStatus.choices,
        default=AgentCallStatus.PENDING, db_index=True,
    )
    duration_ms = models.IntegerField('耗时（毫秒）', null=True, blank=True)
    token_usage = models.JSONField(
        'Token使用量', null=True, blank=True,
        help_text='{"prompt_tokens": 100, "completion_tokens": 200, "total_tokens": 300}',
    )
    tool_calls_log = models.JSONField(
        '工具调用记录', default=list, blank=True,
        help_text='[{"tool": "databus_snapshot", "args": {...}, "result_size": 123, "elapsed_ms": 45}]',
    )
    created_at = models.DateTimeField('创建时间', auto_now_add=True, db_index=True)

    def __str__(self):
        return f'{self.agent_id}[{self.provider}] - {self.status} ({self.created_at})'
