"""
客户价值经营模型

进思·客户台定位为管理驾驶舱，面向市场管理人员：
- 聚合采苓·研究台产生的客户交互数据
- 提供战略分析、健康度监控、预警、赋能能力
- 不重复采苓的日常操作功能（沟通记录、方案准备、项目执行）

模型分层：
- 基础层：Client, ClientContact, ClientOrgMap (P0)
- 业务层：ClientProductLine, InnovationCalendar (P1)
- 监控层：ClientHealthScore, ClientAlert (P1)
- 赋能层：ClientValueInsight, ClientBrief, ProjectValueTag (P2)
- 满意度层：SatisfactionSurvey, ClientSuccessMilestone (P2)
- 知识层：ClaimTrend, MarketTrendBulletin (P3)
- 原有：Opportunity, Ticket（保留，进思以只读分析视角使用）
"""
from django.db import models


# ============================================================================
# 枚举定义
# ============================================================================
class ClientLevel(models.TextChoices):
    STRATEGIC = 'strategic', '战略客户'
    KEY = 'key', '重点客户'
    NORMAL = 'normal', '普通客户'
    POTENTIAL = 'potential', '潜在客户'


class CompanyType(models.TextChoices):
    GLOBAL_TOP20 = 'global_top20', '全球Top20'
    CHINA_TOP10 = 'china_top10', '国内Top10'
    MULTINATIONAL = 'multinational', '跨国企业'
    DOMESTIC_LARGE = 'domestic_large', '国内大型'
    EMERGING_BRAND = 'emerging_brand', '新锐品牌'
    OEM_ODM = 'oem_odm', 'OEM/ODM'
    HEALTH_WELLNESS = 'health_wellness', '大健康'
    OTHER = 'other', '其他'


class PartnershipTier(models.TextChoices):
    PLATINUM = 'platinum', '铂金合作伙伴'
    GOLD = 'gold', '黄金合作伙伴'
    SILVER = 'silver', '银牌合作伙伴'
    DEVELOPING = 'developing', '发展中'
    PROSPECT = 'prospect', '潜在客户'


class RoleType(models.TextChoices):
    DECISION_MAKER = 'decision_maker', '决策者'
    INFLUENCER = 'influencer', '影响者'
    GATEKEEPER = 'gatekeeper', '把关人'
    USER = 'user', '使用者'
    CHAMPION = 'champion', '内部推荐人'


class RelationshipLevel(models.TextChoices):
    STRATEGIC = 'strategic', '战略伙伴'
    TRUSTED = 'trusted', '信任关系'
    WORKING = 'working', '工作关系'
    NEW = 'new', '初步接触'
    COLD = 'cold', '疏远'


class OpportunityStage(models.TextChoices):
    LEAD = 'lead', '线索'
    CONTACT = 'contact', '接洽中'
    EVALUATION = 'evaluation', '需求评估'
    PROPOSAL = 'proposal', '方案提交'
    NEGOTIATION = 'negotiation', '商务谈判'
    WON = 'won', '已成交'
    LOST = 'lost', '已丢失'


class TicketPriority(models.TextChoices):
    HIGH = 'high', '高'
    MEDIUM = 'medium', '中'
    LOW = 'low', '低'


class TicketStatus(models.TextChoices):
    OPEN = 'open', '待处理'
    IN_PROGRESS = 'in_progress', '处理中'
    RESOLVED = 'resolved', '已解决'
    CLOSED = 'closed', '已关闭'


class ProductCategory(models.TextChoices):
    SKINCARE = 'skincare', '护肤'
    MAKEUP = 'makeup', '彩妆'
    HAIRCARE = 'haircare', '护发'
    BODYCARE = 'bodycare', '身体护理'
    SUNCARE = 'suncare', '防晒'
    FRAGRANCE = 'fragrance', '香水'
    ORAL_CARE = 'oral_care', '口腔护理'
    MENS_CARE = 'mens_care', '男士护理'
    BABY_CARE = 'baby_care', '婴童护理'
    HEALTH_SUPPLEMENT = 'health_supplement', '健康补充剂'


class PriceTier(models.TextChoices):
    LUXURY = 'luxury', '奢侈'
    PREMIUM = 'premium', '高端'
    MID = 'mid', '中端'
    MASS = 'mass', '大众'


class InnovationType(models.TextChoices):
    NEW_PRODUCT = 'new_product', '全新产品'
    REFORMULATION = 'reformulation', '配方升级'
    LINE_EXTENSION = 'line_extension', '线扩展'
    CLAIM_UPGRADE = 'claim_upgrade', '宣称升级'
    PACKAGING = 'packaging', '包装革新'
    RELAUNCH = 'relaunch', '重新上市'


class InnovationStatus(models.TextChoices):
    INTELLIGENCE = 'intelligence', '情报阶段'
    CONFIRMED = 'confirmed', '已确认'
    ENGAGED = 'engaged', '已介入'
    PROJECT_CREATED = 'project_created', '已立项'


class ChurnRisk(models.TextChoices):
    LOW = 'low', '低'
    MEDIUM = 'medium', '中'
    HIGH = 'high', '高'
    CRITICAL = 'critical', '危急'


class AlertType(models.TextChoices):
    CHURN_RISK = 'churn_risk', '流失风险'
    REVENUE_DECLINE = 'revenue_decline', '收入下降'
    CONTACT_GAP = 'contact_gap', '联系中断'
    COMPLAINT_SURGE = 'complaint_surge', '投诉激增'
    COMPETITOR_THREAT = 'competitor_threat', '竞争对手威胁'
    PAYMENT_OVERDUE = 'payment_overdue', '回款逾期'
    KEY_PERSON_CHANGE = 'key_person_change', '关键人变动'
    CONTRACT_EXPIRING = 'contract_expiring', '合同即将到期'


class AlertSeverity(models.TextChoices):
    INFO = 'info', '提示'
    WARNING = 'warning', '警告'
    CRITICAL = 'critical', '严重'


class InsightType(models.TextChoices):
    MARKET_TREND = 'market_trend', '市场趋势洞察'
    COMPETITOR_ANALYSIS = 'competitor_analysis', '竞品分析'
    REGULATORY_UPDATE = 'regulatory_update', '法规动态'
    CLAIM_INNOVATION = 'claim_innovation', '宣称创新建议'
    FORMULATION_TREND = 'formulation_trend', '配方趋势'
    CONSUMER_INSIGHT = 'consumer_insight', '消费者洞察'
    COST_OPTIMIZATION = 'cost_optimization', '成本优化建议'
    TEST_METHOD_INNOVATION = 'test_method_innovation', '检测方法创新'


class InsightSource(models.TextChoices):
    AI_GENERATED = 'ai_generated', 'AI生成'
    MANUAL = 'manual', '人工撰写'
    INDUSTRY_REPORT = 'industry_report', '行业报告'
    INTERNAL_RD = 'internal_rd', '内部研发'


class BriefType(models.TextChoices):
    QUARTERLY = 'quarterly', '季度简报'
    PROJECT_KICKOFF = 'project_kickoff', '项目启动简报'
    STRATEGIC_REVIEW = 'strategic_review', '战略回顾'
    URGENT = 'urgent', '紧急通报'


class StrategicImportance(models.TextChoices):
    CRITICAL = 'critical', '战略级'
    HIGH = 'high', '高'
    NORMAL = 'normal', '标准'


class SurveyType(models.TextChoices):
    PROJECT_COMPLETION = 'project_completion', '项目完成'
    QUARTERLY = 'quarterly', '季度调查'
    ANNUAL = 'annual', '年度调查'
    NPS = 'nps', 'NPS调查'


class MilestoneType(models.TextChoices):
    FIRST_PROJECT = 'first_project', '首个项目'
    REPEAT_ORDER = 'repeat_order', '首次复购'
    NEW_CATEGORY = 'new_category', '新品类拓展'
    NEW_BRAND = 'new_brand', '新品牌拓展'
    ANNUAL_FRAMEWORK = 'annual_framework', '年框协议签署'
    INNOVATION_COLLAB = 'innovation_collab', '联合创新项目'
    REVENUE_MILESTONE = 'revenue_milestone', '营收里程碑'
    ANNIVERSARY = 'anniversary', '合作周年'


class TrendCategory(models.TextChoices):
    INGREDIENT = 'ingredient', '成分趋势'
    CLAIM = 'claim', '宣称趋势'
    REGULATION = 'regulation', '法规变化'
    CONSUMER = 'consumer', '消费者趋势'
    TECHNOLOGY = 'technology', '技术创新'
    COMPETITION = 'competition', '竞争动态'


# ============================================================================
# P0 基础层：客户档案
# ============================================================================
class Client(models.Model):
    """客户档案 — 战略画像型模型，面向管理层视角"""

    class Meta:
        db_table = 't_client'
        verbose_name = '客户'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['level']),
            models.Index(fields=['industry']),
            models.Index(fields=['partnership_tier']),
            models.Index(fields=['company_type']),
        ]

    # --- 基础信息（原有保留） ---
    name = models.CharField('客户名称', max_length=200)
    short_name = models.CharField('简称', max_length=50, blank=True, default='')
    level = models.CharField('客户等级', max_length=20, choices=ClientLevel.choices, default=ClientLevel.POTENTIAL)
    industry = models.CharField('行业', max_length=100, blank=True, default='')
    contact_name = models.CharField('联系人', max_length=100, blank=True, default='')
    contact_phone = models.CharField('联系电话', max_length=50, blank=True, default='')
    contact_email = models.EmailField('联系邮箱', blank=True, default='')
    address = models.CharField('地址', max_length=500, blank=True, default='')
    total_projects = models.IntegerField('累计项目数', default=0)
    total_revenue = models.DecimalField('累计营收', max_digits=14, decimal_places=2, default=0)
    notes = models.TextField('备注', blank=True, default='')
    feishu_project_id = models.CharField('飞书项目ID(废弃)', max_length=100, blank=True, default='')

    # --- 客户画像（P0新增） ---
    company_type = models.CharField(
        '公司类型', max_length=30, choices=CompanyType.choices,
        default=CompanyType.OTHER, blank=True,
    )
    headquarters = models.CharField('总部所在地', max_length=100, blank=True, default='')
    china_entity = models.CharField('中国实体名称', max_length=200, blank=True, default='')
    annual_revenue_estimate = models.CharField('年营收估算', max_length=50, blank=True, default='')
    employee_count_range = models.CharField('员工规模', max_length=30, blank=True, default='')

    # --- 合作关系（P0新增） ---
    partnership_start_date = models.DateField('合作起始日期', null=True, blank=True)
    partnership_tier = models.CharField(
        '合作等级', max_length=20, choices=PartnershipTier.choices,
        default=PartnershipTier.PROSPECT, blank=True,
    )
    account_manager_id = models.IntegerField('客户经理ID', null=True, blank=True)
    backup_manager_id = models.IntegerField('备份客户经理ID', null=True, blank=True)

    # --- 业务特征（P0新增） ---
    main_categories = models.JSONField('主要合作品类', default=list, blank=True)
    main_claim_types = models.JSONField('主要宣称类型', default=list, blank=True)
    preferred_test_methods = models.JSONField('偏好测试方法', default=list, blank=True)
    regulatory_regions = models.JSONField('法规覆盖区域', default=list, blank=True)
    annual_project_budget = models.DecimalField(
        '年度项目预算', max_digits=14, decimal_places=2, null=True, blank=True,
    )

    # --- 竞争情报（P0新增） ---
    known_competitors = models.JSONField('已知竞争CRO', default=list, blank=True)
    our_share_estimate = models.IntegerField('估算份额(%)', null=True, blank=True)
    competitive_advantages = models.JSONField('我方竞争优势', default=list, blank=True)
    competitive_risks = models.JSONField('竞争风险', default=list, blank=True)

    # --- 服务偏好（P0新增） ---
    communication_preference = models.CharField('沟通偏好', max_length=20, blank=True, default='')
    report_language = models.CharField('报告语言', max_length=10, default='zh', blank=True)
    invoice_requirements = models.JSONField('开票要求', default=dict, blank=True)
    payment_terms_days = models.IntegerField('账期(天)', default=30)

    # --- 权限 ---
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return self.name


# ============================================================================
# P0 基础层：关键联系人
# ============================================================================
class ClientContact(models.Model):
    """
    客户关键联系人

    管理者在进思定义关键人矩阵和关系策略；
    研究经理在采苓的沟通记录中选择具体联系人，系统自动更新 last_contact_date。
    """

    class Meta:
        db_table = 't_client_contact'
        verbose_name = '客户关键联系人'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['client', 'role_type']),
            models.Index(fields=['last_contact_date']),
        ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='contacts', verbose_name='客户')
    name = models.CharField('姓名', max_length=100)
    title = models.CharField('职位', max_length=100, blank=True, default='')
    department = models.CharField('部门', max_length=100, blank=True, default='')
    role_type = models.CharField(
        '角色类型', max_length=30, choices=RoleType.choices,
        default=RoleType.USER,
    )
    phone = models.CharField('电话', max_length=50, blank=True, default='')
    email = models.CharField('邮箱', max_length=200, blank=True, default='')
    wechat = models.CharField('微信', max_length=100, blank=True, default='')

    relationship_level = models.CharField(
        '关系层级', max_length=20, choices=RelationshipLevel.choices,
        default=RelationshipLevel.NEW,
    )
    last_contact_date = models.DateField('最近联系日期', null=True, blank=True)
    contact_frequency_days = models.IntegerField('期望联系频率(天)', default=30)

    preferences = models.JSONField('沟通偏好', default=dict, blank=True)
    birthday = models.DateField('生日', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.client.name} - {self.name}'


# ============================================================================
# P0 基础层：客户组织架构
# ============================================================================
class ClientOrgMap(models.Model):
    """客户组织架构 — 理解决策链和预算审批层级"""

    class Meta:
        db_table = 't_client_org_map'
        verbose_name = '客户组织架构'

    client = models.OneToOneField(Client, on_delete=models.CASCADE, related_name='org_map', verbose_name='客户')
    org_structure = models.JSONField('组织结构', default=dict, blank=True)
    decision_chain = models.JSONField('采购决策链', default=list, blank=True)
    budget_authority = models.JSONField('预算审批层级', default=list, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.client.name} 组织架构'


# ============================================================================
# 原有：商机跟踪（保留，进思以只读分析视角使用）
# ============================================================================
class Opportunity(models.Model):
    """商机"""

    class Meta:
        db_table = 't_opportunity'
        verbose_name = '商机'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['stage']),
            models.Index(fields=['client', 'stage']),
        ]

    title = models.CharField('商机名称', max_length=300)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='opportunities', verbose_name='客户')
    stage = models.CharField('阶段', max_length=20, choices=OpportunityStage.choices, default=OpportunityStage.LEAD)
    estimated_amount = models.DecimalField('预估金额', max_digits=14, decimal_places=2, null=True, blank=True)
    probability = models.IntegerField('成交概率(%)', default=0)
    owner = models.CharField('负责人', max_length=100)
    owner_id = models.IntegerField('负责人ID', null=True, blank=True)
    expected_close_date = models.DateField('预计成交日', null=True, blank=True)
    description = models.TextField('描述', blank=True, default='')
    demand_version = models.CharField('需求版本', max_length=50, blank=True, default='', help_text='需求规格版本号，如 v1.0')
    feishu_project_id = models.CharField('飞书项目ID(废弃)', max_length=100, blank=True, default='')
    source_mail_signal_id = models.IntegerField('来源邮件信号ID', null=True, blank=True, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return self.title


# ============================================================================
# 原有：售后工单（保留，进思以服务质量追踪视角聚合）
# ============================================================================
class Ticket(models.Model):
    """售后工单"""

    class Meta:
        db_table = 't_ticket'
        verbose_name = '售后工单'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['status', 'priority']),
            models.Index(fields=['client', 'status']),
        ]

    code = models.CharField('工单编号', max_length=50, unique=True)
    title = models.CharField('标题', max_length=500)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='tickets', verbose_name='客户')
    category = models.CharField('分类', max_length=50)
    priority = models.CharField('优先级', max_length=20, choices=TicketPriority.choices, default=TicketPriority.MEDIUM)
    status = models.CharField('状态', max_length=20, choices=TicketStatus.choices, default=TicketStatus.OPEN)
    description = models.TextField('描述', blank=True, default='')
    assignee = models.CharField('处理人', max_length=100, blank=True, default='')
    assignee_id = models.IntegerField('处理人ID', null=True, blank=True)
    resolved_at = models.DateTimeField('解决时间', null=True, blank=True)
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.code} - {self.title}'


# ============================================================================
# P1 业务层：客户产品线
# ============================================================================
class ClientProductLine(models.Model):
    """客户产品线 — 品牌×品类矩阵"""

    class Meta:
        db_table = 't_client_product_line'
        verbose_name = '客户产品线'
        ordering = ['brand', 'category']
        indexes = [
            models.Index(fields=['client', 'category']),
        ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='product_lines', verbose_name='客户')
    brand = models.CharField('品牌', max_length=100)
    category = models.CharField('品类', max_length=50, choices=ProductCategory.choices)
    sub_category = models.CharField('子品类', max_length=100, blank=True, default='')
    price_tier = models.CharField('价格定位', max_length=20, choices=PriceTier.choices, default=PriceTier.MID)
    annual_sku_count = models.IntegerField('年均SKU数量', default=0)
    typical_claims = models.JSONField('常用宣称类型', default=list, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.client.name} - {self.brand} ({self.get_category_display()})'


# ============================================================================
# P1 业务层：创新日历
# ============================================================================
class InnovationCalendar(models.Model):
    """客户创新日历 — 预判项目机会窗口"""

    class Meta:
        db_table = 't_innovation_calendar'
        verbose_name = '创新日历'
        ordering = ['-year', 'season']
        indexes = [
            models.Index(fields=['client', 'year']),
            models.Index(fields=['status']),
        ]

    SEASON_CHOICES = [
        ('spring', '春季'), ('summer', '夏季'),
        ('autumn', '秋季'), ('winter', '冬季'),
    ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='innovation_calendar', verbose_name='客户')
    product_line = models.ForeignKey(
        ClientProductLine, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='innovations', verbose_name='关联产品线',
    )
    year = models.IntegerField('年份')
    season = models.CharField('季节', max_length=10, choices=SEASON_CHOICES)
    launch_date = models.DateField('上市日期', null=True, blank=True)
    product_concept = models.CharField('新品概念', max_length=200)
    innovation_type = models.CharField('创新类型', max_length=30, choices=InnovationType.choices)
    test_requirements = models.JSONField('预估检测需求', default=list, blank=True)
    status = models.CharField('状态', max_length=20, choices=InnovationStatus.choices, default=InnovationStatus.INTELLIGENCE)
    our_opportunity = models.TextField('我方机会分析', blank=True, default='')
    competitor_info = models.TextField('竞争对手情况', blank=True, default='')

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.client.name} - {self.year}{self.get_season_display()} - {self.product_concept}'


# ============================================================================
# P1 监控层：客户健康度评分
# ============================================================================
class ClientHealthScore(models.Model):
    """客户健康度评分 — 定期自动计算，管理者监控全盘"""

    class Meta:
        db_table = 't_client_health_score'
        verbose_name = '客户健康度评分'
        ordering = ['-score_date']
        indexes = [
            models.Index(fields=['client', '-score_date']),
            models.Index(fields=['churn_risk']),
        ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='health_scores', verbose_name='客户')
    score_date = models.DateField('评分日期')

    overall_score = models.IntegerField('综合评分', default=0)
    engagement_score = models.IntegerField('互动评分', default=0)
    revenue_score = models.IntegerField('收入评分', default=0)
    satisfaction_score = models.IntegerField('满意度评分', default=0)
    growth_score = models.IntegerField('增长评分', default=0)
    loyalty_score = models.IntegerField('忠诚度评分', default=0)
    innovation_score = models.IntegerField('创新评分', default=0)

    churn_risk = models.CharField('流失风险', max_length=10, choices=ChurnRisk.choices, default=ChurnRisk.LOW)
    risk_factors = models.JSONField('风险因素', default=list, blank=True)
    recommended_actions = models.JSONField('建议行动', default=list, blank=True)
    calculation_details = models.JSONField('计算依据', default=dict, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.client.name} - {self.score_date} ({self.overall_score})'


# ============================================================================
# P1 监控层：客户预警
# ============================================================================
class ClientAlert(models.Model):
    """客户预警 — 系统自动生成，管理者确认和处理"""

    class Meta:
        db_table = 't_client_alert'
        verbose_name = '客户预警'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['alert_type', 'resolved']),
            models.Index(fields=['client', '-create_time']),
            models.Index(fields=['severity', 'acknowledged']),
        ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='alerts', verbose_name='客户')
    alert_type = models.CharField('预警类型', max_length=30, choices=AlertType.choices)
    severity = models.CharField('严重程度', max_length=10, choices=AlertSeverity.choices, default=AlertSeverity.WARNING)
    description = models.TextField('描述')
    suggested_action = models.TextField('建议行动', blank=True, default='')

    acknowledged = models.BooleanField('已确认', default=False)
    acknowledged_at = models.DateTimeField('确认时间', null=True, blank=True)
    acknowledged_by_id = models.IntegerField('确认人ID', null=True, blank=True)
    resolved = models.BooleanField('已解决', default=False)
    resolved_at = models.DateTimeField('解决时间', null=True, blank=True)
    resolved_note = models.TextField('解决说明', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.client.name} - {self.get_alert_type_display()}'


# ============================================================================
# P2 赋能层：客户价值洞察
# ============================================================================
class ClientValueInsight(models.Model):
    """
    主动赋能记录

    管理者在进思创建/AI生成洞察 → 推送通知研究经理 →
    研究经理在采苓与客户沟通时传递 → 记录客户反馈 → 进思追踪转化率
    """

    class Meta:
        db_table = 't_client_value_insight'
        verbose_name = '客户价值洞察'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['client', 'insight_type']),
        ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='value_insights', verbose_name='客户')
    insight_type = models.CharField('洞察类型', max_length=30, choices=InsightType.choices)
    title = models.CharField('标题', max_length=200)
    content = models.TextField('洞察内容')
    source = models.CharField('来源', max_length=50, choices=InsightSource.choices, default=InsightSource.MANUAL)

    shared_with = models.JSONField('分享对象', default=list, blank=True, help_text='ClientContact IDs')
    shared_at = models.DateTimeField('分享时间', null=True, blank=True)
    client_feedback = models.TextField('客户反馈', blank=True, default='')
    led_to_opportunity = models.ForeignKey(
        Opportunity, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='source_insights', verbose_name='转化商机',
    )

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.client.name} - {self.title}'


# ============================================================================
# P2 赋能层：客户简报（面向内部研究团队）
# ============================================================================
class ClientBrief(models.Model):
    """
    客户简报 — 管理者向研究经理团队传递客户战略意图

    发布后推送到采苓工作台待办 + 飞书群组通知
    """

    class Meta:
        db_table = 't_client_brief'
        verbose_name = '客户简报'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['client', 'brief_type']),
        ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='briefs', verbose_name='客户')
    brief_type = models.CharField('简报类型', max_length=20, choices=BriefType.choices)
    title = models.CharField('标题', max_length=200)

    client_strategy = models.TextField('客户当前战略重点', blank=True, default='')
    market_context = models.TextField('市场背景', blank=True, default='')
    competition_landscape = models.TextField('竞争格局', blank=True, default='')
    client_pain_points = models.JSONField('客户痛点清单', default=list, blank=True)
    quality_expectations = models.JSONField('质量期望', default=list, blank=True)
    communication_tips = models.JSONField('沟通注意事项', default=list, blank=True)
    key_contacts = models.JSONField('关键对接人', default=list, blank=True)

    target_roles = models.JSONField('目标角色', default=list, blank=True)
    published = models.BooleanField('已发布', default=False)
    published_at = models.DateTimeField('发布时间', null=True, blank=True)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.client.name} - {self.title}'


# ============================================================================
# P2 赋能层：项目价值标注
# ============================================================================
class ProjectValueTag(models.Model):
    """
    项目价值标注 — 管理者为关键项目标注战略信息

    标注后在采苓·研究台的项目仪表板中展示
    """

    class Meta:
        db_table = 't_project_value_tag'
        verbose_name = '项目价值标注'

    protocol_id = models.IntegerField('协议ID', unique=True, help_text='关联 t_protocol.id')

    strategic_importance = models.CharField(
        '战略重要性', max_length=10, choices=StrategicImportance.choices,
        default=StrategicImportance.NORMAL,
    )
    client_sensitivity = models.TextField('客户敏感点', blank=True, default='')
    delivery_emphasis = models.JSONField('交付重点', default=list, blank=True)
    upsell_potential = models.TextField('追加机会', blank=True, default='')
    competitor_context = models.TextField('竞争背景', blank=True, default='')

    expected_timeline_note = models.TextField('时间线说明', blank=True, default='')
    quality_bar = models.TextField('质量标准', blank=True, default='')
    report_format_preference = models.TextField('报告偏好', blank=True, default='')

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'协议#{self.protocol_id} 价值标注'


# ============================================================================
# P2 满意度层：满意度调查
# ============================================================================
class SatisfactionSurvey(models.Model):
    """客户满意度调查 — 管理者发起，追踪服务质量"""

    class Meta:
        db_table = 't_satisfaction_survey'
        verbose_name = '满意度调查'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['client', 'survey_type']),
        ]

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='surveys', verbose_name='客户')
    protocol_id = models.IntegerField('关联协议ID', null=True, blank=True)
    survey_type = models.CharField('调查类型', max_length=20, choices=SurveyType.choices)

    overall_satisfaction = models.IntegerField('综合满意度', default=0, help_text='1-10')
    quality_score = models.IntegerField('检测质量', default=0, help_text='1-10')
    timeliness_score = models.IntegerField('交付时效', default=0, help_text='1-10')
    communication_score = models.IntegerField('沟通效率', default=0, help_text='1-10')
    innovation_score = models.IntegerField('创新能力', default=0, help_text='1-10')
    value_score = models.IntegerField('性价比', default=0, help_text='1-10')
    nps_score = models.IntegerField('NPS评分', null=True, blank=True, help_text='-100 到 100')

    strengths = models.TextField('优势', blank=True, default='')
    improvements = models.TextField('改进建议', blank=True, default='')
    respondent_id = models.IntegerField('调查对象ID', null=True, blank=True, help_text='ClientContact ID')

    follow_up_actions = models.JSONField('跟进行动', default=list, blank=True)
    followed_up = models.BooleanField('已跟进', default=False)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.client.name} - {self.get_survey_type_display()}'


# ============================================================================
# P2 满意度层：合作里程碑
# ============================================================================
class ClientSuccessMilestone(models.Model):
    """客户成功里程碑 — 追踪合作关系深化轨迹"""

    class Meta:
        db_table = 't_client_success_milestone'
        verbose_name = '合作里程碑'
        ordering = ['-achieved_at']

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='milestones', verbose_name='客户')
    milestone_type = models.CharField('里程碑类型', max_length=30, choices=MilestoneType.choices)
    title = models.CharField('标题', max_length=200)
    achieved_at = models.DateField('达成日期')
    description = models.TextField('说明', blank=True, default='')
    value = models.DecimalField('金额', max_digits=14, decimal_places=2, null=True, blank=True)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.client.name} - {self.title}'


# ============================================================================
# P3 知识层：宣称趋势
# ============================================================================
class ClaimTrend(models.Model):
    """宣称趋势数据库 — 行业知识引擎"""

    class Meta:
        db_table = 't_claim_trend'
        verbose_name = '宣称趋势'
        ordering = ['-trending_score']
        indexes = [
            models.Index(fields=['claim_category', 'region']),
            models.Index(fields=['year', '-trending_score']),
        ]

    claim_category = models.CharField('宣称类别', max_length=50)
    claim_text = models.CharField('宣称措辞', max_length=500)
    region = models.CharField('适用地区', max_length=20, default='中国')
    regulatory_basis = models.TextField('法规依据', blank=True, default='')
    test_methods = models.JSONField('推荐测试方案', default=list, blank=True)
    trending_score = models.FloatField('趋势热度', default=0)
    year = models.IntegerField('年份')
    market_data = models.JSONField('市场数据', default=dict, blank=True)
    competitor_usage = models.JSONField('竞品使用情况', default=list, blank=True)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.claim_category} - {self.claim_text[:50]}'


# ============================================================================
# P3 知识层：市场趋势通报
# ============================================================================
class MarketTrendBulletin(models.Model):
    """
    市场趋势通报 — 管理者编辑并发布给全团队

    发布后自动推送到采苓知识库 + 飞书知识空间
    """

    class Meta:
        db_table = 't_market_trend_bulletin'
        verbose_name = '市场趋势通报'
        ordering = ['-create_time']

    title = models.CharField('标题', max_length=200)
    category = models.CharField('类别', max_length=30, choices=TrendCategory.choices)
    summary = models.TextField('摘要')
    detail = models.TextField('详细内容')
    impact_analysis = models.TextField('对我们的影响', blank=True, default='')
    action_items = models.JSONField('行动建议', default=list, blank=True)
    source_references = models.JSONField('来源引用', default=list, blank=True)

    ai_generated = models.BooleanField('AI生成', default=False)
    relevance_client_ids = models.JSONField('相关客户ID列表', default=list, blank=True)

    published = models.BooleanField('已发布', default=False)
    published_at = models.DateTimeField('发布时间', null=True, blank=True)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return self.title
