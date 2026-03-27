"""
质量合规模型

包含：偏差管理、CAPA 跟踪、SOP 管理
"""
from django.db import models


# ============================================================================
# 偏差管理
# ============================================================================
class DeviationSeverity(models.TextChoices):
    CRITICAL = 'critical', '严重'
    MAJOR = 'major', '重大'
    MINOR = 'minor', '轻微'


class DeviationStatus(models.TextChoices):
    """
    偏差全状态机（S2-6 增强）

    identified → reported → investigating → capa_pending → capa_executing → capa_complete → closed
    """
    IDENTIFIED = 'identified', '已识别'
    REPORTED = 'reported', '已报告'
    INVESTIGATING = 'investigating', '调查中'
    CAPA_PENDING = 'capa_pending', 'CAPA待建'
    CAPA_EXECUTING = 'capa_executing', 'CAPA执行中'
    CAPA_COMPLETE = 'capa_complete', 'CAPA已完成'
    CLOSED = 'closed', '已关闭'


class Deviation(models.Model):
    """偏差记录"""

    class Meta:
        db_table = 't_deviation'
        verbose_name = '偏差'
        ordering = ['-reported_at']
        indexes = [
            models.Index(fields=['status', 'severity']),
            models.Index(fields=['project', 'status']),
            models.Index(fields=['reported_at']),
        ]

    code = models.CharField('偏差编号', max_length=50, unique=True)
    title = models.CharField('偏差描述', max_length=500)
    category = models.CharField('分类', max_length=50)
    severity = models.CharField('严重度', max_length=20, choices=DeviationSeverity.choices)
    status = models.CharField('状态', max_length=20, choices=DeviationStatus.choices, default=DeviationStatus.IDENTIFIED)
    reporter = models.CharField('报告人', max_length=100)
    reporter_id = models.IntegerField('报告人ID', null=True, blank=True)
    reported_at = models.DateField('报告日期')
    project = models.CharField('项目', max_length=100)
    project_id = models.IntegerField('项目ID', null=True, blank=True)
    description = models.TextField('详细描述', blank=True, default='')
    root_cause = models.TextField('根因分析', blank=True, default='')
    resolution = models.TextField('处理措施', blank=True, default='')
    closed_at = models.DateField('关闭日期', null=True, blank=True)

    # 跨台来源追踪
    source = models.CharField('偏差来源', max_length=50, blank=True, default='self_report')
    source_workstation = models.CharField('来源工作台', max_length=50, blank=True, default='')
    source_record_id = models.CharField('来源记录ID', max_length=50, blank=True, default='')

    # 飞书审批（以飞书审批为主引擎，对应 FEISHU_NATIVE_SETUP.md 3.3）
    feishu_approval_instance_id = models.CharField('飞书审批实例ID', max_length=100, blank=True, default='', db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.code} - {self.title}'


# ============================================================================
# CAPA 管理
# ============================================================================
class CAPAType(models.TextChoices):
    CORRECTIVE = 'corrective', '纠正'
    PREVENTIVE = 'preventive', '预防'


class CAPAStatus(models.TextChoices):
    PLANNED = 'planned', '计划中'
    IN_PROGRESS = 'in_progress', '执行中'
    VERIFICATION = 'verification', '验证中'
    CLOSED = 'closed', '已关闭'
    OVERDUE = 'overdue', '已超期'


class CAPA(models.Model):
    """CAPA（纠正和预防措施）"""

    class Meta:
        db_table = 't_capa'
        verbose_name = 'CAPA'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['status', 'due_date']),
            models.Index(fields=['deviation', 'status']),
        ]

    code = models.CharField('CAPA编号', max_length=50, unique=True)
    deviation = models.ForeignKey(Deviation, on_delete=models.CASCADE, related_name='capas', verbose_name='关联偏差')
    type = models.CharField('类型', max_length=20, choices=CAPAType.choices)
    title = models.CharField('措施描述', max_length=500)
    responsible = models.CharField('责任人', max_length=100)
    responsible_id = models.IntegerField('责任人ID', null=True, blank=True)
    due_date = models.DateField('到期日')
    status = models.CharField('状态', max_length=20, choices=CAPAStatus.choices, default=CAPAStatus.PLANNED)
    effectiveness = models.CharField('有效性', max_length=20, blank=True, default='待验证')
    action_detail = models.TextField('措施详情', blank=True, default='')
    verification_note = models.TextField('验证记录', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.code} - {self.title}'


class CAPAActionItemStatus(models.TextChoices):
    PENDING = 'pending', '待执行'
    IN_PROGRESS = 'in_progress', '执行中'
    COMPLETED = 'completed', '已完成'
    OVERDUE = 'overdue', '已超期'


class CAPAActionItem(models.Model):
    """
    CAPA 行动项（S2-6）

    CAPA 下的具体行动步骤，全部完成后自动检查 CAPA 状态。
    """

    class Meta:
        db_table = 't_capa_action_item'
        verbose_name = 'CAPA行动项'
        ordering = ['sequence']
        indexes = [
            models.Index(fields=['capa', 'status']),
        ]

    capa = models.ForeignKey(CAPA, on_delete=models.CASCADE,
                             related_name='action_items', verbose_name='关联CAPA')
    sequence = models.IntegerField('序号', default=1)
    title = models.CharField('行动项描述', max_length=500)
    responsible_id = models.IntegerField('责任人ID', null=True, blank=True, help_text='Account ID')
    responsible_name = models.CharField('责任人', max_length=100, blank=True, default='')
    due_date = models.DateField('到期日')
    status = models.CharField('状态', max_length=20, choices=CAPAActionItemStatus.choices,
                              default=CAPAActionItemStatus.PENDING)
    completion_note = models.TextField('完成说明', blank=True, default='')
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'CAPA#{self.capa_id} Action#{self.sequence}: {self.title}'


# ============================================================================
# SOP 管理
# ============================================================================
class SOPStatus(models.TextChoices):
    EFFECTIVE = 'effective', '生效中'
    DRAFT = 'draft', '草稿'
    UNDER_REVIEW = 'under_review', '审核中'
    RETIRED = 'retired', '已废止'


class SOP(models.Model):
    """标准操作规程"""

    class Meta:
        db_table = 't_sop'
        verbose_name = 'SOP'
        ordering = ['code']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['category']),
        ]

    code = models.CharField('SOP编号', max_length=50, unique=True)
    title = models.CharField('文件名称', max_length=300)
    version = models.CharField('版本', max_length=20)
    category = models.CharField('分类', max_length=50)
    status = models.CharField('状态', max_length=20, choices=SOPStatus.choices, default=SOPStatus.DRAFT)
    effective_date = models.DateField('生效日期', null=True, blank=True)
    next_review = models.DateField('下次审查日期', null=True, blank=True)
    owner = models.CharField('归口部门', max_length=100)
    feishu_doc_url = models.URLField('飞书文档链接', blank=True, default='')
    description = models.TextField('说明', blank=True, default='')

    # 版本与变更（QP2-3）
    previous_version_id = models.IntegerField('上一版本ID', null=True, blank=True)
    change_request_id = models.IntegerField('关联变更ID', null=True, blank=True)
    review_history = models.JSONField('审查记录', default=list, blank=True)

    # 权限相关
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.code} {self.title} {self.version}'


class SOPTrainingStatus(models.TextChoices):
    PENDING = 'pending', '待培训'
    COMPLETED = 'completed', '已完成'
    OVERDUE = 'overdue', '已超期'


class SOPTraining(models.Model):
    """SOP培训记录（QP2-3）"""

    class Meta:
        db_table = 't_sop_training'
        verbose_name = 'SOP培训记录'
        unique_together = [['sop', 'trainee_id']]

    sop = models.ForeignKey(SOP, on_delete=models.CASCADE, related_name='trainings')
    trainee_id = models.IntegerField('培训人员ID')
    trainee_name = models.CharField('培训人员', max_length=100)
    status = models.CharField(
        '状态', max_length=20,
        choices=SOPTrainingStatus.choices,
        default=SOPTrainingStatus.PENDING,
    )
    due_date = models.DateField('培训截止日', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.sop.code} - {self.trainee_name} ({self.status})'


# ============================================================================
# 审计管理
# ============================================================================
class Audit(models.Model):
    """审计记录"""

    class Meta:
        db_table = 't_audit'
        verbose_name = '审计记录'
        ordering = ['-create_time']

    STATUS_CHOICES = [
        ('planned', '计划中'),
        ('in_progress', '进行中'),
        ('completed', '已完成'),
        ('closed', '已关闭'),
    ]

    code = models.CharField('审计编号', max_length=50, unique=True, db_index=True)
    title = models.CharField('审计标题', max_length=200)
    audit_type = models.CharField('审计类型', max_length=50)
    scope = models.TextField('审计范围', blank=True, default='')
    auditor = models.CharField('审计员', max_length=100)
    auditor_org = models.CharField('审计机构', max_length=200, blank=True, default='')
    planned_date = models.DateField('计划日期')
    actual_date = models.DateField('实际日期', null=True, blank=True)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='planned')
    summary = models.TextField('审计总结', blank=True, default='')
    checklist = models.JSONField('检查清单', default=list, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.code} - {self.title}'


class AuditFinding(models.Model):
    """审计发现项"""

    class Meta:
        db_table = 't_audit_finding'
        verbose_name = '审计发现项'
        ordering = ['sequence']

    SEVERITY_CHOICES = [
        ('critical', '严重'),
        ('major', '重大'),
        ('minor', '轻微'),
        ('observation', '观察项'),
    ]

    STATUS_CHOICES = [
        ('open', '待整改'),
        ('in_progress', '整改中'),
        ('closed', '已关闭'),
    ]

    audit = models.ForeignKey(Audit, on_delete=models.CASCADE, related_name='findings')
    sequence = models.IntegerField('序号', default=1)
    title = models.CharField('发现项标题', max_length=200)
    severity = models.CharField('严重程度', max_length=20, choices=SEVERITY_CHOICES)
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='open')
    clause = models.CharField('条款', max_length=100, blank=True, default='')
    corrective_requirement = models.TextField('整改要求', blank=True, default='')
    corrective_deadline = models.DateField('整改截止日', null=True, blank=True)
    deviation_id = models.IntegerField('关联偏差ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.audit.code} #{self.sequence} - {self.title}'


# ============================================================================
# 变更控制
# ============================================================================
class ChangeRequest(models.Model):
    """变更请求"""

    class Meta:
        db_table = 't_change_request'
        verbose_name = '变更请求'
        ordering = ['-create_time']

    STATUS_CHOICES = [
        ('draft', '草稿'),
        ('submitted', '已提交'),
        ('approved', '已批准'),
        ('rejected', '已驳回'),
        ('implementing', '实施中'),
        ('verified', '已验证'),
        ('closed', '已关闭'),
    ]

    RISK_LEVEL_CHOICES = [
        ('low', '低'),
        ('medium', '中'),
        ('high', '高'),
    ]

    code = models.CharField('变更编号', max_length=50, unique=True, db_index=True)
    title = models.CharField('变更标题', max_length=200)
    change_type = models.CharField('变更类型', max_length=50)
    description = models.TextField('变更描述', blank=True, default='')
    impact_assessment = models.TextField('影响评估', blank=True, default='')
    risk_level = models.CharField('风险等级', max_length=20, choices=RISK_LEVEL_CHOICES,
                                  default='medium')
    status = models.CharField('状态', max_length=20, choices=STATUS_CHOICES, default='draft')

    applicant = models.CharField('申请人', max_length=100, blank=True, default='')
    applicant_id = models.IntegerField('申请人ID', null=True, blank=True)
    reviewer = models.CharField('审批人', max_length=100, blank=True, default='')
    reviewer_id = models.IntegerField('审批人ID', null=True, blank=True)

    implementation_plan = models.TextField('实施方案', blank=True, default='')
    verification_note = models.TextField('验证说明', blank=True, default='')

    feishu_approval_instance_id = models.CharField('飞书审批实例ID', max_length=100,
                                                    blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.code} - {self.title}'


# ============================================================================
# 项目监察（与临床试验协议一对一）
# ============================================================================
class ProtocolProjectSupervision(models.Model):
    """协议项目监察记录：计划 + 实际执行"""

    class Meta:
        db_table = 't_quality_protocol_supervision'
        verbose_name = '协议项目监察'
        indexes = [
            models.Index(fields=['execution_start_date']),
            models.Index(fields=['plan_submitted_at']),
            models.Index(fields=['actual_submitted_at']),
        ]

    protocol = models.OneToOneField(
        'protocol.Protocol',
        on_delete=models.CASCADE,
        related_name='quality_supervision',
        verbose_name='协议',
    )
    execution_start_date = models.DateField('执行周期开始', null=True, blank=True, db_index=True)
    execution_end_date = models.DateField('执行周期结束', null=True, blank=True)
    plan_content = models.TextField('监察计划（监察内容）', blank=True, default='')
    plan_submitted_at = models.DateTimeField('监察计划提交时间', null=True, blank=True)
    actual_content = models.TextField('实际监察内容', blank=True, default='')
    actual_submitted_at = models.DateTimeField('实际监察提交时间', null=True, blank=True)
    updated_by_id = models.IntegerField('最后更新人', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'Supervision#{self.id} protocol={self.protocol_id}'


class QualityProjectRegistry(models.Model):
    """
    质量台「项目管理」来源登记：维周执行台新建协议自动登记为 weizhou；
    质量台本地测试创建可标记为 quality_manual（仅项目监察测试，不出现在项目管理页签）。
    """

    class Meta:
        db_table = 't_quality_project_registry'
        verbose_name = '质量台项目来源登记'

    class Source(models.TextChoices):
        WEIZHOU = 'weizhou', '维周执行台'
        QUALITY_MANUAL = 'quality_manual', '质量台本地测试'

    protocol = models.OneToOneField(
        'protocol.Protocol',
        on_delete=models.CASCADE,
        related_name='quality_project_registry',
        verbose_name='协议',
    )
    source = models.CharField(
        '来源',
        max_length=32,
        choices=Source.choices,
        default=Source.WEIZHOU,
        db_index=True,
    )
    create_time = models.DateTimeField('登记时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'Registry#{self.id} protocol={self.protocol_id} {self.source}'
