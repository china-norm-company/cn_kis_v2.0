# 接待台 v1 对齐：看板表、过号字段、SubjectProjectSC 入组情况

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0029_merge_20260320_1824'),
    ]

    operations = [
        migrations.CreateModel(
            name='ReceptionBoardCheckin',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('checkin_date', models.DateField(verbose_name='签到日期')),
                ('checkin_time', models.DateTimeField(blank=True, null=True, verbose_name='接待看板签到时间')),
                ('checkout_time', models.DateTimeField(blank=True, null=True, verbose_name='接待看板签出时间')),
                ('appointment_id', models.IntegerField(blank=True, db_index=True, null=True, verbose_name='关联预约ID')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reception_board_checkins', to='subject.subject')),
            ],
            options={
                'verbose_name': '接待看板签到记录',
                'db_table': 't_reception_board_checkin',
            },
        ),
        migrations.AddIndex(
            model_name='receptionboardcheckin',
            index=models.Index(fields=['subject_id', 'checkin_date'], name='t_reception_br_chk_subj_date_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='receptionboardcheckin',
            unique_together={('subject', 'checkin_date')},
        ),
        migrations.CreateModel(
            name='ReceptionBoardProjectSc',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('project_code', models.CharField(db_index=True, max_length=64, verbose_name='项目编号')),
                ('sc_number', models.CharField(blank=True, default='', max_length=20, verbose_name='SC号')),
                ('enrollment_status', models.CharField(blank=True, default='', max_length=32, verbose_name='入组情况')),
                ('rd_number', models.CharField(blank=True, default='', max_length=20, verbose_name='RD号')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='reception_board_project_sc', to='subject.subject')),
            ],
            options={
                'verbose_name': '接待看板项目SC',
                'db_table': 't_reception_board_project_sc',
                'unique_together': {('subject', 'project_code')},
            },
        ),
        migrations.AddIndex(
            model_name='receptionboardprojectsc',
            index=models.Index(fields=['subject_id', 'project_code'], name='t_reception_br_sc_subj_pc_idx'),
        ),
        migrations.AddField(
            model_name='subjectcheckin',
            name='missed_call_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='过号时间'),
        ),
        migrations.AddField(
            model_name='subjectcheckin',
            name='missed_after_sc_rank',
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text='过号时该项目内即将被叫的 SC 序号，用于叫号序=该值+3',
                null=True,
                verbose_name='过号时队首SC序号',
            ),
        ),
        migrations.AddField(
            model_name='subjectprojectsc',
            name='enrollment_status',
            field=models.CharField(
                blank=True,
                default='',
                help_text='初筛合格/正式入组/不合格/复筛不合格/退出/缺席',
                max_length=20,
                verbose_name='入组情况',
            ),
        ),
    ]
