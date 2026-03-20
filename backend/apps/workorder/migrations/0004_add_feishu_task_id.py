"""
添加飞书任务 ID 字段

工单派发时创建飞书任务，记录任务 GUID 以便后续状态同步。
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workorder', '0003_add_created_by_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='workorder',
            name='feishu_task_id',
            field=models.CharField(
                blank=True, db_index=True, default='',
                help_text='task/v2 任务 GUID，工单派发时创建',
                max_length=100, verbose_name='飞书任务ID',
            ),
        ),
    ]
