# Generated manually for 开票申请金额类型与税率（含税/不含税）

from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0013_merge_20260315_1715'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoicerequest',
            name='amount_type',
            field=models.CharField(
                choices=[('exclusive_of_tax', '不含税（需按税率折算含税）'), ('inclusive_of_tax', '含税')],
                default='inclusive_of_tax',
                help_text='客户确认的金额为不含税时选不含税，系统按税率折算含税；票面与展示均为含税金额',
                max_length=20,
                verbose_name='金额类型',
            ),
        ),
        migrations.AddField(
            model_name='invoicerequest',
            name='tax_rate',
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal('0.13'),
                help_text='如 0.13 表示 13%，用于不含税→含税折算',
                max_digits=5,
                verbose_name='税率',
            ),
        ),
        migrations.AlterField(
            model_name='invoicerequest',
            name='total_amount',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('0'),
                help_text='票面/展示用含税总金额',
                max_digits=15,
                verbose_name='总金额（含税）',
            ),
        ),
    ]
