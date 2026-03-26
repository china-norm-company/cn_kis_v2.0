# SubjectCheckin：按项目区分同日签到，修复多项目队列行共用一条记录的问题

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0030_reception_v1_alignment'),
    ]

    operations = [
        migrations.AddField(
            model_name='subjectcheckin',
            name='project_code',
            field=models.CharField(
                blank=True,
                db_index=True,
                default='',
                max_length=128,
                verbose_name='项目编号',
            ),
        ),
        migrations.AddIndex(
            model_name='subjectcheckin',
            index=models.Index(
                fields=['subject', 'checkin_date', 'project_code'],
                name='t_subject_chk_subj_dt_pc_idx',
            ),
        ),
    ]
