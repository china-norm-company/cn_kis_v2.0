# Generated for data scope: Enrollment created_by_id

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0002_add_created_by_id'),
    ]

    operations = [
        migrations.AddField(
            model_name='enrollment',
            name='created_by_id',
            field=models.IntegerField(blank=True, db_index=True, help_text='Account ID', null=True, verbose_name='创建人ID'),
        ),
    ]
