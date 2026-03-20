"""
监管沟通模型 (REG003)

核心流程：
记录收发沟通 → 链式回复跟踪 → 截止日期管理 → 附件管理
"""
from django.db import models


class CorrespondenceDirection(models.TextChoices):
    INBOUND = 'inbound', '收件'
    OUTBOUND = 'outbound', '发件'


class CorrespondenceStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SENT = 'sent', '已发送'
    RECEIVED = 'received', '已接收'
    REPLIED = 'replied', '已回复'
    CLOSED = 'closed', '已关闭'


class RegulatoryCorrespondence(models.Model):
    """监管沟通记录"""

    class Meta:
        db_table = 't_ethics_regulatory_correspondence'
        verbose_name = '监管沟通'
        ordering = ['-correspondence_date', '-create_time']
        indexes = [
            models.Index(fields=['direction', 'status']),
            models.Index(fields=['correspondence_no']),
        ]

    correspondence_no = models.CharField('沟通编号', max_length=50, unique=True, db_index=True)
    direction = models.CharField(
        '方向', max_length=10,
        choices=CorrespondenceDirection.choices,
    )
    subject = models.CharField('主题', max_length=500)
    content = models.TextField('内容', blank=True, default='')
    counterpart = models.CharField('对方机构', max_length=200, blank=True, default='')
    contact_person = models.CharField('联系人', max_length=100, blank=True, default='')

    correspondence_date = models.DateField('沟通日期', null=True, blank=True)
    reply_deadline = models.DateField('回复截止日期', null=True, blank=True)
    status = models.CharField(
        '状态', max_length=20,
        choices=CorrespondenceStatus.choices,
        default=CorrespondenceStatus.DRAFT,
    )

    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='replies',
        verbose_name='回复的沟通',
    )
    protocol = models.ForeignKey(
        'protocol.Protocol',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='regulatory_correspondences',
        verbose_name='关联项目',
    )

    attachment_urls = models.JSONField('附件列表', default=list)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.correspondence_no} - {self.subject}'
