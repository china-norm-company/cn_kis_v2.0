"""
实验室人员管理 — 合规增强模型

包含：
- DelegationLog: PI 授权日志（Delegation Log）
- FieldChangeLog: 关键字段变更审计追踪
"""
from django.db import models


# ============================================================================
# DelegationLog — PI 授权日志
# ============================================================================
class DelegationLog(models.Model):
    """
    PI 授权日志

    记录 PI（Principal Investigator）签署的人员授权，
    包括授权范围、签名、日期等，满足 GCP/GLP 审计要求。
    """

    class Meta:
        db_table = 't_delegation_log'
        verbose_name = 'PI授权日志'
        ordering = ['-delegation_date']
        indexes = [
            models.Index(fields=['staff', 'protocol_id']),
            models.Index(fields=['protocol_id', 'is_active']),
            models.Index(fields=['delegation_date']),
        ]

    staff = models.ForeignKey(
        'hr.Staff', on_delete=models.CASCADE,
        related_name='delegation_logs', verbose_name='被授权人员',
    )
    protocol_id = models.IntegerField('关联协议ID', db_index=True)
    protocol_name = models.CharField('协议名称', max_length=300, blank=True, default='')

    scope = models.TextField(
        '授权范围',
        help_text='详细描述 PI 授权该人员执行的具体职责和操作',
    )
    delegation_date = models.DateField('授权日期')
    expiry_date = models.DateField('授权到期日', null=True, blank=True)

    pi_name = models.CharField('PI 姓名', max_length=100)
    pi_staff_id = models.IntegerField('PI Staff ID', null=True, blank=True)
    pi_signature_id = models.IntegerField(
        'PI 电子签名ID', null=True, blank=True,
        help_text='关联 signature.ElectronicSignature.id',
    )

    is_active = models.BooleanField('是否有效', default=True)
    revoked_at = models.DateField('撤销日期', null=True, blank=True)
    revoke_reason = models.CharField('撤销原因', max_length=500, blank=True, default='')

    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.staff.name} - Protocol#{self.protocol_id} ({self.delegation_date})'


# ============================================================================
# FieldChangeLog — 关键字段变更审计
# ============================================================================
class FieldChangeLog(models.Model):
    """
    关键字段变更审计日志

    记录 LabStaffProfile / StaffCertificate / MethodQualification
    等关键模型字段的每次变更，满足 21 CFR Part 11 要求。
    """

    class Meta:
        db_table = 't_field_change_log'
        verbose_name = '字段变更日志'
        ordering = ['-changed_at']
        indexes = [
            models.Index(fields=['model_name', 'record_id']),
            models.Index(fields=['changed_at']),
            models.Index(fields=['changed_by_id']),
        ]

    model_name = models.CharField('模型名称', max_length=100,
                                   help_text='如 LabStaffProfile / StaffCertificate')
    record_id = models.IntegerField('记录ID')
    field_name = models.CharField('字段名', max_length=100)
    old_value = models.TextField('变更前值', blank=True, default='')
    new_value = models.TextField('变更后值', blank=True, default='')

    changed_by_id = models.IntegerField('操作人ID', null=True, blank=True)
    changed_by_name = models.CharField('操作人', max_length=100, blank=True, default='')
    changed_at = models.DateTimeField('变更时间', auto_now_add=True)
    reason = models.CharField('变更原因', max_length=500, blank=True, default='')

    def __str__(self):
        return f'{self.model_name}#{self.record_id}.{self.field_name} @ {self.changed_at}'
