"""
访视管理模型

包含：访视计划、访视节点、访视活动
"""
from django.db import models


class VisitPlanStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    ACTIVE = 'active', '进行中'
    COMPLETED = 'completed', '已完成'
    CANCELLED = 'cancelled', '已取消'


class VisitPlan(models.Model):
    """访视计划"""

    class Meta:
        db_table = 't_visit_plan'
        verbose_name = '访视计划'
        indexes = [
            models.Index(fields=['protocol', 'status']),
            models.Index(fields=['status', 'create_time']),
        ]

    protocol = models.ForeignKey('protocol.Protocol', on_delete=models.CASCADE, related_name='visit_plans')
    name = models.CharField('计划名称', max_length=200)
    description = models.TextField('描述', blank=True, default='')
    status = models.CharField('状态', max_length=20, choices=VisitPlanStatus.choices, default=VisitPlanStatus.DRAFT, db_index=True)

    # 权限相关
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    # 软删除
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.protocol.title} - {self.name}'


class VisitNode(models.Model):
    """访视节点"""

    class Meta:
        db_table = 't_visit_node'
        verbose_name = '访视节点'
        indexes = [
            models.Index(fields=['plan', 'baseline_day']),
            models.Index(fields=['plan', 'status']),
        ]

    plan = models.ForeignKey(VisitPlan, on_delete=models.CASCADE, related_name='nodes')
    name = models.CharField('节点名称', max_length=200)
    code = models.CharField('访视编号', max_length=20, blank=True, default='',
                            help_text='如 V1、V2、V3，S1-2 访视计划自动生成时填充')
    baseline_day = models.IntegerField('基线天数', default=0, help_text='相对于基线的时间（天）')
    window_before = models.IntegerField('窗口期前（天）', default=0)
    window_after = models.IntegerField('窗口期后（天）', default=0)
    status = models.CharField('状态', max_length=20, choices=VisitPlanStatus.choices, default=VisitPlanStatus.DRAFT, db_index=True)
    order = models.IntegerField('排序', default=0)

    # 飞书日历（对应 FEISHU_NATIVE_SETUP.md 5.1 访视排程日历）
    feishu_event_id = models.CharField('飞书日历事件ID', max_length=100, blank=True, default='')

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.plan.name} - {self.name} (Day {self.baseline_day})'


# ============================================================================
# 资源需求计划（S1-3）
# ============================================================================
class ResourceDemandStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SUBMITTED = 'submitted', '已提交'
    APPROVED = 'approved', '已审批'
    REJECTED = 'rejected', '已拒绝'


class ResourceDemand(models.Model):
    """
    资源需求计划

    由 VisitPlan 的 BOM 汇总自动生成，提交后发起飞书审批。
    来源：cn_kis_test visit/services/resource_demand_generation_service.py
    """

    class Meta:
        db_table = 't_resource_demand'
        verbose_name = '资源需求计划'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['visit_plan', 'status']),
            models.Index(fields=['status']),
        ]

    visit_plan = models.ForeignKey(VisitPlan, on_delete=models.CASCADE,
                                   related_name='resource_demands',
                                   verbose_name='关联访视计划')
    status = models.CharField('状态', max_length=20,
                              choices=ResourceDemandStatus.choices,
                              default=ResourceDemandStatus.DRAFT, db_index=True)
    demand_details = models.JSONField('需求明细', default=list, blank=True,
                                      help_text='按资源类型分组的汇总需求')
    summary = models.CharField('需求摘要', max_length=500, blank=True, default='')

    # 飞书审批
    feishu_approval_instance_id = models.CharField(
        '飞书审批实例ID', max_length=100, blank=True, default='', db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'资源需求 #{self.id} - {self.visit_plan.name} ({self.status})'


class ActivityType(models.TextChoices):
    EXAMINATION = 'examination', '检查'
    LABORATORY = 'laboratory', '实验室检查'
    QUESTIONNAIRE = 'questionnaire', '问卷'
    MEDICATION = 'medication', '用药'
    ADVERSE_EVENT = 'adverse_event', '不良事件'
    OTHER = 'other', '其他'


class VisitActivity(models.Model):
    """访视活动"""

    class Meta:
        db_table = 't_visit_activity'
        verbose_name = '访视活动'
        indexes = [
            models.Index(fields=['node', 'activity_type']),
        ]

    node = models.ForeignKey(VisitNode, on_delete=models.CASCADE, related_name='activities')
    name = models.CharField('活动名称', max_length=200)
    activity_type = models.CharField('活动类型', max_length=50, choices=ActivityType.choices, default=ActivityType.OTHER)
    description = models.TextField('描述', blank=True, default='')
    is_required = models.BooleanField('是否必填', default=True)
    order = models.IntegerField('排序', default=0)

    # S1-1：关联活动模板，访视活动与标准化活动模板挂钩
    activity_template = models.ForeignKey(
        'resource.ActivityTemplate', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='visit_activities',
        verbose_name='关联活动模板',
    )

    # 时间
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.node.name} - {self.name}'
