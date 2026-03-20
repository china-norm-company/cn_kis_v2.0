# 房间使用时段：支持多选星期、工作日、指定日期

from django.db import migrations, models


def migrate_day_of_week_to_days_of_week(apps, schema_editor):
    VenueUsageSchedule = apps.get_model('resource', 'VenueUsageSchedule')
    for s in VenueUsageSchedule.objects.all():
        old = getattr(s, 'day_of_week', 7)
        if old == 7:
            s.days_of_week = [0, 1, 2, 3, 4, 5, 6]
        else:
            s.days_of_week = [old]
        s.schedule_type = 'recurring'
        s.save(update_fields=['days_of_week', 'schedule_type'])


def reverse_migrate(apps, schema_editor):
    VenueUsageSchedule = apps.get_model('resource', 'VenueUsageSchedule')
    for s in VenueUsageSchedule.objects.all():
        days = s.days_of_week or []
        if set(days) == {0, 1, 2, 3, 4, 5, 6}:
            s.day_of_week = 7
        elif days:
            s.day_of_week = days[0]
        else:
            s.day_of_week = 7
        s.save(update_fields=['day_of_week'])


class Migration(migrations.Migration):

    dependencies = [
        ('resource', '0010_venue_usage_schedule_monitor_config'),
    ]

    operations = [
        migrations.AddField(
            model_name='venueusageschedule',
            name='schedule_type',
            field=models.CharField(
                choices=[('recurring', '按周重复'), ('specific', '指定日期')],
                default='recurring',
                max_length=20,
                verbose_name='类型',
            ),
        ),
        migrations.AddField(
            model_name='venueusageschedule',
            name='days_of_week',
            field=models.JSONField(
                default=list,
                help_text='[0,1,2,3,4] 周一到周五, [0,1,2,3,4,5,6] 每天',
                verbose_name='星期（多选）',
            ),
        ),
        migrations.AddField(
            model_name='venueusageschedule',
            name='specific_date',
            field=models.DateField(blank=True, null=True, verbose_name='指定日期'),
        ),
        migrations.RunPython(migrate_day_of_week_to_days_of_week, reverse_migrate),
        migrations.RemoveIndex(
            model_name='venueusageschedule',
            name='t_venue_us_venue_i_idx2',
        ),
        migrations.RemoveField(
            model_name='venueusageschedule',
            name='day_of_week',
        ),
        migrations.AlterModelOptions(
            name='venueusageschedule',
            options={
                'ordering': ['venue', 'schedule_type', 'specific_date', 'start_time'],
                'verbose_name': '房间使用时段',
                'db_table': 't_venue_usage_schedule',
            },
        ),
        migrations.AddIndex(
            model_name='venueusageschedule',
            index=models.Index(fields=['venue', 'schedule_type'], name='t_venue_us_venue_i_idx2'),
        ),
        migrations.AddIndex(
            model_name='venueusageschedule',
            index=models.Index(fields=['specific_date'], name='t_venue_us_specific_idx'),
        ),
    ]
