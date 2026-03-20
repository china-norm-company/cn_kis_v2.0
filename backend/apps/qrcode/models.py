"""
二维码管理模型

支持六种实体类型的二维码生成与解析：
- subject:   受试者（一人一码，终身有效，跨项目复用）
- station:   场所/工位（一位一码，半永久，受试者自助签到用）
- sample:    样品（一管一码，采集到销毁）
- asset:     资产，包含设备与耗材（一物一码，台账管理）
- workorder: 工单（按需生成）
"""
from django.db import models


class EntityType(models.TextChoices):
    SUBJECT = 'subject', '受试者'
    STATION = 'station', '场所/工位'
    SAMPLE = 'sample', '样品'
    ASSET = 'asset', '资产(设备/物资)'
    WORKORDER = 'workorder', '工单'


class QRCodeRecord(models.Model):
    """二维码记录"""
    entity_type = models.CharField('实体类型', max_length=20, choices=EntityType.choices, db_index=True)
    entity_id = models.IntegerField('实体ID', db_index=True)
    qr_data = models.CharField('二维码数据', max_length=500, unique=True, help_text='编码在二维码中的完整URL或标识')
    qr_hash = models.CharField('二维码哈希', max_length=64, unique=True, help_text='用于快速查找的短哈希')
    label = models.CharField('显示标签', max_length=200, blank=True, default='', help_text='如受试者脱敏姓名、场所名称、设备编号等')
    generated_by = models.IntegerField('生成人ID', null=True, blank=True)
    is_active = models.BooleanField('是否有效', default=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    class Meta:
        db_table = 't_qrcode_record'
        unique_together = [('entity_type', 'entity_id')]
        ordering = ['-create_time']

    def __str__(self):
        return f'QR:{self.entity_type}#{self.entity_id}'


class ScanAction(models.TextChoices):
    CHECKIN = 'checkin', '签到'
    CHECKOUT = 'checkout', '签出'
    SELF_CHECKIN = 'self_checkin', '自助签到'
    WORKORDER_MATCH = 'workorder_match', '工单匹配'
    SAMPLE_COLLECT = 'sample_collect', '样品采集'
    ASSET_USE = 'asset_use', '资产使用'
    MATERIAL_ISSUE = 'material_issue', '物料出库'
    STIPEND_PAY = 'stipend_pay', '礼金发放'
    PROFILE_VIEW = 'profile_view', '查看档案'
    AE_REPORT = 'ae_report', '不良反应上报'
    DROPOUT = 'dropout', '脱落记录'
    RESOLVE = 'resolve', '通用解析'


class ScanAuditLog(models.Model):
    """扫码审计日志：每次扫码都记录，满足 GCP 合规审计要求"""
    qr_record = models.ForeignKey(
        QRCodeRecord,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='scan_logs',
        verbose_name='二维码记录',
    )
    scanner_id = models.IntegerField('扫码人ID', null=True, blank=True, db_index=True)
    workstation = models.CharField('工作台', max_length=50, blank=True, default='', db_index=True)
    action = models.CharField('触发动作', max_length=30, choices=ScanAction.choices, default=ScanAction.RESOLVE)
    scan_time = models.DateTimeField('扫码时间', auto_now_add=True, db_index=True)
    ip_address = models.GenericIPAddressField('IP地址', null=True, blank=True)
    extra = models.JSONField('附加信息', default=dict, blank=True)

    class Meta:
        db_table = 't_qrcode_scan_log'
        ordering = ['-scan_time']
        indexes = [
            models.Index(fields=['qr_record', 'scan_time']),
            models.Index(fields=['scanner_id', 'scan_time']),
        ]

    def __str__(self):
        return f'ScanLog#{self.id}:{self.action}@{self.workstation}'
