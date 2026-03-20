"""
伦理审查意见模型 (ETH002)

核心流程：
伦理委员会审查 → 出具审查意见 → 意见类型驱动申请状态变更 → 需回复意见跟踪
"""
from django.db import models
from .models import EthicsApplication


class OpinionType(models.TextChoices):
    APPROVE = 'approve', '批准'
    CONDITIONAL_APPROVE = 'conditional_approve', '有条件批准'
    REVISE = 'revise', '修改后再审'
    DISAPPROVE = 'disapprove', '不批准'
    SUSPEND = 'suspend', '暂停'
    TERMINATE = 'terminate', '终止'


class EthicsReviewOpinion(models.Model):
    """伦理审查意见"""

    class Meta:
        db_table = 't_ethics_review_opinion'
        verbose_name = '伦理审查意见'
        ordering = ['-review_date', '-create_time']
        indexes = [
            models.Index(fields=['application', 'opinion_type']),
            models.Index(fields=['opinion_no']),
        ]

    application = models.ForeignKey(
        EthicsApplication,
        on_delete=models.CASCADE,
        related_name='review_opinions',
        verbose_name='关联伦理申请',
    )
    opinion_no = models.CharField('意见编号', max_length=50, unique=True, db_index=True)
    opinion_type = models.CharField(
        '意见类型', max_length=30,
        choices=OpinionType.choices,
    )
    review_date = models.DateField('审查日期')
    summary = models.TextField('摘要')
    detailed_opinion = models.TextField('详细意见')
    modification_requirements = models.TextField('修改要求', blank=True, default='')
    reviewer_names = models.JSONField('审查委员', default=list)

    response_required = models.BooleanField('是否需要回复', default=False)
    response_deadline = models.DateField('回复截止日期', null=True, blank=True)
    response_received = models.BooleanField('是否已回复', default=False)
    response_text = models.TextField('回复内容', blank=True, default='')
    response_date = models.DateField('回复日期', null=True, blank=True)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.opinion_no} ({self.get_opinion_type_display()})'
