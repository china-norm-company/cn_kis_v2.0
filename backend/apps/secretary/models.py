"""
秘书工作台模型

- FeishuUserToken: OAuth 登录时存储的飞书 user_access_token / refresh_token
- PersonalContext: 飞书集成平台采集的个人上下文（邮件、日历、聊天、任务等）
- DashboardOverviewCache: 大模型分析结果缓存
"""
from django.db import models


class FeishuUserToken(models.Model):
    """
    飞书用户 Token 存储

    OAuth 登录时保存 user_access_token + refresh_token，
    工作台扫描飞书信息时用此 token 直接调用飞书开放平台 API，
    无需依赖 feishu-connector。

    user_access_token 有效期约 2 小时，refresh_token 有效期约 30 天。

    子衿主授权：issuer_app_id 记录签发应用，预检结果写入 granted_capabilities，
    requires_reauth 标记需重授权，last_preflight_at/last_error_code 用于可观测。
    """
    class Meta:
        db_table = 't_feishu_user_token'
        verbose_name = '飞书用户Token'
        indexes = [
            models.Index(fields=['account_id']),
            models.Index(fields=['issuer_app_id']),
            models.Index(fields=['requires_reauth']),
        ]

    account_id = models.IntegerField('账号ID', unique=True, db_index=True)
    open_id = models.CharField('飞书OpenID', max_length=100, db_index=True)
    access_token = models.TextField('User Access Token')
    refresh_token = models.TextField('Refresh Token', blank=True, default='')
    token_expires_at = models.DateTimeField('Access Token 过期时间')
    refresh_expires_at = models.DateTimeField('Refresh Token 过期时间', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    # 子衿主授权：签发来源与预检可观测
    issuer_app_id = models.CharField('签发应用 App ID', max_length=64, blank=True, default='')
    issuer_app_name = models.CharField('签发应用名称', max_length=64, blank=True, default='')
    feishu_scope = models.TextField(
        '飞书授权 Scope',
        blank=True,
        default='',
        help_text='OAuth 授权时飞书实际返回的 scope 字符串（空格分隔），'
                  '可与 DEFAULT_USER_SCOPES 对比检测缺失权限。'
                  '刷新 token 不会增加新 scope，需重新登录才能获得新增权限。',
    )
    granted_capabilities = models.JSONField(
        '预检通过的能力',
        default=dict,
        blank=True,
        help_text='预检结果字典，键：mail/im/calendar/task/wiki/docx/drive_file/minutes，值：bool',
    )
    requires_reauth = models.BooleanField('需要重授权', default=False)
    last_preflight_at = models.DateTimeField('最近预检时间', null=True, blank=True)
    last_error_code = models.CharField('最近错误码', max_length=32, blank=True, default='')

    def __str__(self):
        return f'FeishuToken(account={self.account_id}, open_id={self.open_id})'


class PersonalContext(models.Model):
    """
    个人上下文：飞书信息采集后的结构化存储

    source_type: mail | im | calendar | task | approval | doc | wiki | sheet | slide | file | group_msg | contact
    user_id: 飞书 open_id，与 Account.feishu_open_id 对应
    """
    class Meta:
        db_table = 't_personal_context'
        verbose_name = '个人上下文'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user_id', 'source_type']),
            models.Index(fields=['user_id', 'created_at']),
            models.Index(fields=['content_hash']),
            models.Index(fields=['batch_id']),
        ]

    user_id = models.CharField('飞书用户ID', max_length=100, db_index=True)
    source_type = models.CharField('来源类型', max_length=20, db_index=True)
    source_id = models.CharField('来源ID', max_length=200, blank=True, default='')
    summary = models.TextField('摘要/关键信息', blank=True, default='')
    raw_content = models.TextField('原始内容', blank=True, default='')
    metadata = models.JSONField('元数据', default=dict, blank=True)
    created_at = models.DateTimeField('采集时间', auto_now_add=True)
    # 全量迁移扩展字段
    file_path = models.CharField(
        '本地文件路径', max_length=500, blank=True, default='',
        help_text='原始文件在 /data/media/feishu_files/ 下的相对路径',
    )
    file_size = models.IntegerField('文件大小(bytes)', null=True, blank=True)
    content_hash = models.CharField(
        '内容哈希', max_length=64, blank=True, default='',
        help_text='raw_content 的 SHA-1 哈希，用于采集层去重',
    )
    batch_id = models.CharField(
        '采集批次ID', max_length=100, blank=True, default='',
        help_text='关联 FeishuMigrationBatch.batch_id，如 full-20260317',
    )


class MailSignalExternalClassification(models.TextChoices):
    EXTERNAL = 'external', '外部邮件'
    INTERNAL = 'internal', '内部邮件'
    MIXED = 'mixed', '混合线程'
    UNKNOWN = 'unknown', '未知'


class MailSignalType(models.TextChoices):
    INQUIRY = 'inquiry', '询价/合作意向'
    PROJECT_FOLLOWUP = 'project_followup', '项目执行沟通'
    COMPETITOR_PRESSURE = 'competitor_pressure', '竞品/市场压力'
    COMPLAINT = 'complaint', '投诉/强负反馈'
    RELATIONSHIP_SIGNAL = 'relationship_signal', '关系变化信号'
    INTERNAL_ADMIN = 'internal_admin', '内部行政事务'  # 评测改进：HR/财务/IT等内部邮件
    UNKNOWN = 'unknown', '未分类'


class MailSignalStatus(models.TextChoices):
    NEW = 'new', '新建'
    PARSED = 'parsed', '已解析'
    LINKED = 'linked', '已关联'
    TASKED = 'tasked', '已生成任务'
    COMPLETED = 'completed', '已完成'
    IGNORED = 'ignored', '已忽略'
    ERROR = 'error', '异常'


class MailSignalLinkType(models.TextChoices):
    CLIENT = 'client', '客户'
    CONTACT = 'contact', '联系人'
    OPPORTUNITY = 'opportunity', '商机'
    PROTOCOL = 'protocol', '协议/项目'
    ACCOUNT = 'account', '内部账号'
    TASK = 'task', '动作任务'


class MailSignalMatchMethod(models.TextChoices):
    EXACT_EMAIL = 'exact_email', '邮箱精确匹配'
    DOMAIN = 'domain', '域名匹配'
    SIGNATURE = 'signature', '签名匹配'
    THREAD = 'thread', '线程匹配'
    MANUAL = 'manual', '人工指定'


class MailSignalEvent(models.Model):
    """
    邮件业务事件：从 PersonalContext 中抽取出的可运营事件层。

    该模型不替代 PersonalContext，而是承接后续：
    - 客户/联系人/项目关联
    - 动作箱任务生成
    - 正式业务回写
    """
    class Meta:
        db_table = 't_mail_signal_event'
        verbose_name = '邮件业务事件'
        ordering = ['-received_at', '-created_at']
        indexes = [
            models.Index(fields=['account_id', 'received_at']),
            models.Index(fields=['sender_email']),
            models.Index(fields=['thread_id']),
            models.Index(fields=['status', 'is_external']),
            models.Index(fields=['mail_signal_type', 'status']),
        ]

    account_id = models.IntegerField('账号ID', db_index=True)
    source_context_id = models.BigIntegerField('来源上下文ID', null=True, blank=True, db_index=True)
    source_mail_id = models.CharField('飞书邮件ID', max_length=200, unique=True)
    thread_id = models.CharField('邮件线程ID', max_length=200, blank=True, default='', db_index=True)
    internet_message_id = models.CharField('Internet Message ID', max_length=500, blank=True, default='')
    mailbox_owner_open_id = models.CharField('邮箱拥有者OpenID', max_length=100, blank=True, default='')

    sender_email = models.CharField('发件人邮箱', max_length=200, db_index=True)
    sender_name = models.CharField('发件人姓名', max_length=200, blank=True, default='')
    sender_domain = models.CharField('发件域名', max_length=120, blank=True, default='')
    recipient_emails = models.JSONField('收件人列表', default=list, blank=True)
    cc_emails = models.JSONField('抄送列表', default=list, blank=True)

    subject = models.CharField('邮件主题', max_length=500, blank=True, default='')
    body_text = models.TextField('正文文本', blank=True, default='')
    body_preview = models.TextField('正文预览', blank=True, default='')
    sent_at = models.DateTimeField('发件时间', null=True, blank=True)
    received_at = models.DateTimeField('收件时间', null=True, blank=True, db_index=True)

    is_external = models.BooleanField('是否外部邮件', default=False, db_index=True)
    external_classification = models.CharField(
        '内外部分类',
        max_length=30,
        choices=MailSignalExternalClassification.choices,
        default=MailSignalExternalClassification.UNKNOWN,
    )
    mail_signal_type = models.CharField(
        '邮件业务类型',
        max_length=50,
        choices=MailSignalType.choices,
        default=MailSignalType.UNKNOWN,
        db_index=True,
    )
    importance_score = models.IntegerField('重要度分数', null=True, blank=True)
    sentiment_score = models.IntegerField('情绪分数', null=True, blank=True)
    urgency_score = models.IntegerField('紧急度分数', null=True, blank=True)
    confidence_score = models.IntegerField('分类置信度', null=True, blank=True)

    # 评测改进（2026-03-15）：增加业务价值评估和紧迫度，弥补系统与大模型的分析差距
    business_value = models.CharField(
        '业务价值',
        max_length=20,
        blank=True,
        default='',
        choices=[
            ('critical', '极高价值'),
            ('high', '高价值'),
            ('medium', '中等价值'),
            ('low', '低价值'),
            ('none', '无业务价值'),
        ],
        db_index=True,
    )
    urgency_level = models.CharField(
        '紧迫等级',
        max_length=20,
        blank=True,
        default='',
        choices=[
            ('critical', '紧急'),
            ('high', '较紧急'),
            ('medium', '一般'),
            ('low', '不紧急'),
        ],
    )

    extracted_entities = models.JSONField('抽取实体', default=dict, blank=True)
    extracted_people = models.JSONField('抽取人员', default=list, blank=True)
    extracted_intents = models.JSONField('抽取意图', default=list, blank=True)
    attachment_count = models.IntegerField('附件数', default=0)
    raw_payload = models.JSONField('原始邮件快照', default=dict, blank=True)
    parse_version = models.CharField('解析版本', max_length=20, default='v1')
    status = models.CharField(
        '状态',
        max_length=30,
        choices=MailSignalStatus.choices,
        default=MailSignalStatus.NEW,
        db_index=True,
    )
    error_note = models.TextField('异常说明', blank=True, default='')
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)


class MailSignalAttachment(models.Model):
    """邮件附件元数据与抽取状态。"""
    class Meta:
        db_table = 't_mail_signal_attachment'
        verbose_name = '邮件业务附件'
        ordering = ['id']
        indexes = [
            models.Index(fields=['mail_signal_event_id']),
            models.Index(fields=['extract_status']),
        ]

    mail_signal_event_id = models.BigIntegerField('邮件事件ID', db_index=True)
    attachment_id = models.CharField('附件ID', max_length=200, blank=True, default='')
    filename = models.CharField('文件名', max_length=300)
    content_type = models.CharField('MIME 类型', max_length=120, blank=True, default='')
    file_size = models.BigIntegerField('文件大小', null=True, blank=True)
    storage_uri = models.CharField('内部存储地址', max_length=500, blank=True, default='')
    extract_status = models.CharField('抽取状态', max_length=30, default='pending')
    extract_summary = models.TextField('附件提要', blank=True, default='')
    extract_entities = models.JSONField('附件抽取实体', default=dict, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)


class MailSignalLink(models.Model):
    """邮件事件与业务对象的候选/确认关联。"""
    class Meta:
        db_table = 't_mail_signal_link'
        verbose_name = '邮件事件关联'
        ordering = ['-is_primary', '-match_score', 'id']
        indexes = [
            models.Index(fields=['mail_signal_event_id', 'link_type']),
            models.Index(fields=['link_type', 'target_id']),
            models.Index(fields=['confirmed', 'match_score']),
        ]

    mail_signal_event_id = models.BigIntegerField('邮件事件ID', db_index=True)
    link_type = models.CharField('关联类型', max_length=40, choices=MailSignalLinkType.choices)
    target_id = models.BigIntegerField('目标对象ID')
    match_method = models.CharField('匹配方式', max_length=40, choices=MailSignalMatchMethod.choices)
    match_score = models.IntegerField('匹配分数', null=True, blank=True)
    is_primary = models.BooleanField('是否主关联', default=False)
    confirmed = models.BooleanField('是否确认', default=False)
    confirmed_by = models.IntegerField('确认人ID', null=True, blank=True)
    confirmed_at = models.DateTimeField('确认时间', null=True, blank=True)
    note = models.TextField('说明', blank=True, default='')
    created_at = models.DateTimeField('创建时间', auto_now_add=True)


class MailThreadSnapshot(models.Model):
    """同一线程的最近聚合上下文快照。"""
    class Meta:
        db_table = 't_mail_thread_snapshot'
        verbose_name = '邮件线程快照'
        unique_together = ['thread_id', 'account_id']
        indexes = [
            models.Index(fields=['thread_id', 'account_id']),
            models.Index(fields=['primary_client_id']),
            models.Index(fields=['primary_protocol_id']),
        ]

    thread_id = models.CharField('线程ID', max_length=200)
    account_id = models.IntegerField('账号ID', db_index=True)
    last_mail_signal_event_id = models.BigIntegerField('最近事件ID', null=True, blank=True)
    primary_client_id = models.BigIntegerField('主客户ID', null=True, blank=True)
    primary_contact_id = models.BigIntegerField('主联系人ID', null=True, blank=True)
    primary_protocol_id = models.BigIntegerField('主项目ID', null=True, blank=True)
    context_summary = models.TextField('线程摘要', blank=True, default='')
    last_signal_type = models.CharField(
        '最近信号类型',
        max_length=50,
        choices=MailSignalType.choices,
        default=MailSignalType.UNKNOWN,
    )
    last_sentiment_score = models.IntegerField('最近情绪分数', null=True, blank=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)


class DashboardOverviewCache(models.Model):
    """
    工作台总览缓存：大模型分析结果的缓存，减少重复调用
    """
    class Meta:
        db_table = 't_dashboard_overview_cache'
        verbose_name = '工作台总览缓存'
        unique_together = ['account_id', 'cache_type']
        indexes = [
            models.Index(fields=['account_id', 'cache_type']),
        ]

    class CacheType(models.TextChoices):
        FEISHU_SCAN = 'feishu_scan', '飞书信息扫描'
        PROJECT_ANALYSIS = 'project_analysis', '项目客户分析'
        HOT_TOPICS = 'hot_topics', '热点话题'

    account_id = models.IntegerField('账号ID', db_index=True)
    cache_type = models.CharField('缓存类型', max_length=30, choices=CacheType.choices)
    content = models.JSONField('缓存内容')
    expires_at = models.DateTimeField('过期时间')
    created_at = models.DateTimeField('创建时间', auto_now_add=True)


class AssistantContextSnapshot(models.Model):
    """
    子衿上下文快照（P1）

    基于当前账号权限与数据范围聚合出的只读上下文，用于后续摘要生成和动作编排。
    """
    class Meta:
        db_table = 't_assistant_context_snapshot'
        verbose_name = '子衿上下文快照'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['account_id', 'created_at']),
            models.Index(fields=['account_id', 'expires_at']),
        ]

    account_id = models.IntegerField('账号ID', db_index=True)
    time_range = models.CharField('时间范围', max_length=20, default='7d')
    permission_snapshot = models.JSONField('权限快照', default=dict)
    scope_snapshot = models.JSONField('数据范围快照', default=dict)
    context_payload = models.JSONField('上下文数据', default=dict)
    source_trace = models.JSONField('来源追踪', default=list, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    expires_at = models.DateTimeField('过期时间')


class AssistantSummaryDraft(models.Model):
    """
    子衿摘要草稿（P1）
    """
    class Meta:
        db_table = 't_assistant_summary_draft'
        verbose_name = '子衿摘要草稿'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['account_id', 'summary_type']),
            models.Index(fields=['context_snapshot_id']),
        ]

    account_id = models.IntegerField('账号ID', db_index=True)
    summary_type = models.CharField('摘要类型', max_length=30, default='daily')
    context_snapshot_id = models.BigIntegerField('上下文快照ID', db_index=True)
    content_markdown = models.TextField('摘要正文', blank=True, default='')
    highlights = models.JSONField('关键结论', default=list, blank=True)
    risk_points = models.JSONField('风险点', default=list, blank=True)
    suggested_actions = models.JSONField('建议动作', default=list, blank=True)
    model_provider = models.CharField('模型提供方', max_length=50, default='kimi')
    model_id = models.CharField('模型ID', max_length=100, default='moonshot-v1-32k')
    prompt_version = models.CharField('提示词版本', max_length=20, default='v1')
    created_at = models.DateTimeField('创建时间', auto_now_add=True)


class AssistantActionPlan(models.Model):
    """
    子衿动作计划（P2）
    """

    class RiskLevel(models.TextChoices):
        LOW = 'low', '低风险'
        MEDIUM = 'medium', '中风险'
        HIGH = 'high', '高风险'

    class Status(models.TextChoices):
        SUGGESTED = 'suggested', '已建议'
        PENDING_CONFIRM = 'pending_confirm', '待确认'
        CONFIRMED = 'confirmed', '已确认'
        REJECTED = 'rejected', '已拒绝'
        EXECUTED = 'executed', '已执行'
        FAILED = 'failed', '执行失败'
        CANCELLED = 'cancelled', '已取消'

    class Meta:
        db_table = 't_assistant_action_plan'
        verbose_name = '子衿动作计划'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['account_id', 'status']),
            models.Index(fields=['account_id', 'risk_level']),
            models.Index(fields=['context_snapshot_id']),
        ]

    account_id = models.IntegerField('账号ID', db_index=True)
    context_snapshot_id = models.BigIntegerField('上下文快照ID', db_index=True, null=True, blank=True)
    action_type = models.CharField('动作类型', max_length=50)
    title = models.CharField('动作标题', max_length=200, default='')
    description = models.TextField('动作说明', blank=True, default='')
    action_payload = models.JSONField('动作载荷', default=dict)
    biz_domain = models.CharField('业务域', max_length=40, blank=True, default='')
    task_key = models.CharField('标准任务键', max_length=80, blank=True, default='')
    source_event_id = models.BigIntegerField('来源事件ID', null=True, blank=True, db_index=True)
    source_event_type = models.CharField('来源事件类型', max_length=40, blank=True, default='')
    target_object_refs = models.JSONField('目标业务对象引用', default=list, blank=True)
    evidence_refs = models.JSONField('证据引用', default=list, blank=True)
    draft_artifact_refs = models.JSONField('草稿产物引用', default=list, blank=True)
    risk_level = models.CharField('风险等级', max_length=20, choices=RiskLevel.choices, default=RiskLevel.MEDIUM)
    priority_score = models.IntegerField('优先级分数', null=True, blank=True)
    confidence_score = models.IntegerField('置信度分数', null=True, blank=True)
    owner_account_id = models.IntegerField('责任人账号ID', null=True, blank=True)
    reviewer_account_id = models.IntegerField('审核人账号ID', null=True, blank=True)
    due_at = models.DateTimeField('期望完成时间', null=True, blank=True)
    source_trace = models.JSONField('来源追踪', default=list, blank=True)
    status = models.CharField('状态', max_length=30, choices=Status.choices, default=Status.PENDING_CONFIRM)
    requires_confirmation = models.BooleanField('是否需要确认', default=True)
    confirmed_by = models.IntegerField('确认人ID', null=True, blank=True)
    confirmed_at = models.DateTimeField('确认时间', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)


class AssistantActionExecution(models.Model):
    """
    子衿动作执行记录（P2）
    """
    class Meta:
        db_table = 't_assistant_action_execution'
        verbose_name = '子衿动作执行记录'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['action_plan_id']),
            models.Index(fields=['executor_id', 'started_at']),
        ]

    action_plan_id = models.BigIntegerField('动作计划ID', db_index=True)
    executor_id = models.IntegerField('执行人ID', db_index=True)
    execution_result = models.JSONField('执行结果', default=dict, blank=True)
    target_refs = models.JSONField('目标引用', default=list, blank=True)
    started_at = models.DateTimeField('开始时间', auto_now_add=True)
    finished_at = models.DateTimeField('结束时间', null=True, blank=True)


class AssistantActionPolicy(models.Model):
    """
    子衿动作策略（P3 起步）

    按账号+动作类型定义策略，用于约束建议生成与动作执行。
    """
    class Meta:
        db_table = 't_assistant_action_policy'
        verbose_name = '子衿动作策略'
        unique_together = ['account_id', 'action_type']
        indexes = [
            models.Index(fields=['account_id', 'action_type']),
            models.Index(fields=['account_id', 'enabled']),
        ]

    account_id = models.IntegerField('账号ID', db_index=True)
    action_type = models.CharField('动作类型', max_length=50)
    enabled = models.BooleanField('是否启用', default=True)
    requires_confirmation = models.BooleanField('是否必须确认', default=True)
    allowed_risk_levels = models.JSONField('允许风险等级', default=list, blank=True)
    min_priority_score = models.IntegerField('最低优先级分数', default=0)
    min_confidence_score = models.IntegerField('最低置信度分数', default=0)
    created_by = models.IntegerField('创建人ID', null=True, blank=True)
    updated_by = models.IntegerField('更新人ID', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)


class AssistantUserPreference(models.Model):
    """
    子衿个人偏好（P3.3）

    记录用户在摘要语气、动作偏好等方面的配置。
    """
    class Meta:
        db_table = 't_assistant_user_preference'
        verbose_name = '子衿个人偏好'
        unique_together = ['account_id', 'preference_key']
        indexes = [
            models.Index(fields=['account_id', 'preference_key']),
        ]

    account_id = models.IntegerField('账号ID', db_index=True)
    preference_key = models.CharField('偏好键', max_length=50)
    preference_value = models.JSONField('偏好值', default=dict, blank=True)
    updated_by = models.IntegerField('更新人ID', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)


class AssistantActionFeedback(models.Model):
    """
    子衿动作反馈（P2.7）

    用于记录建议是否被采纳、采纳原因、主观评分，
    为后续策略学习和个性化推荐提供训练数据。
    """
    class Meta:
        db_table = 't_assistant_action_feedback'
        verbose_name = '子衿动作反馈'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['action_plan_id']),
            models.Index(fields=['account_id', 'created_at']),
        ]

    action_plan_id = models.BigIntegerField('动作计划ID', db_index=True)
    account_id = models.IntegerField('反馈人ID', db_index=True)
    adopted = models.BooleanField('是否采纳', default=False)
    score = models.IntegerField('评分(1-5)', null=True, blank=True)
    note = models.TextField('反馈说明', blank=True, default='')
    created_at = models.DateTimeField('创建时间', auto_now_add=True)


# ============================================================================
# Phase 6：主动式伙伴经营
# ============================================================================


class InsightType(models.TextChoices):
    TREND_ALERT = 'trend_alert', '趋势预警'
    CLIENT_PERIODIC = 'client_periodic', '客户定期洞察'
    PROJECT_RECOMMENDATION = 'project_recommendation', '项目推荐'


class InsightStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    PENDING_REVIEW = 'pending_review', '待审核'
    APPROVED = 'approved', '已审核'
    PUSHED = 'pushed', '已推送'
    ACTED = 'acted', '已行动'
    DISMISSED = 'dismissed', '已忽略'
    EXPIRED = 'expired', '已过期'


class ProactiveInsight(models.Model):
    """
    主动洞察：系统主动发现的机会或风险。

    来源：定时扫描外部数据 × 客户画像 → AI 匹配生成。
    生命周期：draft → pending_review → approved → pushed → acted/dismissed/expired
    """
    class Meta:
        db_table = 't_proactive_insight'
        verbose_name = '主动洞察'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['insight_type', 'status']),
            models.Index(fields=['client_id', '-created_at']),
            models.Index(fields=['scan_batch_id']),
            models.Index(fields=['priority', '-created_at']),
        ]

    insight_type = models.CharField('洞察类型', max_length=30, choices=InsightType.choices)
    title = models.CharField('标题', max_length=300)
    summary = models.TextField('摘要')
    detail = models.JSONField('详细内容', default=dict)

    client_id = models.IntegerField('关联客户ID', null=True, blank=True, db_index=True)
    client_name = models.CharField('客户名称', max_length=200, blank=True, default='')
    related_categories = models.JSONField('相关品类', default=list)
    related_claim_types = models.JSONField('相关宣称类型', default=list)

    trigger_source = models.CharField('触发来源', max_length=50, blank=True, default='')
    scan_batch_id = models.CharField('扫描批次ID', max_length=64, blank=True, default='')
    source_evidence_refs = models.JSONField('来源证据引用', default=list)

    priority = models.CharField('优先级', max_length=10, default='medium')
    relevance_score = models.FloatField('相关性评分', default=0.0)
    urgency_score = models.FloatField('紧迫度评分', default=0.0)
    impact_score = models.FloatField('影响力评分', default=0.0)

    status = models.CharField('状态', max_length=20, choices=InsightStatus.choices, default='draft')
    reviewed_by = models.IntegerField('审核人', null=True, blank=True)
    reviewed_at = models.DateTimeField('审核时间', null=True, blank=True)
    pushed_at = models.DateTimeField('推送时间', null=True, blank=True)
    push_channel = models.CharField('推送渠道', max_length=30, blank=True, default='')
    expires_at = models.DateTimeField('过期时间', null=True, blank=True)

    action_taken = models.TextField('采取的行动', blank=True, default='')
    action_result = models.CharField('行动结果', max_length=30, blank=True, default='')
    linked_opportunity_id = models.IntegerField('关联商机ID', null=True, blank=True)
    feedback_score = models.IntegerField('反馈评分(1-5)', null=True, blank=True)
    feedback_note = models.TextField('反馈说明', blank=True, default='')

    governance_level = models.CharField('治理等级', max_length=30, default='internal_draft')
    auto_send_to_client = models.BooleanField('是否可自动对客', default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'[{self.get_insight_type_display()}] {self.title[:50]}'


class ScanFrequency(models.TextChoices):
    DAILY = 'daily', '每日'
    WEEKLY = 'weekly', '每周'
    BIWEEKLY = 'biweekly', '双周'
    MONTHLY = 'monthly', '每月'


class ProactiveScanConfig(models.Model):
    """
    主动扫描配置：定义扫描任务的范围和频率。

    可按客户、品类、数据源维度配置。
    """
    class Meta:
        db_table = 't_proactive_scan_config'
        verbose_name = '主动扫描配置'

    name = models.CharField('配置名称', max_length=100)
    scan_type = models.CharField('扫描类型', max_length=30)
    enabled = models.BooleanField('是否启用', default=True)
    frequency = models.CharField('频率', max_length=20, choices=ScanFrequency.choices, default='weekly')
    cron_expression = models.CharField('CRON 表达式', max_length=50, blank=True, default='')

    target_client_ids = models.JSONField('目标客户ID列表', default=list)
    target_categories = models.JSONField('目标品类', default=list)
    target_regions = models.JSONField('目标法规区域', default=list)
    data_sources = models.JSONField('数据源白名单', default=list)

    ai_provider = models.CharField('AI 通道', max_length=20, default='kimi')
    ai_model = models.CharField('模型', max_length=50, default='moonshot-v1-32k')
    prompt_template_key = models.CharField('提示词模板', max_length=50, blank=True, default='')

    last_run_at = models.DateTimeField('上次运行时间', null=True, blank=True)
    last_run_result = models.JSONField('上次运行结果', default=dict)
    run_count = models.IntegerField('累计运行次数', default=0)

    created_by = models.IntegerField('创建人', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.name} ({self.scan_type}/{self.frequency})'


class ScanRunStatus(models.TextChoices):
    PENDING = 'pending', '待执行'
    RUNNING = 'running', '执行中'
    COMPLETED = 'completed', '已完成'
    FAILED = 'failed', '失败'
    PARTIAL = 'partial', '部分完成'


class ProactiveScanRun(models.Model):
    """单次扫描执行记录"""
    class Meta:
        db_table = 't_proactive_scan_run'
        verbose_name = '扫描运行记录'
        ordering = ['-started_at']

    config = models.ForeignKey(ProactiveScanConfig, on_delete=models.CASCADE, related_name='runs')
    batch_id = models.CharField('批次ID', max_length=64, unique=True)
    status = models.CharField('状态', max_length=20, choices=ScanRunStatus.choices, default='pending')

    started_at = models.DateTimeField('开始时间', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    duration_seconds = models.IntegerField('耗时(秒)', null=True, blank=True)

    sources_scanned = models.JSONField('已扫描数据源', default=list)
    raw_signals_count = models.IntegerField('原始信号数', default=0)
    insights_generated = models.IntegerField('生成洞察数', default=0)
    insights_deduplicated = models.IntegerField('去重后洞察数', default=0)
    error_log = models.TextField('错误日志', blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Scan {self.batch_id} ({self.get_status_display()})'


from .models_orchestration import OrchestrationRun, OrchestrationSubTask, SkillExecutionLog  # noqa: E402,F401
from .models_runtime import UnifiedExecutionTask, UnifiedExecutionTransition, HandoffRecord  # noqa: E402,F401
from .models_memory import WorkerMemoryProfile, WorkerMemoryRecord, WorkerPolicyUpdate  # noqa: E402,F401
from .models_workers import DomainWorkerBlueprint  # noqa: E402,F401
from .models_roles import WorkerRoleDefinition, RoleKPISnapshot  # noqa: E402,F401
from .models_governance import EvidenceGateRun, EvergreenWatchReport  # noqa: E402,F401
from .models_skills import SkillDefinition  # noqa: E402,F401
from .models_orchestration_config import (  # noqa: E402,F401
    DomainAgentMapping,
    DomainSkillMapping,
    KeywordDomainMapping,
)
from .models_workstation_binding import WorkstationBinding  # noqa: E402,F401


# ============================================================================
# 飞书全量迁移进度追踪
# ============================================================================

class MigrationStatus(models.TextChoices):
    PENDING = 'pending', '待迁移'
    RUNNING = 'running', '迁移中'
    PAUSED = 'paused', '已暂停'
    COMPLETED = 'completed', '已完成'
    FAILED = 'failed', '失败'
    SKIPPED = 'skipped', '已跳过'


class FeishuMigrationCheckpoint(models.Model):
    """
    飞书全量迁移断点续传表。

    每条记录代表「一个用户 × 一个数据源」的迁移进度。
    用于：
    1. 全量迁移断点续传（page_token / last_timestamp）
    2. 增量采集起点（last_timestamp）
    3. 进度可视化与对账
    """

    class Meta:
        db_table = 't_feishu_migration_checkpoint'
        verbose_name = '飞书迁移断点'
        unique_together = [['user_open_id', 'source_type']]
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['source_type', 'status']),
            models.Index(fields=['auth_mode']),
            models.Index(fields=['updated_at']),
        ]

    # ---- 标识 ----
    user_open_id = models.CharField(
        '飞书 OpenID', max_length=100,
        help_text="飞书 open_id；'__TENANT__' 表示租户维度（Wiki/审批/通讯录等）",
    )
    user_name = models.CharField('用户名', max_length=100, blank=True, default='')
    user_email = models.CharField('邮箱', max_length=200, blank=True, default='')
    source_type = models.CharField(
        '数据源类型', max_length=30,
        help_text='mail/im/calendar/task/approval/doc/wiki/sheet/slide/drive_file/group_msg/contact',
    )

    # ---- 状态 ----
    status = models.CharField('状态', max_length=20, choices=MigrationStatus.choices, default=MigrationStatus.PENDING)
    auth_mode = models.CharField(
        '认证模式', max_length=20, blank=True, default='',
        help_text='user_token / tenant_token / degraded（tenant fallback） / skipped',
    )

    # ---- 断点信息 ----
    page_token = models.CharField(
        '分页游标', max_length=500, blank=True, default='',
        help_text='最后成功的 page_token，下次采集从此继续',
    )
    last_item_id = models.CharField(
        '最后成功项ID', max_length=200, blank=True, default='',
        help_text='最后成功处理的消息/邮件/文档 ID',
    )
    last_timestamp = models.DateTimeField(
        '最后成功时间戳', null=True, blank=True,
        help_text='最后成功项的时间戳，增量采集的起点',
    )
    oldest_timestamp = models.DateTimeField(
        '已追溯最早时间', null=True, blank=True,
        help_text='已追溯到的最早记录时间戳，null 表示尚未完成全量',
    )

    # ---- 统计 ----
    total_fetched = models.IntegerField('已获取数量', default=0)
    total_deposited = models.IntegerField('已入库数量', default=0)
    total_skipped = models.IntegerField('已跳过数量', default=0)
    total_errors = models.IntegerField('错误数量', default=0)
    error_log = models.TextField('最近错误详情', blank=True, default='')

    # ---- 配置快照 ----
    config = models.JSONField(
        '采集参数快照', default=dict, blank=True,
        help_text='{"page_size": 100, "batch_id": "full-20260317", ...}',
    )

    # ---- 时间 ----
    started_at = models.DateTimeField('开始时间', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'Checkpoint({self.user_open_id[:20]}:{self.source_type} → {self.status})'

    def mark_running(self):
        from django.utils import timezone
        self.status = MigrationStatus.RUNNING
        self.started_at = self.started_at or timezone.now()
        self.save(update_fields=['status', 'started_at', 'updated_at'])

    def mark_completed(self):
        from django.utils import timezone
        self.status = MigrationStatus.COMPLETED
        self.completed_at = timezone.now()
        self.page_token = ''
        self.save(update_fields=['status', 'completed_at', 'page_token', 'updated_at'])

    def mark_failed(self, error: str):
        self.status = MigrationStatus.FAILED
        self.total_errors += 1
        self.error_log = (error or '')[:2000]
        self.save(update_fields=['status', 'total_errors', 'error_log', 'updated_at'])

    def increment_stats(self, fetched: int = 0, deposited: int = 0, skipped: int = 0):
        self.total_fetched += fetched
        self.total_deposited += deposited
        self.total_skipped += skipped
        self.save(update_fields=['total_fetched', 'total_deposited', 'total_skipped', 'updated_at'])


class FeishuMigrationBatch(models.Model):
    """
    飞书迁移批次管理。

    每次执行 sweep_feishu_full_history 或增量任务时创建一条记录，
    用于追踪批次级别的进度和统计。
    """

    class Meta:
        db_table = 't_feishu_migration_batch'
        verbose_name = '飞书迁移批次'
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['batch_type', 'status']),
            models.Index(fields=['started_at']),
        ]

    BATCH_TYPE_CHOICES = [
        ('full_history', '全量历史迁移'),
        ('daily_incremental', '每日增量采集'),
        ('weekly_deep', '每周深度扫描'),
        ('monthly_reconcile', '每月全量对账'),
        ('manual', '手动触发'),
    ]

    batch_id = models.CharField('批次ID', max_length=100, unique=True,
                                help_text="如 'full-20260317' / 'daily-20260318'")
    batch_type = models.CharField('批次类型', max_length=30, choices=BATCH_TYPE_CHOICES, default='manual')
    sources = models.JSONField('目标数据源', default=list,
                               help_text="['mail', 'im', ...] 或 ['__ALL__']")
    target_users = models.JSONField('目标用户', default=list,
                                   help_text="['__ALL__'] 或指定 open_id 列表")

    # ---- 状态 ----
    status = models.CharField('状态', max_length=20, choices=[
        ('running', '执行中'), ('completed', '已完成'),
        ('failed', '失败'), ('paused', '已暂停'),
    ], default='running')

    # ---- 统计 ----
    total_users = models.IntegerField('目标用户数', default=0)
    completed_users = models.IntegerField('已完成用户数', default=0)
    total_items = models.IntegerField('已获取总条数', default=0)
    total_deposited = models.IntegerField('已入库总条数', default=0)
    total_errors = models.IntegerField('错误总数', default=0)
    summary = models.JSONField('分源统计', default=dict, blank=True,
                               help_text='{"mail": {"fetched": 100, "deposited": 80}, ...}')

    # ---- 时间 ----
    started_at = models.DateTimeField('开始时间', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Batch({self.batch_id} {self.status} {self.total_items}条)'


# ── 用户反馈模型（Issue #4 智能运营早晚报）─────────────────────────────────
# 放在单独文件中定义，这里重导出让 Django 的 app 发现机制正常工作
from .feedback_models import UserFeedback  # noqa: F401, E402
