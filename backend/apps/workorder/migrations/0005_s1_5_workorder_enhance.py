"""
S1-5：工单模型补强 + 工单资源 + 工单分配记录
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('workorder', '0004_add_feishu_task_id'),
        ('visit', '0005_resourcedemand'),
        ('scheduling', '0001_initial'),
        ('resource', '0001_initial'),
    ]

    operations = [
        # WorkOrder 新增字段
        migrations.AddField(
            model_name='workorder',
            name='visit_activity',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='work_orders', to='visit.visitactivity', verbose_name='关联访视活动',
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='schedule_slot',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='work_orders', to='scheduling.scheduleslot', verbose_name='关联排程时间槽',
            ),
        ),
        migrations.AddField(
            model_name='workorder',
            name='work_order_type',
            field=models.CharField(blank=True, default='visit', max_length=50, verbose_name='工单类型',
                                   help_text='visit/examination/laboratory/other'),
        ),
        migrations.AddField(
            model_name='workorder',
            name='scheduled_date',
            field=models.DateField(blank=True, null=True, verbose_name='排程日期'),
        ),
        migrations.AddField(
            model_name='workorder',
            name='actual_date',
            field=models.DateField(blank=True, null=True, verbose_name='实际执行日期'),
        ),

        # WorkOrderResource
        migrations.CreateModel(
            name='WorkOrderResource',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('required_quantity', models.IntegerField(default=1, verbose_name='需求数量')),
                ('actual_quantity', models.IntegerField(blank=True, null=True, verbose_name='实际数量')),
                ('is_mandatory', models.BooleanField(default=True, verbose_name='是否必须')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('work_order', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='resources', to='workorder.workorder', verbose_name='工单',
                )),
                ('resource_category', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='workorder_usages', to='resource.resourcecategory', verbose_name='资源类别',
                )),
                ('resource_item', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='workorder_usages', to='resource.resourceitem', verbose_name='实际资源实例',
                )),
            ],
            options={
                'db_table': 't_work_order_resource',
                'verbose_name': '工单资源',
            },
        ),
        migrations.AddIndex(
            model_name='workorderresource',
            index=models.Index(fields=['work_order'], name='wor_wo_idx'),
        ),
        migrations.AddIndex(
            model_name='workorderresource',
            index=models.Index(fields=['resource_category'], name='wor_cat_idx'),
        ),

        # WorkOrderAssignment
        migrations.CreateModel(
            name='WorkOrderAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assigned_to_id', models.IntegerField(verbose_name='被分配人ID', help_text='Account ID')),
                ('assigned_by_id', models.IntegerField(blank=True, null=True, verbose_name='分配人ID', help_text='Account ID')),
                ('assigned_at', models.DateTimeField(auto_now_add=True, verbose_name='分配时间')),
                ('reason', models.CharField(blank=True, default='', max_length=200, verbose_name='分配原因',
                                            help_text='auto/manual/reassign')),
                ('work_order', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='assignments', to='workorder.workorder', verbose_name='工单',
                )),
            ],
            options={
                'db_table': 't_work_order_assignment',
                'verbose_name': '工单分配记录',
                'ordering': ['-assigned_at'],
            },
        ),
        migrations.AddIndex(
            model_name='workorderassignment',
            index=models.Index(fields=['work_order'], name='woa_wo_idx'),
        ),
        migrations.AddIndex(
            model_name='workorderassignment',
            index=models.Index(fields=['assigned_to_id'], name='woa_user_idx'),
        ),
    ]
