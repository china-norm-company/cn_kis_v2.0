from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0015_orchestration_run_business_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='RoleKPISnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role_code', models.CharField(db_index=True, max_length=80, verbose_name='岗位编码')),
                ('snapshot_date', models.DateField(db_index=True, verbose_name='快照日期')),
                ('period_days', models.IntegerField(default=7, verbose_name='统计周期（天）')),
                ('kpis', models.JSONField(default=dict, help_text='{"metric_key": value, ...}', verbose_name='指标集合')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'verbose_name': '岗位 KPI 快照',
                'verbose_name_plural': '岗位 KPI 快照',
                'db_table': 't_role_kpi_snapshot',
                'ordering': ['-snapshot_date', 'role_code'],
                'unique_together': {('role_code', 'snapshot_date', 'period_days')},
            },
        ),
    ]
