# Generated for WeChat mini program auth lifecycle (L0/L1/L2)

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0014_support_ticket_sla_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='subject',
            name='auth_level',
            field=models.CharField(
                choices=[('guest', '游客'), ('phone_verified', '手机已认证'), ('identity_verified', '实名已认证')],
                db_index=True,
                default='guest',
                help_text='L0 游客 / L1 手机认证 / L2 实名认证',
                max_length=24,
                verbose_name='认证等级',
            ),
        ),
        migrations.AddField(
            model_name='subject',
            name='identity_verified_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='实名认证通过时间'),
        ),
        migrations.AddField(
            model_name='subject',
            name='identity_verify_status',
            field=models.CharField(
                blank=True,
                choices=[('pending', '待结果'), ('verified', '已通过'), ('rejected', '未通过'), ('expired', '已过期')],
                max_length=20,
                null=True,
                verbose_name='最近一次实名核验状态',
            ),
        ),
        migrations.AddField(
            model_name='subject',
            name='id_card_encrypted',
            field=models.CharField(blank=True, default='', max_length=500, verbose_name='身份证号加密存储'),
        ),
    ]
