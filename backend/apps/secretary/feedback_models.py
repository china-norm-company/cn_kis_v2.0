"""
CN KIS 用户反馈模型

记录来自「CN KIS 用户反馈群」的飞书消息，经 AI 分类后
自动创建 GitHub Issue 或直接回复。
"""
from django.db import models


class FeedbackCategory(models.TextChoices):
    BUG = 'bug', '功能故障'
    FEATURE = 'feature', '功能建议'
    QUESTION = 'question', '使用疑问'
    DATA = 'data', '数据问题'
    PERFORMANCE = 'performance', '性能问题'
    OTHER = 'other', '其他'


class FeedbackStatus(models.TextChoices):
    PENDING = 'pending', '待处理'
    AUTO_REPLIED = 'auto_replied', '已自动回复'
    ISSUE_CREATED = 'issue_created', '已创建 Issue'
    RESOLVED = 'resolved', '已解决'
    IGNORED = 'ignored', '已忽略'


class UserFeedback(models.Model):
    """
    来自飞书用户反馈群的一条反馈记录。
    """

    class Meta:
        db_table = 't_user_feedback'
        verbose_name = '用户反馈'
        verbose_name_plural = '用户反馈'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status', 'created_at'], name='feedback_status_time_idx'),
            models.Index(fields=['category', 'workstation'], name='feedback_cat_ws_idx'),
        ]

    # ── 来源信息 ──────────────────────────────────────────────
    feishu_message_id = models.CharField(
        '飞书消息 ID', max_length=100, unique=True,
        help_text='飞书事件回调中的 message_id，用于幂等去重',
    )
    sender_open_id = models.CharField('发送人 open_id', max_length=100, blank=True)
    sender_name = models.CharField('发送人姓名', max_length=100, blank=True)
    raw_text = models.TextField('原始消息内容')

    # ── AI 分类结果 ───────────────────────────────────────────
    category = models.CharField(
        '反馈分类', max_length=20,
        choices=FeedbackCategory.choices,
        default=FeedbackCategory.OTHER,
    )
    workstation = models.CharField(
        '涉及工作台', max_length=50, blank=True,
        help_text='AI 从消息内容推断的涉及工作台，如 quality / finance',
    )
    severity = models.CharField(
        '严重程度', max_length=10, blank=True,
        choices=[('high', '高'), ('medium', '中'), ('low', '低')],
        default='medium',
    )
    ai_summary = models.CharField(
        'AI 生成摘要', max_length=200, blank=True,
        help_text='用于 GitHub Issue 标题和晚报摘要的简短描述',
    )

    # ── 处理结果 ──────────────────────────────────────────────
    status = models.CharField(
        '处理状态', max_length=20,
        choices=FeedbackStatus.choices,
        default=FeedbackStatus.PENDING,
    )
    github_issue_url = models.URLField(
        'GitHub Issue URL', blank=True,
        help_text='自动创建的 GitHub Issue 链接',
    )
    github_issue_number = models.IntegerField('GitHub Issue 编号', null=True, blank=True)
    auto_reply_text = models.TextField('自动回复内容', blank=True)

    # ── 元数据 ────────────────────────────────────────────────
    created_at = models.DateTimeField('收到时间', auto_now_add=True)
    processed_at = models.DateTimeField('处理完成时间', null=True, blank=True)

    def __str__(self):
        return f'[{self.get_category_display()}] {self.ai_summary or self.raw_text[:50]}'
