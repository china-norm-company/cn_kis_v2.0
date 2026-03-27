"""
Migration: 0025_feishu_user_token_scope

给 FeishuUserToken 模型新增两项字段：
1. feishu_scope (TextField) — 存储 OAuth 实际授权的 scope 字符串，用于运行时校验缺失权限。
2. 更新 granted_capabilities 的 help_text（仅 state 层变更，无 DB schema 修改）。

背景：OAuth refresh_token 续期不带回 scope 字段，历史 token 无法自动获知已授权的 scope，
需在每次登录时将飞书返回的 scope 字符串持久化，以便后续检测是否需要用户重新授权。
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0024_user_feedback'),
    ]

    operations = [
        migrations.AddField(
            model_name='feishuusertoken',
            name='feishu_scope',
            field=models.TextField(
                blank=True,
                default='',
                verbose_name='飞书授权 Scope',
                help_text=(
                    'OAuth 授权时飞书实际返回的 scope 字符串（空格分隔），'
                    '可与 DEFAULT_USER_SCOPES 对比检测缺失权限。'
                    '刷新 token 不会增加新 scope，需重新登录才能获得新增权限。'
                ),
            ),
        ),
        migrations.AlterField(
            model_name='feishuusertoken',
            name='granted_capabilities',
            field=models.JSONField(
                blank=True,
                default=dict,
                verbose_name='预检通过的能力',
                help_text='预检结果字典，键：mail/im/calendar/task/wiki/docx/drive_file/minutes，值：bool',
            ),
        ),
    ]
