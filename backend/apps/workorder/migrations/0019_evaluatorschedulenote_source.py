# Generated migration: EvaluatorScheduleNote.source

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workorder', '0018_schedule_note_room_no'),
    ]

    operations = [
        migrations.AddField(
            model_name='evaluatorschedulenote',
            name='source',
            field=models.CharField(
                choices=[('manual', '手工/衡技'), ('excel_import', '维周Excel导入'), ('image_ocr', '图片识别')],
                db_index=True,
                default='manual',
                help_text='manual=手工/衡技, excel_import=维周Excel导入, image_ocr=图片识别',
                max_length=20,
                verbose_name='来源',
            ),
        ),
    ]
