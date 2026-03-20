"""
实验室人员管理 — 排班模型

包含：
- ShiftSchedule: 排班计划（周级别）
- ShiftSlot: 排班时间槽（单人单日单时段）
- ShiftSwapRequest: 换班申请
"""
from django.db import models


# ============================================================================
# 枚举定义
# ============================================================================
class ShiftStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    PUBLISHED = 'published', '已发布'
    CONFIRMED = 'confirmed', '已确认'


class SlotConfirmStatus(models.TextChoices):
    PENDING = 'pending', '待确认'
    CONFIRMED = 'confirmed', '已确认'
    REJECTED = 'rejected', '已拒绝'
    SWAPPED = 'swapped', '已换班'


# ============================================================================
# ShiftSchedule — 排班计划（周级别）
# ============================================================================
class ShiftSchedule(models.Model):
    """排班计划（周级别）"""

    class Meta:
        db_table = 't_shift_schedule'
        verbose_name = '排班计划'
        indexes = [
            models.Index(fields=['week_start_date', 'status']),
        ]

    week_start_date = models.DateField('周起始日期', help_text='该周周一日期')
    week_end_date = models.DateField('周结束日期')
    status = models.CharField('状态', max_length=20,
                               choices=ShiftStatus.choices, default=ShiftStatus.DRAFT)
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    published_at = models.DateTimeField('发布时间', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'排班 {self.week_start_date} ~ {self.week_end_date} ({self.get_status_display()})'


# ============================================================================
# ShiftSlot — 排班时间槽
# ============================================================================
class ShiftSlot(models.Model):
    """排班时间槽（单人单日单时段）"""

    class Meta:
        db_table = 't_shift_slot'
        verbose_name = '排班时间槽'
        ordering = ['shift_date', 'start_time']
        indexes = [
            models.Index(fields=['schedule', 'shift_date']),
            models.Index(fields=['staff', 'shift_date']),
            models.Index(fields=['confirm_status']),
        ]

    schedule = models.ForeignKey(ShiftSchedule, on_delete=models.CASCADE,
                                  related_name='slots', verbose_name='所属排班计划')
    staff = models.ForeignKey('hr.Staff', on_delete=models.CASCADE,
                               related_name='shift_slots', verbose_name='排班人员')

    shift_date = models.DateField('排班日期')
    start_time = models.TimeField('开始时间')
    end_time = models.TimeField('结束时间')
    planned_hours = models.DecimalField('计划工时', max_digits=4, decimal_places=1, default=0)

    project_name = models.CharField('关联项目', max_length=200, blank=True, default='')
    protocol_id = models.IntegerField('关联协议ID', null=True, blank=True)
    tasks_description = models.TextField('任务描述', blank=True, default='')

    confirm_status = models.CharField('确认状态', max_length=20,
                                       choices=SlotConfirmStatus.choices,
                                       default=SlotConfirmStatus.PENDING)
    reject_reason = models.CharField('拒绝原因', max_length=300, blank=True, default='')

    feishu_calendar_event_id = models.CharField('飞书日历事件ID', max_length=100, blank=True, default='')
    feishu_task_id = models.CharField('飞书确认任务ID', max_length=100, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.staff.name} {self.shift_date} {self.start_time}-{self.end_time}'


# ============================================================================
# ShiftSwapRequest — 换班申请
# ============================================================================
class ShiftSwapRequest(models.Model):
    """换班申请"""

    class Meta:
        db_table = 't_shift_swap_request'
        verbose_name = '换班申请'
        ordering = ['-create_time']

    SWAP_STATUS_CHOICES = [
        ('pending', '待审批'),
        ('approved', '已批准'),
        ('rejected', '已拒绝'),
    ]

    original_slot = models.ForeignKey(ShiftSlot, on_delete=models.CASCADE,
                                       related_name='swap_requests_from', verbose_name='原排班')
    requester = models.ForeignKey('hr.Staff', on_delete=models.CASCADE,
                                   related_name='swap_requests_initiated', verbose_name='申请人')
    target_staff = models.ForeignKey('hr.Staff', on_delete=models.CASCADE,
                                      related_name='swap_requests_received', verbose_name='接替人')
    reason = models.TextField('换班原因')
    status = models.CharField('审批状态', max_length=20,
                               choices=SWAP_STATUS_CHOICES, default='pending')
    approved_by_id = models.IntegerField('审批人ID', null=True, blank=True)

    feishu_approval_instance_id = models.CharField('飞书审批实例ID', max_length=100, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.requester.name} → {self.target_staff.name} ({self.get_status_display()})'
