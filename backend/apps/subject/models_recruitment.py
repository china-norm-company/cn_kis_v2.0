"""
受试者招募管理模型

迁移自 cn_kis_test 并适配 CN_KIS_V1.0 规范。
覆盖完整招募链路：计划 -> 入排标准 -> 渠道 -> 预算 -> 广告 -> 报名 -> 筛选 -> 入组 -> 进度 -> 问题 -> 策略。
"""
from django.db import models


# ============================================================================
# 招募计划
# ============================================================================
class RecruitmentPlanStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    APPROVED = 'approved', '已批准'
    ACTIVE = 'active', '进行中'
    PAUSED = 'paused', '已暂停'
    COMPLETED = 'completed', '已完成'
    CANCELLED = 'cancelled', '已取消'


class MaterialPrepStatus(models.TextChoices):
    """物料准备状态（与计划生命周期状态区分）"""
    DRAFT = 'draft', '草稿'
    IN_PROGRESS = 'in_progress', '进行中'
    PUBLISHED = 'published', '发布'


class AppointmentDocsStatus(models.TextChoices):
    """招募预约文档包审批状态"""
    MISSING = 'missing', '待上传'
    PENDING_REVIEW = 'pending_review', '待审批'
    APPROVED = 'approved', '已通过'
    REJECTED = 'rejected', '已驳回'


class RecruitmentPlan(models.Model):
    """招募计划"""

    class Meta:
        db_table = 't_recruitment_plan'
        verbose_name = '招募计划'
        indexes = [
            models.Index(fields=['protocol', 'status']),
            models.Index(fields=['status', 'start_date']),
        ]

    plan_no = models.CharField('计划编号', max_length=50, unique=True, db_index=True)
    protocol = models.ForeignKey(
        'protocol.Protocol', on_delete=models.CASCADE,
        related_name='recruitment_plans', verbose_name='关联协议',
        null=True,
        blank=True,
    )
    title = models.CharField('计划标题', max_length=200)
    description = models.TextField('计划描述', blank=True, default='')

    # 维周工单 / 项目信息（项目编号全局唯一；与 protocol.code 可并存）
    project_code = models.CharField(
        '项目编号', max_length=64, unique=True, null=True, blank=True, db_index=True,
        help_text='维周同步或手工录入，唯一',
    )
    sample_requirement = models.TextField('样本要求', blank=True, default='')
    wei_visit_point = models.CharField('访视点', max_length=200, blank=True, default='')
    wei_visit_date = models.CharField(
        '具体访视日期',
        max_length=500,
        blank=True,
        default='',
        help_text='自由文本，如具体日期或「3月上旬」等说明',
    )
    researcher_name = models.CharField('研究员', max_length=200, blank=True, default='')
    supervisor_name = models.CharField('督导', max_length=200, blank=True, default='')

    # 招募主管填报（第二步）
    recruit_start_date = models.DateField('招募启动日期', null=True, blank=True)
    recruit_end_date = models.DateField('招募结束日期', null=True, blank=True)
    planned_appointment_count = models.IntegerField('计划预约人数', default=0)
    estimated_work_hours = models.DecimalField(
        '预计工时', max_digits=10, decimal_places=2, null=True, blank=True,
    )
    actual_work_hours = models.DecimalField(
        '实际工时', max_digits=10, decimal_places=2, null=True, blank=True,
        help_text='仅招募专员填写',
    )
    recruit_specialist_names = models.JSONField(
        '派发招募专员', default=list, blank=True,
        help_text='姓名列表，多选则多人可见「我的计划」',
    )
    channel_recruitment_needed = models.BooleanField('是否需要渠道招募', default=False)
    material_prep_status = models.CharField(
        '物料准备状态', max_length=20,
        choices=MaterialPrepStatus.choices,
        default=MaterialPrepStatus.DRAFT,
        db_index=True,
    )
    appointment_docs_status = models.CharField(
        '招募预约文档状态', max_length=20,
        choices=AppointmentDocsStatus.choices,
        default=AppointmentDocsStatus.MISSING,
        db_index=True,
    )
    appointment_docs_reject_reason = models.TextField('预约文档驳回原因', blank=True, default='')

    target_count = models.IntegerField('目标人数', default=0)
    enrolled_count = models.IntegerField('已入组人数', default=0)
    screened_count = models.IntegerField('已筛选人数', default=0)
    registered_count = models.IntegerField('已报名人数', default=0)

    start_date = models.DateField('开始日期')
    end_date = models.DateField('结束日期')
    status = models.CharField('状态', max_length=20, choices=RecruitmentPlanStatus.choices, default=RecruitmentPlanStatus.DRAFT, db_index=True)

    manager_id = models.IntegerField('负责人ID', null=True, blank=True, help_text='Account ID')
    notes = models.TextField('备注', blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.plan_no} - {self.title}'

    @property
    def completion_rate(self):
        if self.target_count > 0:
            return round(self.enrolled_count / self.target_count * 100, 2)
        return 0


# ============================================================================
# 入排标准
# ============================================================================
class CriteriaType(models.TextChoices):
    INCLUSION = 'inclusion', '入组标准'
    EXCLUSION = 'exclusion', '排除标准'


class EligibilityCriteria(models.Model):
    """入排标准"""

    class Meta:
        db_table = 't_eligibility_criteria'
        verbose_name = '入排标准'
        ordering = ['plan', 'criteria_type', 'sequence']

    plan = models.ForeignKey(RecruitmentPlan, on_delete=models.CASCADE, related_name='criteria')
    criteria_type = models.CharField('标准类型', max_length=20, choices=CriteriaType.choices)
    sequence = models.IntegerField('序号', default=1)
    description = models.TextField('标准描述')
    is_mandatory = models.BooleanField('是否必须', default=True)
    notes = models.TextField('备注', blank=True, default='')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.get_criteria_type_display()} {self.sequence}'


# ============================================================================
# 招募渠道
# ============================================================================
class ChannelType(models.TextChoices):
    HOSPITAL = 'hospital', '医院'
    CLINIC = 'clinic', '诊所'
    ONLINE = 'online', '线上'
    ADVERTISEMENT = 'advertisement', '广告'
    REFERRAL = 'referral', '转介'
    DATABASE = 'database', '数据库'
    WECHAT = 'wechat', '微信'
    OTHER = 'other', '其他'


class RecruitmentChannel(models.Model):
    """招募渠道"""

    class Meta:
        db_table = 't_recruitment_channel'
        verbose_name = '招募渠道'

    plan = models.ForeignKey(RecruitmentPlan, on_delete=models.CASCADE, related_name='channels')
    channel_type = models.CharField('渠道类型', max_length=20, choices=ChannelType.choices)
    name = models.CharField('渠道名称', max_length=200)
    description = models.TextField('渠道描述', blank=True, default='')
    contact_person = models.CharField('联系人', max_length=100, blank=True, default='')
    contact_phone = models.CharField('联系电话', max_length=50, blank=True, default='')
    status = models.CharField('状态', max_length=20, default='active')

    registered_count = models.IntegerField('报名人数', default=0)
    screened_count = models.IntegerField('筛选人数', default=0)
    enrolled_count = models.IntegerField('入组人数', default=0)
    cost = models.DecimalField('成本', max_digits=12, decimal_places=2, default=0)
    effectiveness_score = models.DecimalField('效果评分', max_digits=5, decimal_places=2, null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.name}({self.get_channel_type_display()})'


# ============================================================================
# 招募预算
# ============================================================================
class BudgetCategory(models.TextChoices):
    ADVERTISING = 'advertising', '广告费'
    CHANNEL_FEE = 'channel_fee', '渠道费'
    MATERIAL = 'material', '物料费'
    LABOR = 'labor', '人工费'
    COMPENSATION = 'compensation', '受试者补偿'
    TRAVEL = 'travel', '交通费'
    OTHER = 'other', '其他'


class RecruitmentBudget(models.Model):
    """招募预算"""

    class Meta:
        db_table = 't_recruitment_budget'
        verbose_name = '招募预算'

    plan = models.ForeignKey(RecruitmentPlan, on_delete=models.CASCADE, related_name='budgets')
    category = models.CharField('预算类别', max_length=20, choices=BudgetCategory.choices)
    budgeted_amount = models.DecimalField('预算金额', max_digits=12, decimal_places=2, default=0)
    actual_amount = models.DecimalField('实际金额', max_digits=12, decimal_places=2, default=0)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.get_category_display()}: {self.budgeted_amount}'


# ============================================================================
# 招募广告/信息
# ============================================================================
class AdType(models.TextChoices):
    POSTER = 'poster', '海报'
    FLYER = 'flyer', '传单'
    ONLINE_AD = 'online_ad', '线上广告'
    VIDEO = 'video', '视频'
    ARTICLE = 'article', '文章'
    SOCIAL_MEDIA = 'social_media', '社交媒体'
    RECRUIT_TEMPLATE = 'recruit_template', '招募模板'


class AdStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    PENDING = 'pending', '待审批'
    APPROVED = 'approved', '已审批'
    PUBLISHED = 'published', '已发布'
    WITHDRAWN = 'withdrawn', '已撤回'


class RecruitmentAd(models.Model):
    """招募广告/信息"""

    class Meta:
        db_table = 't_recruitment_ad'
        verbose_name = '招募广告'

    plan = models.ForeignKey(RecruitmentPlan, on_delete=models.CASCADE, related_name='ads')
    ad_type = models.CharField('广告类型', max_length=20, choices=AdType.choices)
    title = models.CharField('标题', max_length=200)
    content = models.TextField('内容', blank=True, default='')
    publish_channels = models.JSONField('发布渠道', null=True, blank=True, default=list)
    status = models.CharField('状态', max_length=20, choices=AdStatus.choices, default=AdStatus.DRAFT)

    template_project_code = models.CharField('模板-项目编号', max_length=128, blank=True, default='')
    template_project_name = models.CharField('模板-项目名称', max_length=200, blank=True, default='')
    template_sample_requirement = models.TextField('模板-样本要求', blank=True, default='')
    template_visit_date = models.DateField('模板-具体访视日期', null=True, blank=True)
    template_honorarium = models.DecimalField(
        '模板-礼金', max_digits=12, decimal_places=2, null=True, blank=True,
    )
    template_liaison_fee = models.CharField(
        '模板-联络费', max_length=200, blank=True, default='',
        help_text='支持金额或说明文字，如「合格1人15元」',
    )
    reject_reason = models.TextField('驳回原因', blank=True, default='')
    submitted_at = models.DateTimeField('提交审批时间', null=True, blank=True)
    submitted_by_id = models.IntegerField('提交人ID', null=True, blank=True)

    view_count = models.IntegerField('查看数', default=0)
    click_count = models.IntegerField('点击数', default=0)
    registration_count = models.IntegerField('注册数', default=0)

    published_at = models.DateTimeField('发布时间', null=True, blank=True)
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.title}({self.get_ad_type_display()})'


def _appointment_doc_upload_to(instance: 'RecruitmentPlanAppointmentDoc', filename: str) -> str:
    safe = (filename or 'file').replace('..', '').replace('/', '_').replace('\\', '_')[:180]
    return f'recruitment/appointment_docs/plan_{instance.plan_id}/{instance.doc_type}_{safe}'


class RecruitmentPlanAppointmentDoc(models.Model):
    """招募计划预约文档（三类固定槽位，每计划每类型一条，上传覆盖）"""

    class Meta:
        db_table = 't_recruitment_plan_appointment_doc'
        verbose_name = '招募预约文档'
        constraints = [
            models.UniqueConstraint(fields=['plan', 'doc_type'], name='uniq_plan_appointment_doc_type'),
        ]

    class DocType(models.TextChoices):
        PHONE_APPOINTMENT_FLOW = 'phone_appointment_flow', '测试电话预约流程'
        PHONE_SCREENING_QUESTIONNAIRE = 'phone_screening_questionnaire', '电话甄别问卷'
        PHONE_APPOINTMENT_FORM = 'phone_appointment_form', '电话预约信息表'

    plan = models.ForeignKey(
        RecruitmentPlan, on_delete=models.CASCADE, related_name='appointment_docs',
    )
    doc_type = models.CharField('文档类型', max_length=40, choices=DocType.choices, db_index=True)
    file = models.FileField('文件', upload_to=_appointment_doc_upload_to, max_length=500)
    original_filename = models.CharField('原始文件名', max_length=255, blank=True, default='')
    file_size = models.BigIntegerField('文件大小', default=0)
    uploaded_by_id = models.IntegerField('上传人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.plan_id}/{self.doc_type}'


# ============================================================================
# 受试者报名
# ============================================================================
class RegistrationStatus(models.TextChoices):
    REGISTERED = 'registered', '已报名'
    CONTACTED = 'contacted', '已联系'
    PRE_SCREENING = 'pre_screening', '初筛中'
    PRE_SCREENED_PASS = 'pre_screened_pass', '初筛通过'
    PRE_SCREENED_FAIL = 'pre_screened_fail', '初筛不通过'
    SCREENING = 'screening', '筛选中'
    SCREENED_PASS = 'screened_pass', '筛选通过'
    SCREENED_FAIL = 'screened_fail', '筛选未通过'
    ENROLLED = 'enrolled', '已入组'
    WITHDRAWN = 'withdrawn', '已退出'


class SubjectRegistration(models.Model):
    """受试者报名"""

    class Meta:
        db_table = 't_subject_registration'
        verbose_name = '受试者报名'
        indexes = [
            models.Index(fields=['plan', 'status']),
            models.Index(fields=['phone']),
        ]

    plan = models.ForeignKey(RecruitmentPlan, on_delete=models.CASCADE, related_name='registrations')
    channel = models.ForeignKey(RecruitmentChannel, on_delete=models.SET_NULL, null=True, blank=True, related_name='registrations')
    registration_no = models.CharField('报名编号', max_length=50, unique=True, db_index=True)

    name = models.CharField('姓名', max_length=100)
    gender = models.CharField('性别', max_length=10, blank=True, default='')
    age = models.IntegerField('年龄', null=True, blank=True)
    phone = models.CharField('手机号', max_length=20, db_index=True)
    email = models.CharField('邮箱', max_length=100, blank=True, default='')
    medical_history = models.TextField('病史摘要', blank=True, default='')

    status = models.CharField('状态', max_length=20, choices=RegistrationStatus.choices, default=RegistrationStatus.REGISTERED, db_index=True)

    contacted_at = models.DateTimeField('联系时间', null=True, blank=True)
    contact_notes = models.TextField('联系备注', blank=True, default='')

    withdrawal_reason = models.TextField('退出原因', blank=True, default='')
    withdrawal_date = models.DateTimeField('退出时间', null=True, blank=True)
    withdrawal_initiated_by_id = models.IntegerField('退出操作人ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.registration_no} - {self.name}'


# ============================================================================
# 筛选记录
# ============================================================================
class ScreeningResult(models.TextChoices):
    PENDING = 'pending', '待评估'
    PASS = 'pass', '通过'
    FAIL = 'fail', '未通过'


class ScreeningRecord(models.Model):
    """筛选记录"""

    class Meta:
        db_table = 't_screening_record'
        verbose_name = '筛选记录'

    registration = models.ForeignKey(SubjectRegistration, on_delete=models.CASCADE, related_name='screenings')
    screening_no = models.CharField('筛选编号', max_length=50, unique=True, db_index=True)
    result = models.CharField('筛选结果', max_length=20, choices=ScreeningResult.choices, default=ScreeningResult.PENDING)
    criteria_checks = models.JSONField('入排标准检查', null=True, blank=True, help_text='[{criteria_id, met, notes}]')
    vital_signs = models.JSONField('生命体征', null=True, blank=True, help_text='{"bp","hr","temp",...}')
    lab_results = models.JSONField('实验室结果', null=True, blank=True)
    screener_id = models.IntegerField('筛选人ID', null=True, blank=True)
    screened_at = models.DateTimeField('筛选时间', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.screening_no} - {self.get_result_display()}'


# ============================================================================
# 招募侧入组记录（含随机化）
# ============================================================================
class EnrollmentRecordStatus(models.TextChoices):
    PENDING = 'pending', '待入组'
    ENROLLED = 'enrolled', '已入组'
    RANDOMIZED = 'randomized', '已随机化'
    WITHDRAWN = 'withdrawn', '已退出'


class EnrollmentRecord(models.Model):
    """招募侧入组记录（含 ICF 签署、随机化）"""

    class Meta:
        db_table = 't_enrollment_record'
        verbose_name = '招募入组记录'

    registration = models.ForeignKey(SubjectRegistration, on_delete=models.CASCADE, related_name='enrollment_records')
    enrollment_no = models.CharField('入组编号', max_length=50, unique=True, db_index=True)
    subject_no = models.CharField('受试者编号', max_length=50, blank=True, default='')
    enrollment_date = models.DateField('入组日期', null=True, blank=True)

    icf_signed = models.BooleanField('知情同意已签署', default=False)
    icf_signed_date = models.DateField('签署日期', null=True, blank=True)
    randomized = models.BooleanField('已随机化', default=False)
    randomization_no = models.CharField('随机号', max_length=50, blank=True, default='')

    status = models.CharField('状态', max_length=20, choices=EnrollmentRecordStatus.choices, default=EnrollmentRecordStatus.PENDING, db_index=True)
    notes = models.TextField('备注', blank=True, default='')

    withdrawal_reason = models.TextField('退出原因', blank=True, default='')
    withdrawal_date = models.DateTimeField('退出时间', null=True, blank=True)
    withdrawal_initiated_by_id = models.IntegerField('退出操作人ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.enrollment_no}'


# ============================================================================
# 招募进度
# ============================================================================
class RecruitmentProgress(models.Model):
    """招募进度（每日/每周快照）"""

    class Meta:
        db_table = 't_recruitment_progress'
        verbose_name = '招募进度'
        unique_together = ['plan', 'record_date']

    plan = models.ForeignKey(RecruitmentPlan, on_delete=models.CASCADE, related_name='progress_records')
    record_date = models.DateField('记录日期')
    registered_count = models.IntegerField('累计报名数', default=0)
    screened_count = models.IntegerField('累计筛选数', default=0)
    enrolled_count = models.IntegerField('累计入组数', default=0)
    completion_rate = models.DecimalField('完成率(%)', max_digits=5, decimal_places=2, default=0)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.plan.plan_no} - {self.record_date}'


# ============================================================================
# 招募问题
# ============================================================================
class IssuePriority(models.TextChoices):
    LOW = 'low', '低'
    MEDIUM = 'medium', '中'
    HIGH = 'high', '高'
    CRITICAL = 'critical', '紧急'


class IssueStatus(models.TextChoices):
    OPEN = 'open', '待处理'
    IN_PROGRESS = 'in_progress', '处理中'
    RESOLVED = 'resolved', '已解决'
    CLOSED = 'closed', '已关闭'


class RecruitmentIssue(models.Model):
    """招募问题"""

    class Meta:
        db_table = 't_recruitment_issue'
        verbose_name = '招募问题'

    plan = models.ForeignKey(RecruitmentPlan, on_delete=models.CASCADE, related_name='issues')
    issue_type = models.CharField('问题类型', max_length=50, blank=True, default='')
    priority = models.CharField('优先级', max_length=20, choices=IssuePriority.choices, default=IssuePriority.MEDIUM)
    title = models.CharField('标题', max_length=200)
    description = models.TextField('描述', blank=True, default='')
    root_cause = models.TextField('根因分析', blank=True, default='')
    solution = models.TextField('解决方案', blank=True, default='')
    status = models.CharField('状态', max_length=20, choices=IssueStatus.choices, default=IssueStatus.OPEN)
    assigned_to_id = models.IntegerField('处理人ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.title}'


# ============================================================================
# 招募策略
# ============================================================================
class StrategyStatus(models.TextChoices):
    PROPOSED = 'proposed', '已提出'
    APPROVED = 'approved', '已批准'
    IMPLEMENTED = 'implemented', '已实施'
    ASSESSED = 'assessed', '已评估'
    REJECTED = 'rejected', '已拒绝'


class ContactRecord(models.Model):
    """报名跟进记录"""

    class Meta:
        db_table = 't_contact_record'
        verbose_name = '跟进记录'
        ordering = ['-contact_date']

    CONTACT_TYPE_CHOICES = [
        ('phone', '电话'), ('wechat', '微信'), ('email', '邮件'),
        ('visit', '面访'), ('sms', '短信'), ('other', '其他'),
    ]
    RESULT_CHOICES = [
        ('interested', '有意向'), ('not_interested', '无意向'),
        ('scheduled', '已约筛选'), ('no_answer', '未接通'),
        ('callback', '要求回电'), ('need_time', '需考虑'),
        ('other', '其他'),
    ]

    registration = models.ForeignKey(SubjectRegistration, on_delete=models.CASCADE, related_name='contact_records')
    contact_date = models.DateTimeField('联系时间', auto_now_add=True)
    contact_type = models.CharField('联系方式', max_length=20, choices=CONTACT_TYPE_CHOICES, default='phone')
    content = models.TextField('联系内容')
    result = models.CharField('联系结果', max_length=30, choices=RESULT_CHOICES, default='other')
    next_contact_date = models.DateField('下次联系日期', null=True, blank=True)
    next_contact_plan = models.CharField('下次联系计划', max_length=200, blank=True, default='')
    contacted_by_id = models.IntegerField('操作人ID', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.registration.registration_no} - {self.get_contact_type_display()} - {self.contact_date}'


class RecruitmentStrategy(models.Model):
    """招募策略"""

    class Meta:
        db_table = 't_recruitment_strategy'
        verbose_name = '招募策略'

    plan = models.ForeignKey(RecruitmentPlan, on_delete=models.CASCADE, related_name='strategies')
    issue = models.ForeignKey(RecruitmentIssue, on_delete=models.SET_NULL, null=True, blank=True, related_name='strategies')
    strategy_type = models.CharField('策略类型', max_length=50, blank=True, default='')
    title = models.CharField('标题', max_length=200)
    description = models.TextField('描述', blank=True, default='')
    rationale = models.TextField('依据', blank=True, default='')
    expected_outcome = models.TextField('预期效果', blank=True, default='')
    status = models.CharField('状态', max_length=20, choices=StrategyStatus.choices, default=StrategyStatus.PROPOSED)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.title}'


# ============================================================================
# 初筛记录
# ============================================================================
class PreScreeningResult(models.TextChoices):
    PENDING = 'pending', '待评估'
    PASS = 'pass', '通过'
    FAIL = 'fail', '未通过'
    REFER = 'refer', '推荐其他项目'


class PreScreeningRecord(models.Model):
    """
    受试者初筛评估记录

    初筛是正式筛选之前的专业评估环节。每个到场受试者必须建档，
    由专业人员按协议定义的检查表逐项评估。仪器数据和医学史写入
    Subject 模型体系（timeseries / profile），本模型仅保存聚合
    结果和判定信息。
    """

    class Meta:
        db_table = 't_pre_screening_record'
        verbose_name = '初筛记录'
        indexes = [
            models.Index(fields=['protocol', 'result']),
            models.Index(fields=['pre_screening_date', 'result']),
            models.Index(fields=['screener_id']),
        ]

    registration = models.ForeignKey(
        SubjectRegistration, on_delete=models.CASCADE,
        related_name='pre_screenings', verbose_name='报名记录',
    )
    subject = models.ForeignKey(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='pre_screenings', verbose_name='受试者',
    )
    protocol = models.ForeignKey(
        'protocol.Protocol', on_delete=models.CASCADE,
        related_name='pre_screenings', verbose_name='关联协议',
    )

    pre_screening_no = models.CharField('初筛编号', max_length=50, unique=True, db_index=True)

    # --- 时间 ---
    pre_screening_date = models.DateField('初筛日期')
    start_time = models.DateTimeField('开始时间', null=True, blank=True)
    end_time = models.DateTimeField('结束时间', null=True, blank=True)
    location = models.CharField('初筛地点', max_length=200, blank=True, default='')

    # --- 检查结果（聚合摘要，详细数据在 Subject 子表中） ---
    hard_exclusion_checks = models.JSONField(
        '硬性排除条件检查', null=True, blank=True,
        help_text='[{"item":"年龄范围","met":true,"value":"28"}, ...]',
    )
    skin_visual_assessment = models.JSONField(
        '皮肤视觉评估', null=True, blank=True,
        help_text='{"overall_condition","test_site_integrity","fitzpatrick_type",...}',
    )
    instrument_summary = models.JSONField(
        '仪器测量摘要', null=True, blank=True,
        help_text='{"visia_done":true,"moisture_value":42.5,...}',
    )
    medical_summary = models.JSONField(
        '医学史摘要', null=True, blank=True,
        help_text='{"conditions_count":0,"allergies_count":1,...}',
    )
    lifestyle_summary = models.JSONField(
        '生活方式摘要', null=True, blank=True,
        help_text='{"sun_exposure":"low","skincare_routine":"basic",...}',
    )

    # --- 判定 ---
    result = models.CharField(
        '初筛结果', max_length=20,
        choices=PreScreeningResult.choices,
        default=PreScreeningResult.PENDING, db_index=True,
    )
    fail_reasons = models.JSONField(
        '不通过原因', null=True, blank=True, default=list,
        help_text='["皮肤敏感度超标","近期使用过抗组胺药"]',
    )
    reviewer_decision = models.CharField(
        'PI复核结果', max_length=20, blank=True, default='',
        help_text='pass / fail（仅 result=pending 时由 PI 填写）',
    )
    reviewer_notes = models.TextField('PI复核备注', blank=True, default='')
    reviewed_at = models.DateTimeField('复核时间', null=True, blank=True)

    # --- 后续安排 ---
    screening_appointment_id = models.IntegerField(
        '筛选预约ID', null=True, blank=True,
        help_text='初筛通过后创建的正式筛选预约 SubjectAppointment ID',
    )
    compensation_amount = models.DecimalField(
        '交通补贴金额', max_digits=10, decimal_places=2,
        null=True, blank=True,
    )
    compensation_paid = models.BooleanField('补贴已发放', default=False)

    # --- 人员 ---
    screener_id = models.IntegerField('初筛评估员ID', null=True, blank=True, help_text='Account ID')
    reviewer_id = models.IntegerField('复核人ID', null=True, blank=True, help_text='Account ID')

    # --- 元数据 ---
    notes = models.TextField('备注', blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.pre_screening_no} - {self.get_result_display()}'
