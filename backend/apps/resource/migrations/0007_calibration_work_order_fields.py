# 校准工单支持：新增 calibration_due_date 字段，用于关联校准到期日

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('resource', '0006_environmentincident_cleaningrecord'),
    ]

    operations = [
        migrations.AddField(
            model_name='equipmentmaintenance',
            name='calibration_due_date',
            field=models.DateField(blank=True, null=True, verbose_name='校准到期日（校准工单时填写）'),
        ),
    ]
