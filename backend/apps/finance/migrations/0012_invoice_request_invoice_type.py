# Generated manually for 开票申请增加发票类型

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('finance', '0009_rename_t_fin_client_code_idx_t_finance_c_custome_7376a0_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='invoicerequest',
            name='invoice_type',
            field=models.CharField(
                choices=[('vat_special', '增值税专用发票'), ('proforma', '形式发票')],
                default='vat_special',
                max_length=20,
                verbose_name='发票类型',
            ),
        ),
    ]
