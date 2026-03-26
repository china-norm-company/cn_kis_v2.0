# Generated manually for witness signature authorization step after face verification

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('protocol', '0017_protocol_consent_config_account'),
    ]

    operations = [
        migrations.AddField(
            model_name='witnessdualsignauthtoken',
            name='signature_auth_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='签名授权时间'),
        ),
        migrations.AddField(
            model_name='witnessdualsignauthtoken',
            name='signature_auth_decision',
            field=models.CharField(
                blank=True,
                default='',
                help_text='人脸通过后：agreed=同意项目使用签名信息；refused=拒绝；空=未选择',
                max_length=16,
                verbose_name='签名授权决策',
            ),
        ),
    ]
