"""
法规跟踪模型 (REG001)

核心流程：
录入法规信息 → 影响分析 → 制定行动项 → 跟踪合规状态
"""
from django.db import models


class RegulationType(models.TextChoices):
    LAW = 'law', '法律'
    REGULATION = 'regulation', '法规'
    GUIDELINE = 'guideline', '指导原则'
    STANDARD = 'standard', '标准'
    NOTICE = 'notice', '通知/公告'


class ImpactLevel(models.TextChoices):
    HIGH = 'high', '高'
    MEDIUM = 'medium', '中'
    LOW = 'low', '低'


class RegulationStatus(models.TextChoices):
    DRAFT = 'draft', '草案'
    PUBLISHED = 'published', '已发布'
    EFFECTIVE = 'effective', '已生效'
    AMENDED = 'amended', '已修订'
    REPEALED = 'repealed', '已废止'


class Regulation(models.Model):
    """法规信息"""

    class Meta:
        db_table = 't_ethics_regulation'
        verbose_name = '法规信息'
        ordering = ['-publish_date', '-create_time']
        indexes = [
            models.Index(fields=['regulation_type', 'status']),
            models.Index(fields=['impact_level']),
        ]

    title = models.CharField('法规名称', max_length=500)
    regulation_type = models.CharField(
        '法规类型', max_length=30,
        choices=RegulationType.choices,
    )
    issuing_authority = models.CharField('发布机构', max_length=200, blank=True, default='')
    document_number = models.CharField('文号', max_length=200, blank=True, default='')
    publish_date = models.DateField('发布日期', null=True, blank=True)
    effective_date = models.DateField('生效日期', null=True, blank=True)
    status = models.CharField(
        '状态', max_length=20,
        choices=RegulationStatus.choices,
        default=RegulationStatus.PUBLISHED,
    )

    summary = models.TextField('摘要', blank=True, default='')
    key_requirements = models.TextField('核心要求', blank=True, default='')
    full_text_url = models.URLField('全文链接', max_length=500, blank=True, default='')

    impact_level = models.CharField(
        '影响级别', max_length=10,
        choices=ImpactLevel.choices,
        default=ImpactLevel.MEDIUM,
    )
    affected_areas = models.JSONField('受影响领域', default=list)
    impact_analysis = models.TextField('影响分析', blank=True, default='')

    action_items = models.TextField('行动项', blank=True, default='')
    action_deadline = models.DateField('行动截止日期', null=True, blank=True)
    action_completed = models.BooleanField('行动已完成', default=False)

    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return self.title
