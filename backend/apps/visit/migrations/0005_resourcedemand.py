"""
S1-3：新建资源需求计划模型
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('visit', '0004_visitnode_code_visitactivity_template'),
    ]

    operations = [
        migrations.CreateModel(
            name='ResourceDemand',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(
                    max_length=20, db_index=True, default='draft', verbose_name='状态',
                    choices=[
                        ('draft', '草稿'), ('submitted', '已提交'),
                        ('approved', '已审批'), ('rejected', '已拒绝'),
                    ],
                )),
                ('demand_details', models.JSONField(blank=True, default=list, verbose_name='需求明细',
                                                    help_text='按资源类型分组的汇总需求')),
                ('summary', models.CharField(blank=True, default='', max_length=500, verbose_name='需求摘要')),
                ('feishu_approval_instance_id', models.CharField(
                    blank=True, db_index=True, default='', max_length=100, verbose_name='飞书审批实例ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('visit_plan', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='resource_demands', to='visit.visitplan', verbose_name='关联访视计划',
                )),
            ],
            options={
                'db_table': 't_resource_demand',
                'verbose_name': '资源需求计划',
                'ordering': ['-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='resourcedemand',
            index=models.Index(fields=['visit_plan', 'status'], name='visit_rd_plan_status_idx'),
        ),
        migrations.AddIndex(
            model_name='resourcedemand',
            index=models.Index(fields=['status'], name='visit_rd_status_idx'),
        ),
    ]
