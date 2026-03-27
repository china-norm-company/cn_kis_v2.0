# SubjectProjectSC 增加 enrollment_status 字段（接待看板入组情况）

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0032_add_subject_checkin_missed_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='subjectprojectsc',
            name='enrollment_status',
            field=models.CharField(
                blank=True,
                default='',
                help_text='初筛合格/正式入组/不合格/复筛不合格/退出',
                max_length=32,
                verbose_name='入组情况',
            ),
        ),
    ]
