"""
审批流程通用引擎

S4-9：动态审批流定义 + 执行，支持飞书审批联动
"""
from django.db import models


class ApprovalType(models.TextChoices):
    SEQUENTIAL = 'sequential', '依次审批'
    PARALLEL = 'parallel', '会签'
    ANY = 'any', '或签'


class WorkflowStatus(models.TextChoices):
    ACTIVE = 'active', '启用'
    INACTIVE = 'inactive', '停用'


class WorkflowDefinition(models.Model):
    """审批流程定义"""

    class Meta:
        db_table = 't_workflow_definition'
        verbose_name = '流程定义'
        ordering = ['name']

    name = models.CharField('流程名称', max_length=200)
    code = models.CharField('流程编码', max_length=50, unique=True, db_index=True)
    description = models.TextField('描述', blank=True, default='')
    business_type = models.CharField('业务类型', max_length=50,
                                      help_text='如 deviation/ae/document/ethics')
    status = models.CharField('状态', max_length=20, choices=WorkflowStatus.choices,
                              default=WorkflowStatus.ACTIVE)
    steps = models.JSONField('审批步骤', default=list,
                              help_text='[{"step": 1, "name": "xx", "type": "sequential", '
                                        '"approvers": [{"role": "xx"}, {"user_id": 1}]}]')
    feishu_approval_code = models.CharField('飞书审批定义Code', max_length=100,
                                             blank=True, default='',
                                             help_text='可选，关联飞书原生审批')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.code} - {self.name}'


class InstanceStatus(models.TextChoices):
    PENDING = 'pending', '审批中'
    APPROVED = 'approved', '已通过'
    REJECTED = 'rejected', '已驳回'
    CANCELLED = 'cancelled', '已撤销'


class WorkflowInstance(models.Model):
    """审批流程实例"""

    class Meta:
        db_table = 't_workflow_instance'
        verbose_name = '流程实例'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['definition', 'status']),
            models.Index(fields=['business_type', 'business_id']),
            models.Index(fields=['initiator_id']),
        ]

    definition = models.ForeignKey(WorkflowDefinition, on_delete=models.PROTECT,
                                   related_name='instances', verbose_name='流程定义',
                                   null=True, blank=True)
    business_type = models.CharField('业务类型', max_length=50)
    business_id = models.IntegerField('业务ID')
    title = models.CharField('审批标题', max_length=500)
    status = models.CharField('状态', max_length=20, choices=InstanceStatus.choices,
                              default=InstanceStatus.PENDING)
    current_step = models.IntegerField('当前步骤', default=1)
    initiator_id = models.IntegerField('发起人ID', help_text='Account ID')
    form_data = models.JSONField('表单数据', default=dict, blank=True)

    # 飞书
    feishu_approval_instance_id = models.CharField('飞书审批实例ID', max_length=100,
                                                    blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.title} ({self.status})'


class ApprovalRecord(models.Model):
    """审批记录"""

    class Meta:
        db_table = 't_workflow_approval_record'
        verbose_name = '审批记录'
        ordering = ['step', 'create_time']

    instance = models.ForeignKey(WorkflowInstance, on_delete=models.CASCADE,
                                 related_name='approval_records', verbose_name='流程实例')
    step = models.IntegerField('审批步骤')
    approver_id = models.IntegerField('审批人ID', help_text='Account ID')
    action = models.CharField('操作', max_length=20,
                              help_text='approve/reject/forward')
    comment = models.TextField('审批意见', blank=True, default='')
    approved_at = models.DateTimeField('审批时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'Instance#{self.instance_id} Step{self.step}: {self.action}'
