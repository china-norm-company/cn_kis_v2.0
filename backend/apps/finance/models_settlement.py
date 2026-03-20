"""
项目决算模型
"""
from decimal import Decimal
from django.db import models


class SettlementStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    REVIEWING = 'reviewing', '审核中'
    APPROVED = 'approved', '已批准'
    ARCHIVED = 'archived', '已归档'


class ProjectSettlement(models.Model):
    """项目决算"""
    class Meta:
        db_table = 't_project_settlement'
        verbose_name = '项目决算'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['protocol_id']),
        ]

    settlement_no = models.CharField('决算编号', max_length=50, unique=True, db_index=True)
    protocol_id = models.IntegerField('协议ID', db_index=True)
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='')
    contract_amount = models.DecimalField('合同总额', max_digits=15, decimal_places=2, default=Decimal('0'))
    total_invoiced = models.DecimalField('累计开票', max_digits=15, decimal_places=2, default=Decimal('0'))
    total_received = models.DecimalField('累计回款', max_digits=15, decimal_places=2, default=Decimal('0'))
    total_cost = models.DecimalField('累计成本', max_digits=15, decimal_places=2, default=Decimal('0'))
    total_expense = models.DecimalField('累计费用', max_digits=15, decimal_places=2, default=Decimal('0'))
    gross_profit = models.DecimalField('毛利', max_digits=15, decimal_places=2, default=Decimal('0'))
    gross_margin = models.DecimalField('毛利率(%)', max_digits=5, decimal_places=2, default=Decimal('0'))
    budget_variance = models.DecimalField('预算偏差', max_digits=15, decimal_places=2, default=Decimal('0'))
    settlement_status = models.CharField('状态', max_length=20, choices=SettlementStatus.choices,
                                          default=SettlementStatus.DRAFT)
    settlement_report = models.JSONField('详细决算数据', default=dict, blank=True)
    feishu_doc_token = models.CharField('飞书文档token', max_length=200, blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.settlement_no} - {self.project_name}'


class AnalysisSnapshot(models.Model):
    """分析快照"""
    class Meta:
        db_table = 't_analysis_snapshot'
        verbose_name = '分析快照'
        unique_together = [['snapshot_date', 'metric_type', 'dimension_type', 'dimension_id']]
        indexes = [
            models.Index(fields=['snapshot_date', 'metric_type']),
        ]

    snapshot_date = models.DateField('快照日期')
    metric_type = models.CharField('指标类型', max_length=50)
    dimension_type = models.CharField('维度类型', max_length=30, default='company')
    dimension_id = models.IntegerField('维度ID', default=0)
    value = models.DecimalField('指标值', max_digits=15, decimal_places=4, default=Decimal('0'))
    previous_value = models.DecimalField('上期值', max_digits=15, decimal_places=4, null=True, blank=True)
    yoy_value = models.DecimalField('去年同期值', max_digits=15, decimal_places=4, null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.snapshot_date} - {self.metric_type}'


class CreditScore(models.Model):
    """客户信用评分"""
    class Meta:
        db_table = 't_credit_score'
        verbose_name = '客户信用评分'
        unique_together = [['client_id', 'score_date']]
        ordering = ['-score_date']

    client_id = models.IntegerField('客户ID', db_index=True)
    client_name = models.CharField('客户名称', max_length=200, blank=True, default='')
    score_date = models.DateField('评分日期')
    score = models.IntegerField('信用评分', default=0)
    grade = models.CharField('信用等级', max_length=2, default='C')
    on_time_rate = models.DecimalField('准时回款率(%)', max_digits=5, decimal_places=2, default=Decimal('0'))
    avg_overdue_days = models.DecimalField('平均逾期天数', max_digits=6, decimal_places=1, default=Decimal('0'))
    overdue_count = models.IntegerField('逾期次数', default=0)
    total_amount = models.DecimalField('历史合同总额', max_digits=15, decimal_places=2, default=Decimal('0'))
    score_detail = models.JSONField('评分明细', default=dict, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.client_name} - {self.score_date} - {self.grade}'
