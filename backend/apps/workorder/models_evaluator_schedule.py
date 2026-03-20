"""
衡技评估台 - 我的排程扩展模型

支持 Excel 导入的排程备注、图片附件的存储
"""
from django.db import models


class EvaluatorScheduleNote(models.Model):
    """评估员排程备注（Excel 导入或手工添加）"""

    class Meta:
        db_table = 't_evaluator_schedule_note'
        verbose_name = '评估员排程备注'
        ordering = ['schedule_date', 'create_time']
        indexes = [
            models.Index(fields=['account_id', 'schedule_date']),
        ]

    account_id = models.IntegerField('评估员账号ID', db_index=True)
    schedule_date = models.DateField('排程日期', db_index=True)
    title = models.CharField('标题', max_length=500)
    note = models.TextField('备注', blank=True, default='')
    equipment = models.CharField('设备名称', max_length=200, blank=True, default='')
    project_no = models.CharField('项目编号', max_length=100, blank=True, default='')
    room_no = models.CharField('房间号', max_length=100, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)


class EvaluatorScheduleAttachment(models.Model):
    """评估员排程图片附件"""

    class Meta:
        db_table = 't_evaluator_schedule_attachment'
        verbose_name = '评估员排程附件'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['account_id']),
            models.Index(fields=['account_id', 'schedule_date']),
        ]

    account_id = models.IntegerField('评估员账号ID', db_index=True)
    schedule_date = models.DateField('关联日期', null=True, blank=True, db_index=True,
                                     help_text='为空表示全局附件，不关联具体日期')
    file_path = models.CharField('存储路径', max_length=500, help_text='相对 media 的路径')
    file_name = models.CharField('原始文件名', max_length=255)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
