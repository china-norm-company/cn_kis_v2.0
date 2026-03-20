"""
工单执行跟踪模型

来源：cn_kis_test workorder/models_execution.py
技术评估人员工作台核心模型，支持分步执行、仪器检测和进度跟踪

核心模型：
- ExperimentStep：分步执行跟踪
- InstrumentDetection：仪器检测记录
- WorkOrderProgressTracker：实时进度
"""
from django.db import models


class StepStatus(models.TextChoices):
    PENDING = 'pending', '待执行'
    IN_PROGRESS = 'in_progress', '执行中'
    COMPLETED = 'completed', '已完成'
    SKIPPED = 'skipped', '已跳过'
    FAILED = 'failed', '失败'


class DetectionStatus(models.TextChoices):
    QUEUED = 'queued', '排队中'
    RUNNING = 'running', '检测中'
    COMPLETED = 'completed', '已完成'
    FAILED = 'failed', '失败'
    CANCELLED = 'cancelled', '已取消'


class DataSource(models.TextChoices):
    MANUAL_ENTRY = 'manual_entry', '手工录入'
    INSTRUMENT_AUTO = 'instrument_auto', '仪器自动采集'
    INSTRUMENT_IMPORT = 'instrument_import', '仪器文件导入'


class ExperimentStep(models.Model):
    """
    分步执行跟踪

    从 DetectionMethodTemplate 的 standard_procedure 初始化，
    技术评估人员逐步执行，每步记录开始/完成时间和执行数据。
    """

    class Meta:
        db_table = 't_experiment_step'
        verbose_name = '实验步骤'
        ordering = ['work_order', 'step_number']
        indexes = [
            models.Index(fields=['work_order', 'status']),
        ]

    work_order = models.ForeignKey(
        'workorder.WorkOrder', on_delete=models.CASCADE,
        related_name='experiment_steps', verbose_name='关联工单'
    )
    step_number = models.IntegerField('步骤序号')
    step_name = models.CharField('步骤名称', max_length=200)
    step_description = models.TextField('步骤说明', blank=True, default='')
    estimated_duration_minutes = models.IntegerField('预计时长(分钟)', default=0)

    status = models.CharField(
        '状态', max_length=20,
        choices=StepStatus.choices, default=StepStatus.PENDING
    )
    started_at = models.DateTimeField('开始时间', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    actual_duration_minutes = models.IntegerField('实际时长(分钟)', null=True, blank=True)

    execution_data = models.JSONField('执行数据', default=dict, blank=True)
    equipment_used = models.JSONField('使用设备', default=list, blank=True)
    result = models.TextField('执行结果', blank=True, default='')
    attachments = models.JSONField('附件', default=list, blank=True)
    skip_reason = models.TextField('跳过原因', blank=True, default='')

    executed_by = models.IntegerField('执行人 Account ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f"WO#{self.work_order_id} Step {self.step_number}: {self.step_name}"


class InstrumentDetection(models.Model):
    """
    仪器检测记录

    记录使用精密仪器进行的检测操作，包含原始数据、处理数据和质控信息。
    支持化妆品 CRO 常用检测：Corneometer、Cutometer、VISIA、Mexameter 等。
    """

    class Meta:
        db_table = 't_instrument_detection'
        verbose_name = '仪器检测记录'
        indexes = [
            models.Index(fields=['work_order', 'status']),
            models.Index(fields=['equipment', 'status']),
        ]

    work_order = models.ForeignKey(
        'workorder.WorkOrder', on_delete=models.CASCADE,
        related_name='instrument_detections', verbose_name='关联工单'
    )
    equipment = models.ForeignKey(
        'resource.ResourceItem', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='detections', verbose_name='使用设备'
    )

    detection_name = models.CharField('检测名称', max_length=200)
    detection_method = models.CharField('检测方法', max_length=200, blank=True, default='')

    status = models.CharField(
        '状态', max_length=20,
        choices=DetectionStatus.choices, default=DetectionStatus.QUEUED
    )
    started_at = models.DateTimeField('开始时间', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)

    raw_data = models.JSONField('原始数据', default=dict, blank=True)
    processed_data = models.JSONField('处理后数据', default=dict, blank=True)
    result_values = models.JSONField('结果值', default=dict, blank=True)
    data_file_path = models.CharField('数据文件路径', max_length=500, blank=True, default='')

    qc_passed = models.BooleanField('质控通过', null=True, blank=True)
    qc_notes = models.TextField('质控备注', blank=True, default='')

    operated_by = models.IntegerField('操作人 Account ID', null=True, blank=True)

    # ---- F1: 数据变更留痕 ----
    data_source = models.CharField(
        '数据来源', max_length=30,
        choices=DataSource.choices, default=DataSource.MANUAL_ENTRY,
    )
    is_voided = models.BooleanField('是否已作废', default=False)
    voided_reason = models.TextField('作废原因', blank=True, default='')
    voided_by = models.IntegerField('作废人 Account ID', null=True, blank=True)
    voided_at = models.DateTimeField('作废时间', null=True, blank=True)

    # ---- F2: 环境数据快照 ----
    environment_snapshot = models.JSONField(
        '环境快照',
        default=dict, blank=True,
        help_text='检测开始时的温湿度快照：{"temperature": 22.5, "humidity": 48.0, "is_compliant": true, ...}',
    )

    # ---- F3: 人员资质快照 ----
    operator_qualification_snapshot = models.JSONField(
        '操作人资质快照',
        default=dict, blank=True,
        help_text='检测开始时的操作人方法资质和设备授权快照',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f"WO#{self.work_order_id} Detection: {self.detection_name} ({self.status})"


class WorkOrderProgressTracker(models.Model):
    """
    工单实时进度跟踪

    与工单一对一关联，记录当前执行进度和时间偏差。
    """

    class Meta:
        db_table = 't_work_order_progress'
        verbose_name = '工单进度'

    work_order = models.OneToOneField(
        'workorder.WorkOrder', on_delete=models.CASCADE,
        related_name='progress_tracker', verbose_name='关联工单'
    )
    progress_percent = models.IntegerField('进度百分比', default=0)
    current_step = models.IntegerField('当前步骤', default=0)
    total_steps = models.IntegerField('总步骤数', default=0)

    actual_start = models.DateTimeField('实际开始时间', null=True, blank=True)
    actual_end = models.DateTimeField('实际结束时间', null=True, blank=True)
    time_variance_minutes = models.IntegerField('时间偏差(分钟)', default=0)
    current_status_note = models.CharField('当前状态说明', max_length=500, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f"WO#{self.work_order_id} Progress: {self.progress_percent}%"
