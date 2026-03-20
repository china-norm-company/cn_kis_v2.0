"""
发票管理（新）— 独立发票模型

与前端「发票管理（新）」schema 对齐，支持 invoice_no、customer_name、project_code、sales_manager 等字段。
数据存数据库，多用户共享。
"""
from decimal import Decimal
from django.db import models


class LegacyInvoiceStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    ISSUED = 'issued', '已开票'
    PAID = 'paid', '已收款'
    PARTIAL = 'partial', '部分收款'
    OVERDUE = 'overdue', '逾期'
    CANCELLED = 'cancelled', '已作废'


class LegacyInvoice(models.Model):
    """发票（新）— 与前端 schema 对齐"""

    class Meta:
        db_table = 't_legacy_invoice'
        verbose_name = '发票（新）'
        ordering = ['-invoice_date', '-id']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['customer_name']),
            models.Index(fields=['project_code']),
            models.Index(fields=['invoice_date']),
        ]

    invoice_no = models.CharField('发票号码', max_length=50, db_index=True)
    invoice_date = models.DateField('开票日期')
    customer_name = models.CharField('客户名称', max_length=300)
    invoice_content = models.TextField('开票内容', blank=True, default='')
    invoice_currency = models.CharField('币种', max_length=10, blank=True, default='CNY')
    invoice_amount_tax_included = models.DecimalField('开票金额(含税)', max_digits=15, decimal_places=2, null=True, blank=True)
    revenue_amount = models.DecimalField('收入金额', max_digits=15, decimal_places=2)
    invoice_type = models.CharField('发票类型', max_length=20, default='专票')
    company_name = models.CharField('我司名称', max_length=200, default='')
    project_code = models.CharField('项目编号', max_length=100, blank=True, default='')
    project_id = models.IntegerField('项目ID', null=True, blank=True)
    po = models.CharField('PO号', max_length=100, blank=True, default='')
    payment_term = models.IntegerField('账期(天)', null=True, blank=True)
    sales_manager = models.CharField('客户经理', max_length=100, default='')
    payment_date = models.DateField('到账日期', null=True, blank=True)
    payment_amount = models.DecimalField('到账金额', max_digits=15, decimal_places=2, null=True, blank=True)
    expected_payment_date = models.DateField('应到账日', null=True, blank=True)
    receivable_date = models.DateField('应收日', null=True, blank=True)
    status = models.CharField('状态', max_length=20, choices=LegacyInvoiceStatus.choices, default=LegacyInvoiceStatus.ISSUED)
    invoice_year = models.CharField('开票年', max_length=20, blank=True, default='')
    invoice_month = models.CharField('开票月', max_length=20, blank=True, default='')
    payment_year = models.CharField('到账年', max_length=20, blank=True, default='')
    payment_month = models.CharField('到账月', max_length=20, blank=True, default='')
    lims_report_submitted_at = models.DateTimeField('LIMS提交时间', null=True, blank=True)
    electronic_invoice_file = models.CharField('电子发票路径', max_length=500, blank=True, default='')
    electronic_invoice_file_name = models.CharField('电子发票文件名', max_length=200, blank=True, default='')
    electronic_invoice_uploaded_at = models.DateTimeField('电子发票上传时间', null=True, blank=True)
    electronic_invoice_download_count = models.IntegerField('下载次数', default=0)
    invoice_items_json = models.JSONField('发票明细(JSON)', default=list, blank=True)
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.invoice_no} - {self.customer_name}'
