"""
受试者管理模型

包含：受试者主索引、入组记录、知情同意书版本与签署记录。
Subject 作为受试者数据资产的核心实体，所有业务数据最终关联回 Subject。
"""
from django.db import models


class SubjectGender(models.TextChoices):
    MALE = 'male', '男'
    FEMALE = 'female', '女'
    OTHER = 'other', '其他'


class SubjectSkinType(models.TextChoices):
    TYPE_I = 'I', 'I型'
    TYPE_II = 'II', 'II型'
    TYPE_III = 'III', 'III型'
    TYPE_IV = 'IV', 'IV型'
    TYPE_V = 'V', 'V型'
    TYPE_VI = 'VI', 'VI型'


class SubjectRiskLevel(models.TextChoices):
    LOW = 'low', '低风险'
    MEDIUM = 'medium', '中风险'
    HIGH = 'high', '高风险'


class SubjectStatus(models.TextChoices):
    PRE_SCREENING = 'pre_screening', '粗筛中'
    PRE_SCREENED = 'pre_screened', '粗筛通过'
    SCREENING = 'screening', '筛选中'
    ENROLLED = 'enrolled', '已入组'
    ACTIVE = 'active', '进行中'
    COMPLETED = 'completed', '已完成'
    WITHDRAWN = 'withdrawn', '已退出'
    DISQUALIFIED = 'disqualified', '不符合'


class AuthLevel(models.TextChoices):
    """认证等级：L0 游客 / L1 手机认证 / L2 实名认证"""
    GUEST = 'guest', '游客'
    PHONE_VERIFIED = 'phone_verified', '手机已认证'
    IDENTITY_VERIFIED = 'identity_verified', '实名已认证'


class IdentityVerifyStatus(models.TextChoices):
    """单次实名核验状态"""
    PENDING = 'pending', '待结果'
    VERIFIED = 'verified', '已通过'
    REJECTED = 'rejected', '未通过'
    EXPIRED = 'expired', '已过期'


class SubjectSourceChannel(models.TextChoices):
    HOSPITAL = 'hospital', '医院'
    CLINIC = 'clinic', '诊所'
    ONLINE = 'online', '线上'
    ADVERTISEMENT = 'advertisement', '广告'
    REFERRAL = 'referral', '转介'
    DATABASE = 'database', '数据库'
    WECHAT = 'wechat', '微信'
    OTHER = 'other', '其他'


class Subject(models.Model):
    """
    受试者主索引

    轻量级核心实体，用于列表展示、快速搜索和跨系统关联。
    完整档案信息存储在 SubjectProfile（1:1）及各领域 Profile 子表中。
    """

    class Meta:
        db_table = 't_subject'
        verbose_name = '受试者'
        indexes = [
            models.Index(fields=['status', 'create_time']),
            models.Index(fields=['phone']),
            models.Index(fields=['subject_no']),
        ]
        constraints = [
            # PostgreSQL：部分唯一索引。未删除且手机号非空时，phone 唯一（空手机号可同时多条，如历史占位）。
            models.UniqueConstraint(
                fields=['phone'],
                condition=models.Q(is_deleted=False) & ~models.Q(phone=''),
                name='subject_phone_active_uniq',
            ),
        ]

    # P0: 受试者编号（全局唯一，格式 SUB-YYYYMM-NNNN）
    subject_no = models.CharField(
        '受试者编号', max_length=20, unique=True, blank=True, default='',
        help_text='系统自动生成，格式 SUB-YYYYMM-NNNN',
    )

    # P0: 关联登录账号（受试者通过微信小程序登录后绑定）
    account = models.OneToOneField(
        'identity.Account', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='subject_profile_ref',
        verbose_name='关联账号', help_text='受试者本人的登录账号',
    )

    # 基本信息
    name = models.CharField('姓名', max_length=100)
    gender = models.CharField('性别', max_length=10, choices=SubjectGender.choices, blank=True, default='')
    age = models.IntegerField('年龄', null=True, blank=True)
    phone = models.CharField('手机号', max_length=20, blank=True, default='', db_index=True)

    # 医学信息
    skin_type = models.CharField('皮肤类型', max_length=10, choices=SubjectSkinType.choices, blank=True, default='')
    risk_level = models.CharField('风险等级', max_length=20, choices=SubjectRiskLevel.choices, default=SubjectRiskLevel.LOW)

    # P0: 来源渠道追踪
    source_channel = models.CharField(
        '来源渠道', max_length=20, choices=SubjectSourceChannel.choices,
        blank=True, default='', help_text='受试者从哪个渠道获取',
    )

    # 状态
    status = models.CharField('状态', max_length=20, choices=SubjectStatus.choices, default=SubjectStatus.SCREENING, db_index=True)

    # 权限相关
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    # 软删除
    is_deleted = models.BooleanField('已删除', default=False)

    # 认证等级与实名核验（规划 Phase 1–2）
    auth_level = models.CharField(
        '认证等级',
        max_length=24,
        choices=AuthLevel.choices,
        default=AuthLevel.GUEST,
        db_index=True,
        help_text='L0 游客 / L1 手机认证 / L2 实名认证',
    )
    identity_verified_at = models.DateTimeField('实名认证通过时间', null=True, blank=True)
    identity_verify_status = models.CharField(
        '最近一次实名核验状态',
        max_length=20,
        choices=IdentityVerifyStatus.choices,
        null=True,
        blank=True,
    )
    id_card_encrypted = models.CharField('身份证号加密存储', max_length=500, blank=True, default='')

    def __str__(self):
        if self.subject_no:
            return f'{self.name}({self.subject_no})'
        return f'{self.name}({self.phone})'


class EnrollmentStatus(models.TextChoices):
    PENDING = 'pending', '待入组审批'
    ENROLLED = 'enrolled', '已入组'
    COMPLETED = 'completed', '已完成'
    WITHDRAWN = 'withdrawn', '已退出'


class Enrollment(models.Model):
    """受试者入组记录

    入组流程：subject + protocol → 创建 Enrollment（status=pending）→ 项目总监审批 →
    状态变为 enrolled → 后续访视/工单均以 enrolled 为前提。

    初始状态为 pending 而非 enrolled，符合 GCP 要求：入组需要经过授权人员审批确认，
    不能由创建动作直接完成。测试中应通过 approve_enrollment 服务或 API 变更状态。
    """

    class Meta:
        db_table = 't_enrollment'
        verbose_name = '入组记录'
        unique_together = ['subject', 'protocol']
        indexes = [
            models.Index(fields=['status', 'enrolled_at']),
            models.Index(fields=['protocol', 'status']),
        ]

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='enrollments')
    protocol = models.ForeignKey('protocol.Protocol', on_delete=models.CASCADE, related_name='enrollments')
    status = models.CharField('状态', max_length=20, choices=EnrollmentStatus.choices, default=EnrollmentStatus.PENDING, db_index=True)
    enrolled_at = models.DateTimeField('入组时间', null=True, blank=True)

    # 权限相关
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} -> {self.protocol.title}'


class ICFVersion(models.Model):
    """知情同意书版本"""

    class Meta:
        db_table = 't_icf_version'
        verbose_name = 'ICF版本'

    protocol = models.ForeignKey('protocol.Protocol', on_delete=models.CASCADE, related_name='icf_versions')
    version = models.CharField('版本号', max_length=20)
    file_path = models.CharField('文件路径', max_length=500, blank=True, default='')
    content = models.TextField('内容', blank=True, default='')
    is_active = models.BooleanField('是否生效', default=True)
    required_reading_duration_seconds = models.PositiveIntegerField(
        '要求阅读时长(秒)', default=0, help_text='0 表示不校验，建议 10-600'
    )
    display_order = models.IntegerField('签署顺序', default=0, help_text='越小越靠前')
    node_title = models.CharField(
        '节点标题', max_length=200, blank=True, default='',
        help_text='如：知情同意书、照片使用授权书',
    )
    mini_sign_rules = models.JSONField(
        '小程序签署规则',
        default=dict,
        blank=True,
        help_text='人脸/双签/测验/阅读时长/采集项/双签人员等，与协议级配置结构一致；未保存前由协议配置兜底',
    )
    mini_sign_rules_saved = models.BooleanField(
        '已保存小程序签署规则',
        default=False,
        help_text='至少完整保存过一次后为 True，用于列表标记与发布前校验',
    )

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.protocol.title} - ICF v{self.version}'


class SubjectConsentManager(models.Manager):
    """默认仅包含未软删除的签署记录（执行台列表、小程序等）。"""

    def get_queryset(self):
        return super().get_queryset().filter(is_deleted=False)


class SubjectConsent(models.Model):
    """受试者知情同意书签署记录"""

    class Meta:
        db_table = 't_subject_consent'
        verbose_name = '知情同意书签署'
        unique_together = ['subject', 'icf_version']
        indexes = [
            models.Index(fields=['subject', 'signed_at']),
            models.Index(fields=['icf_version']),
        ]

    objects = SubjectConsentManager()
    all_objects = models.Manager()

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='consents')
    icf_version = models.ForeignKey(ICFVersion, on_delete=models.CASCADE, related_name='consents')
    signed_at = models.DateTimeField('签署时间', null=True, blank=True)
    investigator_signed_at = models.DateTimeField('研究者见证签署时间', null=True, blank=True)
    signature_data = models.JSONField('签名数据', null=True, blank=True)
    is_signed = models.BooleanField('已签署', default=False)
    receipt_no = models.CharField(
        '签署回执号',
        max_length=64,
        null=True,
        blank=True,
        db_index=True,
        help_text='同受试者、同协议下多知情节点共用同一回执号',
    )
    staff_audit_status = models.CharField(
        '工作人员审核状态',
        max_length=24,
        blank=True,
        default='',
        db_index=True,
        help_text='pending_review=待审核(列表显示为已签署), approved=已通过审核, returned=退回重签中',
    )
    is_deleted = models.BooleanField('已删除', default=False, db_index=True)

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} - ICF v{self.icf_version.version}'


# 导入分拆的模型文件，使 Django 能够检测到所有模型并生成迁移
from .models_profile import *  # noqa: F401,F403
from .models_domain import *  # noqa: F401,F403
from .models_recruitment import *  # noqa: F401,F403
from .models_execution import *  # noqa: F401,F403
from .models_timeseries import *  # noqa: F401,F403
from .models_loyalty import *  # noqa: F401,F403
from .models_identity import *  # noqa: F401,F403

from .models_questionnaire import *  # noqa: F401,F403
