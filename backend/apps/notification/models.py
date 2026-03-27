"""
通知模块模型

S4-8：结构化通知管理，多渠道（飞书消息/卡片/群/加急）
"""
from django.db import models


class NotificationChannel(models.TextChoices):
    FEISHU_MESSAGE = 'feishu_message', '飞书消息'
    FEISHU_CARD = 'feishu_card', '飞书卡片'
    FEISHU_GROUP = 'feishu_group', '飞书群'
    FEISHU_URGENT = 'feishu_urgent', '飞书加急'
    WECHAT_SUBSCRIBE = 'wechat_subscribe', '微信订阅消息'
    SMS = 'sms', '短信'
    SYSTEM = 'system', '系统内通知'


class NotificationPriority(models.TextChoices):
    LOW = 'low', '低'
    NORMAL = 'normal', '普通'
    HIGH = 'high', '高'
    URGENT = 'urgent', '紧急'


class NotificationStatus(models.TextChoices):
    PENDING = 'pending', '待发送'
    SENT = 'sent', '已发送'
    DELIVERED = 'delivered', '已送达'
    READ = 'read', '已读'
    FAILED = 'failed', '发送失败'


class NotificationRecord(models.Model):
    """通知记录"""

    class Meta:
        db_table = 't_notification_record'
        verbose_name = '通知记录'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['recipient_id', 'status']),
            models.Index(fields=['channel', 'status']),
            models.Index(fields=['create_time']),
        ]

    # 通知内容
    title = models.CharField('标题', max_length=500)
    content = models.TextField('内容', blank=True, default='')
    channel = models.CharField('渠道', max_length=20, choices=NotificationChannel.choices)
    priority = models.CharField('优先级', max_length=20, choices=NotificationPriority.choices,
                                default=NotificationPriority.NORMAL)

    # 接收人
    recipient_id = models.IntegerField('接收人ID', db_index=True, help_text='Account ID')
    recipient_open_id = models.CharField('接收人Open ID', max_length=100, blank=True, default='')

    # 关联业务
    source_type = models.CharField('来源类型', max_length=50, blank=True, default='',
                                    help_text='如 workorder/ae/deviation')
    source_id = models.IntegerField('来源ID', null=True, blank=True)
    source_workstation = models.CharField('来源工作台', max_length=50, blank=True, default='')
    target_url = models.CharField('目标跳转URL', max_length=500, blank=True, default='')

    # 状态
    status = models.CharField('状态', max_length=20, choices=NotificationStatus.choices,
                              default=NotificationStatus.PENDING)
    sent_at = models.DateTimeField('发送时间', null=True, blank=True)
    feishu_message_id = models.CharField('飞书消息ID', max_length=100, blank=True, default='')
    error_message = models.TextField('错误信息', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.title} → #{self.recipient_id} ({self.status})'


class NotificationPreference(models.Model):
    """用户通知偏好"""

    class Meta:
        db_table = 't_notification_preference'
        verbose_name = '通知偏好'
        unique_together = [('user_id', 'notification_type')]

    user_id = models.IntegerField('用户ID', db_index=True)
    notification_type = models.CharField('通知类型', max_length=50,
                                          help_text='如 workorder_assigned/ae_reported')
    enabled = models.BooleanField('是否启用', default=True)
    preferred_channel = models.CharField('首选渠道', max_length=20,
                                          choices=NotificationChannel.choices,
                                          default=NotificationChannel.FEISHU_CARD)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'User#{self.user_id} - {self.notification_type}'


class PrApprovalRecord(models.Model):
    """飞书原生 PR 审批记录（免 GitHub 登录）"""

    class Meta:
        db_table = 't_pr_approval_record'
        verbose_name = 'PR 飞书审批记录'
        unique_together = [('repo', 'pr_number', 'approver_open_id')]
        indexes = [
            models.Index(fields=['repo', 'pr_number', 'action']),
        ]

    repo = models.CharField('仓库', max_length=200, help_text='owner/repo 格式')
    pr_number = models.IntegerField('PR 编号')
    commit_sha = models.CharField('Commit SHA', max_length=40)

    approver_open_id = models.CharField('审批人 Feishu open_id', max_length=100)
    approver_name = models.CharField('审批人姓名', max_length=100, blank=True, default='')

    ACTION_APPROVE = 'approve'
    ACTION_REJECT = 'reject'
    ACTION_CHOICES = [(ACTION_APPROVE, '批准'), (ACTION_REJECT, '拒绝')]
    action = models.CharField('审批动作', max_length=20, choices=ACTION_CHOICES)

    github_status_set = models.BooleanField('已更新 GitHub 状态', default=False)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'PR#{self.pr_number} {self.action} by {self.approver_name or self.approver_open_id}'
