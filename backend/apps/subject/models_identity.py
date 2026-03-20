# 实名核验会话与审计（Phase 2）
from django.db import models
from .models import Subject, IdentityVerifyStatus


class IdentityVerifySession(models.Model):
    """单次实名核验会话，用于轮询结果与审计"""

    class Meta:
        db_table = 't_identity_verify_session'
        verbose_name = '实名核验会话'
        indexes = [
            models.Index(fields=['subject', 'status']),
            models.Index(fields=['verify_id']),
        ]

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='identity_verify_sessions')
    verify_id = models.CharField('核验会话ID', max_length=64, unique=True, db_index=True)
    provider = models.CharField('服务商', max_length=32, default='volcengine_cert')
    status = models.CharField(
        '状态',
        max_length=20,
        choices=IdentityVerifyStatus.choices,
        default=IdentityVerifyStatus.PENDING,
        db_index=True,
    )
    byted_token = models.CharField('火山引擎 byted_token', max_length=500, blank=True, default='')
    expire_at = models.DateTimeField('过期时间', null=True, blank=True)
    requested_at = models.DateTimeField('发起时间', auto_now_add=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    reject_reason = models.CharField('拒绝原因', max_length=200, blank=True, default='')
    id_card_encrypted = models.CharField('身份证号加密', max_length=500, blank=True, default='')
    extra_data = models.JSONField('扩展数据', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
