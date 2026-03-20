from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('identity', '0003_accountrole_constraints'),
    ]

    operations = [
        migrations.CreateModel(
            name='SmsVerifyCode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('phone', models.CharField(db_index=True, max_length=20, verbose_name='手机号')),
                ('scene', models.CharField(default='login', max_length=32, verbose_name='场景')),
                ('code_hash', models.CharField(max_length=128, verbose_name='验证码哈希')),
                ('expire_at', models.DateTimeField(verbose_name='过期时间')),
                ('is_used', models.BooleanField(default=False, verbose_name='是否已使用')),
                ('used_at', models.DateTimeField(blank=True, null=True, verbose_name='使用时间')),
                ('verify_attempts', models.IntegerField(default=0, verbose_name='校验失败次数')),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True, verbose_name='请求IP')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
            ],
            options={
                'verbose_name': '短信验证码',
                'db_table': 't_sms_verify_code',
            },
        ),
        migrations.AddIndex(
            model_name='smsverifycode',
            index=models.Index(fields=['phone', 'scene', 'is_used'], name='t_sms_verif_phone_12a95f_idx'),
        ),
        migrations.AddIndex(
            model_name='smsverifycode',
            index=models.Index(fields=['expire_at'], name='t_sms_verif_expire__5b4f7d_idx'),
        ),
    ]
