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


# ============================================================================
# 时间线上传 / 发布、执行订单、排程核心、实验室排期（执行台「创建排程」等，与 v1 对齐）
# ============================================================================
class TimelineUpload(models.Model):
    """存储上传的时间线表格解析结果（JSON），用于列表/甘特图持久化展示。"""

    class Meta:
        db_table = 't_timeline_upload'
        verbose_name = '时间线上传'
        ordering = ['-create_time']

    data = models.JSONField('时间线行数据', default=list, help_text='TimelineRow[] 序列化')
    created_by_id = models.IntegerField('上传人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'时间线上传 #{self.id} ({len(self.data or [])} 行)'


class TimelinePublishedPlan(models.Model):
    """从时间线详情页「发布」后生成的记录，在排程计划列表中与 SchedulePlan 一并展示。"""

    class Meta:
        db_table = 't_timeline_published_plan'
        verbose_name = '时间线发布记录'
        ordering = ['-create_time']

    timeline_schedule = models.OneToOneField(
        'TimelineSchedule',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='published_plan',
        verbose_name='排程核心',
    )
    source_type = models.CharField(
        '数据来源',
        max_length=16,
        choices=[('online', '线上'), ('offline', '线下')],
        default='online',
        db_index=True,
    )
    snapshot = models.JSONField('时间线行快照', default=dict)
    created_by_id = models.IntegerField('发布人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        s = self.snapshot or {}
        return f"时间线发布 #{self.id} ({s.get('项目编号') or s.get('询期编号') or '—'})"


class ExecutionOrderUpload(models.Model):
    """测试执行订单文件解析结果；资源需求 Tab 与待排程任务。"""

    class Meta:
        db_table = 't_execution_order_upload'
        verbose_name = '执行订单上传'
        ordering = ['-create_time']

    data = models.JSONField('解析行数据', default=list, help_text='表头+行列表或行对象列表')
    created_by_id = models.IntegerField('上传人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        rows = self.data if isinstance(self.data, list) else []
        return f'执行订单上传 #{self.id} ({len(rows)} 行)'


class TimelineScheduleStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    TIMELINE_PUBLISHED = 'timeline_published', '时间线已发布'
    COMPLETED = 'completed', '排程完成'


class TimelineSchedule(models.Model):
    """排程核心：一条执行订单对应一条；行政/评估/技术排程在 payload 中。"""

    class Meta:
        db_table = 't_timeline_schedule'
        verbose_name = '排程核心'
        ordering = ['-create_time']
        constraints = [
            models.UniqueConstraint(
                fields=['execution_order_upload'],
                name='unique_timeline_schedule_per_order_v2',
            ),
        ]

    execution_order_upload = models.OneToOneField(
        ExecutionOrderUpload,
        on_delete=models.CASCADE,
        related_name='timeline_schedule',
        verbose_name='执行订单',
    )
    supervisor = models.CharField('督导', max_length=100, blank=True, default='')
    research_group = models.CharField('研究组', max_length=100, blank=True, default='')
    t0_date = models.DateField('T0 基准日期', null=True, blank=True)
    split_days = models.PositiveSmallIntegerField('拆分天数', default=1)

    status = models.CharField(
        '状态',
        max_length=32,
        choices=TimelineScheduleStatus.choices,
        default=TimelineScheduleStatus.DRAFT,
        db_index=True,
    )
    admin_published = models.BooleanField('行政排程已发布', default=False)
    eval_published = models.BooleanField('评估排程已发布', default=False)
    tech_published = models.BooleanField('技术排程已发布', default=False)

    payload = models.JSONField('排程数据', default=dict, blank=True)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'排程核心 #{self.id} (订单#{self.execution_order_upload_id} {self.get_status_display()})'


class LabScheduleUpload(models.Model):
    """实验室项目运营安排上传结果。"""

    class Meta:
        db_table = 't_lab_schedule_upload'
        verbose_name = '实验室排期上传'
        ordering = ['-create_time']

    source_file_name = models.CharField('来源文件名', max_length=255, blank=True, default='')
    data = models.JSONField('解析行数据', default=list, help_text='已弃用，数据存 LabScheduleRow 表')
    created_by_id = models.IntegerField('上传人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'实验室排期 #{self.id}'


class LabScheduleRow(models.Model):
    """实验室排期明细行。"""

    class Meta:
        db_table = 't_lab_schedule_row'
        verbose_name = '实验室排期行'
        ordering = ['upload', 'id']
        indexes = [
            models.Index(fields=['upload']),
            models.Index(fields=['person_role']),
            models.Index(fields=['equipment']),
            models.Index(fields=['date']),
        ]

    upload = models.ForeignKey(
        LabScheduleUpload,
        on_delete=models.CASCADE,
        related_name='rows',
        verbose_name='所属上传',
    )
    group = models.CharField('组别', max_length=100, blank=True, default='')
    equipment_code = models.CharField('设备编号', max_length=100, blank=True, default='')
    equipment = models.CharField('设备', max_length=200, blank=True, default='')
    date = models.CharField('日期', max_length=20, blank=True, default='')
    protocol_code = models.CharField('项目编号', max_length=100, blank=True, default='')
    sample_size = models.CharField('样本量', max_length=50, blank=True, default='')
    person_role = models.CharField('人员/岗位', max_length=200, blank=True, default='')
    room = models.CharField('房间', max_length=100, blank=True, default='')
    day_group = models.CharField('组别', max_length=100, blank=True, default='')

    def __str__(self):
        return f'{self.protocol_code} @ {self.date}'
