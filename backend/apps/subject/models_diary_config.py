"""
日记 2.0 — 项目级日记配置（题目定义 + 规则 + 发布/确认门禁）

表名与字段约定见 docs/日记配置表字段约定.md
"""
from django.db import models


class SubjectDiaryConfigStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    PUBLISHED = 'published', '已发布'


class SubjectDiaryConfig(models.Model):
    """受试者日记配置：一行 = 某项目下一版表单与规则。"""

    class Meta:
        db_table = 't_subject_diary_config'
        verbose_name = '受试者日记配置'
        indexes = [
            models.Index(fields=['project', 'status']),
            models.Index(fields=['project_no']),
        ]

    project = models.ForeignKey(
        'project_full_link.Project',
        on_delete=models.CASCADE,
        related_name='subject_diary_configs',
        verbose_name='项目',
    )
    project_no = models.CharField(
        '项目编号',
        max_length=100,
        blank=True,
        default='',
        db_index=True,
        help_text='业务编号冗余，如 W26000000',
    )
    config_version_label = models.CharField(
        '配置版本标签',
        max_length=50,
        blank=True,
        default='',
        help_text='如 v1、2026Q1',
    )
    form_definition_json = models.JSONField(
        '题目与表单定义',
        default=list,
        help_text='题型、选项、顺序、必填等；小程序依此渲染',
    )
    rule_json = models.JSONField(
        '填写与校验规则',
        default=dict,
        help_text='应填起止日、时间窗、补填等',
    )
    status = models.CharField(
        '配置状态',
        max_length=20,
        choices=SubjectDiaryConfigStatus.choices,
        default=SubjectDiaryConfigStatus.DRAFT,
        db_index=True,
    )
    researcher_confirmed_at = models.DateTimeField(
        '研究员确认时间',
        null=True,
        blank=True,
        help_text='非空表示 2.0 门禁已满足，可对受试者生效',
    )
    supervisor_confirmed_at = models.DateTimeField(
        '督导确认时间',
        null=True,
        blank=True,
        help_text='3.0 督导二次确认时使用',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'DiaryConfig#{self.id} project={self.project_id} {self.config_version_label or ""}'
