"""
EDC数据采集模型

包含：CRF模板、CRF记录、仪器接口
"""
from django.db import models


class CRFRecordStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SUBMITTED = 'submitted', '已提交'
    VERIFIED = 'verified', '已核实'
    QUERIED = 'queried', '已质疑'
    SDV_COMPLETED = 'sdv_completed', 'SDV已完成'
    LOCKED = 'locked', '已锁定'


class CRFTemplate(models.Model):
    """CRF模板"""

    class Meta:
        db_table = 't_crf_template'
        verbose_name = 'CRF模板'
        indexes = [
            models.Index(fields=['name', 'version']),
            models.Index(fields=['is_active']),
        ]

    name = models.CharField('模板名称', max_length=200)
    version = models.CharField('版本号', max_length=20, default='1.0')
    schema = models.JSONField('表单结构', help_text='JSON Schema格式的表单定义')
    description = models.TextField('描述', blank=True, default='')
    is_active = models.BooleanField('是否生效', default=True)

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    # 软删除
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.name} v{self.version}'


class CRFRecord(models.Model):
    """CRF数据记录"""

    class Meta:
        db_table = 't_crf_record'
        verbose_name = 'CRF记录'
        indexes = [
            models.Index(fields=['template', 'status']),
            models.Index(fields=['work_order']),
            models.Index(fields=['status', 'create_time']),
        ]

    template = models.ForeignKey(CRFTemplate, on_delete=models.PROTECT, related_name='records')
    work_order = models.ForeignKey(
        'workorder.WorkOrder', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='crf_records',
        verbose_name='关联工单',
    )
    data = models.JSONField('表单数据', help_text='根据模板schema填写的数据')
    status = models.CharField('状态', max_length=20, choices=CRFRecordStatus.choices, default=CRFRecordStatus.DRAFT, db_index=True)

    # F5: 数据来源标注（instrument_auto / manual_entry / instrument_import）
    data_source = models.CharField(
        '数据来源', max_length=30, blank=True, default='manual_entry',
        help_text='manual_entry: 手工录入 / instrument_auto: 仪器自动映射 / instrument_import: 仪器文件导入',
    )
    source_detection_id = models.IntegerField(
        '来源检测记录ID', null=True, blank=True,
        help_text='关联的 InstrumentDetection.id（数据来源为仪器时）',
    )

    # 审核信息
    submitted_by = models.IntegerField('提交人ID', null=True, blank=True)
    submitted_at = models.DateTimeField('提交时间', null=True, blank=True)
    verified_by = models.IntegerField('核实人ID', null=True, blank=True)
    verified_at = models.DateTimeField('核实时间', null=True, blank=True)

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.template.name} - WO#{self.work_order_id}'


# ============================================================================
# S1-6：CRF 验证规则与结果
# ============================================================================
class ValidationRuleType(models.TextChoices):
    REQUIRED = 'required', '必填'
    RANGE = 'range', '范围'
    PATTERN = 'pattern', '正则'
    DATE_RANGE = 'date_range', '日期范围'
    CROSS_FIELD = 'cross_field', '跨字段'


class CRFValidationRule(models.Model):
    """
    CRF 验证规则

    来源：cn_kis_test edc/services/data_validation_service.py
    """

    class Meta:
        db_table = 't_crf_validation_rule'
        verbose_name = 'CRF验证规则'
        ordering = ['template', 'field_name']
        indexes = [
            models.Index(fields=['template', 'field_name']),
            models.Index(fields=['rule_type']),
        ]

    template = models.ForeignKey(CRFTemplate, on_delete=models.CASCADE,
                                 related_name='validation_rules', verbose_name='CRF模板')
    field_name = models.CharField('字段名', max_length=100, help_text='data JSON 中的字段键名')
    rule_type = models.CharField('规则类型', max_length=20, choices=ValidationRuleType.choices)
    rule_config = models.JSONField('规则配置', default=dict,
                                   help_text='如 {"min": 0, "max": 200} 或 {"pattern": "^[A-Z]{2}\\d+$"}')
    error_message = models.CharField('错误提示', max_length=500, blank=True, default='')
    is_active = models.BooleanField('是否启用', default=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.template.name}.{self.field_name} [{self.rule_type}]'


class ValidationSeverity(models.TextChoices):
    ERROR = 'error', '错误'
    WARNING = 'warning', '警告'


class CRFValidationResult(models.Model):
    """CRF 验证结果"""

    class Meta:
        db_table = 't_crf_validation_result'
        verbose_name = 'CRF验证结果'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['record', 'severity']),
        ]

    record = models.ForeignKey(CRFRecord, on_delete=models.CASCADE,
                               related_name='validation_results', verbose_name='CRF记录')
    rule = models.ForeignKey(CRFValidationRule, on_delete=models.SET_NULL,
                             null=True, blank=True, related_name='results', verbose_name='规则')
    field_name = models.CharField('字段名', max_length=100)
    severity = models.CharField('严重度', max_length=20, choices=ValidationSeverity.choices,
                                default=ValidationSeverity.ERROR)
    message = models.CharField('错误信息', max_length=500)
    field_value = models.CharField('字段值', max_length=200, blank=True, default='')
    is_resolved = models.BooleanField('是否已解决', default=False)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'CRF#{self.record_id}.{self.field_name}: {self.message}'


class InstrumentInterface(models.Model):
    """仪器接口配置"""

    class Meta:
        db_table = 't_instrument_interface'
        verbose_name = '仪器接口'
        indexes = [
            models.Index(fields=['instrument_type', 'is_active']),
        ]

    name = models.CharField('接口名称', max_length=200)
    instrument_type = models.CharField('仪器类型', max_length=100, help_text='如：血压计、体温计、实验室设备等')
    interface_type = models.CharField('接口类型', max_length=50, help_text='如：HL7、REST API、文件导入等')
    config = models.JSONField('接口配置', help_text='连接参数、认证信息等')
    mapping = models.JSONField('数据映射', null=True, blank=True, help_text='仪器数据到CRF字段的映射规则')
    is_active = models.BooleanField('是否启用', default=True)

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    # 软删除
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.name} ({self.instrument_type})'


# ============================================================================
# S2-4：SDV + 质疑管理
# ============================================================================
class SDVStatus(models.TextChoices):
    PENDING = 'pending', '待核查'
    VERIFIED = 'verified', '已核查'
    DISCREPANCY = 'discrepancy', '有差异'


class SDVRecord(models.Model):
    """
    源数据核查（SDV）记录

    字段级 SDV：CRA 对 CRF 记录中的每个字段进行核查。
    """

    class Meta:
        db_table = 't_sdv_record'
        verbose_name = 'SDV记录'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['crf_record', 'field_name']),
            models.Index(fields=['status']),
        ]

    crf_record = models.ForeignKey(CRFRecord, on_delete=models.CASCADE,
                                   related_name='sdv_records', verbose_name='CRF记录')
    field_name = models.CharField('字段名', max_length=100)
    status = models.CharField('状态', max_length=20, choices=SDVStatus.choices,
                              default=SDVStatus.PENDING)
    verified_by_id = models.IntegerField('核查人ID', null=True, blank=True, help_text='Account ID')
    verified_at = models.DateTimeField('核查时间', null=True, blank=True)
    notes = models.TextField('核查备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'SDV CRF#{self.crf_record_id}.{self.field_name}: {self.status}'


class QueryStatus(models.TextChoices):
    OPEN = 'open', '已开放'
    ANSWERED = 'answered', '已回复'
    CLOSED = 'closed', '已关闭'


class DataQuery(models.Model):
    """
    数据质疑

    CRA 针对 CRF 数据中的问题创建质疑 → CRC 回复 → CRA 关闭
    """

    class Meta:
        db_table = 't_data_query'
        verbose_name = '数据质疑'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['crf_record', 'status']),
            models.Index(fields=['status']),
        ]

    crf_record = models.ForeignKey(CRFRecord, on_delete=models.CASCADE,
                                   related_name='data_queries', verbose_name='CRF记录')
    field_name = models.CharField('字段名', max_length=100)
    query_text = models.TextField('质疑内容')
    status = models.CharField('状态', max_length=20, choices=QueryStatus.choices,
                              default=QueryStatus.OPEN)

    # 回复
    answer_text = models.TextField('回复内容', blank=True, default='')
    answered_by_id = models.IntegerField('回复人ID', null=True, blank=True)
    answered_at = models.DateTimeField('回复时间', null=True, blank=True)

    # 关闭
    closed_by_id = models.IntegerField('关闭人ID', null=True, blank=True)
    closed_at = models.DateTimeField('关闭时间', null=True, blank=True)
    close_reason = models.TextField('关闭原因', blank=True, default='')

    # 创建人
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, help_text='Account ID')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'Query CRF#{self.crf_record_id}.{self.field_name}: {self.status}'
