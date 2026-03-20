# Generated manually for evaluator schedule import feature

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workorder', '0015_evaluator_compliance_f1_f2_f3'),
    ]

    operations = [
        migrations.CreateModel(
            name='EvaluatorScheduleNote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('account_id', models.IntegerField(db_index=True, verbose_name='评估员账号ID')),
                ('schedule_date', models.DateField(db_index=True, verbose_name='排程日期')),
                ('title', models.CharField(max_length=500, verbose_name='标题')),
                ('note', models.TextField(blank=True, default='', verbose_name='备注')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '评估员排程备注',
                'db_table': 't_evaluator_schedule_note',
                'ordering': ['schedule_date', 'create_time'],
            },
        ),
        migrations.CreateModel(
            name='EvaluatorScheduleAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('account_id', models.IntegerField(db_index=True, verbose_name='评估员账号ID')),
                ('schedule_date', models.DateField(blank=True, db_index=True, help_text='为空表示全局附件，不关联具体日期', null=True, verbose_name='关联日期')),
                ('file_path', models.CharField(help_text='相对 media 的路径', max_length=500, verbose_name='存储路径')),
                ('file_name', models.CharField(max_length=255, verbose_name='原始文件名')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
            ],
            options={
                'verbose_name': '评估员排程附件',
                'db_table': 't_evaluator_schedule_attachment',
                'ordering': ['-create_time'],
            },
        ),
        migrations.AddIndex(
            model_name='evaluatorschedulenote',
            index=models.Index(fields=['account_id', 'schedule_date'], name='eval_sched_note_acc_date_idx'),
        ),
        migrations.AddIndex(
            model_name='evaluatorscheduleattachment',
            index=models.Index(fields=['account_id'], name='eval_sched_attach_acc_idx'),
        ),
        migrations.AddIndex(
            model_name='evaluatorscheduleattachment',
            index=models.Index(fields=['account_id', 'schedule_date'], name='eval_sched_attach_acc_date_idx'),
        ),
    ]
