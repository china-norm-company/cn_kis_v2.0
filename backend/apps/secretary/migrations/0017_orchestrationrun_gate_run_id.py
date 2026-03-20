from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0016_role_kpi_snapshot'),
    ]

    operations = [
        migrations.AddField(
            model_name='orchestrationrun',
            name='gate_run_id',
            field=models.CharField(blank=True, db_index=True, default='', max_length=80, verbose_name='关联门禁运行 ID'),
        ),
    ]
