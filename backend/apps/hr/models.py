"""
人事能力模型

包含：资质管理（GCP）、胜任力模型、能力评估、培训跟踪
"""
from django.db import models


# ============================================================================
# 资质管理
# ============================================================================
class GCPStatus(models.TextChoices):
    VALID = 'valid', '有效'
    EXPIRING = 'expiring', '即将过期'
    EXPIRED = 'expired', '已过期'
    NONE = 'none', '无证书'


class Staff(models.Model):
    """人员资质"""

    class Meta:
        db_table = 't_staff'
        verbose_name = '人员资质'
        ordering = ['name']
        indexes = [
            models.Index(fields=['gcp_status']),
            models.Index(fields=['department']),
        ]

    name = models.CharField('姓名', max_length=100)
    employee_no = models.CharField('工号', max_length=50, blank=True, default='', db_index=True)
    position = models.CharField('岗位', max_length=200)
    department = models.CharField('部门', max_length=100)
    phone = models.CharField('手机号', max_length=50, blank=True, default='')
    email = models.EmailField('邮箱', blank=True, default='')
    gcp_cert = models.CharField('GCP证书号', max_length=100, blank=True, default='')
    gcp_expiry = models.DateField('GCP到期日', null=True, blank=True)
    gcp_status = models.CharField('GCP状态', max_length=20, choices=GCPStatus.choices, default=GCPStatus.NONE)
    other_certs = models.TextField('其他资质', blank=True, default='')
    training_status = models.CharField('培训状态', max_length=20, blank=True, default='未开始')
    account_id = models.IntegerField('关联账户ID', null=True, blank=True, db_index=True)
    account_fk = models.ForeignKey(
        'identity.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hr_staff_records',
        db_index=True,
        db_column='account_fk_id',
        verbose_name='关联账户FK',
    )
    feishu_open_id = models.CharField('飞书Open ID', max_length=100, blank=True, default='',
                                      db_index=True, unique=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.name} ({self.position})'

    @property
    def effective_account_id(self):
        """兼容双轨期：优先使用 FK，再回退历史整数字段。"""
        return self.account_fk_id or self.account_id


# ============================================================================
# 胜任力模型
# ============================================================================
class CompetencyModel(models.Model):
    """胜任力维度"""

    class Meta:
        db_table = 't_competency_model'
        verbose_name = '胜任力模型'
        ordering = ['sort_order']

    name = models.CharField('维度名称', max_length=100)
    description = models.TextField('描述', blank=True, default='')
    icon = models.CharField('图标', max_length=20, blank=True, default='')
    levels = models.JSONField('等级描述', default=list, help_text='JSON 数组，按等级排列')
    sort_order = models.IntegerField('排序', default=0)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return self.name


# ============================================================================
# 能力评估
# ============================================================================
class AssessmentStatus(models.TextChoices):
    PENDING = 'pending', '未开始'
    IN_PROGRESS = 'in_progress', '评估中'
    COMPLETED = 'completed', '已完成'


class Assessment(models.Model):
    """能力评估"""

    class Meta:
        db_table = 't_assessment'
        verbose_name = '能力评估'
        ordering = ['-period', 'staff__name']
        indexes = [
            models.Index(fields=['staff', 'period']),
            models.Index(fields=['status']),
        ]

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='assessments', verbose_name='被评估人')
    period = models.CharField('评估期', max_length=20, help_text='如 2025-H2')
    scores = models.JSONField('各维度分数', default=dict, help_text='{"维度名": 分数}')
    overall = models.CharField('综合评价', max_length=20, blank=True, default='')
    status = models.CharField('状态', max_length=20, choices=AssessmentStatus.choices, default=AssessmentStatus.PENDING)
    assessor = models.CharField('评估人', max_length=100)
    assessor_id = models.IntegerField('评估人ID', null=True, blank=True)
    comments = models.TextField('评估意见', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.staff.name} - {self.period}'


# ============================================================================
# 培训跟踪
# ============================================================================
class TrainingStatus(models.TextChoices):
    SCHEDULED = 'scheduled', '已排期'
    IN_PROGRESS = 'in_progress', '进行中'
    COMPLETED = 'completed', '已完成'
    OVERDUE = 'overdue', '已逾期'


class Training(models.Model):
    """培训记录"""

    class Meta:
        db_table = 't_training'
        verbose_name = '培训记录'
        ordering = ['-start_date']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['trainee', 'status']),
        ]

    course_name = models.CharField('课程名称', max_length=300)
    category = models.CharField('类别', max_length=50)
    trainee = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='trainings', verbose_name='学员')
    trainer = models.CharField('讲师', max_length=100)
    start_date = models.DateField('开始日期')
    end_date = models.DateField('结束日期', null=True, blank=True)
    hours = models.IntegerField('学时')
    status = models.CharField('状态', max_length=20, choices=TrainingStatus.choices, default=TrainingStatus.SCHEDULED)
    score = models.CharField('考核分', max_length=20, blank=True, default='')
    feishu_calendar_id = models.CharField('飞书日历ID', max_length=100, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.course_name} - {self.trainee.name}'


# ============================================================================
# S3-4：项目-人员分配
# ============================================================================
class ProjectAssignment(models.Model):
    """
    项目人员分配

    关联协议 + Staff，定义角色和工作量。
    用于工作负荷计算、项目群自动拉人。
    """

    class Meta:
        db_table = 't_project_assignment'
        verbose_name = '项目人员分配'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['protocol_id', 'staff']),
            models.Index(fields=['staff', 'is_active']),
        ]
        unique_together = [('protocol_id', 'staff', 'role')]

    protocol_id = models.IntegerField('协议ID', db_index=True, help_text='关联 Protocol.id')
    staff = models.ForeignKey(Staff, on_delete=models.CASCADE,
                              related_name='project_assignments', verbose_name='员工')
    role = models.CharField('项目角色', max_length=50,
                            help_text='如 PM/CRA/CRC/DM/MW/QC')
    workload_percentage = models.IntegerField('工作量占比(%)', default=100,
                                              help_text='0-100, 此项目占该员工总工作量百分比')
    is_active = models.BooleanField('是否活跃', default=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'Protocol#{self.protocol_id} - {self.staff.name}({self.role})'


# ============================================================================
# P1：人事档案中心
# ============================================================================
class EmploymentStatus(models.TextChoices):
    PROBATION = 'probation', '试用期'
    ACTIVE = 'active', '在职'
    LEAVE = 'leave', '停薪留职'
    EXITED = 'exited', '已离职'


class EmploymentType(models.TextChoices):
    FULL_TIME = 'full_time', '全职'
    PART_TIME = 'part_time', '兼职'
    CONTRACTOR = 'contractor', '外包'
    INTERN = 'intern', '实习'


class StaffArchive(models.Model):
    """员工人事档案主表（公司级主数据）"""

    class Meta:
        db_table = 't_staff_archive'
        verbose_name = '员工人事档案'
        indexes = [
            models.Index(fields=['employment_status']),
            models.Index(fields=['employment_type']),
            models.Index(fields=['department']),
        ]

    staff = models.OneToOneField(Staff, on_delete=models.CASCADE, related_name='archive', verbose_name='员工')
    department = models.CharField('部门', max_length=100, blank=True, default='')
    manager_name = models.CharField('直属上级', max_length=100, blank=True, default='')
    job_rank = models.CharField('职级', max_length=50, blank=True, default='')
    employment_status = models.CharField(
        '任职状态', max_length=20, choices=EmploymentStatus.choices, default=EmploymentStatus.ACTIVE,
    )
    employment_type = models.CharField(
        '用工类型', max_length=20, choices=EmploymentType.choices, default=EmploymentType.FULL_TIME,
    )
    hire_date = models.DateField('入职日期', null=True, blank=True)
    regular_date = models.DateField('转正日期', null=True, blank=True)
    id_card_no = models.CharField('证件号', max_length=64, blank=True, default='')
    emergency_contact = models.CharField('紧急联系人', max_length=100, blank=True, default='')
    emergency_phone = models.CharField('紧急联系电话', max_length=50, blank=True, default='')
    address = models.CharField('联系地址', max_length=255, blank=True, default='')
    last_sync_at = models.DateTimeField('最近同步时间', null=True, blank=True)
    sync_source = models.CharField('同步来源', max_length=50, blank=True, default='manual')
    sync_hash = models.CharField('同步哈希', max_length=64, blank=True, default='')
    sync_locked_fields = models.JSONField('人工锁定字段', default=list, blank=True)
    remarks = models.TextField('备注', blank=True, default='')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.staff.name} 档案'


class StaffContract(models.Model):
    """员工合同台账"""

    class Meta:
        db_table = 't_staff_contract'
        verbose_name = '员工合同'
        indexes = [models.Index(fields=['staff', 'status']), models.Index(fields=['end_date'])]

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='contracts', verbose_name='员工')
    contract_no = models.CharField('合同编号', max_length=100)
    contract_type = models.CharField('合同类型', max_length=50, blank=True, default='劳动合同')
    start_date = models.DateField('开始日期')
    end_date = models.DateField('结束日期', null=True, blank=True)
    status = models.CharField('合同状态', max_length=20, blank=True, default='active')
    auto_renew = models.BooleanField('自动续签', default=False)
    file_url = models.CharField('附件链接', max_length=500, blank=True, default='')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


class HrStaffCertificate(models.Model):
    """员工证照台账（补充 GCP 以外证照）"""

    class Meta:
        db_table = 't_hr_staff_certificate'
        verbose_name = '员工证照'
        indexes = [models.Index(fields=['staff', 'cert_type']), models.Index(fields=['expiry_date'])]

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='certificate_entries', verbose_name='员工')
    cert_type = models.CharField('证照类型', max_length=100)
    cert_no = models.CharField('证照编号', max_length=100, blank=True, default='')
    issuer = models.CharField('发证机构', max_length=100, blank=True, default='')
    issue_date = models.DateField('发证日期', null=True, blank=True)
    expiry_date = models.DateField('到期日期', null=True, blank=True)
    status = models.CharField('状态', max_length=20, blank=True, default='valid')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


class StaffChangeLog(models.Model):
    """员工异动台账"""

    class Meta:
        db_table = 't_staff_change_log'
        verbose_name = '员工异动记录'
        ordering = ['-change_date', '-id']
        indexes = [models.Index(fields=['staff', 'change_type']), models.Index(fields=['change_date'])]

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='change_logs', verbose_name='员工')
    change_type = models.CharField('异动类型', max_length=50, help_text='入职/转正/调岗/晋升/降级/离职等')
    change_date = models.DateField('异动日期')
    before_data = models.JSONField('变更前', default=dict, blank=True)
    after_data = models.JSONField('变更后', default=dict, blank=True)
    operated_by = models.CharField('操作人', max_length=100, blank=True, default='')
    reason = models.TextField('原因说明', blank=True, default='')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)


class StaffExitRecord(models.Model):
    """员工离职台账"""

    class Meta:
        db_table = 't_staff_exit_record'
        verbose_name = '员工离职记录'
        indexes = [models.Index(fields=['staff']), models.Index(fields=['exit_date'])]

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='exit_records', verbose_name='员工')
    exit_date = models.DateField('离职日期')
    exit_type = models.CharField('离职类型', max_length=30, blank=True, default='主动离职')
    reason = models.TextField('离职原因', blank=True, default='')
    handover_status = models.CharField('交接状态', max_length=20, blank=True, default='pending')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


# ============================================================================
# P2：招聘、绩效、薪酬激励、文化
# ============================================================================
class RecruitmentDemand(models.Model):
    class Meta:
        db_table = 't_hr_recruitment_demand'
        verbose_name = '招聘需求'
        ordering = ['-create_time']

    title = models.CharField('需求标题', max_length=200)
    department = models.CharField('需求部门', max_length=100, blank=True, default='')
    headcount = models.IntegerField('需求人数', default=1)
    owner = models.CharField('需求负责人', max_length=100, blank=True, default='')
    status = models.CharField('状态', max_length=30, blank=True, default='draft')
    target_date = models.DateField('目标到岗日', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


class RecruitmentCandidate(models.Model):
    class Meta:
        db_table = 't_hr_recruitment_candidate'
        verbose_name = '候选人'
        ordering = ['-create_time']

    demand = models.ForeignKey(
        RecruitmentDemand, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='candidates', verbose_name='招聘需求',
    )
    name = models.CharField('姓名', max_length=100)
    phone = models.CharField('手机号', max_length=50, blank=True, default='')
    source = models.CharField('来源渠道', max_length=50, blank=True, default='')
    stage = models.CharField('招聘阶段', max_length=30, blank=True, default='screening')
    interviewer = models.CharField('面试官', max_length=100, blank=True, default='')
    offer_amount = models.DecimalField('拟定薪资', max_digits=12, decimal_places=2, default=0)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


class PerformanceCycle(models.Model):
    class Meta:
        db_table = 't_hr_performance_cycle'
        verbose_name = '绩效周期'
        ordering = ['-period_start']

    name = models.CharField('周期名称', max_length=100)
    period_start = models.DateField('开始日期')
    period_end = models.DateField('结束日期')
    status = models.CharField('状态', max_length=30, blank=True, default='draft')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


class PerformanceRecord(models.Model):
    class Meta:
        db_table = 't_hr_performance_record'
        verbose_name = '绩效记录'
        ordering = ['-create_time']
        indexes = [models.Index(fields=['staff', 'status'])]

    cycle = models.ForeignKey(
        PerformanceCycle, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='records', verbose_name='绩效周期',
    )
    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='performance_records', verbose_name='员工')
    score = models.DecimalField('绩效分', max_digits=5, decimal_places=2, default=0)
    grade = models.CharField('绩效等级', max_length=20, blank=True, default='')
    status = models.CharField('状态', max_length=30, blank=True, default='draft')
    improvement_plan = models.TextField('改进计划', blank=True, default='')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


class PayrollRecord(models.Model):
    class Meta:
        db_table = 't_hr_payroll_record'
        verbose_name = '薪资记录'
        ordering = ['-pay_month']
        indexes = [models.Index(fields=['staff', 'pay_month'])]

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='payroll_records', verbose_name='员工')
    pay_month = models.CharField('薪资月份', max_length=7, help_text='YYYY-MM')
    base_salary = models.DecimalField('基本工资', max_digits=12, decimal_places=2, default=0)
    bonus = models.DecimalField('奖金', max_digits=12, decimal_places=2, default=0)
    deductions = models.DecimalField('扣减', max_digits=12, decimal_places=2, default=0)
    net_salary = models.DecimalField('实发', max_digits=12, decimal_places=2, default=0)
    status = models.CharField('状态', max_length=20, blank=True, default='draft')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


class IncentiveRecord(models.Model):
    class Meta:
        db_table = 't_hr_incentive_record'
        verbose_name = '激励记录'
        ordering = ['-grant_date']

    staff = models.ForeignKey(Staff, on_delete=models.CASCADE, related_name='incentive_records', verbose_name='员工')
    incentive_type = models.CharField('激励类型', max_length=50, blank=True, default='bonus')
    amount = models.DecimalField('激励金额', max_digits=12, decimal_places=2, default=0)
    reason = models.TextField('激励原因', blank=True, default='')
    grant_date = models.DateField('发放日期', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)


class CultureActivity(models.Model):
    class Meta:
        db_table = 't_hr_culture_activity'
        verbose_name = '企业文化活动'
        ordering = ['-planned_date']

    title = models.CharField('活动主题', max_length=200)
    category = models.CharField('活动类型', max_length=50, blank=True, default='文化活动')
    planned_date = models.DateField('计划日期', null=True, blank=True)
    owner = models.CharField('负责人', max_length=100, blank=True, default='')
    status = models.CharField('状态', max_length=30, blank=True, default='planned')
    participant_count = models.IntegerField('参与人数', default=0)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


class EngagementPulse(models.Model):
    class Meta:
        db_table = 't_hr_engagement_pulse'
        verbose_name = '敬业度脉冲'
        ordering = ['-survey_month']

    survey_month = models.CharField('调查月份', max_length=7, help_text='YYYY-MM')
    score = models.DecimalField('敬业度得分', max_digits=5, decimal_places=2, default=0)
    risk_level = models.CharField('风险等级', max_length=20, blank=True, default='low')
    actions = models.TextField('跟进行动', blank=True, default='')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)


# ============================================================================
# P3：跨工作台协同治理
# ============================================================================
class HrCollaborationSnapshot(models.Model):
    class Meta:
        db_table = 't_hr_collaboration_snapshot'
        verbose_name = '跨台协同快照'
        ordering = ['-create_time']
        indexes = [models.Index(fields=['source_workstation', 'data_type'])]

    source_workstation = models.CharField('来源工作台', max_length=50)
    data_type = models.CharField('数据类型', max_length=100)
    period = models.CharField('统计周期', max_length=50, blank=True, default='')
    payload = models.JSONField('快照数据', default=dict, blank=True)
    sync_status = models.CharField('同步状态', max_length=20, blank=True, default='pending')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)


# ============================================================================
# P4：绩效结算体系
# ============================================================================

class PerformanceRuleStatus(models.TextChoices):
    ACTIVE = 'active', '启用'
    INACTIVE = 'inactive', '停用'
    DRAFT = 'draft', '草稿'


class PerformanceRule(models.Model):
    """绩效计算规则版本，可按时间段启停。"""
    class Meta:
        db_table = 't_hr_performance_rule'
        verbose_name = '绩效规则'
        ordering = ['-effective_from']

    name = models.CharField('规则名称', max_length=200)
    version = models.CharField('版本号', max_length=50, blank=True, default='')
    effective_from = models.DateField('生效日期')
    effective_to = models.DateField('失效日期', null=True, blank=True)
    group_config = models.JSONField(
        '组别配置', default=dict, blank=True,
        help_text='{"C01": {"label": "心电组", "pool_ratio": 0.3}, ...}',
    )
    weight_config = models.JSONField(
        '维度权重', default=dict, blank=True,
        help_text='{"workorder": 0.4, "quality": 0.2, "amount": 0.3, "timeliness": 0.1}',
    )
    threshold_config = models.JSONField(
        '等级阈值', default=dict, blank=True,
        help_text='{"S": 90, "A": 75, "B": 60, "C": 0}',
    )
    cap_floor_config = models.JSONField(
        '封顶保底', default=dict, blank=True,
        help_text='{"cap_multiplier": 2.0, "floor_multiplier": 0.5}',
    )
    status = models.CharField(
        '状态', max_length=20,
        choices=PerformanceRuleStatus.choices, default=PerformanceRuleStatus.DRAFT,
    )
    approved_by = models.CharField('审批人', max_length=100, blank=True, default='')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.name} ({self.version})'


class SettlementStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SUBMITTED = 'submitted', '已提交'
    REVIEWING = 'reviewing', '审核中'
    APPROVED = 'approved', '已批准'
    RELEASED = 'released', '已发放'
    ARCHIVED = 'archived', '已归档'
    REOPENED = 'reopened', '已重开'


class PerformanceSettlement(models.Model):
    """月度绩效结算单（Header），聚合当月所有人的结算明细。"""
    class Meta:
        db_table = 't_hr_performance_settlement'
        verbose_name = '绩效结算单'
        ordering = ['-period']
        constraints = [
            models.UniqueConstraint(fields=['period', 'rule'],
                                    name='uq_settlement_period_rule'),
        ]

    period = models.CharField('结算月份', max_length=7, help_text='YYYY-MM')
    title = models.CharField('标题', max_length=200, blank=True, default='')
    rule = models.ForeignKey(
        PerformanceRule, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='settlements', verbose_name='关联规则',
    )
    status = models.CharField(
        '状态', max_length=20,
        choices=SettlementStatus.choices, default=SettlementStatus.DRAFT,
    )
    total_pool = models.DecimalField(
        '奖金池总额', max_digits=14, decimal_places=2, default=0,
    )
    total_allocated = models.DecimalField(
        '已分配总额', max_digits=14, decimal_places=2, default=0,
    )
    data_completeness = models.DecimalField(
        '数据完整度', max_digits=5, decimal_places=2, default=0,
        help_text='0-100，缺数据时低于 100 但不阻断',
    )
    source_snapshot_ids = models.JSONField(
        '关联贡献快照', default=list, blank=True,
    )
    notes = models.TextField('备注', blank=True, default='')
    created_by = models.CharField('创建人', max_length=100, blank=True, default='')
    submitted_by = models.CharField('提交人', max_length=100, blank=True, default='')
    approved_by = models.CharField('审批人', max_length=100, blank=True, default='')
    submitted_at = models.DateTimeField('提交时间', null=True, blank=True)
    approved_at = models.DateTimeField('审批时间', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.period} - {self.title or "结算单"}'


class LineLockStatus(models.TextChoices):
    UNLOCKED = 'unlocked', '未锁定'
    LOCKED = 'locked', '已锁定'


class SettlementLine(models.Model):
    """结算明细行——每人一行，可手工调整。"""
    class Meta:
        db_table = 't_hr_settlement_line'
        verbose_name = '结算明细'
        ordering = ['group_name', '-final_score']
        indexes = [models.Index(fields=['settlement', 'staff'])]
        constraints = [
            models.UniqueConstraint(fields=['settlement', 'staff'],
                                    name='uq_line_settlement_staff'),
        ]

    settlement = models.ForeignKey(
        PerformanceSettlement, on_delete=models.CASCADE,
        related_name='lines', verbose_name='结算单',
    )
    staff = models.ForeignKey(
        Staff, on_delete=models.CASCADE,
        related_name='settlement_lines', verbose_name='员工',
    )
    group_name = models.CharField('组别', max_length=50, blank=True, default='')
    role_label = models.CharField('角色标签', max_length=50, blank=True, default='')
    contribution_data = models.JSONField('贡献原始数据', default=dict, blank=True)
    base_score = models.DecimalField('基础分', max_digits=8, decimal_places=2, default=0)
    quality_adjust = models.DecimalField('质量校正', max_digits=8, decimal_places=2, default=0)
    manual_adjust = models.DecimalField('人工调整', max_digits=8, decimal_places=2, default=0)
    manual_adjust_reason = models.TextField('调整说明', blank=True, default='')
    final_score = models.DecimalField('最终分', max_digits=8, decimal_places=2, default=0)
    suggested_bonus = models.DecimalField('建议奖金', max_digits=12, decimal_places=2, default=0)
    final_bonus = models.DecimalField('确认奖金', max_digits=12, decimal_places=2, default=0)
    grade = models.CharField('等级', max_length=10, blank=True, default='')
    lock_status = models.CharField(
        '锁定状态', max_length=20,
        choices=LineLockStatus.choices, default=LineLockStatus.UNLOCKED,
    )
    evidence_refs = models.JSONField('证据引用', default=list, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.settlement.period} - {self.staff}'


class ContributionSnapshot(models.Model):
    """来自研究台或其他工作台的贡献数据快照，支持自动采集和手工录入。"""
    class Meta:
        db_table = 't_hr_contribution_snapshot'
        verbose_name = '贡献快照'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['period', 'source_workstation']),
            models.Index(fields=['staff', 'period']),
        ]

    period = models.CharField('统计月份', max_length=7, help_text='YYYY-MM')
    source_workstation = models.CharField('来源工作台', max_length=50, default='manual')
    staff = models.ForeignKey(
        Staff, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='contribution_snapshots', verbose_name='员工',
    )
    staff_name = models.CharField('姓名（冗余）', max_length=100, blank=True, default='')
    project_code = models.CharField('项目编号', max_length=100, blank=True, default='')
    group_name = models.CharField('组别', max_length=50, blank=True, default='')
    role_in_project = models.CharField('项目角色', max_length=50, blank=True, default='')
    metrics = models.JSONField(
        '指标数据', default=dict, blank=True,
        help_text='{"workorder_count": 12, "on_time_rate": 0.95, ...}',
    )
    amount_contribution = models.DecimalField(
        '金额贡献', max_digits=14, decimal_places=2, null=True, blank=True,
    )
    data_confidence = models.DecimalField(
        '数据置信度', max_digits=3, decimal_places=2, default=1.00,
        help_text='0.00-1.00，手工录入=0.50，Excel=0.70，自动采集=1.00',
    )
    import_source = models.CharField(
        '导入来源', max_length=50, blank=True, default='manual',
        help_text='auto/manual/excel',
    )
    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.period} {self.staff_name or self.staff}'


class SettlementAuditLog(models.Model):
    """结算单状态变更审计日志，不可删除。"""
    class Meta:
        db_table = 't_hr_settlement_audit_log'
        verbose_name = '结算审计日志'
        ordering = ['-create_time']

    settlement = models.ForeignKey(
        PerformanceSettlement, on_delete=models.CASCADE,
        related_name='audit_logs', verbose_name='结算单',
    )
    action = models.CharField('操作', max_length=50)
    from_status = models.CharField('原状态', max_length=20, blank=True, default='')
    to_status = models.CharField('新状态', max_length=20, blank=True, default='')
    operator = models.CharField('操作人', max_length=100, blank=True, default='')
    detail = models.JSONField('变更明细', default=dict, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.settlement.period} {self.action}'
