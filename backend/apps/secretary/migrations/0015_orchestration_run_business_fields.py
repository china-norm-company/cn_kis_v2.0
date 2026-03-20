# 二轮收口：OrchestrationRun 写入业务对象与岗位字段

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0014_business_run_and_structured_artifacts'),
    ]

    operations = [
        migrations.AddField(
            model_name='orchestrationrun',
            name='role_code',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='orchestrationrun',
            name='domain_code',
            field=models.CharField(blank=True, db_index=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='orchestrationrun',
            name='workstation_key',
            field=models.CharField(blank=True, db_index=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='orchestrationrun',
            name='business_object_type',
            field=models.CharField(blank=True, db_index=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='orchestrationrun',
            name='business_object_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=120),
        ),
    ]
