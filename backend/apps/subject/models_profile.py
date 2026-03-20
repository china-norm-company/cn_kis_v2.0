"""
受试者主档案与医学子表

对标 CDISC CDASH（人口学 DM、医学史 MH、合并用药 CM）及 HL7 FHIR Patient 资源。
敏感数据分级：L1 极敏感（加密）、L2 高敏感（加密）、L3 中敏感（明文）、L4 低敏感。
"""
from django.db import models


# ============================================================================
# 主档案
# ============================================================================
class PrivacyLevel(models.TextChoices):
    STANDARD = 'standard', '标准'
    HIGH = 'high', '高'
    MAXIMUM = 'maximum', '最高'


class SubjectProfile(models.Model):
    """
    受试者主档案（1:1 关联 Subject）

    包含人口学信息、身份信息（加密）、联系方式、紧急联系人、隐私与合规设置。
    """

    class Meta:
        db_table = 't_subject_profile'
        verbose_name = '受试者档案'

    subject = models.OneToOneField(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='profile', verbose_name='受试者',
    )

    # --- 人口学（CDASH DM 域） ---
    birth_date = models.DateField('出生日期', null=True, blank=True)
    age = models.IntegerField('年龄', null=True, blank=True, help_text='可从 birth_date 计算')
    ethnicity = models.CharField('民族', max_length=50, blank=True, default='')
    education = models.CharField('教育程度', max_length=50, blank=True, default='')
    occupation = models.CharField('职业', max_length=100, blank=True, default='')
    marital_status = models.CharField('婚姻状况', max_length=20, blank=True, default='')

    # --- 身份信息（L1 极敏感，加密存储） ---
    id_card_hash = models.CharField(
        '身份证号哈希', max_length=64, blank=True, default='',
        db_index=True, help_text='SHA-256 不可逆，用于查重',
    )
    id_card_encrypted = models.CharField(
        '身份证号加密', max_length=255, blank=True, default='',
        help_text='AES-256 可逆，需审计权限才能解密',
    )
    id_card_last4 = models.CharField(
        '身份证后4位', max_length=4, blank=True, default='',
        help_text='用于快速核验',
    )
    name_pinyin = models.CharField('姓名拼音', max_length=200, blank=True, default='', help_text='搜索用')

    # --- 联系信息（L2 高敏感） ---
    phone_backup = models.CharField('备用电话', max_length=20, blank=True, default='')
    email = models.EmailField('邮箱', blank=True, default='')
    province = models.CharField('省份', max_length=50, blank=True, default='')
    city = models.CharField('城市', max_length=50, blank=True, default='')
    district = models.CharField('区县', max_length=50, blank=True, default='')
    address = models.CharField('详细地址', max_length=300, blank=True, default='')
    postal_code = models.CharField('邮编', max_length=10, blank=True, default='')

    # --- 紧急联系人 ---
    emergency_contact_name = models.CharField('紧急联系人', max_length=100, blank=True, default='')
    emergency_contact_phone = models.CharField('紧急联系电话', max_length=20, blank=True, default='')
    emergency_contact_relation = models.CharField('与受试者关系', max_length=50, blank=True, default='')

    # --- 入组历史（聚合统计） ---
    first_screening_date = models.DateField('首次筛选日期', null=True, blank=True)
    first_enrollment_date = models.DateField('首次入组日期', null=True, blank=True)
    total_enrollments = models.IntegerField('累计参与项目数', default=0)
    total_completed = models.IntegerField('累计完成项目数', default=0)

    # --- 隐私与合规 ---
    privacy_level = models.CharField(
        '隐私级别', max_length=20, choices=PrivacyLevel.choices,
        default=PrivacyLevel.STANDARD,
    )
    consent_data_sharing = models.BooleanField('同意数据共享', default=False)
    consent_rwe_usage = models.BooleanField('同意真实世界研究使用', default=False)
    consent_biobank = models.BooleanField('同意生物样本库储存', default=False)
    consent_follow_up = models.BooleanField('同意长期随访', default=False)
    data_retention_years = models.IntegerField('数据保留年限', default=10)

    # --- 时间 ---
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'档案: {self.subject.name}'


# ============================================================================
# 医学史（CDASH MH 域）
# ============================================================================
class MedicalHistorySeverity(models.TextChoices):
    MILD = 'mild', '轻度'
    MODERATE = 'moderate', '中度'
    SEVERE = 'severe', '重度'


class MedicalHistory(models.Model):
    """受试者病史记录（CDASH MH 域），支持多条"""

    class Meta:
        db_table = 't_subject_medical_history'
        verbose_name = '病史记录'
        indexes = [
            models.Index(fields=['subject', 'is_ongoing']),
        ]

    subject = models.ForeignKey(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='medical_histories', verbose_name='受试者',
    )
    condition_name = models.CharField('疾病/状况名称', max_length=200)
    condition_code = models.CharField('ICD-10编码', max_length=20, blank=True, default='')
    body_system = models.CharField('系统器官分类(SOC)', max_length=100, blank=True, default='')
    is_ongoing = models.BooleanField('是否持续', default=False)
    start_date = models.DateField('开始日期', null=True, blank=True)
    end_date = models.DateField('结束日期', null=True, blank=True)
    severity = models.CharField(
        '严重程度', max_length=20, choices=MedicalHistorySeverity.choices,
        blank=True, default='',
    )
    notes = models.TextField('补充说明', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} - {self.condition_name}'


# ============================================================================
# 合并用药（CDASH CM 域）
# ============================================================================
class ConcomitantMedication(models.Model):
    """受试者合并用药记录（CDASH CM 域），支持多条"""

    class Meta:
        db_table = 't_subject_medication'
        verbose_name = '合并用药'
        indexes = [
            models.Index(fields=['subject', 'is_ongoing']),
        ]

    subject = models.ForeignKey(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='medications', verbose_name='受试者',
    )
    medication_name = models.CharField('药品名称', max_length=200)
    generic_name = models.CharField('通用名', max_length=200, blank=True, default='')
    indication = models.CharField('适应症', max_length=200, blank=True, default='')
    dose = models.CharField('剂量', max_length=100, blank=True, default='')
    frequency = models.CharField('频次', max_length=50, blank=True, default='', help_text='QD/BID/TID/PRN')
    route = models.CharField('给药途径', max_length=50, blank=True, default='')
    is_ongoing = models.BooleanField('是否持续', default=False)
    start_date = models.DateField('开始日期', null=True, blank=True)
    end_date = models.DateField('结束日期', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} - {self.medication_name}'


# ============================================================================
# 过敏记录
# ============================================================================
class AllergenType(models.TextChoices):
    DRUG = 'drug', '药物'
    FOOD = 'food', '食物'
    CHEMICAL = 'chemical', '化学品'
    ENVIRONMENT = 'environment', '环境'
    COSMETIC = 'cosmetic', '化妆品成分'
    OTHER = 'other', '其他'


class AllergySeverity(models.TextChoices):
    MILD = 'mild', '轻度'
    MODERATE = 'moderate', '中度'
    SEVERE = 'severe', '重度'


class AllergyRecord(models.Model):
    """受试者过敏记录，支持多条"""

    class Meta:
        db_table = 't_subject_allergy'
        verbose_name = '过敏记录'

    subject = models.ForeignKey(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='allergies', verbose_name='受试者',
    )
    allergen = models.CharField('过敏原', max_length=200)
    allergen_type = models.CharField(
        '过敏原类型', max_length=20, choices=AllergenType.choices,
        blank=True, default='',
    )
    reaction = models.CharField('反应描述', max_length=500, blank=True, default='')
    severity = models.CharField(
        '严重程度', max_length=20, choices=AllergySeverity.choices,
        blank=True, default='',
    )
    onset_date = models.DateField('发生日期', null=True, blank=True)
    is_confirmed = models.BooleanField('是否经过医学确认', default=False)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} - 过敏: {self.allergen}'


# ============================================================================
# 家族病史
# ============================================================================
class FamilyRelation(models.TextChoices):
    FATHER = 'father', '父亲'
    MOTHER = 'mother', '母亲'
    SIBLING = 'sibling', '兄弟姐妹'
    GRANDPARENT = 'grandparent', '祖父母/外祖父母'
    OTHER = 'other', '其他'


class FamilyHistory(models.Model):
    """受试者家族病史，支持多条"""

    class Meta:
        db_table = 't_subject_family_history'
        verbose_name = '家族病史'

    subject = models.ForeignKey(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='family_histories', verbose_name='受试者',
    )
    relation = models.CharField(
        '亲属关系', max_length=20, choices=FamilyRelation.choices,
    )
    condition_name = models.CharField('疾病名称', max_length=200)
    condition_code = models.CharField('ICD-10编码', max_length=20, blank=True, default='')
    is_deceased = models.BooleanField('是否已故', default=False)
    age_at_onset = models.IntegerField('发病年龄', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} - 家族: {self.condition_name}'


# ============================================================================
# 生活方式（RWE 核心数据）
# ============================================================================
class LifestyleCategory(models.TextChoices):
    SMOKING = 'smoking', '吸烟'
    ALCOHOL = 'alcohol', '饮酒'
    EXERCISE = 'exercise', '运动'
    DIET = 'diet', '饮食'
    SLEEP = 'sleep', '睡眠'
    SUN_EXPOSURE = 'sun_exposure', '日晒暴露'
    COSMETIC_USAGE = 'cosmetic_usage', '化妆品使用'
    SKINCARE_ROUTINE = 'skincare_routine', '护肤日程'
    ORAL_HYGIENE = 'oral_hygiene', '口腔清洁'
    SUPPLEMENT_USAGE = 'supplement_usage', '保健品使用'
    ENVIRONMENTAL = 'environmental', '环境暴露'
    OCCUPATION_EXPOSURE = 'occupation_exposure', '职业暴露'


class LifestyleRecord(models.Model):
    """受试者生活方式记录，支持多条"""

    class Meta:
        db_table = 't_subject_lifestyle'
        verbose_name = '生活方式记录'
        indexes = [
            models.Index(fields=['subject', 'category']),
        ]

    subject = models.ForeignKey(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='lifestyle_records', verbose_name='受试者',
    )
    category = models.CharField('类别', max_length=30, choices=LifestyleCategory.choices)
    description = models.CharField('具体描述', max_length=500, blank=True, default='')
    frequency = models.CharField('频率', max_length=100, blank=True, default='')
    duration_years = models.DecimalField('持续年数', max_digits=5, decimal_places=1, null=True, blank=True)
    is_current = models.BooleanField('是否当前', default=True)
    recorded_at = models.DateTimeField('记录时间', auto_now_add=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.subject.name} - {self.get_category_display()}'
