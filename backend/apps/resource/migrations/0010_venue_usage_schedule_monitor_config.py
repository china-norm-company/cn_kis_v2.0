# 坤元环境监控：房间使用时段、监控人配置

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('resource', '0009_venue_change_log'),
    ]

    operations = [
        migrations.CreateModel(
            name='VenueUsageSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_enabled', models.BooleanField(default=True, verbose_name='是否启用')),
                ('day_of_week', models.SmallIntegerField(default=7, help_text='0=周一, 6=周日, 7=每天', verbose_name='星期')),
                ('start_time', models.TimeField(verbose_name='开始时间')),
                ('end_time', models.TimeField(verbose_name='结束时间')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('venue', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='usage_schedules', to='resource.resourceitem', verbose_name='场地')),
            ],
            options={
                'verbose_name': '房间使用时段',
                'db_table': 't_venue_usage_schedule',
                'ordering': ['venue', 'day_of_week', 'start_time'],
            },
        ),
        migrations.CreateModel(
            name='VenueMonitorConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('monitor_account_id', models.IntegerField(db_index=True, verbose_name='监控人账号ID')),
                ('is_primary', models.BooleanField(default=False, verbose_name='主监控人')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('venue', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='monitor_configs', to='resource.resourceitem', verbose_name='场地')),
            ],
            options={
                'verbose_name': '场地监控人',
                'db_table': 't_venue_monitor_config',
                'ordering': ['venue', '-is_primary', 'id'],
            },
        ),
        migrations.AddIndex(
            model_name='venueusageschedule',
            index=models.Index(fields=['venue'], name='t_venue_us_venue_i_idx'),
        ),
        migrations.AddIndex(
            model_name='venueusageschedule',
            index=models.Index(fields=['venue', 'day_of_week'], name='t_venue_us_venue_i_idx2'),
        ),
        migrations.AddIndex(
            model_name='venuemonitorconfig',
            index=models.Index(fields=['venue'], name='t_venue_mo_venue_i_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='venuemonitorconfig',
            unique_together={('venue', 'monitor_account_id')},
        ),
    ]
