# Generated for Phase 2 identity verification

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('subject', '0015_subject_auth_level_identity'),
    ]

    operations = [
        migrations.CreateModel(
            name='IdentityVerifySession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('verify_id', models.CharField(db_index=True, max_length=64, unique=True, verbose_name='核验会话ID')),
                ('provider', models.CharField(default='tencent_faceid', max_length=32, verbose_name='服务商')),
                ('status', models.CharField(choices=[('pending', '待结果'), ('verified', '已通过'), ('rejected', '未通过'), ('expired', '已过期')], db_index=True, default='pending', max_length=20, verbose_name='状态')),
                ('biz_token', models.CharField(blank=True, default='', max_length=500, verbose_name='第三方 BizToken')),
                ('expire_at', models.DateTimeField(blank=True, null=True, verbose_name='过期时间')),
                ('requested_at', models.DateTimeField(auto_now_add=True, verbose_name='发起时间')),
                ('completed_at', models.DateTimeField(blank=True, null=True, verbose_name='完成时间')),
                ('reject_reason', models.CharField(blank=True, default='', max_length=200, verbose_name='拒绝原因')),
                ('id_card_encrypted', models.CharField(blank=True, default='', max_length=500, verbose_name='身份证号加密')),
                ('extra_data', models.JSONField(blank=True, null=True, verbose_name='扩展数据')),
                ('create_time', models.DateTimeField(auto_now_add=True, verbose_name='创建时间')),
                ('update_time', models.DateTimeField(auto_now=True, verbose_name='更新时间')),
                ('subject', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='identity_verify_sessions', to='subject.subject')),
            ],
            options={
                'verbose_name': '实名核验会话',
                'db_table': 't_identity_verify_session',
            },
        ),
        migrations.AddIndex(
            model_name='identityverifysession',
            index=models.Index(fields=['subject', 'status'], name='t_identity_v_subject_3c2e2a_idx'),
        ),
        migrations.AddIndex(
            model_name='identityverifysession',
            index=models.Index(fields=['verify_id'], name='t_identity_v_verify__e2f8b0_idx'),
        ),
    ]
