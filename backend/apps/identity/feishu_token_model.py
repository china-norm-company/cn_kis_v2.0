"""
飞书用户 Token 模型 — 迁入 identity 模块（V2）

V2 架构中，飞书 token 持久化归属 identity 模块，
保持与 V1 secretary.FeishuUserToken 完全一致的模型结构与字段语义，
确保迁移时无数据丢失。
"""
from django.db import models


class FeishuUserToken(models.Model):
    """
    飞书用户 Token 存储

    OAuth 登录时保存 user_access_token + refresh_token，
    工作台扫描飞书信息时用此 token 直接调用飞书开放平台 API。

    user_access_token 有效期约 2 小时，refresh_token 有效期约 30 天（滚动续期）。

    ⚠️ V2 迁移章程红线要求：
    - 保存时只在拿到非空 refresh_token 时才更新（防止空值覆盖）
    - refresh_expires_at 不允许为 None
    - 刷新时提前 1 小时执行 pre-expiry 刷新
    - refresh_token 剩余 < 7 天时主动续期

    子衿主授权：issuer_app_id 记录签发应用，requires_reauth 标记需重授权。
    """
    class Meta:
        db_table = 't_feishu_user_token'
        verbose_name = '飞书用户Token'
        indexes = [
            models.Index(fields=['account_id']),
            models.Index(fields=['issuer_app_id']),
            models.Index(fields=['requires_reauth']),
        ]

    account_id = models.IntegerField('账号ID', unique=True, db_index=True)
    open_id = models.CharField('飞书OpenID', max_length=100, db_index=True)
    access_token = models.TextField('User Access Token')
    refresh_token = models.TextField('Refresh Token', blank=True, default='')
    token_expires_at = models.DateTimeField('Access Token 过期时间')
    refresh_expires_at = models.DateTimeField('Refresh Token 过期时间', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    # 子衿主授权：签发来源与预检可观测
    issuer_app_id = models.CharField('签发应用 App ID', max_length=64, blank=True, default='')
    issuer_app_name = models.CharField('签发应用名称', max_length=64, blank=True, default='')
    granted_capabilities = models.JSONField('预检通过的能力(mail/im/calendar/task)', default=dict, blank=True)
    requires_reauth = models.BooleanField('需要重授权', default=False)
    last_preflight_at = models.DateTimeField('最近预检时间', null=True, blank=True)
    last_error_code = models.CharField('最近错误码', max_length=32, blank=True, default='')

    def __str__(self):
        return f'FeishuToken(account={self.account_id}, open_id={self.open_id})'
