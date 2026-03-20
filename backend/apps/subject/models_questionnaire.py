"""
问卷管理模型（B端）

支持问卷模板 CRUD、分配给受试者、跟踪完成状态。
"""
from django.db import models


class QuestionnaireCategory(models.TextChoices):
    SCREENING = 'screening', '筛选问卷'
    FOLLOW_UP = 'follow_up', '随访问卷'
    SATISFACTION = 'satisfaction', '满意度调查'
    SAFETY = 'safety', '安全性问卷'
    PRO = 'pro', '患者报告结局'
    OTHER = 'other', '其他'


class QuestionnaireTemplate(models.Model):
    """问卷模板"""

    class Meta:
        db_table = 't_questionnaire_template'
        verbose_name = '问卷模板'

    template_name = models.CharField('模板名称', max_length=200)
    category = models.CharField('问卷类型', max_length=50, choices=QuestionnaireCategory.choices, default=QuestionnaireCategory.OTHER)
    description = models.TextField('问卷描述', blank=True, default='')
    form_definition = models.JSONField('表单定义', null=True, blank=True, help_text='JSON Schema 格式的表单定义')
    is_active = models.BooleanField('是否启用', default=True)
    version = models.IntegerField('版本号', default=1)
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.template_name} v{self.version}'


class AssignmentStatus(models.TextChoices):
    PENDING = 'pending', '待完成'
    IN_PROGRESS = 'in_progress', '进行中'
    COMPLETED = 'completed', '已完成'
    OVERDUE = 'overdue', '已逾期'
    CANCELLED = 'cancelled', '已取消'


class QuestionnaireAssignment(models.Model):
    """问卷分配"""

    class Meta:
        db_table = 't_questionnaire_assignment'
        verbose_name = '问卷分配'
        indexes = [
            models.Index(fields=['subject_id', 'status']),
            models.Index(fields=['template', 'status']),
        ]

    template = models.ForeignKey(QuestionnaireTemplate, on_delete=models.CASCADE, related_name='assignments')
    subject_id = models.IntegerField('受试者ID', db_index=True)
    enrollment_id = models.IntegerField('入组ID', null=True, blank=True)

    status = models.CharField('状态', max_length=20, choices=AssignmentStatus.choices, default=AssignmentStatus.PENDING)
    due_date = models.DateField('截止日期', null=True, blank=True)
    completed_at = models.DateTimeField('完成时间', null=True, blank=True)
    responses = models.JSONField('答卷数据', null=True, blank=True)
    score = models.DecimalField('评分', max_digits=5, decimal_places=2, null=True, blank=True)

    assigned_by_id = models.IntegerField('分配人ID', null=True, blank=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'问卷分配 #{self.id} - {self.template.template_name}'
