# 受试者-项目 SC/RD 号表：同一受试者在同一项目下唯一一条，签到后分配 SC 号

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0024_appointment_name_pinyin_initials'),
    ]

    operations = [
        migrations.CreateModel(
            name='SubjectProjectSC',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('project_code', models.CharField(db_index=True, max_length=100, verbose_name='项目编号')),
                ('sc_number', models.CharField(blank=True, default='', help_text='如 001、002，签到后按项目内顺序分配', max_length=20, verbose_name='SC号')),
                ('rd_number', models.CharField(blank=True, default='', help_text='逻辑待定，暂空', max_length=20, verbose_name='RD号')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('created_by_id', models.IntegerField(blank=True, null=True, verbose_name='创建人ID')),
                ('updated_by_id', models.IntegerField(blank=True, null=True, verbose_name='更新人ID')),
                ('is_deleted', models.BooleanField(default=False, verbose_name='是否删除')),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_sc_records', to='subject.subject', verbose_name='受试者')),
            ],
            options={
                'verbose_name': '受试者项目SC号',
                'db_table': 't_subject_project_sc',
            },
        ),
        migrations.AddIndex(
            model_name='subjectprojectsc',
            index=models.Index(fields=['project_code', 'sc_number'], name='t_subject_p_project__a1b2c3_idx'),
        ),
        migrations.AddConstraint(
            model_name='subjectprojectsc',
            constraint=models.UniqueConstraint(fields=('subject', 'project_code'), name='t_subject_project_sc_subject_project_uniq'),
        ),
    ]
