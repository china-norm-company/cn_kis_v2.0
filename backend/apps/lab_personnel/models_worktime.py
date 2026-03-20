"""
实验室人员管理 — 工时模型

包含：
- WorkTimeLog: 工时记录（单条）
- WorkTimeSummary: 工时汇总（周级别，定时聚合）
"""
from django.db import models


# ============================================================================
# 枚举定义
# ============================================================================
class WorkTimeSource(models.TextChoices):
    WORKORDER = 'workorder', '工单执行'
    TRAINING = 'training', '培训'
    MAINTENANCE = 'maintenance', '设备维护'
    ADMIN = 'admin', '行政事务'
    MANUAL = 'manual', '手动录入'


# ============================================================================
# WorkTimeLog — 工时记录
# ============================================================================
class WorkTimeLog(models.Model):
    """工时记录（单条）"""

    class Meta:
        db_table = 't_work_time_log'
        verbose_name = '工时记录'
        ordering = ['-work_date', '-start_time']
        indexes = [
            models.Index(fields=['staff', 'work_date']),
            models.Index(fields=['source']),
        ]

    staff = models.ForeignKey('hr.Staff', on_delete=models.CASCADE,
                               related_name='work_time_logs', verbose_name='人员')
    work_date = models.DateField('工作日期')
    start_time = models.TimeField('开始时间')
    end_time = models.TimeField('结束时间', null=True, blank=True)
    actual_hours = models.DecimalField('实际工时', max_digits=4, decimal_places=1, default=0)

    source = models.CharField('来源', max_length=20,
                               choices=WorkTimeSource.choices, default=WorkTimeSource.MANUAL)
    source_id = models.IntegerField('来源ID', null=True, blank=True,
                                     help_text='关联的工单/培训/维护ID')
    description = models.CharField('说明', max_length=300, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.staff.name} {self.work_date} {self.actual_hours}h'


# ============================================================================
# WorkTimeSummary — 工时汇总（周级别）
# ============================================================================
class WorkTimeSummary(models.Model):
    """工时汇总（周级别，定时聚合）"""

    class Meta:
        db_table = 't_work_time_summary'
        verbose_name = '工时汇总'
        unique_together = [('staff', 'week_start_date')]
        indexes = [
            models.Index(fields=['week_start_date']),
        ]

    staff = models.ForeignKey('hr.Staff', on_delete=models.CASCADE,
                               related_name='work_time_summaries', verbose_name='人员')
    week_start_date = models.DateField('周起始日期')
    total_hours = models.DecimalField('总工时', max_digits=5, decimal_places=1, default=0)
    workorder_hours = models.DecimalField('工单工时', max_digits=5, decimal_places=1, default=0)
    training_hours = models.DecimalField('培训工时', max_digits=5, decimal_places=1, default=0)
    other_hours = models.DecimalField('其他工时', max_digits=5, decimal_places=1, default=0)
    available_hours = models.DecimalField('可用工时', max_digits=5, decimal_places=1, default=40)
    utilization_rate = models.DecimalField('利用率(%)', max_digits=5, decimal_places=1, default=0)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.staff.name} 第{self.week_start_date}周 {self.utilization_rate}%'
