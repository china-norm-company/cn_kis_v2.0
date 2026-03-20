# 税率默认值改为 6%（0.06）

from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0014_invoice_request_amount_type_tax_rate'),
    ]

    operations = [
        migrations.AlterField(
            model_name='invoicerequest',
            name='tax_rate',
            field=models.DecimalField(
                decimal_places=4,
                default=Decimal('0.06'),
                help_text='如 0.06 表示 6%，用于不含税→含税折算',
                max_digits=5,
                verbose_name='税率',
            ),
        ),
    ]
