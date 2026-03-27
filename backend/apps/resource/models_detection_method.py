"""
检测方法模型

来源：cn_kis_test resource/models_detection_method.py
化妆品 CRO 行业核心模型，定义标准检测方法及其资源/人员需求

核心模型：
- DetectionMethodTemplate：检测方法模板（如 Corneometer 皮肤水分、VISIA 图像分析等）
- DetectionMethodResource：方法所需资源（设备、耗材、场地）
- DetectionMethodPersonnel：方法所需人员资质
"""
from django.db import models


class MethodStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    ACTIVE = 'active', '有效'
    DEPRECATED = 'deprecated', '已废弃'


class MethodCategory(models.TextChoices):
    SKIN_HYDRATION = 'skin_hydration', '皮肤水分'
    SKIN_ELASTICITY = 'skin_elasticity', '皮肤弹性'
    SKIN_COLOR = 'skin_color', '皮肤色素'
    SKIN_IMAGING = 'skin_imaging', '皮肤成像'
    SKIN_ROUGHNESS = 'skin_roughness', '皮肤粗糙度'
    SKIN_SEBUM = 'skin_sebum', '皮脂分泌'
    SKIN_PH = 'skin_ph', '皮肤pH值'
    SKIN_BARRIER = 'skin_barrier', '皮肤屏障'
    HAIR_ANALYSIS = 'hair_analysis', '毛发分析'
    PATCH_TEST = 'patch_test', '斑贴试验'
    EFFICACY_GENERAL = 'efficacy_general', '功效综合'
    OTHER = 'other', '其他'


class QualificationLevel(models.TextChoices):
    REQUIRED = 'required', '必须'
    PREFERRED = 'preferred', '优先'
    TRAINING = 'training', '培训中'


class DetectionMethodTemplate(models.Model):
    """
    检测方法模板

    定义化妆品功效检测的标准方法，包括操作步骤、环境要求和资源需求。
    常用方法如：
    - Corneometer（皮肤角质层含水量）
    - Cutometer（皮肤弹性）
    - VISIA-CR（面部图像分析）
    - Mexameter（皮肤色素/红斑）
    - Tewameter（经皮水分流失）
    """

    class Meta:
        db_table = 't_detection_method_template'
        verbose_name = '检测方法模板'
        ordering = ['category', 'code']

    code = models.CharField('方法编号', max_length=50, unique=True)
    name = models.CharField('方法名称', max_length=200)
    name_en = models.CharField('英文名称', max_length=200, blank=True, default='')
    equipment_name_classification = models.CharField(
        '设备名称分类', max_length=200, blank=True, default='',
        help_text='与设备台账「名称分类」一致：同规格统一类型（如 电子天平、glossymeter）',
    )
    category = models.CharField(
        '方法类别', max_length=30,
        choices=MethodCategory.choices, default=MethodCategory.OTHER
    )
    description = models.TextField('方法说明', blank=True, default='')
    qc_requirements = models.TextField('质控要求', blank=True, default='')

    standard_procedure = models.TextField(
        '标准操作步骤', blank=True, default='',
        help_text='JSON 格式步骤列表：[{"step": 1, "name": "...", "description": "...", "duration_minutes": 5}]'
    )
    sop_reference = models.CharField('SOP 参考编号', max_length=100, blank=True, default='')
    sop_attachment_url = models.CharField(
        'SOP 附件', max_length=500, blank=True, default='',
        help_text='上传后的访问路径，如 /media/detection_methods/sop/xxx.pdf',
    )
    sop = models.ForeignKey(
        'quality.SOP', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='detection_methods', verbose_name='关联SOP'
    )

    estimated_duration_minutes = models.IntegerField('预计检测时长(分钟)', default=30)
    preparation_time_minutes = models.IntegerField('准备时长(分钟)', default=10)

    temperature_min = models.DecimalField('最低温度(°C)', max_digits=5, decimal_places=1, null=True, blank=True)
    temperature_max = models.DecimalField('最高温度(°C)', max_digits=5, decimal_places=1, null=True, blank=True)
    humidity_min = models.DecimalField('最低湿度(%)', max_digits=5, decimal_places=1, null=True, blank=True)
    humidity_max = models.DecimalField('最高湿度(%)', max_digits=5, decimal_places=1, null=True, blank=True)
    environment_notes = models.TextField('环境要求备注', blank=True, default='')

    keywords = models.JSONField(
        '关键词', default=list, blank=True,
        help_text='用于协议解析自动匹配，如 ["角质层含水量", "Corneometer", "skin hydration"]'
    )

    normal_range = models.JSONField(
        '正常值范围', default=dict, blank=True,
        help_text='{"min": 20, "max": 80, "unit": "AU", "notes": "取决于测量部位"}'
    )
    measurement_points = models.JSONField(
        '测量点配置', default=list, blank=True,
        help_text='[{"name": "左颊", "code": "L_CHEEK", "repeat": 3}]'
    )

    status = models.CharField(
        '状态', max_length=20,
        choices=MethodStatus.choices, default=MethodStatus.DRAFT
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f"[{self.code}] {self.name}"


class DetectionMethodResource(models.Model):
    """
    检测方法资源需求

    定义每种检测方法所需的设备、耗材、场地等资源。
    """

    class Meta:
        db_table = 't_detection_method_resource'
        verbose_name = '检测方法资源需求'
        ordering = ['method', 'resource_type']

    RESOURCE_TYPE_CHOICES = [
        ('equipment', '设备'),
        ('consumable', '耗材'),
        ('venue', '场地'),
        ('software', '软件'),
    ]

    method = models.ForeignKey(
        DetectionMethodTemplate, on_delete=models.CASCADE,
        related_name='resource_requirements', verbose_name='检测方法'
    )
    resource_type = models.CharField('资源类型', max_length=20, choices=RESOURCE_TYPE_CHOICES)
    resource_category = models.ForeignKey(
        'resource.ResourceCategory', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='method_requirements', verbose_name='资源类别'
    )
    quantity = models.IntegerField('需求数量', default=1)
    is_mandatory = models.BooleanField('是否必须', default=True)
    recommended_models = models.JSONField(
        '推荐型号', default=list, blank=True,
        help_text='["VISIA-CR Gen7", "VISIA-CR Gen8"]'
    )
    usage_notes = models.TextField('使用说明', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f"{self.method.code} → {self.resource_type}: {self.resource_category}"


class DetectionMethodPersonnel(models.Model):
    """
    检测方法人员资质要求

    定义执行某种检测方法所需的人员资质和经验要求。
    """

    class Meta:
        db_table = 't_detection_method_personnel'
        verbose_name = '检测方法人员资质'
        ordering = ['method', 'level']

    method = models.ForeignKey(
        DetectionMethodTemplate, on_delete=models.CASCADE,
        related_name='personnel_requirements', verbose_name='检测方法'
    )
    qualification_name = models.CharField('资质名称', max_length=200,
                                           help_text='如：VISIA 操作认证、GCP 证书')
    qualification_code = models.CharField('资质编号', max_length=50, blank=True, default='')
    level = models.CharField(
        '要求级别', max_length=20,
        choices=QualificationLevel.choices, default=QualificationLevel.REQUIRED
    )
    min_experience_months = models.IntegerField('最低经验(月)', default=0)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f"{self.method.code} → {self.qualification_name} ({self.level})"
