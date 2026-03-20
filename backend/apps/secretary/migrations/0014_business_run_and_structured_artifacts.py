# Generated for P1 runtime: business_run_id, business object refs, structured_artifacts

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0013_add_worker_role_definition_and_skill_baseline'),
    ]

    operations = [
        migrations.AddField(
            model_name='unifiedexecutiontask',
            name='business_run_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='unifiedexecutiontask',
            name='role_code',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='unifiedexecutiontask',
            name='domain_code',
            field=models.CharField(blank=True, db_index=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='unifiedexecutiontask',
            name='workstation_key',
            field=models.CharField(blank=True, db_index=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='unifiedexecutiontask',
            name='business_object_type',
            field=models.CharField(blank=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='unifiedexecutiontask',
            name='business_object_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='unifiedexecutiontask',
            name='gate_run_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='orchestrationrun',
            name='business_run_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=80),
        ),
        migrations.AddField(
            model_name='orchestrationrun',
            name='structured_artifacts',
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
