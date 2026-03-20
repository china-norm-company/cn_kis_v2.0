"""
报告模块模型

S4-4：报告模板 + 自动生成 + 飞书云文档
"""
from django.db import models


class ReportType(models.TextChoices):
    VISIT_SUMMARY = 'visit_summary', '访视汇总'
    ENROLLMENT_STATUS = 'enrollment_status', '入组状态'
    SAFETY_REPORT = 'safety_report', '安全性报告'
    COMPLIANCE_REPORT = 'compliance_report', '合规报告'
    WORKORDER_SUMMARY = 'workorder_summary', '工单汇总'
    CUSTOM = 'custom', '自定义'


class ReportStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    GENERATING = 'generating', '生成中'
    GENERATED = 'generated', '已生成'
    PUBLISHED = 'published', '已发布'
    FAILED = 'failed', '生成失败'


class ReportTemplate(models.Model):
    """报告模板"""

    class Meta:
        db_table = 't_report_template'
        verbose_name = '报告模板'
        ordering = ['name']

    name = models.CharField('模板名称', max_length=200)
    report_type = models.CharField('报告类型', max_length=30, choices=ReportType.choices)
    description = models.TextField('描述', blank=True, default='')
    template_config = models.JSONField('模板配置', default=dict, blank=True,
                                        help_text='数据源、字段映射、格式配置')
    is_active = models.BooleanField('是否启用', default=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return self.name


class Report(models.Model):
    """报告实例"""

    class Meta:
        db_table = 't_report'
        verbose_name = '报告'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['protocol_id', 'report_type']),
            models.Index(fields=['status']),
        ]

    template = models.ForeignKey(ReportTemplate, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name='reports',
                                 verbose_name='使用模板')
    report_type = models.CharField('报告类型', max_length=30, choices=ReportType.choices)
    title = models.CharField('报告标题', max_length=500)
    protocol_id = models.IntegerField('协议ID', null=True, blank=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=ReportStatus.choices,
                              default=ReportStatus.DRAFT)
    content = models.TextField('报告内容', blank=True, default='')
    data_snapshot = models.JSONField('数据快照', default=dict, blank=True)

    # 飞书集成
    feishu_doc_token = models.CharField('飞书文档token', max_length=200, blank=True, default='')

    generated_by_id = models.IntegerField('生成人ID', null=True, blank=True)
    generated_at = models.DateTimeField('生成时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return self.title
