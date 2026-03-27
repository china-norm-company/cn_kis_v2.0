from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0037_nas_payment_extensions_and_points_ledger'),
    ]

    operations = [
        migrations.AddField(
            model_name='subjectpayment',
            name='protocol_id',
            field=models.IntegerField(
                blank=True,
                db_index=True,
                help_text='关联 t_protocol.id，由 link_lims_ekb_to_protocol 命令填充',
                null=True,
                verbose_name='协议ID',
            ),
        ),
    ]
