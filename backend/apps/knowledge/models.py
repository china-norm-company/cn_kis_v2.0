"""
知识库模型

包含：知识条目、知识标签、知识实体（本体）、知识关系（图谱）
"""
from django.db import models


# ============================================================================
# 知识条目类型
# ============================================================================
class EntryType(models.TextChoices):
    REGULATION = 'regulation', '法规'
    SOP = 'sop', 'SOP'
    PROPOSAL_TEMPLATE = 'proposal_template', '方案模板'
    METHOD_REFERENCE = 'method_reference', '方法参考'
    LESSON_LEARNED = 'lesson_learned', '经验教训'
    FAQ = 'faq', '常见问题'
    FEISHU_DOC = 'feishu_doc', '飞书文档'
    COMPETITOR_INTEL = 'competitor_intel', '竞品情报'
    INSTRUMENT_SPEC = 'instrument_spec', '仪器规格'
    INGREDIENT_DATA = 'ingredient_data', '成分数据'
    MEETING_DECISION = 'meeting_decision', '会议决策'
    MARKET_INSIGHT = 'market_insight', '市场洞察'
    PAPER_ABSTRACT = 'paper_abstract', '论文摘要'
    # 飞书全量迁移原生类型
    FEISHU_MAIL = 'feishu_mail', '飞书邮件'
    FEISHU_IM = 'feishu_im', '飞书消息'
    FEISHU_CALENDAR = 'feishu_calendar', '飞书日历'
    FEISHU_TASK = 'feishu_task', '飞书任务'
    FEISHU_APPROVAL = 'feishu_approval', '飞书审批'
    FEISHU_WIKI = 'feishu_wiki', '飞书知识库'
    FEISHU_SHEET = 'feishu_sheet', '飞书电子表格'
    FEISHU_SLIDE = 'feishu_slide', '飞书幻灯片'
    FEISHU_FILE = 'feishu_file', '飞书文件'


# ============================================================================
# 知识条目状态
# ============================================================================
class EntryStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    PROCESSED = 'processed', '已处理'
    PENDING_REVIEW = 'pending_review', '待审核'
    PUBLISHED = 'published', '已发布'
    ARCHIVED = 'archived', '已归档'
    REJECTED = 'rejected', '已拒绝'


# ============================================================================
# 本体命名空间
# ============================================================================
class OntologyNamespace(models.TextChoices):
    CNKIS = 'cnkis', 'CN_KIS 项目本体'
    CDISC_SDTM = 'cdisc_sdtm', 'CDISC SDTM'
    CDISC_CDASH = 'cdisc_cdash', 'CDISC CDASH'
    CDISC_ODM = 'cdisc_odm', 'CDISC ODM'
    BRIDG = 'bridg', 'BRIDG (ISO 14199)'
    NMPA_REGULATION = 'nmpa_regulation', 'NMPA 法规公告'
    INTERNAL_SOP = 'internal_sop', '内部 SOP'
    PROJECT_EXPERIENCE = 'project_experience', '项目经验'
    CUSTOM = 'custom', '自定义'


# ============================================================================
# 知识条目
# ============================================================================
class KnowledgeEntry(models.Model):
    """知识条目"""

    class Meta:
        db_table = 't_knowledge_entry'
        verbose_name = '知识条目'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['entry_type', 'is_published']),
            models.Index(fields=['source_type', 'source_id']),
            models.Index(fields=['source_type', 'source_id', 'source_key']),
            models.Index(fields=['is_deleted', 'is_published']),
            models.Index(fields=['namespace']),
            models.Index(fields=['status']),
            models.Index(fields=['index_status']),
            models.Index(fields=['quality_score']),
            models.Index(fields=['owner']),
            models.Index(fields=['reviewer']),
            models.Index(fields=['next_review_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['source_type', 'source_id', 'source_key'],
                condition=(
                    models.Q(is_deleted=False) &
                    ~models.Q(source_type='') &
                    models.Q(source_id__isnull=False) &
                    ~models.Q(source_key='')
                ),
                name='uniq_knowledge_source_key_alive',
            ),
        ]

    entry_type = models.CharField(
        '条目类型', max_length=30, choices=EntryType.choices,
    )
    title = models.CharField('标题', max_length=500)
    content = models.TextField('内容')
    summary = models.TextField('摘要', blank=True, default='')
    tags = models.JSONField('标签列表', default=list)
    source_type = models.CharField(
        '来源类型', max_length=50, blank=True, default='',
        help_text='来源类型：protocol/retrospective/sop/document/manual/agent_tool/feishu_chat/feishu_meeting',
    )
    source_id = models.IntegerField(
        '来源ID', null=True, blank=True,
    )
    source_key = models.CharField(
        '来源去重键', max_length=120, blank=True, default='',
        help_text='同一来源下的幂等键，如 lesson 哈希、sop-main',
    )
    version = models.CharField(
        '版本号', max_length=50, blank=True, default='',
        help_text='版本标识，如 v1.0 / 2026年第6号 / 2021',
    )
    embedding_id = models.CharField(
        '向量嵌入存储ID', max_length=200, blank=True, default='',
    )
    view_count = models.IntegerField('浏览次数', default=0)
    is_published = models.BooleanField('是否发布', default=False)
    created_by_id = models.IntegerField(
        '创建人ID', null=True, blank=True, db_index=True, help_text='Account ID',
    )
    owner = models.ForeignKey(
        'identity.Account', verbose_name='知识域负责人',
        null=True, blank=True, on_delete=models.SET_NULL,
        related_name='owned_knowledge_entries',
        help_text='负责该知识条目日常维护与到期处理的负责人',
    )
    reviewer = models.ForeignKey(
        'identity.Account', verbose_name='复核人',
        null=True, blank=True, on_delete=models.SET_NULL,
        related_name='reviewing_knowledge_entries',
        help_text='负责该知识条目复核与发布复审的人员',
    )
    next_review_at = models.DateTimeField(
        '下次复核时间', null=True, blank=True,
        help_text='按知识域治理策略自动计算的下一次复核时间',
    )

    # --- 状态机字段 ---
    status = models.CharField(
        '知识状态', max_length=20, choices=EntryStatus.choices,
        default=EntryStatus.DRAFT, db_index=True,
        help_text='draft/processed/pending_review/published/archived/rejected',
    )
    quality_score = models.IntegerField(
        '质量评分', null=True, blank=True,
        help_text='0-100 综合质量评分，< 40 不自动发布',
    )
    search_vector_text = models.TextField(
        '预分词检索文本', blank=True, default='',
        help_text='供 PostgreSQL FTS 使用的预分词文本缓存',
    )
    index_status = models.CharField(
        '索引状态', max_length=20, default='pending',
        choices=[('pending', '待索引'), ('indexed', '已索引'), ('failed', '索引失败')],
        db_index=True,
        help_text='向量索引状态',
    )
    indexed_at = models.DateTimeField('索引时间', null=True, blank=True)
    rag_cite_count = models.IntegerField('RAG 引用次数', default=0)
    # --- 状态机字段结束 ---

    # --- K1: 本体论扩展字段 ---
    parent = models.ForeignKey(
        'self', verbose_name='父条目', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='children',
        help_text='层次化知识组织，如 SOP 章节隶属关系',
    )
    superseded_by = models.ForeignKey(
        'self', verbose_name='被哪个新版本替代',
        null=True, blank=True, on_delete=models.SET_NULL,
        related_name='superseded_entries',
        help_text='若该条目已被新版本替代，则指向最新替代版本',
    )
    uri = models.CharField(
        '语义 URI', max_length=500, blank=True, default='',
        db_index=True,
        help_text='本体 URI，如 cnkis:sop/sample-management 或 cdisc:sdtm/DM',
    )
    namespace = models.CharField(
        '本体命名空间', max_length=30,
        choices=OntologyNamespace.choices,
        default=OntologyNamespace.CNKIS,
        help_text='标识知识条目所属的本体标准',
    )
    # --- 扩展字段结束 ---

    # --- 专题包字段（第四阶段引入）---
    topic_package = models.ForeignKey(
        'TopicPackage', verbose_name='所属专题包',
        null=True, blank=True, on_delete=models.SET_NULL,
        related_name='entries',
        help_text='该条目所属的知识专题包，用于专题覆盖度评估',
    )
    facet = models.CharField(
        '专题 Facet', max_length=50, blank=True, default='',
        db_index=True,
        help_text='条目在专题包中的维度，如 regulation_boundary/key_metrics/sop_risks',
    )
    # --- 专题包字段结束 ---

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.get_entry_type_display()}: {self.title}'


# ============================================================================
# 专题包（Knowledge Topic Package）— 第四阶段引入
# 知识建设的一等对象，替代 round2/round3/targeted 等过渡方式
# ============================================================================
class TopicPackage(models.Model):
    """
    专题包 — 知识建设的基本组织单元。

    每个专题包代表一个完整的专业知识主题（如"保湿仪器与检测方法"、
    "中国化妆品法规合规"），通过固定 facet 模板确保知识覆盖的闭环性。

    专题包门禁（上线验收）：
      - 专题覆盖完整率（已覆盖 facet / 总 facet）
      - 专题闭环率（法规→指标→方法→仪器→统计→话术全链路）
      - 专题一致性（同一专题多问法是否命中同一知识簇）
      - 权威源覆盖率（核心 facet 是否有 regulation/method_reference 级别条目）
    """

    class Meta:
        db_table = 't_knowledge_topic_package'
        verbose_name = '专题包'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['canonical_topic']),
            models.Index(fields=['status', 'required_for_release']),
            models.Index(fields=['coverage_weight']),
        ]

    # 专题包内置 facet 模板（每个专题包至少应覆盖这些维度）
    DEFAULT_FACETS = [
        'regulation_boundary',   # 法规边界（法规要求、合规限制）
        'claim_boundary',        # 宣称边界（允许/禁止的功效宣称）
        'core_concepts',         # 核心概念（关键术语、定义）
        'key_metrics',           # 关键指标（测量参数、统计方法）
        'instrument_methods',    # 仪器方法（测量仪器、使用规范）
        'study_design',          # 研究设计（统计方法、样本量）
        'sop_risks',             # SOP 风险（偏差处理、质量控制）
        'ingredient_safety',     # 成分安全（限用浓度、禁用成分）
        'faq_misconceptions',    # FAQ/误区（常见问题、错误认知）
        'reporting_templates',   # 报告话术/模板（报告要素、宣传措辞）
    ]

    canonical_topic = models.CharField(
        '标准化主题', max_length=200,
        help_text='专题包的标准化主题名，如 "保湿仪器与检测方法" 或 "中国化妆品法规合规"',
    )
    package_id = models.CharField(
        '专题包 ID', max_length=100, unique=True,
        help_text='全局唯一 ID，如 pkg_moisturizing_instruments，用于跨系统引用',
    )
    description = models.TextField('专题描述', blank=True, default='')
    facets = models.JSONField(
        'Facet 覆盖状态',
        default=dict,
        help_text='各 facet 的覆盖状态和关联 entry 数量，格式: {facet: {count: int, entry_ids: []}}',
    )
    coverage_weight = models.FloatField(
        '覆盖权重', default=1.0,
        help_text='该专题包在整体评测中的权重（关键专题权重更高）',
    )
    required_for_release = models.BooleanField(
        '上线必须通过', default=False,
        help_text='True 表示该专题包的门禁是上线的硬性要求',
    )
    source_authority_level = models.CharField(
        '权威来源级别', max_length=20,
        choices=[
            ('tier1', 'Tier 1 — 国家标准/法规/ICH'),
            ('tier2', 'Tier 2 — 行业标准/协会指南'),
            ('tier3', 'Tier 3 — 学术文献/内部SOP'),
            ('mixed', 'Mixed — 多来源混合'),
        ],
        default='mixed',
    )
    status = models.CharField(
        '专题包状态', max_length=20,
        choices=[
            ('building', '建设中'),
            ('review', '评审中'),
            ('published', '已发布'),
            ('archived', '已归档'),
        ],
        default='building',
    )
    properties = models.JSONField(
        '扩展属性', default=dict, blank=True,
        help_text='如 {"cluster_keywords": [], "related_packages": [], "n8n_workflow_id": ""}',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'[{self.package_id}] {self.canonical_topic}'

    def coverage_rate(self) -> float:
        """计算当前专题包的 facet 覆盖率"""
        if not self.facets:
            return 0.0
        covered = sum(
            1 for facet_data in self.facets.values()
            if isinstance(facet_data, dict) and facet_data.get('count', 0) > 0
        )
        return round(covered / max(len(self.DEFAULT_FACETS), 1), 3)


# ============================================================================
# 知识域治理策略 — KR-5-4
# ============================================================================
class KnowledgeDomainPolicy(models.Model):
    """按 namespace 管理 owner / reviewer / 复核周期。"""

    class Meta:
        db_table = 't_knowledge_domain_policy'
        verbose_name = '知识域治理策略'
        ordering = ['namespace']
        indexes = [
            models.Index(fields=['namespace', 'is_active']),
        ]

    namespace = models.CharField('知识域命名空间', max_length=100, unique=True)
    owner = models.ForeignKey(
        'identity.Account', verbose_name='域负责人',
        null=True, blank=True, on_delete=models.SET_NULL,
        related_name='owned_knowledge_domain_policies',
    )
    reviewer = models.ForeignKey(
        'identity.Account', verbose_name='域复核人',
        null=True, blank=True, on_delete=models.SET_NULL,
        related_name='reviewing_knowledge_domain_policies',
    )
    review_cycle_days = models.PositiveIntegerField(
        '复核周期（天）', default=90,
        help_text='条目入库或更新后，多少天后需要再次复核',
    )
    description = models.TextField('说明', blank=True, default='')
    is_active = models.BooleanField('是否启用', default=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.namespace} ({self.review_cycle_days}d)'


# ============================================================================
# 知识标签
# ============================================================================
class KnowledgeTag(models.Model):
    """知识标签"""

    class Meta:
        db_table = 't_knowledge_tag'
        verbose_name = '知识标签'
        ordering = ['-usage_count', 'name']

    name = models.CharField('标签名称', max_length=100, unique=True)
    category = models.CharField(
        '标签分类', max_length=50, blank=True, default='',
        help_text='标签分类：product_category/claim_type/test_method/regulation',
    )
    usage_count = models.IntegerField('使用次数', default=0)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return self.name


# ============================================================================
# 知识实体（本体中的概念/实例）— K2
# ============================================================================
class EntityType(models.TextChoices):
    CONCEPT = 'concept', '概念'
    INSTANCE = 'instance', '实例'
    PROPERTY = 'property', '属性'
    CLASS = 'class', '类'
    INSTRUMENT = 'instrument', '仪器/设备'
    METHOD = 'method', '检测方法'
    INGREDIENT = 'ingredient', '化妆品成分'
    COMPETITOR = 'competitor', '竞品公司'
    REGULATION_ENTITY = 'regulation_entity', '法规实体'
    MEASUREMENT = 'measurement', '检测指标'
    PAPER = 'paper', '学术论文'
    # 运营知识图谱扩展
    PERSON = 'person', '人员'
    PROJECT = 'project', '项目'
    FACILITY = 'facility', '场地/实验室'
    CLIENT = 'client', '客户/申办方'
    ROLE = 'role', '岗位角色'
    TIMEPOINT = 'timepoint', '检测时间点'
    SAMPLE = 'sample', '样品/耗材'


class KnowledgeEntity(models.Model):
    """
    知识图谱实体 — 本体论中的概念节点。

    支持 CDISC/BRIDG 标准术语导入和项目自定义概念。
    通过 parent 字段实现 is-a 层次结构。
    """

    class Meta:
        db_table = 't_knowledge_entity'
        verbose_name = '知识实体'
        ordering = ['namespace', 'label']
        indexes = [
            models.Index(fields=['entity_type', 'namespace']),
            models.Index(fields=['namespace', 'uri']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['namespace', 'uri'],
                condition=models.Q(is_deleted=False),
                name='uniq_entity_namespace_uri',
            ),
        ]

    entity_type = models.CharField(
        '实体类型', max_length=20, choices=EntityType.choices,
        default=EntityType.CONCEPT,
    )
    uri = models.CharField(
        '语义 URI', max_length=500,
        help_text='全局唯一标识，如 bridg:StudySubject 或 cnkis:visit-plan',
    )
    label = models.CharField('显示名称', max_length=500)
    label_en = models.CharField('英文名称', max_length=500, blank=True, default='')
    definition = models.TextField('定义', blank=True, default='')
    parent = models.ForeignKey(
        'self', verbose_name='上位概念', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='children',
    )
    namespace = models.CharField(
        '命名空间', max_length=30, choices=OntologyNamespace.choices,
        default=OntologyNamespace.CNKIS,
    )
    properties = models.JSONField(
        '扩展属性', default=dict, blank=True,
        help_text='存储本体属性的键值对，如 {domain, range, cardinality}',
    )
    linked_entry = models.ForeignKey(
        KnowledgeEntry, verbose_name='关联知识条目',
        null=True, blank=True, on_delete=models.SET_NULL,
        related_name='entities',
        help_text='实体与现有知识条目的双向关联',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'[{self.namespace}] {self.label}'


# ============================================================================
# 知识关系（本体中的属性/边）— K2
# ============================================================================
class RelationType(models.TextChoices):
    IS_A = 'is_a', '是一种 (is-a)'
    PART_OF = 'part_of', '属于 (part-of)'
    HAS_PROPERTY = 'has_property', '具有属性'
    RELATED_TO = 'related_to', '相关'
    DEPENDS_ON = 'depends_on', '依赖'
    PRODUCES = 'produces', '产出'
    GOVERNED_BY = 'governed_by', '受管辖'
    PRECEDES = 'precedes', '先于'
    FOLLOWS = 'follows', '后于'
    TRANSLATES_TO = 'translates_to', '翻译为'
    MEASURED_BY = 'measured_by', '测量方式'
    IMPLEMENTED_BY = 'implemented_by', '实现方式'
    CUSTOM = 'custom', '自定义'
    HAS_MEASUREMENT = 'has_measurement', '具有检测指标'
    TESTED_BY = 'tested_by', '通过方法检测'
    LIMITED_BY = 'limited_by', '受法规限制'
    USED_IN = 'used_in', '用于项目/检测'
    IMPROVES = 'improves', '改进了'
    COMPETES_WITH = 'competes_with', '与…竞争'
    PUBLISHED_BY = 'published_by', '由…发表'
    REQUIRES = 'requires', '需要'
    RESOLVED_BY = 'resolved_by', '通过…解决'
    HAS_DEVIATION = 'has_deviation', '存在偏差'
    # 运营知识图谱扩展（人员-项目-资源 维度）
    MANAGES = 'manages', '管理/负责'
    ASSIGNED_TO = 'assigned_to', '分配给'
    REPORTS_TO = 'reports_to', '汇报给'
    SCHEDULES = 'schedules', '排程'
    OPERATES = 'operates', '操作/使用'
    SPONSORS = 'sponsors', '委托/发起'
    REVIEWS = 'reviews', '审核/复核'
    EXECUTES = 'executes', '执行'
    REQUESTS = 'requests', '提交申请'
    APPROVES = 'approves', '审批'
    LOCATES_IN = 'locates_in', '位于/所在'
    CERTIFIED_FOR = 'certified_for', '持有资质'
    COLLABORATES_WITH = 'collaborates_with', '协同'


class KnowledgeRelation(models.Model):
    """
    知识图谱关系 — 实体之间的语义连接。

    支持标准关系类型和自定义谓词 URI，可由 LLM 自动抽取或人工维护。
    """

    class Meta:
        db_table = 't_knowledge_relation'
        verbose_name = '知识关系'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['subject', 'relation_type']),
            models.Index(fields=['object', 'relation_type']),
            models.Index(fields=['relation_type']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['subject', 'predicate_uri', 'object'],
                condition=models.Q(is_deleted=False),
                name='uniq_relation_triple',
            ),
        ]

    subject = models.ForeignKey(
        KnowledgeEntity, verbose_name='主语实体',
        on_delete=models.CASCADE, related_name='outgoing_relations',
    )
    relation_type = models.CharField(
        '关系类型', max_length=30, choices=RelationType.choices,
        default=RelationType.RELATED_TO,
    )
    predicate_uri = models.CharField(
        '谓词 URI', max_length=500, blank=True, default='',
        help_text='语义谓词 URI，如 bridg:performedOn 或 cnkis:requires',
    )
    object = models.ForeignKey(
        KnowledgeEntity, verbose_name='宾语实体',
        on_delete=models.CASCADE, related_name='incoming_relations',
    )
    confidence = models.FloatField(
        '置信度', default=1.0,
        help_text='1.0=人工确认, <1.0=LLM 自动抽取的置信度',
    )
    source = models.CharField(
        '来源', max_length=100, blank=True, default='',
        help_text='manual/llm-ark/llm-kimi/cdisc-import/bridg-import',
    )
    metadata = models.JSONField(
        '元数据', default=dict, blank=True,
        help_text='额外信息，如抽取时的上下文、原文引用等',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.subject.label} --[{self.get_relation_type_display()}]--> {self.object.label}'


class KnowledgeQualitySnapshot(models.Model):
    """知识质量日快照 — 按专题包记录每日质量指标，支持趋势分析。"""

    package_id = models.CharField('专题包 ID', max_length=120, db_index=True)
    package_label = models.CharField('专题包名称', max_length=200, blank=True, default='')
    snapshot_date = models.DateField('快照日期', db_index=True)
    total_entries = models.IntegerField('条目总数', default=0)
    published_entries = models.IntegerField('已发布条目数', default=0)
    avg_quality_score = models.FloatField('平均质量分', default=0.0)
    expired_count = models.IntegerField('过期条目数', default=0)
    rag_cite_total = models.IntegerField('RAG 引用总次数', default=0)
    coverage_rate = models.FloatField('Facet 覆盖率', default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 't_knowledge_quality_snapshot'
        verbose_name = '知识质量快照'
        verbose_name_plural = '知识质量快照'
        unique_together = [('package_id', 'snapshot_date')]
        ordering = ['-snapshot_date', 'package_id']

    def __str__(self):
        return f'{self.package_id} @ {self.snapshot_date}'
