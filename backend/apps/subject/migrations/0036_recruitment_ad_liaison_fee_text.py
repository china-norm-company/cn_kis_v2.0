# 联络费改为文本：支持「合格1人15元」等说明

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0035_recruitment_template_and_appointment_docs'),
    ]

    operations = [
        migrations.AlterField(
            model_name='recruitmentad',
            name='template_liaison_fee',
            field=models.CharField(
                blank=True,
                default='',
                help_text='支持金额或说明文字，如「合格1人15元」',
                max_length=200,
                verbose_name='模板-联络费',
            ),
        ),
    ]
