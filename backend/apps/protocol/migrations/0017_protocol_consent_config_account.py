# Generated manually: 知情配置负责人（治理台 CRC / CRC主管 账号）

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0016_witness_auth_token_face_byted_token'),
    ]

    operations = [
        migrations.AddField(
            model_name='protocol',
            name='consent_config_account_id',
            field=models.IntegerField(
                blank=True,
                db_index=True,
                help_text='治理台 Account.id，须具备全局角色 crc 或 crc_supervisor',
                null=True,
                verbose_name='知情配置负责人账号ID',
            ),
        ),
    ]
