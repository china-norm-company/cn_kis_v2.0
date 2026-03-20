"""
排程管理模型

来源：cn_kis_test scheduling/models.py
S1-4：排程计划、时间槽

核心链路：
VisitPlan + ResourceDemand(approved) → SchedulePlan → ScheduleSlot
发布后：每个 Slot → 飞书日历事件 + 工单生成
"""
from django.db import models


class SchedulePlanStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    GENERATED = 'generated', '已生成时间槽'
    PUBLISHED = 'published', '已发布'
    CANCELLED = 'cancelled', '已取消'


class SchedulePlan(models.Model):
    """
    排程计划

    关联已审批的访视计划和资源需求，生成具体的时间槽。
    """

    class Meta:
        db_table = 't_schedule_plan'
        verbose_name = '排程计划'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['visit_plan', 'status']),
            models.Index(fields=['status']),
        ]

    visit_plan = models.ForeignKey('visit.VisitPlan', on_delete=models.CASCADE,
                                   related_name='schedule_plans', verbose_name='关联访视计划')
    resource_demand = models.ForeignKey('visit.ResourceDemand', on_delete=models.SET_NULL,
                                        null=True, blank=True, related_name='schedule_plans',
                                        verbose_name='关联资源需求')

    name = models.CharField('排程名称', max_length=200)
    start_date = models.DateField('开始日期')
    end_date = models.DateField('结束日期')
    status = models.CharField('状态', max_length=20, choices=SchedulePlanStatus.choices,
                              default=SchedulePlanStatus.DRAFT, db_index=True)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, help_text='Account ID')
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.name} ({self.start_date} ~ {self.end_date})'


class SlotStatus(models.TextChoices):
    PLANNED = 'planned', '已排程'
    CONFIRMED = 'confirmed', '已确认'
    COMPLETED = 'completed', '已完成'
    CANCELLED = 'cancelled', '已取消'
    CONFLICT = 'conflict', '冲突'


class ScheduleSlot(models.Model):
    """
    排程时间槽

    每个 Slot 对应一个 VisitNode 在特定日期的执行安排。
    发布后创建飞书日历事件 + 生成工单（S1-5）。
    """

    class Meta:
        db_table = 't_schedule_slot'
        verbose_name = '排程时间槽'
        ordering = ['scheduled_date', 'start_time']
        indexes = [
            models.Index(fields=['schedule_plan', 'scheduled_date']),
            models.Index(fields=['visit_node']),
            models.Index(fields=['assigned_to_id']),
            models.Index(fields=['status']),
        ]

    schedule_plan = models.ForeignKey(SchedulePlan, on_delete=models.CASCADE,
                                      related_name='slots', verbose_name='排程计划')
    visit_node = models.ForeignKey('visit.VisitNode', on_delete=models.CASCADE,
                                   related_name='schedule_slots', verbose_name='访视节点')

    scheduled_date = models.DateField('排程日期')
    start_time = models.TimeField('开始时间', null=True, blank=True)
    end_time = models.TimeField('结束时间', null=True, blank=True)
    status = models.CharField('状态', max_length=20, choices=SlotStatus.choices,
                              default=SlotStatus.PLANNED, db_index=True)

    # 分配的执行人
    assigned_to_id = models.IntegerField('执行人ID', null=True, blank=True,
                                         help_text='Account ID')

    # 飞书日历
    feishu_calendar_event_id = models.CharField('飞书日历事件ID', max_length=100,
                                                blank=True, default='')

    # 冲突检测
    conflict_reason = models.CharField('冲突原因', max_length=500, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.visit_node.name} @ {self.scheduled_date}'


# ============================================================================
# S4-2：排程扩展 — 里程碑
# ============================================================================
class MilestoneType(models.TextChoices):
    FIRST_SUBJECT_IN = 'fsi', '首例入组'
    LAST_SUBJECT_IN = 'lsi', '末例入组'
    LAST_SUBJECT_OUT = 'lso', '末例出组'
    DATABASE_LOCK = 'dbl', '数据库锁定'
    REPORT_SUBMISSION = 'report', '报告提交'
    CUSTOM = 'custom', '自定义'


class ScheduleMilestone(models.Model):
    """排程里程碑"""

    class Meta:
        db_table = 't_schedule_milestone'
        verbose_name = '排程里程碑'
        ordering = ['target_date']
        indexes = [
            models.Index(fields=['schedule_plan', 'milestone_type']),
        ]

    schedule_plan = models.ForeignKey(SchedulePlan, on_delete=models.CASCADE,
                                      related_name='milestones', verbose_name='排程计划')
    milestone_type = models.CharField('里程碑类型', max_length=20,
                                      choices=MilestoneType.choices)
    name = models.CharField('里程碑名称', max_length=200)
    target_date = models.DateField('目标日期')
    actual_date = models.DateField('实际日期', null=True, blank=True)
    is_achieved = models.BooleanField('已达成', default=False)
    notes = models.TextField('备注', blank=True, default='')

    # 飞书日历
    feishu_calendar_event_id = models.CharField('飞书日历事件ID', max_length=100,
                                                blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.name} ({self.target_date})'
