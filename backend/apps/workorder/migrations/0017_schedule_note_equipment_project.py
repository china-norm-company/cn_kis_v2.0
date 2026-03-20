# Generated for evaluator schedule note: equipment, project_no (image recognition)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workorder', '0016_evaluator_schedule_import'),
    ]

    operations = [
        migrations.AddField(
            model_name='evaluatorschedulenote',
            name='equipment',
            field=models.CharField(blank=True, default='', max_length=200, verbose_name='设备名称'),
        ),
        migrations.AddField(
            model_name='evaluatorschedulenote',
            name='project_no',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='项目编号'),
        ),
    ]
