# Generated manually for identity_reverify_pending

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0021_alter_consent_config_account_help_text_qa'),
    ]

    operations = [
        migrations.AddField(
            model_name='witnessstaff',
            name='identity_reverify_pending',
            field=models.BooleanField(
                default=False,
                help_text='已认证档案再次发送核验邮件后为 True，对方完成签名登记后清 False',
                verbose_name='待重新认证',
            ),
        ),
    ]
