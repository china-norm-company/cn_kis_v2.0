"""
项目全链路模型

与 KIS 项目管理模块对齐：项目主表 + 项目方案表。
"""
from django.db import models


class Project(models.Model):
    """项目主表（项目全链路）"""

    class Meta:
        db_table = 'project_full_link_project'
        verbose_name = '项目全链路-项目'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['execution_status']),
            models.Index(fields=['schedule_status']),
            models.Index(fields=['created_at']),
        ]

    opportunity_no = models.CharField('商机编号', max_length=100, blank=True, default='', db_index=True)
    inquiry_no = models.CharField('询价单号', max_length=100, blank=True, default='', null=True)
    project_no = models.CharField('项目编号', max_length=100, blank=True, default='', null=True, db_index=True)
    project_name = models.CharField('项目名称', max_length=500, blank=True, default='')
    business_type = models.CharField('业务类型', max_length=100, blank=True, default='')
    sponsor_no = models.CharField('申办方编号', max_length=100, blank=True, default='', null=True)
    sponsor_name = models.CharField('申办方名称', max_length=300, blank=True, default='', null=True)
    research_institution = models.CharField('研究机构', max_length=300, blank=True, default='', null=True)
    principal_investigator = models.CharField('主要研究者', max_length=200, blank=True, default='', null=True)
    priority = models.CharField('优先级', max_length=20, default='medium')  # high, medium, low
    execution_status = models.CharField(
        '执行状态', max_length=50, default='pending_execution',
        help_text='pending_execution, in_progress, completed, cancelled',
    )
    schedule_status = models.CharField(
        '排程状态', max_length=50, default='pending_visit_plan',
        help_text='pending_visit_plan, pending_resource_review, ...',
    )
    total_samples = models.IntegerField('总样本量', null=True, blank=True)
    expected_start_date = models.DateField('预计开始日期', null=True, blank=True)
    expected_end_date = models.DateField('预计结束日期', null=True, blank=True)
    actual_start_date = models.DateField('实际开始日期', null=True, blank=True)
    actual_end_date = models.DateField('实际结束日期', null=True, blank=True)
    recruitment_start_date = models.DateField('招募开始日期', null=True, blank=True)
    test_start_date = models.DateField('试验开始日期', null=True, blank=True)
    test_end_date = models.DateField('试验结束日期', null=True, blank=True)
    report_deadline = models.DateField('报告截止日期', null=True, blank=True)
    description = models.TextField('描述', blank=True, default='', null=True)
    remark = models.TextField('备注', blank=True, default='', null=True)

    created_by = models.IntegerField('创建人ID', null=True, blank=True)
    updated_by = models.IntegerField('更新人ID', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    is_delete = models.BooleanField('已删除', default=False)

    def __str__(self):
        return self.project_name or self.project_no or f'Project#{self.id}'


class ProjectProtocol(models.Model):
    """项目方案表（方案文档 + 解析结果）"""

    class Meta:
        db_table = 'project_full_link_protocol'
        verbose_name = '项目全链路-方案'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['project', 'is_delete']),
        ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='protocols')
    protocol_no = models.CharField('方案编号', max_length=100, blank=True, default='', null=True)
    protocol_name = models.CharField('方案名称', max_length=500)
    protocol_version = models.CharField('方案版本', max_length=50, blank=True, default='', null=True)
    description = models.TextField('描述', blank=True, default='', null=True)
    file_id = models.IntegerField('文件ID（关联系统文件）', null=True, blank=True)
    file_path = models.CharField('文件路径（本地存储时使用）', max_length=500, blank=True, default='', null=True)
    parsed_data = models.JSONField('解析结果 JSON', null=True, blank=True)
    parse_error = models.TextField('解析错误信息', blank=True, default='', null=True)
    parse_progress = models.JSONField('解析进度', null=True, blank=True)
    parse_logs = models.JSONField('解析日志', null=True, blank=True, default=list)

    created_by = models.IntegerField('创建人ID', null=True, blank=True)
    updated_by = models.IntegerField('更新人ID', null=True, blank=True)
    created_at = models.DateTimeField('创建时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)
    is_delete = models.BooleanField('已删除', default=False)

    def __str__(self):
        return self.protocol_name or f'Protocol#{self.id}'
