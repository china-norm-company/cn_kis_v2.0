"""
时序数据模型

统一设计：subject FK + enrollment FK(nullable) + work_order FK(nullable) + measured_at + source。
支持跨项目纵向追踪和 RWE 数据池。
"""
from django.db import models


class DataSource(models.TextChoices):
    MANUAL = 'manual', '手工录入'
    DEVICE = 'device', '设备采集'
    IMPORTED = 'imported', '导入'
    LIMS = 'lims', 'LIMS系统'
    EDC = 'edc', 'EDC采集'


class TimeseriesBase(models.Model):
    """时序数据抽象基类"""

    class Meta:
        abstract = True

    subject = models.ForeignKey('subject.Subject', on_delete=models.CASCADE, related_name='%(class)s_records')
    enrollment = models.ForeignKey(
        'subject.Enrollment', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='%(class)s_records',
        help_text='关联入组（null 表示独立于项目的数据）',
    )
    work_order = models.ForeignKey(
        'workorder.WorkOrder', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='%(class)s_records',
    )

    measured_at = models.DateTimeField('测量时间', db_index=True)
    source = models.CharField('数据来源', max_length=20, choices=DataSource.choices, default=DataSource.MANUAL)
    operator_id = models.IntegerField('操作人ID', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


# ============================================================================
# 生命体征
# ============================================================================
class VitalSignRecord(TimeseriesBase):
    """生命体征记录（可多次测量）"""

    class Meta:
        db_table = 't_vital_sign_record'
        verbose_name = '生命体征'
        indexes = [
            models.Index(fields=['subject', 'measured_at']),
        ]

    systolic_bp = models.IntegerField('收缩压(mmHg)', null=True, blank=True)
    diastolic_bp = models.IntegerField('舒张压(mmHg)', null=True, blank=True)
    heart_rate = models.IntegerField('心率(bpm)', null=True, blank=True)
    respiratory_rate = models.IntegerField('呼吸频率(次/分)', null=True, blank=True)
    temperature = models.DecimalField('体温(℃)', max_digits=4, decimal_places=1, null=True, blank=True)
    spo2 = models.DecimalField('血氧饱和度(%)', max_digits=5, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f'生命体征 {self.subject_id} @ {self.measured_at}'


# ============================================================================
# 体格测量
# ============================================================================
class BodyMetricRecord(TimeseriesBase):
    """体格测量记录"""

    class Meta:
        db_table = 't_body_metric_record'
        verbose_name = '体格测量'
        indexes = [
            models.Index(fields=['subject', 'measured_at']),
        ]

    height = models.DecimalField('身高(cm)', max_digits=6, decimal_places=1, null=True, blank=True)
    weight = models.DecimalField('体重(kg)', max_digits=6, decimal_places=2, null=True, blank=True)
    bmi = models.DecimalField('BMI', max_digits=5, decimal_places=2, null=True, blank=True)
    waist = models.DecimalField('腰围(cm)', max_digits=6, decimal_places=1, null=True, blank=True)
    hip = models.DecimalField('臀围(cm)', max_digits=6, decimal_places=1, null=True, blank=True)
    body_fat = models.DecimalField('体脂率(%)', max_digits=5, decimal_places=2, null=True, blank=True)

    def __str__(self):
        return f'体格测量 {self.subject_id} @ {self.measured_at}'


# ============================================================================
# 实验室检验
# ============================================================================
class LabResultRecord(TimeseriesBase):
    """实验室检验结果"""

    class Meta:
        db_table = 't_lab_result_record'
        verbose_name = '实验室检验'
        indexes = [
            models.Index(fields=['subject', 'measured_at']),
            models.Index(fields=['test_code']),
        ]

    test_code = models.CharField('检验项编码', max_length=50)
    test_name = models.CharField('检验项名称', max_length=200)
    result_value = models.CharField('结果值', max_length=100, blank=True, default='')
    result_numeric = models.DecimalField('数值结果', max_digits=12, decimal_places=4, null=True, blank=True)
    unit = models.CharField('单位', max_length=50, blank=True, default='')
    reference_low = models.DecimalField('参考下限', max_digits=12, decimal_places=4, null=True, blank=True)
    reference_high = models.DecimalField('参考上限', max_digits=12, decimal_places=4, null=True, blank=True)
    is_abnormal = models.BooleanField('是否异常', default=False)
    specimen_type = models.CharField('标本类型', max_length=50, blank=True, default='', help_text='血液/尿液/唾液等')

    def __str__(self):
        return f'{self.test_name} {self.subject_id} @ {self.measured_at}'


# ============================================================================
# 皮肤仪器测量
# ============================================================================
class SkinMeasurementRecord(TimeseriesBase):
    """皮肤仪器测量数据"""

    class Meta:
        db_table = 't_skin_measurement_record'
        verbose_name = '皮肤测量'
        indexes = [
            models.Index(fields=['subject', 'measured_at']),
        ]

    measurement_site = models.CharField('测量部位', max_length=100, blank=True, default='', help_text='前额/脸颊/前臂等')
    instrument = models.CharField('仪器', max_length=100, blank=True, default='')
    moisture = models.DecimalField('水分值(Corneometer)', max_digits=8, decimal_places=2, null=True, blank=True)
    tewl = models.DecimalField('TEWL值(Tewameter)', max_digits=8, decimal_places=2, null=True, blank=True)
    sebum = models.DecimalField('皮脂值(Sebumeter)', max_digits=8, decimal_places=2, null=True, blank=True)
    melanin = models.DecimalField('黑色素(Mexameter)', max_digits=8, decimal_places=2, null=True, blank=True)
    erythema = models.DecimalField('红斑值(Mexameter)', max_digits=8, decimal_places=2, null=True, blank=True)
    elasticity = models.DecimalField('弹性(Cutometer)', max_digits=8, decimal_places=2, null=True, blank=True)
    gloss = models.DecimalField('光泽度(Glossymeter)', max_digits=8, decimal_places=2, null=True, blank=True)
    ph_value = models.DecimalField('pH值(Skin-pH-Meter)', max_digits=4, decimal_places=2, null=True, blank=True)
    roughness = models.DecimalField('粗糙度(PRIMOS)', max_digits=8, decimal_places=2, null=True, blank=True)
    image_path = models.CharField('影像路径', max_length=500, blank=True, default='', help_text='VISIA/拍照')

    def __str__(self):
        return f'皮肤测量 {self.subject_id} @ {self.measured_at}'
