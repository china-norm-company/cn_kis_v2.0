"""
财务管理模型（管仲模块）

完整 CRO 财务管理：
- 报价管理（Quote）
- 合同管理（Contract）
- 预算管理（BudgetCategory / ProjectBudget / BudgetItem）
- 成本核算（CostRecord）
- 发票管理（Invoice / InvoiceItem）
- 回款管理（Payment + PaymentPlan / PaymentRecord / OverdueFollowup）
- 财务分析（FinancialReport / ProfitAnalysis / CashFlowRecord）

迁移来源：cn_kis_test FIN001-FIN005 场景
"""
from decimal import Decimal
from django.db import models


# ============================================================================
# 报价管理
# ============================================================================
class QuoteStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SENT = 'sent', '已发送'
    ACCEPTED = 'accepted', '已接受'
    REJECTED = 'rejected', '已拒绝'
    EXPIRED = 'expired', '已过期'


class Quote(models.Model):
    """报价"""

    class Meta:
        db_table = 't_quote'
        verbose_name = '报价'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['client', 'status']),
        ]

    code = models.CharField('报价编号', max_length=50, unique=True)
    project = models.CharField('项目名称', max_length=300)
    client = models.CharField('客户', max_length=200)
    total_amount = models.DecimalField('报价金额', max_digits=14, decimal_places=2)
    status = models.CharField('状态', max_length=20, choices=QuoteStatus.choices, default=QuoteStatus.DRAFT)
    created_at = models.DateField('创建日期')
    valid_until = models.DateField('有效期至', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    # FK 关联（可选，兼容旧数据）
    protocol_id = models.IntegerField('协议ID', null=True, blank=True, db_index=True,
                                       help_text='关联 t_protocol')
    client_id = models.IntegerField('客户ID', null=True, blank=True, db_index=True,
                                     help_text='关联 t_client')

    # 权限相关
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    create_time = models.DateTimeField('系统创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)
    version = models.IntegerField('版本', default=1)
    parent_quote = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True,
                                     related_name='revisions', verbose_name='原始报价')

    def __str__(self):
        return f'{self.code} - {self.project}'


class QuoteItem(models.Model):
    """报价明细行"""
    class Meta:
        db_table = 't_quote_item'
        verbose_name = '报价明细'
        ordering = ['sort_order']

    quote = models.ForeignKey(Quote, on_delete=models.CASCADE,
                              related_name='items', verbose_name='报价')
    item_name = models.CharField('项目名称', max_length=200)
    specification = models.CharField('规格型号', max_length=100, blank=True, default='')
    unit = models.CharField('单位', max_length=20, blank=True, default='')
    quantity = models.DecimalField('数量', max_digits=10, decimal_places=2, default=Decimal('1'))
    unit_price = models.DecimalField('单价', max_digits=15, decimal_places=4, default=Decimal('0'))
    amount = models.DecimalField('金额', max_digits=15, decimal_places=2, default=Decimal('0'))
    cost_estimate = models.DecimalField('成本估算', max_digits=15, decimal_places=2, null=True, blank=True)
    sort_order = models.IntegerField('排序', default=0)

    def __str__(self):
        return f'{self.quote.code} - {self.item_name}'


# ============================================================================
# 合同管理
# ============================================================================
class ContractStatus(models.TextChoices):
    NEGOTIATING = 'negotiating', '谈判中'
    SIGNED = 'signed', '已签署'
    ACTIVE = 'active', '执行中'
    COMPLETED = 'completed', '已完成'
    TERMINATED = 'terminated', '已终止'


class Contract(models.Model):
    """合同"""

    class Meta:
        db_table = 't_contract'
        verbose_name = '合同'
        ordering = ['-signed_date']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['client', 'status']),
        ]

    code = models.CharField('合同编号', max_length=50, unique=True)
    project = models.CharField('项目名称', max_length=300)
    client = models.CharField('客户', max_length=200)
    amount = models.DecimalField('合同金额', max_digits=14, decimal_places=2)
    signed_date = models.DateField('签署日期', null=True, blank=True)
    start_date = models.DateField('开始日期', null=True, blank=True)
    end_date = models.DateField('到期日', null=True, blank=True)
    status = models.CharField('状态', max_length=20, choices=ContractStatus.choices, default=ContractStatus.NEGOTIATING)
    feishu_approval_id = models.CharField('飞书审批ID', max_length=100, blank=True, default='')
    notes = models.TextField('备注', blank=True, default='')

    # FK 关联
    protocol_id = models.IntegerField('协议ID', null=True, blank=True, db_index=True,
                                       help_text='关联 t_protocol')
    client_id = models.IntegerField('客户ID', null=True, blank=True, db_index=True,
                                     help_text='关联 t_client')
    quote = models.ForeignKey('Quote', on_delete=models.SET_NULL, null=True, blank=True,
                              related_name='contracts', verbose_name='关联报价')

    # 权限相关
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    create_time = models.DateTimeField('系统创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.code} - {self.project}'


class ContractPaymentTerm(models.Model):
    """合同付款条款"""
    class Meta:
        db_table = 't_contract_payment_term'
        verbose_name = '合同付款条款'
        ordering = ['sort_order']

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE,
                                 related_name='payment_terms', verbose_name='合同')
    milestone = models.CharField('里程碑', max_length=200)
    percentage = models.DecimalField('比例(%)', max_digits=5, decimal_places=2, default=Decimal('0'))
    amount = models.DecimalField('金额', max_digits=15, decimal_places=2, default=Decimal('0'))
    payment_days = models.IntegerField('账期(天)', default=30, help_text='到票后N天内付款')
    trigger_condition = models.TextField('触发条件', blank=True, default='')
    sort_order = models.IntegerField('排序', default=0)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.contract.code} - {self.milestone}'


class ContractChangeType(models.TextChoices):
    AMOUNT = 'amount_change', '金额变更'
    SCOPE = 'scope_change', '范围变更'
    TERM = 'term_change', '条款变更'
    OTHER = 'other', '其他变更'


class ContractChangeStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SUBMITTED = 'submitted', '已提交'
    APPROVED = 'approved', '已批准'
    REJECTED = 'rejected', '已驳回'


class ContractChange(models.Model):
    """合同变更"""
    class Meta:
        db_table = 't_contract_change'
        verbose_name = '合同变更'
        ordering = ['-create_time']

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE,
                                 related_name='changes', verbose_name='合同')
    change_no = models.CharField('变更编号', max_length=50, unique=True, db_index=True)
    change_type = models.CharField('变更类型', max_length=20,
                                   choices=ContractChangeType.choices)
    original_amount = models.DecimalField('原金额', max_digits=15, decimal_places=2,
                                          null=True, blank=True)
    new_amount = models.DecimalField('新金额', max_digits=15, decimal_places=2,
                                     null=True, blank=True)
    reason = models.TextField('变更原因')
    description = models.TextField('变更描述', blank=True, default='')
    approval_status = models.CharField('审批状态', max_length=20,
                                       choices=ContractChangeStatus.choices,
                                       default=ContractChangeStatus.DRAFT)
    feishu_approval_id = models.CharField('飞书审批ID', max_length=100, blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.change_no} - {self.contract.code}'


# ============================================================================
# 发票管理
# ============================================================================
class InvoiceStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SUBMITTED = 'submitted', '已提交'
    APPROVED = 'approved', '已审批'
    SENT = 'sent', '已寄出'
    PAID = 'paid', '已回款'
    VOIDED = 'voided', '已作废'
    CREDITED = 'credited', '已红冲'


class InvoiceType(models.TextChoices):
    MILESTONE = 'milestone', '里程碑'
    MONTHLY = 'monthly', '月度'
    FINAL = 'final', '结项'


class Invoice(models.Model):
    """发票"""

    class Meta:
        db_table = 't_invoice'
        verbose_name = '发票'
        ordering = ['-invoice_date']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['contract', 'status']),
        ]

    code = models.CharField('发票编号', max_length=50, unique=True)
    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name='invoices', verbose_name='关联合同')
    client = models.CharField('客户', max_length=200)
    amount = models.DecimalField('不含税金额', max_digits=14, decimal_places=2)
    tax_amount = models.DecimalField('税额', max_digits=14, decimal_places=2)
    total = models.DecimalField('含税金额', max_digits=14, decimal_places=2)
    type = models.CharField('类型', max_length=20, choices=InvoiceType.choices)
    status = models.CharField('状态', max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.DRAFT)
    invoice_date = models.DateField('开票日期', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    # 权限相关
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    create_time = models.DateTimeField('系统创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.code} - ¥{self.total}'


# ============================================================================
# 回款管理
# ============================================================================
class PaymentStatus(models.TextChoices):
    EXPECTED = 'expected', '待回款'
    PARTIAL = 'partial', '部分回'
    FULL = 'full', '已到账'
    OVERDUE = 'overdue', '已逾期'


class Payment(models.Model):
    """回款"""

    class Meta:
        db_table = 't_payment'
        verbose_name = '回款'
        ordering = ['-payment_date']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['invoice', 'status']),
        ]

    code = models.CharField('回款编号', max_length=50, unique=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='payments', verbose_name='关联发票')
    client = models.CharField('客户', max_length=200)
    expected_amount = models.DecimalField('应收金额', max_digits=14, decimal_places=2)
    actual_amount = models.DecimalField('实收金额', max_digits=14, decimal_places=2, null=True, blank=True)
    payment_date = models.DateField('到账日', null=True, blank=True)
    method = models.CharField('付款方式', max_length=50, blank=True, default='')
    status = models.CharField('状态', max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.EXPECTED)
    days_overdue = models.IntegerField('逾期天数', default=0)
    notes = models.TextField('备注', blank=True, default='')

    # 权限相关
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True, help_text='Account ID')

    create_time = models.DateTimeField('系统创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)
    is_deleted = models.BooleanField('已删除', default=False)

    def __str__(self):
        return f'{self.code} - {self.status}'


# ============================================================================
# 预算管理（FIN001）
# ============================================================================
class BudgetCategoryType(models.TextChoices):
    INCOME = 'income', '收入'
    COST = 'cost', '成本'
    EXPENSE = 'expense', '费用'


class BudgetCategory(models.Model):
    """预算科目"""

    class Meta:
        db_table = 't_budget_category'
        verbose_name = '预算科目'
        ordering = ['sort_order', 'code']

    code = models.CharField('科目编码', max_length=50, unique=True, db_index=True)
    name = models.CharField('科目名称', max_length=100)
    description = models.TextField('描述', blank=True, default='')
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True,
                               related_name='children', verbose_name='上级科目')
    level = models.IntegerField('层级', default=1)
    path = models.CharField('路径', max_length=500, blank=True, default='')
    category_type = models.CharField('科目类型', max_length=20, choices=BudgetCategoryType.choices)
    is_active = models.BooleanField('是否启用', default=True)
    sort_order = models.IntegerField('排序', default=0)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.code} - {self.name}'


class BudgetStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    PENDING = 'pending', '待审批'
    APPROVED = 'approved', '已批准'
    REJECTED = 'rejected', '已驳回'
    EXECUTING = 'executing', '执行中'
    COMPLETED = 'completed', '已完成'
    CANCELLED = 'cancelled', '已取消'


class ProjectBudget(models.Model):
    """项目预算"""

    class Meta:
        db_table = 't_project_budget'
        verbose_name = '项目预算'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['protocol_id', 'status']),
            models.Index(fields=['budget_year', 'status']),
        ]

    budget_no = models.CharField('预算编号', max_length=50, unique=True, db_index=True)
    budget_name = models.CharField('预算名称', max_length=200)
    status = models.CharField('状态', max_length=20, choices=BudgetStatus.choices,
                              default=BudgetStatus.DRAFT)

    # 关联协议/项目
    protocol_id = models.IntegerField('协议ID', db_index=True, help_text='关联 t_protocol')
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='')
    client_id = models.IntegerField('客户ID', null=True, blank=True)
    client_name = models.CharField('客户名称', max_length=200, blank=True, default='')

    # 预算期间
    budget_year = models.IntegerField('预算年度')
    start_date = models.DateField('开始日期')
    end_date = models.DateField('结束日期')

    # 预算金额
    total_income = models.DecimalField('预算收入', max_digits=15, decimal_places=2, default=Decimal('0'))
    total_cost = models.DecimalField('预算成本', max_digits=15, decimal_places=2, default=Decimal('0'))
    total_expense = models.DecimalField('预算费用', max_digits=15, decimal_places=2, default=Decimal('0'))
    gross_profit = models.DecimalField('预算毛利', max_digits=15, decimal_places=2, default=Decimal('0'))
    gross_margin = models.DecimalField('预算毛利率(%)', max_digits=5, decimal_places=2, default=Decimal('0'))

    # 实际金额（执行中更新）
    actual_income = models.DecimalField('实际收入', max_digits=15, decimal_places=2, default=Decimal('0'))
    actual_cost = models.DecimalField('实际成本', max_digits=15, decimal_places=2, default=Decimal('0'))
    actual_expense = models.DecimalField('实际费用', max_digits=15, decimal_places=2, default=Decimal('0'))

    # 版本
    version = models.IntegerField('版本', default=1)
    version_note = models.TextField('版本说明', blank=True, default='')

    # 审批
    submitted_at = models.DateTimeField('提交时间', null=True, blank=True)
    approved_at = models.DateTimeField('审批时间', null=True, blank=True)
    approved_by_id = models.IntegerField('审批人ID', null=True, blank=True)
    approval_notes = models.TextField('审批意见', blank=True, default='')
    feishu_approval_id = models.CharField('飞书审批实例ID', max_length=100, blank=True, default='')

    notes = models.TextField('备注', blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)

    # 易快报溯源字段
    ekuaibao_budget_id = models.CharField(
        '易快报预算ID', max_length=200, blank=True, default='', db_index=True,
    )
    import_batch_id = models.CharField('导入批次号', max_length=50, blank=True, default='')
    import_source = models.CharField('数据来源', max_length=20, default='manual')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.budget_no} - {self.budget_name}'


class BudgetItem(models.Model):
    """预算明细"""

    class Meta:
        db_table = 't_budget_item'
        verbose_name = '预算明细'
        unique_together = [['budget', 'category']]

    budget = models.ForeignKey(ProjectBudget, on_delete=models.CASCADE,
                               related_name='items', verbose_name='预算')
    category = models.ForeignKey(BudgetCategory, on_delete=models.PROTECT,
                                 related_name='budget_items', verbose_name='预算科目')
    budget_amount = models.DecimalField('预算金额', max_digits=15, decimal_places=2, default=Decimal('0'))
    actual_amount = models.DecimalField('实际金额', max_digits=15, decimal_places=2, default=Decimal('0'))
    variance = models.DecimalField('差异', max_digits=15, decimal_places=2, default=Decimal('0'))
    variance_rate = models.DecimalField('差异率(%)', max_digits=5, decimal_places=2, default=Decimal('0'))
    description = models.TextField('说明', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.budget.budget_no} - {self.category.name}'


class BudgetAdjustmentStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    SUBMITTED = 'submitted', '已提交'
    APPROVED = 'approved', '已批准'
    REJECTED = 'rejected', '已驳回'


class BudgetAdjustment(models.Model):
    """预算调整申请"""
    class Meta:
        db_table = 't_budget_adjustment'
        verbose_name = '预算调整'
        ordering = ['-create_time']

    adjustment_no = models.CharField('调整编号', max_length=50, unique=True, db_index=True)
    budget = models.ForeignKey(ProjectBudget, on_delete=models.CASCADE,
                               related_name='adjustments', verbose_name='预算')
    budget_item = models.ForeignKey(BudgetItem, on_delete=models.CASCADE,
                                    related_name='adjustments', verbose_name='预算明细')
    original_amount = models.DecimalField('原预算金额', max_digits=15, decimal_places=2)
    adjusted_amount = models.DecimalField('调整后金额', max_digits=15, decimal_places=2)
    reason = models.TextField('调整原因')
    status = models.CharField('状态', max_length=20, choices=BudgetAdjustmentStatus.choices,
                              default=BudgetAdjustmentStatus.DRAFT)
    feishu_approval_id = models.CharField('飞书审批ID', max_length=100, blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    approved_by_id = models.IntegerField('审批人ID', null=True, blank=True)
    approved_at = models.DateTimeField('审批时间', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.adjustment_no}'


# ============================================================================
# 成本核算（FIN002）
# ============================================================================
class CostType(models.TextChoices):
    LABOR = 'labor', '人工成本'
    MATERIAL = 'material', '材料成本'
    EQUIPMENT = 'equipment', '设备成本'
    OUTSOURCE = 'outsource', '外包成本'
    TRAVEL = 'travel', '差旅成本'
    OTHER = 'other', '其他成本'


class CostRecordStatus(models.TextChoices):
    PENDING = 'pending', '待确认'
    CONFIRMED = 'confirmed', '已确认'
    CANCELLED = 'cancelled', '已取消'


class CostRecord(models.Model):
    """成本记录"""

    class Meta:
        db_table = 't_cost_record'
        verbose_name = '成本记录'
        ordering = ['-cost_date']
        indexes = [
            models.Index(fields=['protocol_id', 'cost_type']),
            models.Index(fields=['cost_date', 'status']),
        ]

    record_no = models.CharField('记录编号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=CostRecordStatus.choices,
                              default=CostRecordStatus.PENDING)

    # 关联
    protocol_id = models.IntegerField('协议ID', db_index=True, help_text='关联 t_protocol')
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='')
    budget = models.ForeignKey(ProjectBudget, on_delete=models.SET_NULL,
                               null=True, blank=True, related_name='cost_records', verbose_name='预算')
    budget_item = models.ForeignKey(BudgetItem, on_delete=models.SET_NULL,
                                    null=True, blank=True, related_name='cost_records', verbose_name='预算明细')

    # 成本信息
    cost_type = models.CharField('成本类型', max_length=20, choices=CostType.choices)
    cost_date = models.DateField('成本日期')
    amount = models.DecimalField('金额', max_digits=15, decimal_places=2)
    description = models.TextField('描述', blank=True, default='')
    reference_no = models.CharField('参考单号', max_length=100, blank=True, default='',
                                     help_text='关联的工单/采购单')
    reference_type = models.CharField('参考类型', max_length=50, blank=True, default='')

    # 人工成本
    staff_id = models.IntegerField('员工ID', null=True, blank=True)
    staff_name = models.CharField('员工姓名', max_length=100, blank=True, default='')
    work_hours = models.DecimalField('工时', max_digits=6, decimal_places=2, null=True, blank=True)
    hourly_rate = models.DecimalField('时薪', max_digits=10, decimal_places=2, null=True, blank=True)

    # 确认
    confirmed_by_id = models.IntegerField('确认人ID', null=True, blank=True)
    confirmed_at = models.DateTimeField('确认时间', null=True, blank=True)

    notes = models.TextField('备注', blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.record_no} - {self.cost_type}'


# ============================================================================
# 发票明细（FIN003 增强）
# ============================================================================
class InvoiceItem(models.Model):
    """发票明细行"""

    class Meta:
        db_table = 't_invoice_item'
        verbose_name = '发票明细'

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE,
                                related_name='items', verbose_name='发票')
    item_name = models.CharField('项目名称', max_length=200)
    specification = models.CharField('规格型号', max_length=100, blank=True, default='')
    unit = models.CharField('单位', max_length=20, blank=True, default='')
    quantity = models.DecimalField('数量', max_digits=10, decimal_places=2, default=Decimal('1'))
    unit_price = models.DecimalField('单价', max_digits=15, decimal_places=4, default=Decimal('0'))
    amount = models.DecimalField('金额', max_digits=15, decimal_places=2, default=Decimal('0'))
    tax_rate = models.DecimalField('税率(%)', max_digits=5, decimal_places=2, default=Decimal('6'))
    tax_amount = models.DecimalField('税额', max_digits=15, decimal_places=2, default=Decimal('0'))

    def __str__(self):
        return f'{self.invoice.code} - {self.item_name}'


# ============================================================================
# 收付款计划（FIN004 增强）
# ============================================================================
class PaymentPlanStatus(models.TextChoices):
    PENDING = 'pending', '待回款'
    PARTIAL = 'partial', '部分回款'
    COMPLETED = 'completed', '已完成'
    OVERDUE = 'overdue', '已逾期'
    CANCELLED = 'cancelled', '已取消'


class PaymentPlan(models.Model):
    """回款计划"""

    class Meta:
        db_table = 't_payment_plan'
        verbose_name = '回款计划'
        ordering = ['planned_date']
        indexes = [
            models.Index(fields=['protocol_id', 'status']),
            models.Index(fields=['planned_date', 'status']),
        ]

    plan_no = models.CharField('计划编号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=PaymentPlanStatus.choices,
                              default=PaymentPlanStatus.PENDING)

    # 关联
    protocol_id = models.IntegerField('协议ID', db_index=True, help_text='关联 t_protocol')
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='')
    contract = models.ForeignKey(Contract, on_delete=models.SET_NULL,
                                 null=True, blank=True, related_name='payment_plans', verbose_name='合同')
    client_id = models.IntegerField('客户ID', null=True, blank=True)
    client_name = models.CharField('客户名称', max_length=200, blank=True, default='')

    # 计划
    milestone = models.CharField('里程碑', max_length=200, blank=True, default='',
                                  help_text='如：首付款、中期款、尾款')
    planned_date = models.DateField('计划回款日期')
    planned_amount = models.DecimalField('计划金额', max_digits=15, decimal_places=2)
    received_amount = models.DecimalField('已回款金额', max_digits=15, decimal_places=2, default=Decimal('0'))
    remaining_amount = models.DecimalField('剩余金额', max_digits=15, decimal_places=2, default=Decimal('0'))

    # 关联发票
    invoice = models.ForeignKey(Invoice, on_delete=models.SET_NULL,
                                null=True, blank=True, related_name='payment_plans', verbose_name='发票')

    # 负责人
    responsible_id = models.IntegerField('负责人ID', null=True, blank=True)
    responsible_name = models.CharField('负责人', max_length=100, blank=True, default='')

    # 逾期
    overdue_days = models.IntegerField('逾期天数', default=0)
    last_followup_date = models.DateField('最后跟进日期', null=True, blank=True)

    notes = models.TextField('备注', blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.plan_no} - {self.client_name}'


class PaymentMethodChoices(models.TextChoices):
    BANK_TRANSFER = 'bank_transfer', '银行转账'
    CHECK = 'check', '支票'
    CASH = 'cash', '现金'
    WECHAT = 'wechat', '微信支付'
    ALIPAY = 'alipay', '支付宝'
    OTHER = 'other', '其他'


class PaymentRecordStatus(models.TextChoices):
    PENDING = 'pending', '待确认'
    CONFIRMED = 'confirmed', '已确认'
    CANCELLED = 'cancelled', '已取消'


class PaymentRecord(models.Model):
    """回款记录（实际到账）"""

    class Meta:
        db_table = 't_payment_record'
        verbose_name = '回款记录'
        ordering = ['-payment_date']
        indexes = [
            models.Index(fields=['protocol_id', 'status']),
            models.Index(fields=['payment_date']),
        ]

    record_no = models.CharField('记录编号', max_length=50, unique=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=PaymentRecordStatus.choices,
                              default=PaymentRecordStatus.PENDING)

    payment_plan = models.ForeignKey(PaymentPlan, on_delete=models.SET_NULL,
                                     null=True, blank=True, related_name='records', verbose_name='回款计划')
    protocol_id = models.IntegerField('协议ID', db_index=True)
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='')
    client_id = models.IntegerField('客户ID', null=True, blank=True)
    client_name = models.CharField('客户名称', max_length=200, blank=True, default='')

    # 回款信息
    payment_date = models.DateField('回款日期')
    amount = models.DecimalField('回款金额', max_digits=15, decimal_places=2)
    payment_method = models.CharField('支付方式', max_length=20,
                                       choices=PaymentMethodChoices.choices,
                                       default=PaymentMethodChoices.BANK_TRANSFER)
    bank_name = models.CharField('银行名称', max_length=100, blank=True, default='')
    bank_account = models.CharField('银行账号', max_length=100, blank=True, default='')
    bank_serial = models.CharField('银行流水号', max_length=100, blank=True, default='')

    # 关联发票
    invoice = models.ForeignKey(Invoice, on_delete=models.SET_NULL,
                                null=True, blank=True, related_name='payment_records', verbose_name='发票')

    # 确认
    confirmed_by_id = models.IntegerField('确认人ID', null=True, blank=True)
    confirmed_at = models.DateTimeField('确认时间', null=True, blank=True)

    notes = models.TextField('备注', blank=True, default='')
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.record_no} - ¥{self.amount}'


class OverdueFollowup(models.Model):
    """逾期跟进记录"""

    class Meta:
        db_table = 't_overdue_followup'
        verbose_name = '逾期跟进'
        ordering = ['-followup_date']

    FOLLOWUP_TYPE_CHOICES = [
        ('phone', '电话'), ('email', '邮件'), ('visit', '拜访'),
        ('letter', '函件'), ('other', '其他'),
    ]
    RESULT_CHOICES = [
        ('promise_pay', '承诺付款'), ('partial_pay', '部分付款'),
        ('dispute', '有争议'), ('unable_pay', '无力支付'),
        ('no_response', '无回应'), ('other', '其他'),
    ]

    payment_plan = models.ForeignKey(PaymentPlan, on_delete=models.CASCADE,
                                     related_name='followups', verbose_name='回款计划')
    followup_date = models.DateField('跟进日期')
    followup_type = models.CharField('跟进方式', max_length=20, choices=FOLLOWUP_TYPE_CHOICES)
    contact_person = models.CharField('联系人', max_length=100, blank=True, default='')
    content = models.TextField('跟进内容')
    result = models.CharField('跟进结果', max_length=20, choices=RESULT_CHOICES)
    promise_date = models.DateField('承诺付款日期', null=True, blank=True)
    promise_amount = models.DecimalField('承诺金额', max_digits=15, decimal_places=2,
                                          null=True, blank=True)
    next_followup_date = models.DateField('下次跟进日期', null=True, blank=True)
    next_followup_plan = models.TextField('下次跟进计划', blank=True, default='')
    followed_by_id = models.IntegerField('跟进人ID', null=True, blank=True)

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.payment_plan.plan_no} - {self.followup_date}'


# ============================================================================
# 财务分析（FIN005）
# ============================================================================
class FinancialReportType(models.TextChoices):
    PROJECT_PROFIT = 'project_profit', '项目盈利报表'
    MONTHLY_SUMMARY = 'monthly_summary', '月度汇总'
    QUARTERLY_SUMMARY = 'quarterly_summary', '季度汇总'
    ANNUAL_SUMMARY = 'annual_summary', '年度汇总'
    CASH_FLOW = 'cash_flow', '现金流报表'
    AR_AGING = 'ar_aging', '应收账龄'
    CUSTOM = 'custom', '自定义报表'


class FinancialReportStatus(models.TextChoices):
    DRAFT = 'draft', '草稿'
    GENERATED = 'generated', '已生成'
    PUBLISHED = 'published', '已发布'


class FinancialReport(models.Model):
    """财务报表"""

    class Meta:
        db_table = 't_financial_report'
        verbose_name = '财务报表'
        ordering = ['-create_time']
        indexes = [
            models.Index(fields=['report_type', 'status']),
            models.Index(fields=['period_start', 'period_end']),
        ]

    report_no = models.CharField('报表编号', max_length=50, unique=True, db_index=True)
    report_name = models.CharField('报表名称', max_length=200)
    report_type = models.CharField('报表类型', max_length=30,
                                    choices=FinancialReportType.choices)
    status = models.CharField('状态', max_length=20,
                              choices=FinancialReportStatus.choices,
                              default=FinancialReportStatus.DRAFT)

    # 期间
    period_type = models.CharField('期间类型', max_length=20, blank=True, default='',
                                    help_text='month/quarter/year')
    period_start = models.DateField('开始日期')
    period_end = models.DateField('结束日期')

    # 项目（可选）
    protocol_id = models.IntegerField('协议ID', null=True, blank=True)
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='')

    # 数据
    report_data = models.JSONField('报表数据', default=dict, blank=True)
    total_income = models.DecimalField('总收入', max_digits=15, decimal_places=2, default=Decimal('0'))
    total_cost = models.DecimalField('总成本', max_digits=15, decimal_places=2, default=Decimal('0'))
    total_expense = models.DecimalField('总费用', max_digits=15, decimal_places=2, default=Decimal('0'))
    gross_profit = models.DecimalField('毛利', max_digits=15, decimal_places=2, default=Decimal('0'))
    net_profit = models.DecimalField('净利润', max_digits=15, decimal_places=2, default=Decimal('0'))
    gross_margin = models.DecimalField('毛利率(%)', max_digits=5, decimal_places=2, default=Decimal('0'))
    net_margin = models.DecimalField('净利率(%)', max_digits=5, decimal_places=2, default=Decimal('0'))

    # 飞书
    feishu_doc_token = models.CharField('飞书文档token', max_length=200, blank=True, default='')

    generated_at = models.DateTimeField('生成时间', null=True, blank=True)
    generated_by_id = models.IntegerField('生成人ID', null=True, blank=True)
    notes = models.TextField('备注', blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.report_no} - {self.report_name}'


class ProfitAnalysis(models.Model):
    """盈利分析"""

    class Meta:
        db_table = 't_profit_analysis'
        verbose_name = '盈利分析'
        unique_together = [['protocol_id', 'analysis_date', 'period_type']]
        ordering = ['-analysis_date']
        indexes = [
            models.Index(fields=['protocol_id', 'analysis_date']),
        ]

    analysis_date = models.DateField('分析日期')
    period_type = models.CharField('期间类型', max_length=20, help_text='month/quarter/year')
    protocol_id = models.IntegerField('协议ID', db_index=True)
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='')

    # 收入
    contract_amount = models.DecimalField('合同金额', max_digits=15, decimal_places=2, default=Decimal('0'))
    invoiced_amount = models.DecimalField('已开票金额', max_digits=15, decimal_places=2, default=Decimal('0'))
    received_amount = models.DecimalField('已回款金额', max_digits=15, decimal_places=2, default=Decimal('0'))

    # 成本明细
    labor_cost = models.DecimalField('人工成本', max_digits=15, decimal_places=2, default=Decimal('0'))
    material_cost = models.DecimalField('材料成本', max_digits=15, decimal_places=2, default=Decimal('0'))
    equipment_cost = models.DecimalField('设备成本', max_digits=15, decimal_places=2, default=Decimal('0'))
    outsource_cost = models.DecimalField('外包成本', max_digits=15, decimal_places=2, default=Decimal('0'))
    other_cost = models.DecimalField('其他成本', max_digits=15, decimal_places=2, default=Decimal('0'))
    total_cost = models.DecimalField('总成本', max_digits=15, decimal_places=2, default=Decimal('0'))

    # 利润
    gross_profit = models.DecimalField('毛利', max_digits=15, decimal_places=2, default=Decimal('0'))
    gross_margin = models.DecimalField('毛利率(%)', max_digits=5, decimal_places=2, default=Decimal('0'))

    # 预算对比
    budget_cost = models.DecimalField('预算成本', max_digits=15, decimal_places=2, default=Decimal('0'))
    cost_variance = models.DecimalField('成本差异', max_digits=15, decimal_places=2, default=Decimal('0'))
    cost_variance_rate = models.DecimalField('成本差异率(%)', max_digits=5, decimal_places=2, default=Decimal('0'))

    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.project_name} - {self.analysis_date}'


class CashFlowType(models.TextChoices):
    INFLOW = 'inflow', '流入'
    OUTFLOW = 'outflow', '流出'


class CashFlowCategory(models.TextChoices):
    OPERATING = 'operating', '经营活动'
    INVESTING = 'investing', '投资活动'
    FINANCING = 'financing', '筹资活动'


class CashFlowRecord(models.Model):
    """现金流记录"""

    class Meta:
        db_table = 't_cash_flow_record'
        verbose_name = '现金流记录'
        ordering = ['-record_date']
        indexes = [
            models.Index(fields=['record_date', 'flow_type']),
            models.Index(fields=['category', 'record_date']),
        ]

    record_date = models.DateField('记录日期')
    flow_type = models.CharField('流向', max_length=20, choices=CashFlowType.choices)
    category = models.CharField('类别', max_length=20, choices=CashFlowCategory.choices)
    amount = models.DecimalField('金额', max_digits=15, decimal_places=2)
    protocol_id = models.IntegerField('协议ID', null=True, blank=True)
    project_name = models.CharField('项目名称', max_length=200, blank=True, default='')
    description = models.TextField('描述', blank=True, default='')
    reference_no = models.CharField('参考单号', max_length=100, blank=True, default='')
    reference_type = models.CharField('参考类型', max_length=50, blank=True, default='')

    create_time = models.DateTimeField('创建时间', auto_now_add=True)

    def __str__(self):
        return f'{self.record_date} - {self.flow_type} - ¥{self.amount}'


# ============================================================================
# 客户管理（发票管理（新））
# ============================================================================
class Client(models.Model):
    """客户（财务管理专用，维护客户名称与账期；表名 t_finance_client 避免与 CRM t_client 冲突）"""

    class Meta:
        db_table = 't_finance_client'
        verbose_name = '客户'
        ordering = ['customer_code']
        indexes = [
            models.Index(fields=['customer_code']),
            models.Index(fields=['is_active']),
        ]

    customer_code = models.CharField('客户编号', max_length=50, db_index=True)
    customer_name = models.CharField('客户名称', max_length=200)
    short_name = models.CharField('简称', max_length=100, blank=True, default='')
    payment_term_days = models.IntegerField('账期(天)', default=30)
    payment_term_description = models.CharField('账期描述', max_length=100, blank=True, default='')
    remark = models.TextField('备注', blank=True, default='')
    is_active = models.BooleanField('启用', default=True)
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'{self.customer_code} - {self.customer_name}'


# ============================================================================
# 开票申请（发票管理（新））
# ============================================================================
class InvoiceRequestStatus(models.TextChoices):
    PENDING = 'pending', '待处理'
    PROCESSING = 'processing', '处理中'
    COMPLETED = 'completed', '已完成'
    CANCELLED = 'cancelled', '已取消'


class InvoiceRequestInvoiceType(models.TextChoices):
    """发票类型"""
    VAT_SPECIAL = 'vat_special', '增值税专用发票'
    PROFORMA = 'proforma', '形式发票'


class InvoiceRequestAmountType(models.TextChoices):
    """金额类型：客户确认的是不含税金额还是含税金额；票面与展示统一为含税金额"""
    EXCLUSIVE_OF_TAX = 'exclusive_of_tax', '不含税（需按税率折算含税）'
    INCLUSIVE_OF_TAX = 'inclusive_of_tax', '含税'


class InvoiceRequest(models.Model):
    """开票申请"""

    class Meta:
        db_table = 't_invoice_request'
        verbose_name = '开票申请'
        ordering = ['-request_date', '-create_time']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['request_by_id', 'status']),
            models.Index(fields=['request_date']),
        ]

    request_date = models.DateField('申请日期')
    customer_name = models.CharField('客户名称', max_length=200)
    invoice_type = models.CharField(
        '发票类型', max_length=20,
        choices=InvoiceRequestInvoiceType.choices,
        default=InvoiceRequestInvoiceType.VAT_SPECIAL,
    )
    amount_type = models.CharField(
        '金额类型', max_length=20,
        choices=InvoiceRequestAmountType.choices,
        default=InvoiceRequestAmountType.INCLUSIVE_OF_TAX,
        help_text='客户确认的金额为不含税时选不含税，系统按税率折算含税；票面与展示均为含税金额',
    )
    tax_rate = models.DecimalField(
        '税率', max_digits=5, decimal_places=4, default=Decimal('0.06'),
        help_text='如 0.06 表示 6%，用于不含税→含税折算',
    )
    po = models.CharField('PO号', max_length=100, blank=True, default='')
    total_amount = models.DecimalField(
        '总金额（含税）', max_digits=15, decimal_places=2, default=Decimal('0'),
        help_text='票面/展示用含税总金额',
    )
    request_by = models.CharField('申请人姓名', max_length=100, blank=True, default='')
    request_by_id = models.IntegerField('申请人ID', null=True, blank=True, db_index=True)
    status = models.CharField('状态', max_length=20, choices=InvoiceRequestStatus.choices,
                              default=InvoiceRequestStatus.PENDING)
    invoice_ids = models.JSONField('关联发票ID列表', default=list, blank=True,
                                   help_text='[1, 2, 3]')
    notes = models.TextField('备注', blank=True, default='')
    processed_by = models.CharField('处理人', max_length=100, blank=True, default='')
    processed_at = models.DateTimeField('处理时间', null=True, blank=True)
    created_by_id = models.IntegerField('创建人ID', null=True, blank=True, db_index=True)
    create_time = models.DateTimeField('创建时间', auto_now_add=True)
    update_time = models.DateTimeField('更新时间', auto_now=True)

    def __str__(self):
        return f'开票申请-{self.id} {self.customer_name} {self.request_date}'


class InvoiceRequestItem(models.Model):
    """开票申请明细项"""

    class Meta:
        db_table = 't_invoice_request_item'
        verbose_name = '开票申请明细'
        ordering = ['sort_order', 'id']

    invoice_request = models.ForeignKey(InvoiceRequest, on_delete=models.CASCADE,
                                        related_name='items', verbose_name='开票申请')
    project_code = models.CharField('项目编号', max_length=80)
    project_id = models.IntegerField('项目ID', null=True, blank=True)
    amount = models.DecimalField('金额', max_digits=15, decimal_places=2, default=Decimal('0'))
    service_content = models.CharField('服务内容', max_length=500, blank=True, default='')
    sort_order = models.IntegerField('排序', default=0)

    def __str__(self):
        return f'{self.invoice_request_id} - {self.project_code}'


# 应付与费用报销（Phase 2）
from .models_payable import PayableRecord, PayableStatus  # noqa: F401
from .models_expense import ExpenseRequest, ExpenseType, ExpenseApprovalStatus  # noqa: F401

# 项目决算与分析（Phase 4）
from .models_settlement import ProjectSettlement, AnalysisSnapshot, CreditScore  # noqa: F401
