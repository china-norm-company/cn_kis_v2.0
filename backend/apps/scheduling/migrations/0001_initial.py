"""
scheduling 模块初始迁移

S1-4：创建 SchedulePlan、ScheduleSlot
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('visit', '0005_resourcedemand'),
    ]

    operations = [
        migrations.CreateModel(
            name='SchedulePlan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200, verbose_name='排程名称')),
                ('start_date', models.DateField(verbose_name='开始日期')),
                ('end_date', models.DateField(verbose_name='结束日期')),
                ('status', models.CharField(
                    max_length=20, db_index=True, default='draft', verbose_name='状态',
                    choices=[
                        ('draft', '草稿'), ('generated', '已生成时间槽'),
                        ('published', '已发布'), ('cancelled', '已取消'),
                    ],
                )),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人ID', help_text='Account ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('visit_plan', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='schedule_plans', to='visit.visitplan', verbose_name='关联访视计划',
                )),
                ('resource_demand', models.ForeignKey(
                    blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                    related_name='schedule_plans', to='visit.resourcedemand', verbose_name='关联资源需求',
                )),
            ],
            options={
                'db_table': 't_schedule_plan',
                'verbose_name': '排程计划',
                'ordering': ['-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='scheduleplan',
            index=models.Index(fields=['visit_plan', 'status'], name='sched_plan_vp_status_idx'),
        ),
        migrations.AddIndex(
            model_name='scheduleplan',
            index=models.Index(fields=['status'], name='sched_plan_status_idx'),
        ),
        migrations.CreateModel(
            name='ScheduleSlot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('scheduled_date', models.DateField(verbose_name='排程日期')),
                ('start_time', models.TimeField(blank=True, null=True, verbose_name='开始时间')),
                ('end_time', models.TimeField(blank=True, null=True, verbose_name='结束时间')),
                ('status', models.CharField(
                    max_length=20, db_index=True, default='planned', verbose_name='状态',
                    choices=[
                        ('planned', '已排程'), ('confirmed', '已确认'),
                        ('completed', '已完成'), ('cancelled', '已取消'),
                        ('conflict', '冲突'),
                    ],
                )),
                ('assigned_to_id', models.IntegerField(blank=True, null=True, verbose_name='执行人ID', help_text='Account ID')),
                ('feishu_calendar_event_id', models.CharField(blank=True, default='', max_length=100, verbose_name='飞书日历事件ID')),
                ('conflict_reason', models.CharField(blank=True, default='', max_length=500, verbose_name='冲突原因')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('schedule_plan', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='slots', to='scheduling.scheduleplan', verbose_name='排程计划',
                )),
                ('visit_node', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='schedule_slots', to='visit.visitnode', verbose_name='访视节点',
                )),
            ],
            options={
                'db_table': 't_schedule_slot',
                'verbose_name': '排程时间槽',
                'ordering': ['scheduled_date', 'start_time'],
            },
        ),
        migrations.AddIndex(
            model_name='scheduleslot',
            index=models.Index(fields=['schedule_plan', 'scheduled_date'], name='sched_slot_plan_date_idx'),
        ),
        migrations.AddIndex(
            model_name='scheduleslot',
            index=models.Index(fields=['visit_node'], name='sched_slot_node_idx'),
        ),
        migrations.AddIndex(
            model_name='scheduleslot',
            index=models.Index(fields=['assigned_to_id'], name='sched_slot_assigned_idx'),
        ),
        migrations.AddIndex(
            model_name='scheduleslot',
            index=models.Index(fields=['status'], name='sched_slot_status_idx'),
        ),
    ]
