"""
费用报销模型
"""
from django.db import models


class ExpenseType(models.TextChoices):
    TRAVEL = 'travel', '差旅'
    PROCUREMENT = 'procurement', '采购'
    ENTERTAINMENT = 'entertainment', '招待'
    OTHER = 'other', '其他'


class ExpenseApprovalStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SUBMITTED = 'submitted', '已提交'
    APPROVED = 'approved', '已审批'
    REJECTED = 'rejected', '已驳回'
    REIMBURSED = 'reimbursed', '已报销'


class ExpenseRequest(models.Model):
    """费用报销申请"""
    class Meta:
        db_table = 't_expense_request'
        verbose_name = '费用报销'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['applicant_id', 'approval_status']),
            models.Index(fields=['protocol_id', 'approval_status']),
        ]

    request_no = models.CharField('报销编号', max_length=50, unique=True, db_index=True)
    applicant_id = models.IntegerField('申请人ID', db_index=True)
    applicant_name = models.CharField('申请人', max_length=100, blank=True, default='')
    protocol_id = models.IntegerField('协议ID', null=True, blank=True, db_index=True)
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='')
    expense_type = models.CharField('费用类型', max_length=20, choices=ExpenseType.choices)
    amount = models.DecimalField('报销金额', max_digits=15, decimal_places=2)
    description = models.TextField('事由')
    receipt_count = models.IntegerField('票据数量', default=0)
    receipt_images = models.JSONField('票据图片', default=list, blank=True)
    approval_status = models.CharField('审批状态', max_length=20,
                                       choices=ExpenseApprovalStatus.choices,
                                       default=ExpenseApprovalStatus.DRAFT)
    budget_item = models.ForeignKey('finance.BudgetItem', on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='expense_requests')
    feishu_approval_id = models.CharField('飞书审批ID', max_length=100, blank=True, default='')
    approved_by_id = models.IntegerField('审批人ID', null=True, blank=True)
    approved_at = models.DateTimeField('审批时间', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.request_no} - {self.applicant_name}'
