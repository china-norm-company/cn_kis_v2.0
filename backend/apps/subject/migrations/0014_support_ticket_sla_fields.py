from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0013_subjectloyaltyscore_subject_ref_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='subjectsupportticket',
            name='assigned_to_id',
            field=models.IntegerField(blank=True, db_index=True, null=True, verbose_name='处理人ID'),
        ),
        migrations.AddField(
            model_name='subjectsupportticket',
            name='priority',
            field=models.CharField(db_index=True, default='normal', max_length=20, verbose_name='优先级'),
        ),
        migrations.AddField(
            model_name='subjectsupportticket',
            name='sla_due_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='SLA截止时间'),
        ),
        migrations.AddField(
            model_name='subjectsupportticket',
            name='first_response_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='首次响应时间'),
        ),
        migrations.AddField(
            model_name='subjectsupportticket',
            name='closed_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='关闭时间'),
        ),
    ]
