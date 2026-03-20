"""
工单管理模型

包含：工单信息、分配、状态流转
"""
from django.db import models


class WorkOrderStatus(models.TextChoices):
    PENDING = 'pending', '待处理'
    ASSIGNED = 'assigned', '已分配'
    IN_PROGRESS = 'in_progress', '进行中'
    COMPLETED = 'completed', '已完成'
    REVIEW = 'review', '待审核'
    APPROVED = 'approved', '已批准'
    REJECTED = 'rejected', '已拒绝'
    CANCELLED = 'cancelled', '已取消'


class WorkOrder(models.Model):
    """工单"""

    class Meta:
        db_table = 't_work_order'
        verbose_name = '工单'
        indexes = [
            models.Index(fields=['enrollment', 'status']),
            models.Index(fields=['visit_node', 'status']),
            models.Index(fields=['assigned_to', 'status']),
            models.Index(fields=['assigned_to_account', 'status']),
            models.Index(fields=['status', 'due_date']),
            models.Index(fields=['create_time']),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(assigned_to_account__isnull=True) |
                    models.Q(assigned_to__isnull=True) |
                    models.Q(assigned_to_account=models.F('assigned_to'))
                ),
                name='chk_workorder_assignee_fk_match_id',
            ),
            models.CheckConstraint(
                check=(
                    models.Q(created_by_account__isnull=True) |
                    models.Q(created_by_id__isnull=True) |
                    models.Q(created_by_account=models.F('created_by_id'))
                ),
                name='chk_workorder_creator_fk_match_id',
            ),
        ]

    # 关联信息
    enrollment = models.ForeignKey('subject.Enrollment', on_delete=models.CASCADE, related_name='work_orders')
    visit_node = models.ForeignKey('visit.VisitNode', on_delete=models.PROTECT, related_name='work_orders', null=True, blank=True)
    
    # S1-5 补强：关联活动（从排程自动生成时关联）
    visit_activity = models.ForeignKey('visit.VisitActivity', on_delete=models.SET_NULL,
                                       null=True, blank=True, related_name='work_orders',
                                       verbose_name='关联访视活动')
    schedule_slot = models.ForeignKey('scheduling.ScheduleSlot', on_delete=models.SET_NULL,
                                      null=True, blank=True, related_name='work_orders',
                                      verbose_name='关联排程时间槽')

    # 基本信息
    title = models.CharField('标题', max_length=500)
    description = models.TextField('描述', blank=True, default='')
    work_order_type = models.CharField('工单类型', max_length=50, blank=True, default='visit',
                                       help_text='visit/examination/laboratory/other')

    # 状态
    status = models.CharField('状态', max_length=20, choices=WorkOrderStatus.choices, default=WorkOrderStatus.PENDING, db_index=True)

    # 排程日期
    scheduled_date = models.DateField('排程日期', null=True, blank=True)
    actual_date = models.DateField('实际执行日期', null=True, blank=True)

    # 分配
    assigned_to = models.IntegerField('分配给', null=True, blank=True, db_index=True, help_text='Account ID')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')
    assigned_to_account = models.ForeignKey(
        'identity.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_work_orders',
        db_column='assigned_to_account_id',
        verbose_name='分配给账号FK',
    )
    created_by_account = models.ForeignKey(
        'identity.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_work_orders',
        db_column='created_by_account_id',
        verbose_name='创建人账号FK',
    )
    due_date = models.DateTimeField('截止日期', null=True, blank=True)
    
    # 飞书集成
    feishu_approval_instance_id = models.CharField('飞书审批实例ID', max_length=100, blank=True, default='', db_index=True)
    feishu_task_id = models.CharField('飞书任务ID', max_length=100, blank=True, default='', db_index=True,
                                      help_text='task/v2 任务 GUID，工单派发时创建')

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    
    # 合规控制
    sop_confirmed = models.BooleanField('SOP已确认', default=False,
                                        help_text='执行前确认已阅读操作规范')
    is_locked = models.BooleanField('数据锁定', default=False,
                                    help_text='审批通过后锁定，不可修改')

    # 软删除
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'WO#{self.id} - {self.title}'

    @property
    def effective_assigned_to(self):
        """双轨兼容：优先 FK，再回退历史整数字段。"""
        return self.assigned_to_account_id or self.assigned_to

    @property
    def effective_created_by(self):
        """双轨兼容：优先 FK，再回退历史整数字段。"""
        return self.created_by_account_id or self.created_by_id


class WorkOrderResource(models.Model):
    """
    工单资源需求与实绩（S1-5）

    记录工单执行所需的资源（来自 BOM）及实际使用情况。
    """

    class Meta:
        db_table = 't_work_order_resource'
        verbose_name = '工单资源'
        indexes = [
            models.Index(fields=['work_order']),
            models.Index(fields=['resource_category']),
        ]

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE,
                                   related_name='resources', verbose_name='工单')
    resource_category = models.ForeignKey('resource.ResourceCategory',
                                          on_delete=models.PROTECT,
                                          related_name='workorder_usages',
                                          verbose_name='资源类别')
    resource_item = models.ForeignKey('resource.ResourceItem',
                                      on_delete=models.SET_NULL, null=True, blank=True,
                                      related_name='workorder_usages',
                                      verbose_name='实际资源实例')
    required_quantity = models.IntegerField('需求数量', default=1)
    actual_quantity = models.IntegerField('实际数量', null=True, blank=True)
    is_mandatory = models.BooleanField('是否必须', default=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'WO#{self.work_order_id} - {self.resource_category.name}'


class WorkOrderAssignment(models.Model):
    """
    工单分配记录（S1-5）

    记录工单分配历史，支持重新分配跟踪。
    """

    class Meta:
        db_table = 't_work_order_assignment'
        verbose_name = '工单分配记录'
        ordering = ['-assigned_at']
        indexes = [
            models.Index(fields=['work_order']),
            models.Index(fields=['assigned_to_id']),
            models.Index(fields=['assigned_to_account']),
            models.Index(fields=['assigned_by_account']),
        ]
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(assigned_to_account__isnull=True) |
                    models.Q(assigned_to_account=models.F('assigned_to_id'))
                ),
                name='chk_wo_assignment_to_fk_match_id',
            ),
            models.CheckConstraint(
                check=(
                    models.Q(assigned_by_account__isnull=True) |
                    models.Q(assigned_by_account=models.F('assigned_by_id'))
                ),
                name='chk_wo_assignment_by_fk_match_id',
            ),
        ]

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE,
                                   related_name='assignments', verbose_name='工单')
    assigned_to_id = models.IntegerField('被分配人ID', help_text='Account ID')
    assigned_by_id = models.IntegerField('分配人ID', null=True, blank=True, help_text='Account ID')
    assigned_to_account = models.ForeignKey(
        'identity.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workorder_assignments_received',
        db_column='assigned_to_account_id',
        verbose_name='被分配人账号FK',
    )
    assigned_by_account = models.ForeignKey(
        'identity.Account',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workorder_assignments_sent',
        db_column='assigned_by_account_id',
        verbose_name='分配人账号FK',
    )
    assigned_at = models.DateTimeField('分配时间', auto_now_add=True)
    reason = models.CharField('分配原因', max_length=200, blank=True, default='',
                              help_text='auto/manual/reassign')

    def __str__(self):
        return f'WO#{self.work_order_id} → User#{self.assigned_to_id}'


class WorkOrderQualityAudit(models.Model):
    """
    工单质量审计记录（S2-3）

    工单完成后自动创建，根据数据完整度和异常情况自动判定。
    """

    class Meta:
        db_table = 't_work_order_quality_audit'
        verbose_name = '工单质量审计'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['work_order']),
            models.Index(fields=['result']),
        ]

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE,
                                   related_name='quality_audits', verbose_name='工单')
    completeness = models.FloatField('数据完整度', default=0.0,
                                     help_text='0.0~1.0')
    has_anomaly = models.BooleanField('存在异常', default=False)
    result = models.CharField('审计结果', max_length=20,
                              help_text='auto_pass/auto_reject/manual_review')
    details = models.JSONField('审计详情', default=dict, blank=True)
    reviewer_id = models.IntegerField('人工审核人ID', null=True, blank=True)
    reviewer_comment = models.TextField('审核意见', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'Audit WO#{self.work_order_id}: {self.result}'


class WorkOrderChecklist(models.Model):
    """
    P3.3: 工单操作检查清单

    工单创建时根据活动模板自动生成检查项，
    技术员逐项勾选确认，必须项全部勾选后才能完成工单。
    """

    class Meta:
        db_table = 't_work_order_checklist'
        verbose_name = '工单检查清单'
        ordering = ['sequence']
        indexes = [
            models.Index(fields=['work_order']),
        ]

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE,
                                   related_name='checklists', verbose_name='工单')
    sequence = models.IntegerField('序号', default=0)
    item_text = models.CharField('检查项内容', max_length=500)
    is_mandatory = models.BooleanField('是否必须', default=True)
    is_checked = models.BooleanField('已勾选', default=False)
    checked_at = models.DateTimeField('勾选时间', null=True, blank=True)
    checked_by = models.IntegerField('勾选人ID', null=True, blank=True, help_text='Account ID')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'CL WO#{self.work_order_id} [{self.sequence}] {"✓" if self.is_checked else "○"}'


class WorkOrderComment(models.Model):
    """P4-3: 工单评论"""

    class Meta:
        db_table = 't_workorder_comment'
        verbose_name = '工单评论'
        ordering = ['create_time']
        indexes = [
            models.Index(fields=['work_order']),
        ]

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE,
                                   related_name='comments', verbose_name='工单')
    author_id = models.IntegerField('作者ID', help_text='Account ID')
    content = models.TextField('评论内容')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'Comment WO#{self.work_order_id} by #{self.author_id}'


class AlertConfig(models.Model):
    """P3-4: 告警阈值配置"""

    class Meta:
        db_table = 't_alert_config'
        verbose_name = '告警配置'
        ordering = ['alert_type']

    alert_type = models.CharField('告警类型', max_length=50,
                                  help_text='workorder_overdue/workload_imbalance/equipment_calibration/subject_no_show')
    threshold = models.FloatField('阈值', default=0)
    level = models.CharField('级别', max_length=20, default='warning',
                             help_text='info/warning/critical')
    is_enabled = models.BooleanField('是否启用', default=True)
    created_by = models.IntegerField('创建人ID', null=True, blank=True, help_text='Account ID')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'AlertConfig: {self.alert_type} > {self.threshold}'


class AutoReportConfig(models.Model):
    """P4-4: 自动通报配置"""

    class Meta:
        db_table = 't_auto_report_config'
        verbose_name = '自动通报配置'

    protocol_id = models.IntegerField('协议ID', unique=True)
    enabled = models.BooleanField('是否启用', default=False)
    created_by = models.IntegerField('创建人ID', null=True, blank=True, help_text='Account ID')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'AutoReport Protocol#{self.protocol_id}: {"ON" if self.enabled else "OFF"}'


# 注册扩展模型，确保 Django 迁移能发现
from .models_execution import ExperimentStep, InstrumentDetection, WorkOrderProgressTracker  # noqa: E402, F401
from .models_extended import (  # noqa: E402, F401
    WorkOrderConfirmation, WorkOrderPreparation,
    WorkOrderSuspension, WorkOrderException,
)
from .models_context import (  # noqa: E402, F401
    ProjectExecutionContext, CRCDecisionLog, ChangeResponseRecord,
)
from .models_evaluator_schedule import (  # noqa: E402, F401
    EvaluatorScheduleNote, EvaluatorScheduleAttachment,
)
