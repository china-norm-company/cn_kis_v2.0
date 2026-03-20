# Generated for evaluator schedule note: room_no (房间号)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workorder', '0017_schedule_note_equipment_project'),
    ]

    operations = [
        migrations.AddField(
            model_name='evaluatorschedulenote',
            name='room_no',
            field=models.CharField(blank=True, default='', max_length=100, verbose_name='房间号'),
        ),
    ]
