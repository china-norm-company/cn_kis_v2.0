"""
实验室人员管理 — 核心模型

包含：
- LabStaffProfile: 实验室人员扩展档案（1:1 关联 hr.Staff）
- StaffCertificate: 多证书管理
- MethodQualification: 人员检测方法资质
"""
from django.db import models


# ============================================================================
# 枚举定义
# ============================================================================
class LabRole(models.TextChoices):
    INSTRUMENT_OPERATOR = 'instrument_operator', '仪器操作员'
    MEDICAL_EVALUATOR = 'medical_evaluator', '医生评估员'
    CRC = 'crc', '临床协调员(CRC)'
    EQUIPMENT_SUPPORT = 'equipment_support', '仪器保障人员'
    FACILITY_SUPPORT = 'facility_support', '场地保障人员'
    SAMPLE_MANAGER = 'sample_manager', '样品管理员'


class EmploymentType(models.TextChoices):
    FULL_TIME = 'full_time', '内部全职'
    PART_TIME = 'part_time', '内部兼职'
    EXTERNAL = 'external', '外部兼职'


class CompetencyLevel(models.TextChoices):
    L1_LEARNING = 'L1', '学习期'
    L2_PROBATION = 'L2', '见习期'
    L3_INDEPENDENT = 'L3', '独立期'
    L4_EXPERT = 'L4', '专家期'
    L5_MENTOR = 'L5', '带教导师'


class CertificateType(models.TextChoices):
    GCP = 'gcp', 'GCP证书'
    MEDICAL_LICENSE = 'medical_license', '医师执业证'
    NURSING_LICENSE = 'nursing_license', '护士执业证'
    PROFESSIONAL_SKILL = 'professional_skill', '专业技能证书'
    SAFETY_TRAINING = 'safety_training', '安全培训证书'
    OTHER = 'other', '其他'


class CertificateStatus(models.TextChoices):
    VALID = 'valid', '有效'
    EXPIRING_90 = 'expiring_90', '90天内到期'
    EXPIRING_30 = 'expiring_30', '30天内到期'
    EXPIRING_7 = 'expiring_7', '7天内到期'
    EXPIRED = 'expired', '已过期'
    REVOKED = 'revoked', '已撤销'


class MethodQualLevel(models.TextChoices):
    LEARNING = 'learning', '学习中'
    PROBATION = 'probation', '见习'
    INDEPENDENT = 'independent', '独立'
    MENTOR = 'mentor', '带教'


# ============================================================================
# LabStaffProfile — 实验室人员扩展档案
# ============================================================================
class LabStaffProfile(models.Model):
    """实验室人员扩展档案 — 一对一关联 hr.Staff"""

    class Meta:
        db_table = 't_lab_staff_profile'
        verbose_name = '实验室人员档案'
        indexes = [
            models.Index(fields=['lab_role', 'is_active']),
            models.Index(fields=['employment_type']),
            models.Index(fields=['competency_level']),
        ]

    staff = models.OneToOneField('hr.Staff', on_delete=models.CASCADE,
                                  related_name='lab_profile', verbose_name='关联人员')

    # 实验室角色
    lab_role = models.CharField('实验室角色', max_length=30,
                                choices=LabRole.choices, default=LabRole.INSTRUMENT_OPERATOR)
    lab_role_secondary = models.CharField('辅助角色', max_length=30,
                                          choices=LabRole.choices, blank=True, default='')
    employment_type = models.CharField('雇佣类型', max_length=20,
                                       choices=EmploymentType.choices, default=EmploymentType.FULL_TIME)

    # 能力等级
    competency_level = models.CharField('能力等级', max_length=5,
                                        choices=CompetencyLevel.choices, default=CompetencyLevel.L1_LEARNING)
    competency_level_updated_at = models.DateField('等级更新日期', null=True, blank=True)

    # 排班约束
    available_weekdays = models.JSONField('可排班工作日', default=list,
                                          help_text='[1,2,3,4,5] 表示周一至周五')
    max_daily_hours = models.IntegerField('每日最大工时', default=8)
    max_weekly_hours = models.IntegerField('每周最大工时', default=40)
    unavailable_dates = models.JSONField('不可用日期', default=list,
                                         help_text='["2026-03-01","2026-03-02"]')

    # 导师/带教关系
    mentor_id = models.IntegerField('导师Staff ID', null=True, blank=True)

    # 替补预案（B 角）
    backup_staff_ids = models.JSONField(
        '替补人员ID列表', default=list, blank=True,
        help_text='JSON 数组 [staff_id1, staff_id2]，用于排班替补预案',
    )

    # 状态
    is_active = models.BooleanField('是否在岗', default=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.staff.name} - {self.get_lab_role_display()}'


# ============================================================================
# StaffCertificate — 多证书管理
# ============================================================================
class StaffCertificate(models.Model):
    """人员资质证书"""

    class Meta:
        db_table = 't_staff_certificate'
        verbose_name = '资质证书'
        ordering = ['staff', '-expiry_date']
        indexes = [
            models.Index(fields=['staff', 'cert_type', 'status']),
            models.Index(fields=['status']),
            models.Index(fields=['expiry_date']),
        ]

    staff = models.ForeignKey('hr.Staff', on_delete=models.CASCADE,
                               related_name='certificates', verbose_name='人员')
    cert_type = models.CharField('证书类型', max_length=30,
                                  choices=CertificateType.choices)
    cert_name = models.CharField('证书名称', max_length=200)
    cert_number = models.CharField('证书编号', max_length=100, blank=True, default='')
    issuing_authority = models.CharField('发证机关', max_length=200, blank=True, default='')
    issue_date = models.DateField('发证日期', null=True, blank=True)
    expiry_date = models.DateField('到期日期', null=True, blank=True,
                                    help_text='null 表示永久有效')
    status = models.CharField('状态', max_length=20,
                               choices=CertificateStatus.choices, default=CertificateStatus.VALID)
    file_url = models.CharField('证书文件URL', max_length=500, blank=True, default='')

    is_locked = models.BooleanField('是否已锁定', default=False,
                                     help_text='过期自动锁定，禁止持证人接受工单')

    feishu_reminder_task_id = models.CharField('飞书续期提醒任务ID', max_length=100, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.staff.name} - {self.cert_name}'


# ============================================================================
# MethodQualification — 人员检测方法资质
# ============================================================================
class MethodQualification(models.Model):
    """人员检测方法资质"""

    class Meta:
        db_table = 't_method_qualification'
        verbose_name = '方法资质'
        unique_together = [('staff', 'method')]
        indexes = [
            models.Index(fields=['staff', 'level']),
            models.Index(fields=['method', 'level']),
        ]

    staff = models.ForeignKey('hr.Staff', on_delete=models.CASCADE,
                               related_name='method_qualifications', verbose_name='人员')
    method = models.ForeignKey('resource.DetectionMethodTemplate', on_delete=models.CASCADE,
                                related_name='qualified_personnel', verbose_name='检测方法')
    level = models.CharField('资质等级', max_length=20,
                              choices=MethodQualLevel.choices, default=MethodQualLevel.LEARNING)
    qualified_date = models.DateField('认定日期', null=True, blank=True)
    expiry_date = models.DateField('资质有效期', null=True, blank=True)
    training_id = models.IntegerField('关联培训记录ID', null=True, blank=True)
    assessment_id = models.IntegerField('关联评估记录ID', null=True, blank=True)
    total_executions = models.IntegerField('累计执行次数', default=0)
    last_execution_date = models.DateField('最近执行日期', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.staff.name} - {self.method.name} ({self.get_level_display()})'


# 注册排班模型
from .models_scheduling import (  # noqa: E402, F401
    ShiftSchedule, ShiftSlot, ShiftSwapRequest,
)

# 注册工时模型
from .models_worktime import (  # noqa: E402, F401
    WorkTimeLog, WorkTimeSummary,
)

# 注册风险模型
from .models_risk import (  # noqa: E402, F401
    RiskAlert,
)

# 注册合规增强模型
from .models_compliance import (  # noqa: E402, F401
    DelegationLog, FieldChangeLog,
)

__all__ = [
    'LabRole', 'EmploymentType', 'CompetencyLevel',
    'CertificateType', 'CertificateStatus', 'MethodQualLevel',
    'LabStaffProfile', 'StaffCertificate', 'MethodQualification',
    'ShiftSchedule', 'ShiftSlot', 'ShiftSwapRequest',
    'WorkTimeLog', 'WorkTimeSummary',
    'RiskAlert',
    'DelegationLog', 'FieldChangeLog',
]
