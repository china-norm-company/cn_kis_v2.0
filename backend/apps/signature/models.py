"""
电子签名模型

符合 21 CFR Part 11 标准，记录所有电子签名操作
"""
from django.db import models


class ElectronicSignature(models.Model):
    """电子签名记录（不可修改、不可删除）"""

    class Meta:
        db_table = 't_electronic_signature'
        verbose_name = '电子签名'
        ordering = ['-signed_at']
        indexes = [
            models.Index(fields=['account_id', 'signed_at']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['signed_at']),
        ]

    # 签名人
    account_id = models.IntegerField('账号ID', db_index=True)
    account_name = models.CharField('账号名称', max_length=100)
    account_type = models.CharField('账号类型', max_length=20, blank=True, default='')
    
    # 签名资源
    resource_type = models.CharField('资源类型', max_length=50, db_index=True, help_text='如：protocol, icf, crf_record等')
    resource_id = models.CharField('资源ID', max_length=100, db_index=True)
    resource_name = models.CharField('资源名称', max_length=200, blank=True, default='')
    
    # 签名数据
    signature_data = models.JSONField('签名数据', help_text='签名图像、证书、哈希值等')
    reason = models.CharField('签名原因', max_length=500, blank=True, default='', help_text='如：同意、批准、确认等')
    
    # 环境信息（审计用）
    ip_address = models.GenericIPAddressField('IP地址', null=True, blank=True)
    user_agent = models.TextField('User Agent', blank=True, default='')
    
    # 时间（不可修改）
    signed_at = models.DateTimeField('签名时间', auto_now_add=True, db_index=True)

    def __str__(self):
        return f'{self.account_name} -> {self.resource_type}:{self.resource_id}'
