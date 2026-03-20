# 子衿主授权：FeishuUserToken 增加签发来源与预检可观测字段

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        # 本地开发环境依赖 0007（无 0008_domainworker...）
        # 生产部署前确认 0008_domainworkerblueprint_evergreenwatchreport_and_more 已执行
        ('secretary', '0007_assistantuserpreference'),
    ]

    operations = [
        migrations.AddField(
            model_name='feishuusertoken',
            name='issuer_app_id',
            field=models.CharField(blank=True, default='', max_length=64, verbose_name='签发应用 App ID'),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='issuer_app_name',
            field=models.CharField(blank=True, default='', max_length=64, verbose_name='签发应用名称'),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='granted_capabilities',
            field=models.JSONField(blank=True, default=dict, verbose_name='预检通过的能力(mail/im/calendar/task)'),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='requires_reauth',
            field=models.BooleanField(default=False, verbose_name='需要重授权'),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='last_preflight_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='最近预检时间'),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='last_error_code',
            field=models.CharField(blank=True, default='', max_length=32, verbose_name='最近错误码'),
        ),
        migrations.AddIndex(
            model_name='feishuusertoken',
            index=models.Index(fields=['issuer_app_id'], name='t_feishu_us_issuer__idx'),
        ),
        migrations.AddIndex(
            model_name='feishuusertoken',
            index=models.Index(fields=['requires_reauth'], name='t_feishu_us_requires_idx'),
        ),
    ]
