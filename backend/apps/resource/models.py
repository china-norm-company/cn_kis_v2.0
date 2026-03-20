"""
资源管理模型

来源：cn_kis_test backend/apps/resource/models.py
S1-1：建立人机料法环的基础数据结构

核心模型：
- ResourceCategory：资源类别（层级结构，统一分类人机料法环）
- ResourceItem：资源实例（设备/人员/场地/耗材的具体实例）
- ActivityTemplate：活动模板（标准化操作定义，关联 SOP + CRF）
- ActivityBOM：活动资源清单（活动模板所需的资源配置）
"""
from django.db import models


# ============================================================================
# 资源类别（层级结构）
# ============================================================================
class ResourceType(models.TextChoices):
    """资源大类——对应人机料法环"""
    PERSONNEL = 'personnel', '人员'
    EQUIPMENT = 'equipment', '设备'
    MATERIAL = 'material', '物料/耗材'
    METHOD = 'method', '方法/SOP'
    ENVIRONMENT = 'environment', '环境/场地'


class ResourceCategory(models.Model):
    """
    资源类别

    支持三级层级结构，例如：
    - 设备 > 皮肤测试仪器 > VISIA-CR
    - 人员 > CRC > 高级CRC
    - 场地 > 测试室 > 恒温恒湿室
    """

    class Meta:
        db_table = 't_resource_category'
        verbose_name = '资源类别'
        ordering = ['resource_type', 'name']
        indexes = [
            models.Index(fields=['resource_type']),
            models.Index(fields=['parent']),
            models.Index(fields=['code']),
        ]

    name = models.CharField('类别名称', max_length=200)
    code = models.CharField('类别编码', max_length=50, unique=True,
                            help_text='唯一编码，如 EQ-SKIN-VISIA')
    resource_type = models.CharField('资源大类', max_length=20,
                                     choices=ResourceType.choices, db_index=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE,
                               related_name='children', null=True, blank=True,
                               verbose_name='父类别')
    description = models.TextField('描述', blank=True, default='')
    is_active = models.BooleanField('是否启用', default=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'[{self.get_resource_type_display()}] {self.name}'

    @property
    def full_path(self) -> str:
        """返回完整层级路径，如 设备 > 皮肤测试仪器 > VISIA-CR"""
        parts = [self.name]
        current = self.parent
        while current:
            parts.insert(0, current.name)
            current = current.parent
        return ' > '.join(parts)


# ============================================================================
# 资源实例
# ============================================================================
class ResourceStatus(models.TextChoices):
    ACTIVE = 'active', '在用'
    IDLE = 'idle', '闲置'
    MAINTENANCE = 'maintenance', '维护中'
    CALIBRATING = 'calibrating', '校准中'
    RETIRED = 'retired', '已报废'
    RESERVED = 'reserved', '已预约'


class ResourceItem(models.Model):
    """
    资源实例

    具体的设备、场地、耗材等实体记录。
    设备全生命周期管理（S3-1 增强）的基础。
    """

    class Meta:
        db_table = 't_resource_item'
        verbose_name = '资源实例'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['category', 'status']),
            models.Index(fields=['code']),
            models.Index(fields=['status']),
        ]

    # 基本信息
    name = models.CharField('资源名称', max_length=200)
    code = models.CharField('资源编号', max_length=50, unique=True)
    category = models.ForeignKey(ResourceCategory, on_delete=models.PROTECT,
                                 related_name='items', verbose_name='资源类别')
    status = models.CharField('状态', max_length=20, choices=ResourceStatus.choices,
                              default=ResourceStatus.ACTIVE, db_index=True)
    location = models.CharField('存放位置', max_length=200, blank=True, default='')

    # 设备相关（S3-1 扩展）
    manufacturer = models.CharField('制造商', max_length=200, blank=True, default='')
    model_number = models.CharField('型号', max_length=100, blank=True, default='')
    serial_number = models.CharField('序列号', max_length=100, blank=True, default='')
    purchase_date = models.DateField('购入日期', null=True, blank=True)
    warranty_expiry = models.DateField('保修到期', null=True, blank=True)

    # 校准信息（S3-1 扩展）
    last_calibration_date = models.DateField('上次校准日期', null=True, blank=True)
    next_calibration_date = models.DateField('下次校准日期', null=True, blank=True)
    calibration_cycle_days = models.IntegerField('校准周期（天）', null=True, blank=True)

    # 核查计划（S3-1 扩展）
    last_verification_date = models.DateField('上次核查日期', null=True, blank=True)
    next_verification_date = models.DateField('下次核查日期', null=True, blank=True)
    verification_cycle_days = models.IntegerField('核查周期（天）', null=True, blank=True)

    # 维护计划（S3-1 扩展，与校准/核查并列）
    last_maintenance_date = models.DateField('上次维护日期', null=True, blank=True)
    next_maintenance_date = models.DateField('下次维护日期', null=True, blank=True)
    maintenance_cycle_days = models.IntegerField('维护周期（天）', null=True, blank=True)

    # 管理
    manager_id = models.IntegerField('负责人ID', null=True, blank=True,
                                     help_text='Account ID')

    # 扩展属性
    attributes = models.JSONField('扩展属性', default=dict, blank=True,
                                  help_text='自定义属性键值对')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.code} - {self.name}'


# ============================================================================
# 活动模板
# ============================================================================
class ActivityTemplate(models.Model):
    """
    活动模板

    标准化的操作定义，是人机料法环管理的核心枢纽。
    每个活动模板定义了执行某项检查/操作所需的：
    - SOP（方法/法）
    - 资质要求（人）
    - CRF 模板（数据采集表）
    - BOM 清单（机、料、环）

    来源：cn_kis_test ActivityTemplate
    """

    class Meta:
        db_table = 't_activity_template'
        verbose_name = '活动模板'
        ordering = ['code']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['is_active']),
        ]

    name = models.CharField('活动名称', max_length=200)
    code = models.CharField('活动编码', max_length=50, unique=True)
    description = models.TextField('描述', blank=True, default='')
    duration = models.IntegerField('预计耗时（分钟）', default=30,
                                   help_text='标准执行时间')

    # 关联 SOP（法）
    sop = models.ForeignKey('quality.SOP', on_delete=models.SET_NULL,
                            null=True, blank=True, related_name='activity_templates',
                            verbose_name='关联SOP')

    # 关联 CRF 模板（数据采集）
    crf_template = models.ForeignKey('edc.CRFTemplate', on_delete=models.SET_NULL,
                                     null=True, blank=True,
                                     related_name='activity_templates',
                                     verbose_name='关联CRF模板')

    # 资质要求（人）— JSON 格式存储资质条件
    # S3-4 HR 增强后可转为 M2M 到 Qualification 模型
    qualification_requirements = models.JSONField(
        '资质要求', default=list, blank=True,
        help_text='JSON 数组，如 [{"name": "GCP证书", "level": "required"}, ...]'
    )

    is_active = models.BooleanField('是否启用', default=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.code} - {self.name}'


# ============================================================================
# 活动资源清单（BOM）
# ============================================================================
class ActivityBOM(models.Model):
    """
    活动资源清单（Bill of Materials）

    定义活动模板执行所需的资源配置。
    例如："VISIA-CR 面部拍照" 活动需要：
    - VISIA-CR 设备 × 1（必须）
    - 恒温恒湿测试室 × 1（必须）
    - 高级技术员 × 1（必须）
    - 一次性面罩 × 2（非必须）

    来源：cn_kis_test ActivityBOM
    """

    class Meta:
        db_table = 't_activity_bom'
        verbose_name = '活动资源清单'
        ordering = ['template', '-is_mandatory', 'resource_category']
        indexes = [
            models.Index(fields=['template']),
            models.Index(fields=['resource_category']),
        ]
        unique_together = [('template', 'resource_category')]

    template = models.ForeignKey(ActivityTemplate, on_delete=models.CASCADE,
                                 related_name='bom_items', verbose_name='活动模板')
    resource_category = models.ForeignKey(ResourceCategory, on_delete=models.PROTECT,
                                          related_name='bom_usages',
                                          verbose_name='所需资源类别')
    quantity = models.IntegerField('数量', default=1)
    is_mandatory = models.BooleanField('是否必须', default=True,
                                       help_text='必须资源缺失时排程报冲突')
    notes = models.CharField('备注', max_length=200, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        flag = '(必须)' if self.is_mandatory else '(可选)'
        return f'{self.template.name} - {self.resource_category.name} ×{self.quantity} {flag}'


# ============================================================================
# S3-1：设备全生命周期
# ============================================================================
class EquipmentCalibration(models.Model):
    """
    设备校准记录

    关联 ResourceItem（resource_type=equipment）。
    校准到期前自动创建飞书日历提醒。
    """

    class CalibrationType(models.TextChoices):
        INTERNAL = 'internal', '内部校准'
        EXTERNAL = 'external', '外部校准'

    class Meta:
        db_table = 't_equipment_calibration'
        verbose_name = '设备校准'
        ordering = ['-calibration_date']
        indexes = [
            models.Index(fields=['equipment', 'next_due_date']),
            models.Index(fields=['result']),
        ]

    equipment = models.ForeignKey(ResourceItem, on_delete=models.CASCADE,
                                  related_name='calibrations', verbose_name='设备')
    calibration_type = models.CharField('校准类型', max_length=20,
                                         choices=CalibrationType.choices,
                                         default=CalibrationType.INTERNAL)
    calibration_date = models.DateField('校准日期')
    next_due_date = models.DateField('下次校准到期日')
    calibrator = models.CharField('校准人/机构', max_length=200, blank=True, default='')
    certificate_no = models.CharField('校准证书编号', max_length=100, blank=True, default='')
    certificate_file_url = models.CharField('校准证书文件URL', max_length=500,
                                             blank=True, default='')
    result = models.CharField('校准结果', max_length=50, default='pass',
                              help_text='pass/fail/conditional')
    notes = models.TextField('备注', blank=True, default='')

    # 飞书日历事件
    feishu_calendar_event_id = models.CharField('飞书日历事件ID', max_length=100,
                                                blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.equipment.name} 校准@{self.calibration_date}'


class EquipmentVerification(models.Model):
    """
    设备核查记录

    关联 ResourceItem（resource_type=equipment）。
    核查计划到期后发起核查工单，完成后填写本记录。
    """

    class Meta:
        db_table = 't_equipment_verification'
        verbose_name = '设备核查'
        ordering = ['-verification_date']
        indexes = [
            models.Index(fields=['equipment', 'next_due_date']),
            models.Index(fields=['result']),
        ]

    equipment = models.ForeignKey(ResourceItem, on_delete=models.CASCADE,
                                  related_name='verifications', verbose_name='设备')
    verification_date = models.DateField('核查日期')
    next_due_date = models.DateField('下次核查到期日')
    verifier = models.CharField('核查人', max_length=200, blank=True, default='')
    result = models.CharField('核查结果', max_length=50, default='pass',
                              help_text='pass/fail/conditional')
    method_notes = models.TextField('核查方法/说明', blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.equipment.name} 核查@{self.verification_date}'


class EquipmentMaintenance(models.Model):
    """
    设备维护记录

    支持预防性维护（计划）和纠正性维护（报修）两种模式。
    工单式管理：创建 → 分配 → 执行 → 完成。
    """

    class MaintenanceType(models.TextChoices):
        PREVENTIVE = 'preventive', '预防性维护'
        CORRECTIVE = 'corrective', '纠正性维护'
        EMERGENCY = 'emergency', '紧急维修'
        CALIBRATION = 'calibration', '校准'
        VERIFICATION = 'verification', '核查'

    class MaintenanceStatus(models.TextChoices):
        PENDING = 'pending', '待处理'
        IN_PROGRESS = 'in_progress', '处理中'
        COMPLETED = 'completed', '已完成'
        CANCELLED = 'cancelled', '已取消'

    class Meta:
        db_table = 't_equipment_maintenance'
        verbose_name = '设备维护'
        ordering = ['-maintenance_date']
        indexes = [
            models.Index(fields=['equipment', 'status']),
            models.Index(fields=['status', 'maintenance_type']),
            models.Index(fields=['assigned_to_id']),
        ]

    equipment = models.ForeignKey(ResourceItem, on_delete=models.CASCADE,
                                  related_name='maintenances', verbose_name='设备')
    title = models.CharField('标题', max_length=200, default='',
                             help_text='维护工单简洁标题')
    maintenance_type = models.CharField('维护类型', max_length=20,
                                        choices=MaintenanceType.choices)
    status = models.CharField('状态', max_length=20,
                              choices=MaintenanceStatus.choices,
                              default=MaintenanceStatus.PENDING, db_index=True)
    maintenance_date = models.DateField('维护日期')
    description = models.TextField('维护内容')
    performed_by = models.CharField('维护人', max_length=200, blank=True, default='')
    cost = models.DecimalField('费用', max_digits=10, decimal_places=2, null=True, blank=True)
    next_maintenance_date = models.DateField('下次维护日期', null=True, blank=True)

    reported_by_id = models.IntegerField('报修人ID', null=True, blank=True,
                                          help_text='Account ID')
    assigned_to_id = models.IntegerField('负责人ID', null=True, blank=True,
                                          help_text='Account ID')
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    result_notes = models.TextField('维修结果说明', blank=True, default='')
    requires_recalibration = models.BooleanField('是否需要重新校准', default=False)
    calibration_due_date = models.DateField('校准到期日（校准工单时填写）', null=True, blank=True)
    verification_due_date = models.DateField('核查到期日（核查工单时填写）', null=True, blank=True)
    maintenance_due_date = models.DateField('维护到期日（计划维护工单时填写）', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.equipment.name} {self.get_maintenance_type_display()}@{self.maintenance_date}'


class EquipmentUsage(models.Model):
    """
    设备使用记录

    两种来源：
    - 工单关联：工单执行时自动创建（AC-3）
    - 手动登记：设备管理员/操作员扫码或手动登记
    """

    class UsageType(models.TextChoices):
        WORKORDER = 'workorder', '工单关联'
        MANUAL = 'manual', '手动登记'
        TRAINING = 'training', '培训使用'

    class Meta:
        db_table = 't_equipment_usage'
        verbose_name = '设备使用记录'
        ordering = ['-usage_date']
        indexes = [
            models.Index(fields=['equipment', 'usage_date']),
            models.Index(fields=['work_order']),
            models.Index(fields=['operator_id']),
            models.Index(fields=['usage_type']),
        ]

    equipment = models.ForeignKey(ResourceItem, on_delete=models.CASCADE,
                                  related_name='usages', verbose_name='设备')
    work_order = models.ForeignKey('workorder.WorkOrder', on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name='equipment_usages',
                                   verbose_name='关联工单')
    usage_type = models.CharField('使用类型', max_length=20,
                                   choices=UsageType.choices,
                                   default=UsageType.WORKORDER)
    usage_date = models.DateField('使用日期')
    start_time = models.DateTimeField('开始时间', null=True, blank=True)
    end_time = models.DateTimeField('结束时间', null=True, blank=True)
    duration_minutes = models.IntegerField('使用时长(分钟)', null=True, blank=True)
    operator_id = models.IntegerField('操作人ID', null=True, blank=True, help_text='Account ID')
    operator_name = models.CharField('操作人姓名', max_length=100, blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.equipment.name} 使用@{self.usage_date}'


# ============================================================================
# S3-1 扩展：设备操作授权
# ============================================================================
class EquipmentAuthorization(models.Model):
    """
    设备操作授权

    管理操作人员对设备的使用授权，是合规追溯的前提。
    每个操作人员需要经过培训并考核通过才能获得授权。
    """

    class Meta:
        db_table = 't_equipment_authorization'
        verbose_name = '设备操作授权'
        unique_together = [('equipment', 'operator_id')]
        indexes = [
            models.Index(fields=['equipment', 'is_active']),
            models.Index(fields=['operator_id']),
            models.Index(fields=['expires_at']),
        ]

    equipment = models.ForeignKey(ResourceItem, on_delete=models.CASCADE,
                                  related_name='authorizations', verbose_name='设备')
    operator_id = models.IntegerField('操作人ID', help_text='Account ID')
    operator_name = models.CharField('操作人姓名', max_length=100, default='')
    authorized_at = models.DateField('授权日期')
    expires_at = models.DateField('授权到期日', null=True, blank=True)
    is_active = models.BooleanField('是否有效', default=True)
    training_record = models.TextField('培训记录', blank=True, default='',
                                       help_text='培训内容/考核结果')
    authorized_by_id = models.IntegerField('授权人ID', null=True, blank=True,
                                            help_text='Account ID')
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.equipment.name} → {self.operator_name}'


# ============================================================================
# S3-3：场地环境监控
# ============================================================================
class VenueEnvironmentLog(models.Model):
    """
    场地环境监控记录

    记录温湿度等，不合规时标记 is_compliant=False。
    """

    class Meta:
        db_table = 't_venue_environment_log'
        verbose_name = '环境监控记录'
        ordering = ['-recorded_at']
        indexes = [
            models.Index(fields=['venue', 'recorded_at']),
            models.Index(fields=['is_compliant']),
        ]

    venue = models.ForeignKey(ResourceItem, on_delete=models.CASCADE,
                              related_name='environment_logs', verbose_name='场地',
                              help_text='ResourceItem with resource_type=environment')
    recorded_at = models.DateTimeField('记录时间')
    temperature = models.FloatField('温度(°C)', null=True, blank=True)
    humidity = models.FloatField('湿度(%)', null=True, blank=True)
    is_compliant = models.BooleanField('是否合规', default=True)
    non_compliance_reason = models.CharField('不合规原因', max_length=500, blank=True, default='')
    recorder_id = models.IntegerField('记录人ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        tag = '✓' if self.is_compliant else '✗'
        return f'{self.venue.name} {tag} {self.recorded_at}'


class VenueReservation(models.Model):
    """场地预约"""

    class ReservationStatus(models.TextChoices):
        PENDING = 'pending', '待确认'
        CONFIRMED = 'confirmed', '已确认'
        CANCELLED = 'cancelled', '已取消'

    class Meta:
        db_table = 't_venue_reservation'
        verbose_name = '场地预约'
        ordering = ['start_time']
        indexes = [
            models.Index(fields=['venue', 'start_time']),
            models.Index(fields=['status']),
        ]

    venue = models.ForeignKey(ResourceItem, on_delete=models.CASCADE,
                              related_name='reservations', verbose_name='场地')
    start_time = models.DateTimeField('开始时间')
    end_time = models.DateTimeField('结束时间')
    purpose = models.CharField('用途', max_length=500, blank=True, default='')
    reserved_by_id = models.IntegerField('预约人ID', null=True, blank=True)
    status = models.CharField('状态', max_length=20,
                              choices=ReservationStatus.choices,
                              default=ReservationStatus.PENDING)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.venue.name} {self.start_time} ~ {self.end_time}'


# 注册检测方法模型，确保 Django 迁移能发现
from .models_detection_method import (  # noqa: E402, F401
    DetectionMethodTemplate, DetectionMethodResource, DetectionMethodPersonnel,
)

# 注册设施环境管理模型
from .models_facility import (  # noqa: E402, F401
    EnvironmentIncident, CleaningRecord, VenueChangeLog,
    VenueUsageSchedule, VenueMonitorConfig,
)

# 确保所有模型可从 models 直接导入
__all__ = [
    'ResourceType', 'ResourceCategory', 'ResourceStatus', 'ResourceItem',
    'ActivityTemplate', 'ActivityBOM',
    'EquipmentCalibration', 'EquipmentMaintenance', 'EquipmentUsage',
    'EquipmentAuthorization',
    'VenueEnvironmentLog', 'VenueReservation',
    'DetectionMethodTemplate', 'DetectionMethodResource', 'DetectionMethodPersonnel',
    'EnvironmentIncident', 'CleaningRecord', 'VenueChangeLog',
    'VenueUsageSchedule', 'VenueMonitorConfig',
]
