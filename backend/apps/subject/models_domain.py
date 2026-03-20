"""
领域专属受试者档案

可插拔设计：每个研究领域一个 Profile 子表，新增领域只需新增模型 + migrate。
每个领域 Profile 与 Subject 为 1:1 关系。
"""
from django.db import models


# ============================================================================
# 皮肤档案（护肤/彩妆/防晒）
# ============================================================================
class SkinSensitivity(models.TextChoices):
    NONE = 'none', '无'
    MILD = 'mild', '轻微'
    MODERATE = 'moderate', '中度'
    SEVERE = 'severe', '重度'


class SkinProfile(models.Model):
    """
    皮肤档案（护肤/彩妆/防晒领域）

    包含 Fitzpatrick 分型、各区域肤质、仪器基线值等。
    """

    class Meta:
        db_table = 't_subject_skin_profile'
        verbose_name = '皮肤档案'

    subject = models.OneToOneField(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='skin_profile', verbose_name='受试者',
    )

    # Fitzpatrick 皮肤分型（国际标准）
    fitzpatrick_type = models.CharField('Fitzpatrick分型', max_length=5, blank=True, default='', help_text='I-VI')
    skin_type_t_zone = models.CharField('T区肤质', max_length=20, blank=True, default='', help_text='oily/dry/combination/normal')
    skin_type_u_zone = models.CharField('U区肤质', max_length=20, blank=True, default='')
    skin_sensitivity = models.CharField(
        '敏感度', max_length=20, choices=SkinSensitivity.choices,
        blank=True, default='',
    )
    skin_concerns = models.JSONField('皮肤问题标签', null=True, blank=True, default=list, help_text='如 ["痘痘","色斑","皱纹"]')

    # 仪器基线值
    photo_damage_score = models.IntegerField('光损伤评分', null=True, blank=True)
    moisture_baseline = models.DecimalField('基线水分值(Corneometer)', max_digits=8, decimal_places=2, null=True, blank=True)
    tewl_baseline = models.DecimalField('基线TEWL值(Tewameter)', max_digits=8, decimal_places=2, null=True, blank=True)
    sebum_baseline = models.DecimalField('基线皮脂值(Sebumeter)', max_digits=8, decimal_places=2, null=True, blank=True)
    melanin_baseline = models.DecimalField('基线黑色素值(Mexameter)', max_digits=8, decimal_places=2, null=True, blank=True)
    erythema_baseline = models.DecimalField('基线红斑值(Mexameter)', max_digits=8, decimal_places=2, null=True, blank=True)
    elasticity_baseline = models.DecimalField('基线弹性值(Cutometer)', max_digits=8, decimal_places=2, null=True, blank=True)
    wrinkle_score_baseline = models.DecimalField('基线皱纹评分(VISIA)', max_digits=8, decimal_places=2, null=True, blank=True)
    pore_score_baseline = models.DecimalField('基线毛孔评分(VISIA)', max_digits=8, decimal_places=2, null=True, blank=True)

    # 使用史
    cosmetic_history = models.JSONField('化妆品使用史', null=True, blank=True, default=list)
    patch_test_history = models.JSONField('斑贴试验史', null=True, blank=True, default=list)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'皮肤档案: {self.subject.name}'


# ============================================================================
# 口腔档案（口腔护理）
# ============================================================================
class OralProfile(models.Model):
    """口腔档案（口腔护理领域）"""

    class Meta:
        db_table = 't_subject_oral_profile'
        verbose_name = '口腔档案'

    subject = models.OneToOneField(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='oral_profile', verbose_name='受试者',
    )

    dental_history = models.JSONField('牙科就诊史', null=True, blank=True, default=list)
    oral_diseases = models.JSONField('口腔疾病', null=True, blank=True, default=list, help_text='龋齿/牙周/口臭等')
    brushing_frequency = models.CharField('刷牙频率', max_length=50, blank=True, default='')
    plaque_index_baseline = models.DecimalField('基线菌斑指数(PLI)', max_digits=5, decimal_places=2, null=True, blank=True)
    gingival_index_baseline = models.DecimalField('基线牙龈指数(GI)', max_digits=5, decimal_places=2, null=True, blank=True)
    tooth_shade_baseline = models.CharField('基线牙齿色号', max_length=20, blank=True, default='')
    halitosis_score_baseline = models.IntegerField('基线口臭评分', null=True, blank=True)
    sensitivity_score_baseline = models.IntegerField('基线敏感度评分', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'口腔档案: {self.subject.name}'


# ============================================================================
# 营养健康档案（保健食品/特殊膳食）
# ============================================================================
class NutritionProfile(models.Model):
    """营养健康档案（保健食品/特殊膳食领域）"""

    class Meta:
        db_table = 't_subject_nutrition_profile'
        verbose_name = '营养健康档案'

    subject = models.OneToOneField(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='nutrition_profile', verbose_name='受试者',
    )

    dietary_pattern = models.CharField('饮食模式', max_length=50, blank=True, default='', help_text='正常/素食/低碳等')
    dietary_restrictions = models.JSONField('饮食限制', null=True, blank=True, default=list, help_text='乳糖不耐/麸质过敏等')
    nutritional_deficiencies = models.JSONField('营养缺乏', null=True, blank=True, default=list, help_text='维D/铁/B12等')
    bmi_baseline = models.DecimalField('基线BMI', max_digits=5, decimal_places=2, null=True, blank=True)
    body_fat_baseline = models.DecimalField('基线体脂率(%)', max_digits=5, decimal_places=2, null=True, blank=True)
    waist_circumference_baseline = models.DecimalField('基线腰围(cm)', max_digits=6, decimal_places=1, null=True, blank=True)
    blood_glucose_baseline = models.DecimalField('基线空腹血糖(mmol/L)', max_digits=5, decimal_places=2, null=True, blank=True)
    blood_lipid_baseline = models.JSONField('基线血脂', null=True, blank=True, help_text='{"TC","TG","HDL","LDL"}')
    gut_microbiome_sampled = models.BooleanField('是否采集肠道菌群样本', default=False)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'营养档案: {self.subject.name}'


# ============================================================================
# 环境暴露档案（消毒/消杀/洗护）
# ============================================================================
class ExposureProfile(models.Model):
    """环境暴露档案（消毒/消杀/洗护领域）"""

    class Meta:
        db_table = 't_subject_exposure_profile'
        verbose_name = '环境暴露档案'

    subject = models.OneToOneField(
        'subject.Subject', on_delete=models.CASCADE,
        related_name='exposure_profile', verbose_name='受试者',
    )

    occupation_type = models.CharField('职业类型', max_length=100, blank=True, default='')
    chemical_exposure_history = models.JSONField('化学品暴露史', null=True, blank=True, default=list)
    skin_irritation_history = models.JSONField('皮肤刺激史', null=True, blank=True, default=list)
    respiratory_baseline = models.JSONField('呼吸系统基线', null=True, blank=True)
    hand_condition_baseline = models.CharField('手部皮肤状况基线', max_length=200, blank=True, default='')
    ppe_usage = models.JSONField('防护用品使用情况', null=True, blank=True, default=list)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'暴露档案: {self.subject.name}'
