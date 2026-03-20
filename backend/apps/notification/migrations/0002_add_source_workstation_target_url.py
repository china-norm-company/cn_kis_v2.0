# Generated migration for NotificationRecord source_workstation and target_url

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notification', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='notificationrecord',
            name='source_workstation',
            field=models.CharField(blank=True, default='', max_length=50, verbose_name='来源工作台'),
        ),
        migrations.AddField(
            model_name='notificationrecord',
            name='target_url',
            field=models.CharField(blank=True, default='', max_length=500, verbose_name='目标跳转URL'),
        ),
    ]
