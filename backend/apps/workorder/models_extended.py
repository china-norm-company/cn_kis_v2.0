"""
工单扩展模型

来源：cn_kis_test workorder/models_workorder_extended.py
技术评估人员工作台扩展模型，支持工单确认、准备、暂停和异常处理

核心模型：
- WorkOrderConfirmation：工单接收确认
- WorkOrderPreparation：执行前准备
- WorkOrderSuspension：暂停记录
- WorkOrderException：异常记录
"""
from django.db import models


class ConfirmationStatus(models.TextChoices):
    PENDING = 'pending', '待确认'
    ACCEPTED = 'accepted', '已接受'
    REJECTED = 'rejected', '已拒绝'
    TRANSFERRED = 'transferred', '已转派'


class PreparationStatus(models.TextChoices):
    NOT_STARTED = 'not_started', '未开始'
    IN_PROGRESS = 'in_progress', '进行中'
    COMPLETED = 'completed', '已完成'
    ISSUES_FOUND = 'issues_found', '发现问题'


class ExceptionType(models.TextChoices):
    DELAY = 'delay', '延迟'
    RESOURCE_UNAVAILABLE = 'resource_unavailable', '资源不可用'
    QUALITY_ISSUE = 'quality_issue', '质量问题'
    TECHNICAL_ISSUE = 'technical_issue', '技术问题'
    SUBJECT_ISSUE = 'subject_issue', '受试者问题'
    EQUIPMENT_FAILURE = 'equipment_failure', '设备故障'
    ENVIRONMENT_ISSUE = 'environment_issue', '环境异常'
    OTHER = 'other', '其他'


class ExceptionSeverity(models.TextChoices):
    LOW = 'low', '低'
    MEDIUM = 'medium', '中'
    HIGH = 'high', '高'
    CRITICAL = 'critical', '严重'


class ResolutionStatus(models.TextChoices):
    REPORTED = 'reported', '已上报'
    INVESTIGATING = 'investigating', '调查中'
    RESOLVING = 'resolving', '处理中'
    RESOLVED = 'resolved', '已解决'
    ESCALATED = 'escalated', '已升级'


class WorkOrderConfirmation(models.Model):
    """
    工单接收确认

    技术评估人员收到工单后，需确认接受或拒绝。
    拒绝需填写原因，可转派给其他人员。
    """

    class Meta:
        db_table = 't_work_order_confirmation'
        verbose_name = '工单确认'

    work_order = models.OneToOneField(
        'workorder.WorkOrder', on_delete=models.CASCADE,
        related_name='confirmation', verbose_name='关联工单'
    )
    status = models.CharField(
        '确认状态', max_length=20,
        choices=ConfirmationStatus.choices, default=ConfirmationStatus.PENDING
    )
    confirmed_by = models.IntegerField('确认人 Account ID', null=True, blank=True)
    confirmed_at = models.DateTimeField('确认时间', null=True, blank=True)
    rejection_reason = models.TextField('拒绝原因', blank=True, default='')
    transfer_to = models.IntegerField('转派给 Account ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f"WO#{self.work_order_id} Confirmation: {self.status}"


class WorkOrderPreparation(models.Model):
    """
    执行前准备

    技术评估人员在开始执行前，需逐项确认准备条件：
    仪器就绪、环境就绪、耗材就绪、受试者就绪、资质确认。
    """

    class Meta:
        db_table = 't_work_order_preparation'
        verbose_name = '执行前准备'

    work_order = models.OneToOneField(
        'workorder.WorkOrder', on_delete=models.CASCADE,
        related_name='preparation', verbose_name='关联工单'
    )
    status = models.CharField(
        '准备状态', max_length=20,
        choices=PreparationStatus.choices, default=PreparationStatus.NOT_STARTED
    )
    checklist_items = models.JSONField(
        '检查清单', default=list, blank=True,
        help_text='[{"name": "仪器就绪", "is_checked": false, "checked_at": null}]'
    )
    resources_confirmed = models.BooleanField('资源已确认', default=False)
    venue_confirmed = models.BooleanField('场地已确认', default=False)
    equipment_confirmed = models.BooleanField('设备已确认', default=False)
    issues_found = models.TextField('发现的问题', blank=True, default='')

    prepared_by = models.IntegerField('准备人 Account ID', null=True, blank=True)
    prepared_at = models.DateTimeField('准备完成时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f"WO#{self.work_order_id} Preparation: {self.status}"


class WorkOrderSuspension(models.Model):
    """
    工单暂停记录

    技术评估人员在执行过程中因异常情况需暂停工单。
    """

    class Meta:
        db_table = 't_work_order_suspension'
        verbose_name = '工单暂停记录'
        ordering = ['-suspended_at']

    work_order = models.ForeignKey(
        'workorder.WorkOrder', on_delete=models.CASCADE,
        related_name='suspensions', verbose_name='关联工单'
    )
    suspended_at = models.DateTimeField('暂停时间', auto_now_add=True)
    suspended_by = models.IntegerField('暂停人 Account ID')
    suspension_reason = models.TextField('暂停原因')

    resumed_at = models.DateTimeField('恢复时间', null=True, blank=True)
    resumed_by = models.IntegerField('恢复人 Account ID', null=True, blank=True)
    duration_minutes = models.IntegerField('暂停时长(分钟)', null=True, blank=True)
    is_active = models.BooleanField('是否仍在暂停', default=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f"WO#{self.work_order_id} Suspension {'(active)' if self.is_active else '(resolved)'}"


class WorkOrderException(models.Model):
    """
    工单异常记录

    技术评估人员在执行过程中发现的异常情况。
    严重异常自动关联偏差记录。
    """

    class Meta:
        db_table = 't_work_order_exception'
        verbose_name = '工单异常'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['work_order', 'resolution_status']),
        ]

    work_order = models.ForeignKey(
        'workorder.WorkOrder', on_delete=models.CASCADE,
        related_name='exceptions', verbose_name='关联工单'
    )
    exception_type = models.CharField(
        '异常类型', max_length=30,
        choices=ExceptionType.choices
    )
    severity = models.CharField(
        '严重程度', max_length=20,
        choices=ExceptionSeverity.choices, default=ExceptionSeverity.MEDIUM
    )
    description = models.TextField('异常描述')
    impact_analysis = models.TextField('影响分析', blank=True, default='')

    resolution_status = models.CharField(
        '处理状态', max_length=20,
        choices=ResolutionStatus.choices, default=ResolutionStatus.REPORTED
    )
    resolution_action = models.TextField('处理措施', blank=True, default='')

    reported_by = models.IntegerField('上报人 Account ID')
    resolved_by = models.IntegerField('处理人 Account ID', null=True, blank=True)
    resolved_at = models.DateTimeField('处理完成时间', null=True, blank=True)

    deviation_id = models.IntegerField('关联偏差 ID', null=True, blank=True,
                                        help_text='严重异常自动创建偏差记录')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f"WO#{self.work_order_id} Exception: {self.exception_type} ({self.severity})"
