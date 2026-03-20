"""
S1-1/S1-2 准备：
- VisitNode 新增 code 字段（访视编号 V1/V2）
- VisitActivity 新增 activity_template 外键（关联活动模板）
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('visit', '0003_add_created_by_id'),
        ('resource', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='visitnode',
            name='code',
            field=models.CharField(
                blank=True, default='', help_text='如 V1、V2、V3，S1-2 访视计划自动生成时填充',
                max_length=20, verbose_name='访视编号',
            ),
        ),
        migrations.AddField(
            model_name='visitactivity',
            name='activity_template',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='visit_activities',
                to='resource.activitytemplate',
                verbose_name='关联活动模板',
            ),
        ),
    ]
