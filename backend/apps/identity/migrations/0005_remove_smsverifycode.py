"""
删除 SmsVerifyCode 表

验证码生命周期改由火山引擎 SDK 原生管理
（send_sms_verify_code / check_sms_verify_code），
不再需要本地数据库存储验证码。
"""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0004_smsverifycode'),
    ]

    operations = [
        migrations.DeleteModel(
            name='SmsVerifyCode',
        ),
    ]
