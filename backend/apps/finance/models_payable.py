"""
应付管理模型
"""
from decimal import Decimal
from django.db import models


class PayableStatus(models.TextChoices):
    PENDING = 'pending', '待审批'
    APPROVED = 'approved', '已审批'
    PAID = 'paid', '已付款'
    CANCELLED = 'cancelled', '已取消'


class PayableRecord(models.Model):
    """应付记录"""
    class Meta:
        db_table = 't_payable_record'
        verbose_name = '应付记录'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['protocol_id', 'payment_status']),
            models.Index(fields=['due_date', 'payment_status']),
        ]

    record_no = models.CharField('应付编号', max_length=50, unique=True, db_index=True)
    protocol_id = models.IntegerField('协议ID', null=True, blank=True, db_index=True)
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='')
    supplier_name = models.CharField('供应商名称', max_length=200)
    supplier_id = models.IntegerField('供应商ID', null=True, blank=True)
    invoice_no = models.CharField('供应商发票号', max_length=100, blank=True, default='')
    amount = models.DecimalField('应付金额', max_digits=15, decimal_places=2)
    tax_amount = models.DecimalField('税额', max_digits=15, decimal_places=2, default=Decimal('0'))
    due_date = models.DateField('到期日')
    payment_status = models.CharField('状态', max_length=20, choices=PayableStatus.choices,
                                       default=PayableStatus.PENDING)
    paid_date = models.DateField('实付日期', null=True, blank=True)
    paid_amount = models.DecimalField('实付金额', max_digits=15, decimal_places=2, default=Decimal('0'))
    cost_type = models.CharField('成本类型', max_length=20, blank=True, default='')
    budget_item = models.ForeignKey('finance.BudgetItem', on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='payable_records')
    feishu_approval_id = models.CharField('飞书审批ID', max_length=100, blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.record_no} - {self.supplier_name}'
