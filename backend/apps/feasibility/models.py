"""
可行性评估模型

包含：可行性评估、评估维度项
核心流程：创建评估（关联商机）→ 自动检查 → 人工补充 → 计算综合评分 → 提交审批
"""
from django.db import models


# ============================================================================
# 可行性评估
# ============================================================================
class AssessmentStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SUBMITTED = 'submitted', '已提交'
    APPROVED = 'approved', '已批准'
    REJECTED = 'rejected', '已驳回'


class FeasibilityAssessment(models.Model):
    """可行性评估"""

    class Meta:
        db_table = 't_feasibility_assessment'
        verbose_name = '可行性评估'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['opportunity', 'status']),
            models.Index(fields=['status']),
        ]

    opportunity = models.ForeignKey(
        'crm.Opportunity', on_delete=models.CASCADE,
        related_name='feasibility_assessments', verbose_name='关联商机',
    )
    protocol = models.ForeignKey(
        'protocol.Protocol', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='feasibility_assessments',
        verbose_name='关联协议',
    )
    title = models.CharField('评估标题', max_length=300)
    status = models.CharField(
        '状态', max_length=20, choices=AssessmentStatus.choices,
        default=AssessmentStatus.DRAFT, db_index=True,
    )
    overall_score = models.FloatField(
        '综合评分', null=True, blank=True,
        help_text='0-100综合评分',
    )
    auto_check_result = models.JSONField(
        '自动检查汇总', default=dict, blank=True,
        help_text='各维度自动检查结果汇总',
    )
    notes = models.TextField('备注', blank=True, default='')

    # 权限相关
    created_by_id = models.IntegerField(
        '创建人ID', null=True, blank=True, db_index=True,
        help_text='Account ID',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return self.title


# ============================================================================
# 评估维度项
# ============================================================================
class AssessmentDimension(models.TextChoices):
    PERSONNEL = 'personnel', '人员'
    EQUIPMENT = 'equipment', '设备'
    VENUE = 'venue', '场地'
    SCHEDULE = 'schedule', '排程'
    COMPLIANCE = 'compliance', '合规'
    RECRUITMENT = 'recruitment', '受试者招募'


class AssessmentItem(models.Model):
    """评估维度项"""

    class Meta:
        db_table = 't_assessment_item'
        verbose_name = '评估维度项'
        ordering = ['assessment', 'dimension']
        indexes = [
            models.Index(fields=['assessment', 'dimension']),
        ]

    assessment = models.ForeignKey(
        FeasibilityAssessment, on_delete=models.CASCADE,
        related_name='items', verbose_name='关联评估',
    )
    dimension = models.CharField(
        '评估维度', max_length=20, choices=AssessmentDimension.choices,
    )
    score = models.IntegerField('评分', default=0, help_text='0-100')
    weight = models.FloatField('权重', default=1.0)
    auto_check_passed = models.BooleanField('自动检查通过', null=True, blank=True)
    auto_check_detail = models.JSONField(
        '自动检查详情', default=dict, blank=True,
    )
    manual_notes = models.TextField('人工备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.assessment.title} - {self.get_dimension_display()}'
