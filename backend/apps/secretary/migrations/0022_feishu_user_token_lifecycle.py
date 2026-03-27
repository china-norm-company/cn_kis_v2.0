"""
Migration: 扩充 FeishuUserToken 模型——完整 Token 生命周期管理字段

新增字段：
  - status               : Token 状态枚举（active/expiring/access_expired/refresh_expired/revoked/invalid）
  - first_authorized_at  : 首次授权时间
  - last_refreshed_at    : 最近刷新成功时间
  - last_used_at         : 最近使用时间
  - last_refresh_failed_at: 最近刷新失败时间
  - refresh_count        : 累计刷新次数
  - consecutive_refresh_failures: 连续刷新失败次数
  - last_refresh_error   : 最近刷新错误信息
  - revoked_at           : 作废时间
  - revoked_reason       : 作废原因

新增索引：
  - status, refresh_expires_at, last_used_at
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('secretary', '0016_handoffrecord_and_more'),
        ('secretary', '0021_merge_20260315_2146'),
    ]

    operations = [
        # ── 状态字段 ──────────────────────────────────────────────────────────
        migrations.AddField(
            model_name='feishuusertoken',
            name='status',
            field=models.CharField(
                verbose_name='Token 状态',
                max_length=20,
                choices=[
                    ('active', '正常'),
                    ('expiring', '即将到期'),
                    ('access_expired', 'Access过期'),
                    ('refresh_expired', '需重新登录'),
                    ('revoked', '已作废'),
                    ('invalid', '无效'),
                ],
                default='active',
                db_index=True,
            ),
        ),
        # ── 时间线字段 ─────────────────────────────────────────────────────────
        migrations.AddField(
            model_name='feishuusertoken',
            name='first_authorized_at',
            field=models.DateTimeField(verbose_name='首次授权时间', null=True, blank=True),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='last_refreshed_at',
            field=models.DateTimeField(verbose_name='最近刷新成功时间', null=True, blank=True),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='last_used_at',
            field=models.DateTimeField(verbose_name='最近使用时间', null=True, blank=True),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='last_refresh_failed_at',
            field=models.DateTimeField(verbose_name='最近刷新失败时间', null=True, blank=True),
        ),
        # ── 刷新统计字段 ───────────────────────────────────────────────────────
        migrations.AddField(
            model_name='feishuusertoken',
            name='refresh_count',
            field=models.PositiveIntegerField(verbose_name='累计刷新次数', default=0),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='consecutive_refresh_failures',
            field=models.PositiveSmallIntegerField(verbose_name='连续刷新失败次数', default=0),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='last_refresh_error',
            field=models.CharField(
                verbose_name='最近刷新错误信息', max_length=255, blank=True, default='',
            ),
        ),
        # ── 作废字段 ──────────────────────────────────────────────────────────
        migrations.AddField(
            model_name='feishuusertoken',
            name='revoked_at',
            field=models.DateTimeField(verbose_name='作废时间', null=True, blank=True),
        ),
        migrations.AddField(
            model_name='feishuusertoken',
            name='revoked_reason',
            field=models.CharField(verbose_name='作废原因', max_length=64, blank=True, default=''),
        ),
        # ── 新增索引 ──────────────────────────────────────────────────────────
        migrations.AddIndex(
            model_name='feishuusertoken',
            index=models.Index(fields=['refresh_expires_at'], name='t_feishu_user_token_refresh_exp_idx'),
        ),
        migrations.AddIndex(
            model_name='feishuusertoken',
            index=models.Index(fields=['last_used_at'], name='t_feishu_user_token_last_used_idx'),
        ),
    ]
