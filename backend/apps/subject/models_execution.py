"""
执行管理模型

包含：签到签出、依从性评估、礼金支付、受试者问卷、预约、客服工单。
"""
from django.db import models


# ============================================================================
# 签到签出
# ============================================================================
class CheckinStatus(models.TextChoices):
    CHECKED_IN = 'checked_in', '已签到'
    IN_PROGRESS = 'in_progress', '执行中'
    CHECKED_OUT = 'checked_out', '已签出'
    NO_SHOW = 'no_show', '缺席'


class SubjectCheckin(models.Model):
    """受试者签到签出记录"""

    class Meta:
        db_table = 't_subject_checkin'
        verbose_name = '签到记录'
        indexes = [
            models.Index(fields=['subject', 'checkin_date']),
            models.Index(fields=['subject', 'checkin_date', 'project_code']),
            models.Index(fields=['enrollment', 'status']),
        ]

    subject = models.ForeignKey('subject.Subject', on_delete=models.CASCADE, related_name='checkins')
    enrollment = models.ForeignKey('subject.Enrollment', on_delete=models.CASCADE, related_name='checkins', null=True, blank=True)
    work_order = models.ForeignKey('workorder.WorkOrder', on_delete=models.SET_NULL, null=True, blank=True, related_name='subject_checkins')

    checkin_date = models.DateField('签到日期')
    # 与 SubjectAppointment.project_code 对齐；同日多项目到访时各项目一条签到，避免队列行共用同一记录
    project_code = models.CharField('项目编号', max_length=128, blank=True, default='', db_index=True)
    checkin_time = models.DateTimeField('签到时间', null=True, blank=True)
    checkout_time = models.DateTimeField('签出时间', null=True, blank=True)
    status = models.CharField('状态', max_length=20, choices=CheckinStatus.choices, default=CheckinStatus.CHECKED_IN, db_index=True)
    location = models.CharField('签到位置', max_length=200, blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')
    # 过号：顺延 3 位时记录过号时刻及当时该项目内即将被叫的 SC 序号（叫号序 = 该值 + 3）
    missed_call_at = models.DateTimeField('过号时间', null=True, blank=True)
    missed_after_sc_rank = models.PositiveSmallIntegerField(
        '过号时队首SC序号', null=True, blank=True,
        help_text='过号时该项目内即将被叫的 SC 序号，用于叫号序=该值+3',
    )

    created_by_id = models.IntegerField('操作人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} - {self.checkin_date}'


# ============================================================================
# 依从性评估
# ============================================================================
class ComplianceLevel(models.TextChoices):
    EXCELLENT = 'excellent', '优秀'
    GOOD = 'good', '良好'
    FAIR = 'fair', '一般'
    POOR = 'poor', '较差'
    NON_COMPLIANT = 'non_compliant', '不合规'


class ComplianceRecord(models.Model):
    """受试者依从性评估记录"""

    class Meta:
        db_table = 't_subject_compliance'
        verbose_name = '依从性记录'
        indexes = [
            models.Index(fields=['subject', 'assessment_date']),
        ]

    subject = models.ForeignKey('subject.Subject', on_delete=models.CASCADE, related_name='compliance_records')
    enrollment = models.ForeignKey('subject.Enrollment', on_delete=models.CASCADE, related_name='compliance_records', null=True, blank=True)

    assessment_date = models.DateField('评估日期')
    visit_attendance_rate = models.DecimalField('到访率(%)', max_digits=5, decimal_places=2, default=0)
    questionnaire_completion_rate = models.DecimalField('问卷完成率(%)', max_digits=5, decimal_places=2, default=0)
    time_window_deviation = models.DecimalField('时间窗偏差(天)', max_digits=5, decimal_places=1, default=0)
    overall_score = models.DecimalField('综合评分', max_digits=5, decimal_places=2, default=0)
    level = models.CharField('依从性等级', max_length=20, choices=ComplianceLevel.choices, blank=True, default='')

    notes = models.TextField('备注', blank=True, default='')
    assessed_by_id = models.IntegerField('评估人ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} - 依从性 {self.overall_score}'


# ============================================================================
# 礼金支付
# ============================================================================
class PaymentStatus(models.TextChoices):
    PENDING = 'pending', '待发起'
    INITIATED = 'initiated', '已发起'
    APPROVED = 'approved', '已审批'
    PAID = 'paid', '已支付'
    FAILED = 'failed', '支付失败'
    CANCELLED = 'cancelled', '已取消'


class PaymentType(models.TextChoices):
    VISIT_COMPENSATION = 'visit_compensation', '到访补偿'
    TRANSPORTATION = 'transportation', '交通补贴'
    MEAL = 'meal', '餐食补贴'
    COMPLETION_BONUS = 'completion_bonus', '完成奖励'
    REFERRAL = 'referral', '推荐奖励'
    OTHER = 'other', '其他'


class SubjectPayment(models.Model):
    """受试者礼金支付记录"""

    class Meta:
        db_table = 't_subject_payment'
        verbose_name = '礼金支付'
        indexes = [
            models.Index(fields=['subject', 'status']),
            models.Index(fields=['project_code']),
            models.Index(fields=['nas_import_batch']),
        ]

    subject = models.ForeignKey('subject.Subject', on_delete=models.CASCADE, related_name='payments')
    enrollment = models.ForeignKey('subject.Enrollment', on_delete=models.CASCADE, related_name='payments', null=True, blank=True)

    payment_no = models.CharField('支付编号', max_length=50, unique=True, db_index=True)
    payment_type = models.CharField('支付类型', max_length=30, choices=PaymentType.choices)
    amount = models.DecimalField('金额', max_digits=10, decimal_places=2)
    status = models.CharField('状态', max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.PENDING, db_index=True)

    initiated_at = models.DateTimeField('发起时间', null=True, blank=True)
    paid_at = models.DateTimeField('支付时间', null=True, blank=True)
    payment_method = models.CharField('支付方式', max_length=50, blank=True, default='', help_text='微信/银行转账/现金')
    transaction_id = models.CharField('交易号', max_length=100, blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')

    # ── NAS 历史档案导入扩展字段 ─────────────────────────────────────────
    bank_account_encrypted = models.TextField(
        '收款账号（加密）', blank=True, default='',
        help_text='AES Fernet 加密的银行卡号，使用 libs.field_encryption 解密',
    )
    bank_account_last4 = models.CharField(
        '收款账号后4位', max_length=4, blank=True, default='',
        help_text='明文后4位，用于展示和模糊匹配',
    )
    platform = models.CharField(
        '支付平台', max_length=50, blank=True, default='',
        help_text='八羿/捷仕达/安徽创启/安徽斯长/宿钲/融辰/怀宁青枫',
        db_index=True,
    )
    project_code = models.CharField(
        '项目代码', max_length=50, blank=True, default='',
        db_index=True,
    )
    nas_paid_date = models.DateField(
        'NAS实际支付日期', null=True, blank=True,
        help_text='从文件名解析的实际支付日期',
    )
    nas_import_batch = models.CharField(
        'NAS导入批次', max_length=30, blank=True, default='',
        help_text='格式 nas-YYYY-MM-DD',
        db_index=True,
    )
    # ── 积分关联 ──────────────────────────────────────────────────────────
    points_awarded = models.IntegerField(
        '奖励积分', default=0,
        help_text='本次支付奖励的积分（1元=1分）',
    )

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.payment_no} - {self.amount}'


# ============================================================================
# 受试者问卷（ePRO）
# ============================================================================
class QuestionnaireStatus(models.TextChoices):
    PENDING = 'pending', '待填写'
    IN_PROGRESS = 'in_progress', '填写中'
    SUBMITTED = 'submitted', '已提交'
    VERIFIED = 'verified', '已核实'


class SubjectQuestionnaire(models.Model):
    """受试者问卷（ePRO）"""

    class Meta:
        db_table = 't_subject_questionnaire'
        verbose_name = '受试者问卷'

    subject = models.ForeignKey('subject.Subject', on_delete=models.CASCADE, related_name='questionnaires')
    enrollment = models.ForeignKey('subject.Enrollment', on_delete=models.CASCADE, related_name='questionnaires', null=True, blank=True)

    questionnaire_type = models.CharField('问卷类型', max_length=50, help_text='自评/他评/满意度/VAS等')
    title = models.CharField('问卷标题', max_length=200)
    form_definition = models.JSONField('表单定义', null=True, blank=True, help_text='问卷结构 JSON Schema')
    answers = models.JSONField('答案', null=True, blank=True)
    score = models.DecimalField('评分', max_digits=8, decimal_places=2, null=True, blank=True)
    status = models.CharField('状态', max_length=20, choices=QuestionnaireStatus.choices, default=QuestionnaireStatus.PENDING, db_index=True)

    assigned_at = models.DateTimeField('分配时间', null=True, blank=True)
    submitted_at = models.DateTimeField('提交时间', null=True, blank=True)
    due_date = models.DateTimeField('截止时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} - {self.title}'


# ============================================================================
# 预约
# ============================================================================
class AppointmentStatus(models.TextChoices):
    PENDING = 'pending', '待确认'
    CONFIRMED = 'confirmed', '已确认'
    CANCELLED = 'cancelled', '已取消'
    COMPLETED = 'completed', '已完成'
    NO_SHOW = 'no_show', '缺席'


class SubjectAppointment(models.Model):
    """受试者预约记录"""

    class Meta:
        db_table = 't_subject_appointment'
        verbose_name = '预约记录'
        indexes = [
            models.Index(fields=['subject', 'appointment_date']),
            models.Index(fields=['appointment_date', 'project_code']),
        ]

    subject = models.ForeignKey('subject.Subject', on_delete=models.CASCADE, related_name='appointments')
    enrollment = models.ForeignKey('subject.Enrollment', on_delete=models.CASCADE, related_name='appointments', null=True, blank=True)

    appointment_date = models.DateField('预约日期')
    appointment_time = models.TimeField('预约时间', null=True, blank=True)
    purpose = models.CharField('预约事由', max_length=200, blank=True, default='')
    status = models.CharField('状态', max_length=20, choices=AppointmentStatus.choices, default=AppointmentStatus.PENDING, db_index=True)
    notes = models.TextField('备注', blank=True, default='')

    # 项目与访视信息（用于接待台筛选和小程序展示）
    visit_point = models.CharField('访视点', max_length=100, blank=True, default='', help_text='如 V0/V1/粗筛/筛选/基线等')
    project_code = models.CharField('项目编号', max_length=100, blank=True, default='', db_index=True, help_text='研究机构方案编号')
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='', help_text='研究名称')
    liaison = models.CharField('联络员', max_length=100, blank=True, default='', help_text='预约联络人')

    # 拼音首字母：由用户手动填写或导入时上传，不再自动生成
    name_pinyin_initials = models.CharField(
        '拼音首字母', max_length=50, blank=True, default='',
        help_text='受试者姓名拼音首字母缩写，如 张三→ZS；手动填写或导入时上传',
    )

    confirmed_by_id = models.IntegerField('确认人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} - {self.appointment_date}'


class EnrollmentStatusSC(models.TextChoices):
    """入组情况（今日队列用）：与 SubjectProjectSC 关联。"""
    PRE_SCREEN_PASS = '初筛合格', '初筛合格'
    ENROLLED = '正式入组', '正式入组'
    DISQUALIFIED = '不合格', '不合格'
    RE_SCREEN_FAIL = '复筛不合格', '复筛不合格'
    WITHDRAWN = '退出', '退出'
    NO_SHOW = '缺席', '缺席'


class SubjectProjectSC(models.Model):
    """
    受试者-项目 SC/RD 号：同一受试者（subject）在同一项目（project_code）下唯一一条记录。
    仅在访视点为 V1 时，签到时按项目内顺序分配 SC 号；同项目后续访视均使用该 SC 号。
    RD 号仅当入组情况为「正式入组」时可填写（如 RD001）。
    与 t_subject_appointment 逻辑关联：预约列表通过 subject_id + project_code 关联本表取 SC/RD 展示。
    """
    class Meta:
        db_table = 't_subject_project_sc'
        verbose_name = '受试者项目SC号'
        unique_together = (('subject', 'project_code'),)
        indexes = [
            models.Index(fields=['project_code', 'sc_number']),
        ]

    subject = models.ForeignKey('subject.Subject', on_delete=models.CASCADE, related_name='project_sc_records')
    project_code = models.CharField('项目编号', max_length=100, db_index=True)
    sc_number = models.CharField(
        'SC号', max_length=20, blank=True, default='',
        help_text='如 001、002，仅在访视点 V1 签到时按项目内顺序分配，后续访视复用',
    )
    rd_number = models.CharField(
        'RD号', max_length=20, blank=True, default='',
        help_text='仅当入组情况为正式入组时可填写，如 RD001',
    )
    enrollment_status = models.CharField(
        '入组情况', max_length=20, blank=True, default='',
        choices=[(c.value, c.label) for c in EnrollmentStatusSC],
        help_text='初筛合格/正式入组/不合格/复筛不合格/退出/缺席',
    )
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    updated_by_id = models.IntegerField('更新人ID', null=True, blank=True)
    is_deleted = models.BooleanField('是否删除', default=False)

    def __str__(self):
        return f'{self.subject_id}@{self.project_code} -> {self.sc_number or "-"}'


# ============================================================================
# 客服工单
# ============================================================================
class SupportTicketStatus(models.TextChoices):
    OPEN = 'open', '待处理'
    IN_PROGRESS = 'in_progress', '处理中'
    REPLIED = 'replied', '已回复'
    CLOSED = 'closed', '已关闭'


class SupportTicketCategory(models.TextChoices):
    QUESTION = 'question', '咨询'
    COMPLAINT = 'complaint', '投诉'
    SUGGESTION = 'suggestion', '建议'
    SCHEDULE = 'schedule', '排程相关'
    PAYMENT = 'payment', '礼金相关'
    OTHER = 'other', '其他'


class SubjectSupportTicket(models.Model):
    """受试者客服答疑工单"""

    class Meta:
        db_table = 't_subject_support_ticket'
        verbose_name = '客服工单'

    subject = models.ForeignKey('subject.Subject', on_delete=models.CASCADE, related_name='support_tickets')
    ticket_no = models.CharField('工单编号', max_length=50, unique=True, db_index=True)
    category = models.CharField('分类', max_length=20, choices=SupportTicketCategory.choices, default=SupportTicketCategory.QUESTION)
    title = models.CharField('标题', max_length=200)
    content = models.TextField('内容')
    status = models.CharField('状态', max_length=20, choices=SupportTicketStatus.choices, default=SupportTicketStatus.OPEN, db_index=True)
    reply = models.TextField('回复内容', blank=True, default='')
    replied_at = models.DateTimeField('回复时间', null=True, blank=True)
    replied_by_id = models.IntegerField('回复人ID', null=True, blank=True)
    assigned_to_id = models.IntegerField('处理人ID', null=True, blank=True, db_index=True)
    priority = models.CharField('优先级', max_length=20, default='normal', db_index=True)
    sla_due_at = models.DateTimeField('SLA截止时间', null=True, blank=True)
    first_response_at = models.DateTimeField('首次响应时间', null=True, blank=True)
    closed_at = models.DateTimeField('关闭时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.ticket_no} - {self.title}'


# ============================================================================
# 接待看板独立签到/签出（与工单执行 SubjectCheckin 分离，互不影响）
# ============================================================================
class ReceptionBoardCheckin(models.Model):
    """接待看板专用签到/签出记录，与工单执行的 SubjectCheckin 独立。"""

    class Meta:
        db_table = 't_reception_board_checkin'
        verbose_name = '接待看板签到记录'
        indexes = [
            models.Index(fields=['subject_id', 'checkin_date']),
        ]
        unique_together = [['subject', 'checkin_date']]

    subject = models.ForeignKey('subject.Subject', on_delete=models.CASCADE, related_name='reception_board_checkins')
    checkin_date = models.DateField('签到日期')
    checkin_time = models.DateTimeField('接待看板签到时间', null=True, blank=True)
    checkout_time = models.DateTimeField('接待看板签出时间', null=True, blank=True)
    appointment_id = models.IntegerField('关联预约ID', null=True, blank=True, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'Board {self.subject.name} - {self.checkin_date}'


class ReceptionBoardProjectSc(models.Model):
    """接待看板专用 SC 号/入组情况/RD 号，与工单执行 SubjectProjectSC 独立。"""

    class Meta:
        db_table = 't_reception_board_project_sc'
        verbose_name = '接待看板项目SC'
        unique_together = [['subject', 'project_code']]
        indexes = [
            models.Index(fields=['subject_id', 'project_code']),
        ]

    subject = models.ForeignKey('subject.Subject', on_delete=models.CASCADE, related_name='reception_board_project_sc')
    project_code = models.CharField('项目编号', max_length=64, db_index=True)
    sc_number = models.CharField('SC号', max_length=20, blank=True, default='')
    enrollment_status = models.CharField('入组情况', max_length=32, blank=True, default='')
    rd_number = models.CharField('RD号', max_length=20, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'Board {self.subject.name} {self.project_code}'
