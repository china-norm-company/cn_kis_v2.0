"""
费用报销模型
"""
from decimal import Decimal
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

    # 易快报溯源字段（来自 ekuaibao_integration）
    ekuaibao_id = models.CharField(
        '易快报内部ID', max_length=200, blank=True, default='', db_index=True,
        help_text='易快报 flowId，唯一标识来源单据',
    )
    ekuaibao_no = models.CharField(
        '易快报单号', max_length=100, blank=True, default='', db_index=True,
        help_text='如 B26000474，展示用',
    )
    import_batch_id = models.CharField(
        '导入批次号', max_length=50, blank=True, default='', db_index=True,
        help_text='对应 EkbImportBatch.batch_no，用于按批次回滚',
    )
    import_source = models.CharField(
        '数据来源', max_length=20, default='manual',
        help_text='manual（手动录入）| ekuaibao（易快报导入）',
    )

    # 业务关联字段（易快报导入时从 userProps 提取）
    linked_budget_no = models.CharField(
        '关联预算申请单号', max_length=100, blank=True, default='', db_index=True,
        help_text='对应 ProjectBudget.budget_no，如 S26000040；通过 expenseLink 关联',
    )
    cost_department = models.CharField(
        '费用承担部门', max_length=100, blank=True, default='',
        help_text='expenseDepartment.name，区别于申请人所属部门',
    )
    expense_template = models.CharField(
        '单据模板', max_length=100, blank=True, default='',
        help_text='specificationId.name，如"功效测试项目报销单"/"日常管理报销单"',
    )
    client_name = models.CharField(
        '客户名称', max_length=200, blank=True, default='',
        help_text='u_客户名称，如欧莱雅、联合利华；冗余字段便于直接展示',
    )
    approval_chain = models.JSONField(
        '审批轨迹', default=list, blank=True,
        help_text='从易快报 logs 提取的审批链，格式：[{action, node_name, operator_name, time}]',
    )
    ekuaibao_submitter_id = models.CharField(
        '易快报提交人ID', max_length=200, blank=True, default='',
        help_text='submitterId.id，用于关联到 Account.ekuaibao_staff_id',
    )

    # ── 支付与收款信息 ──────────────────────────────────────────────────────────
    submit_date = models.DateField(
        '提交日期', null=True, blank=True, db_index=True,
        help_text='单据原始提交日期（历史数据保留）',
    )
    payment_amount = models.DecimalField(
        '支付金额', max_digits=15, decimal_places=2, null=True, blank=True,
        help_text='实际出账金额',
    )
    payment_date = models.DateField(
        '支付日期', null=True, blank=True,
        help_text='资金出账日期',
    )
    payment_method = models.CharField(
        '支付方式', max_length=50, blank=True, default='',
    )
    payee_name = models.CharField(
        '收款户名', max_length=200, blank=True, default='',
    )
    payee_account = models.CharField(
        '收款账号', max_length=100, blank=True, default='', db_index=True,
    )
    payee_bank = models.CharField(
        '开户行', max_length=100, blank=True, default='',
    )
    payee_bank_branch = models.CharField(
        '开户网点', max_length=200, blank=True, default='',
    )
    payee_province = models.CharField(
        '开户行所在省', max_length=50, blank=True, default='',
    )
    payee_city = models.CharField(
        '开户行所在市', max_length=50, blank=True, default='',
    )
    payee_account_type = models.CharField(
        '账户类型', max_length=20, blank=True, default='',
        help_text='个人 / 对公',
    )

    # ── 票据与凭证信息 ──────────────────────────────────────────────────────────
    invoice_count = models.IntegerField('发票张数', default=0)
    voucher_no = models.CharField('凭证号', max_length=100, blank=True, default='')
    account_period = models.CharField('会计期间', max_length=20, blank=True, default='')

    # ── 软删除 + 原始数据保留 ───────────────────────────────────────────────────
    is_deleted = models.BooleanField('已删除', default=False, db_index=True)
    excel_raw_data = models.JSONField(
        '原始Excel行数据', default=dict, blank=True,
        help_text='NAS Excel导入时保存的完整125列原始行数据',
    )

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.request_no} - {self.applicant_name}'
