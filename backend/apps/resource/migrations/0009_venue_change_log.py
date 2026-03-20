# 场地信息变更记录

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('resource', '0008_verification_maintenance_plan_fields'),
    ]

    operations = [
        migrations.CreateModel(
            name='VenueChangeLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('venue_code', models.CharField(db_index=True, max_length=50, verbose_name='场地编号')),
                ('changed_by_id', models.IntegerField(blank=True, null=True, verbose_name='变更人ID')),
                ('changed_by_name', models.CharField(blank=True, default='', max_length=100, verbose_name='变更人')),
                ('change_time', models.DateTimeField(auto_now_add=True, verbose_name='变更时间')),
                ('before_data', models.JSONField(default=dict, verbose_name='变更前数据')),
                ('after_data', models.JSONField(default=dict, verbose_name='变更后数据')),
                ('changed_fields', models.JSONField(default=list, verbose_name='变更字段列表')),
                ('venue', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='change_logs', to='resource.resourceitem', verbose_name='场地')),
            ],
            options={
                'verbose_name': '场地变更记录',
                'db_table': 't_venue_change_log',
                'ordering': ['-change_time'],
            },
        ),
        migrations.AddIndex(
            model_name='venuechangelog',
            index=models.Index(fields=['venue'], name='t_venue_ch_venue_i_idx'),
        ),
        migrations.AddIndex(
            model_name='venuechangelog',
            index=models.Index(fields=['change_time'], name='t_venue_ch_change__idx'),
        ),
    ]
