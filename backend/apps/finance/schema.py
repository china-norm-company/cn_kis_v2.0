"""
财务管理 Schema 定义

所有 API 请求/响应的 Schema 类，按业务域分组。
使用 ninja.Schema 基类，Decimal 在输出时转为 str。
"""
from ninja import Schema
from typing import Optional, List
from datetime import date
from decimal import Decimal


# ============================================================================
# 报价 (Quote)
# ============================================================================
class QuoteQueryParams(Schema):
    status: Optional[str] = None
    client: Optional[str] = None
    page: int = 1
    page_size: int = 20


class QuoteCreateIn(Schema):
    code: str
    project: str
    client: str
    total_amount: Decimal
    created_at: date
    valid_until: Optional[date] = None
    notes: Optional[str] = ''


class QuoteUpdateIn(Schema):
    status: Optional[str] = None
    total_amount: Optional[Decimal] = None
    valid_until: Optional[date] = None
    notes: Optional[str] = None


class QuoteItemIn(Schema):
    """创建报价明细行"""
    item_name: str
    specification: str = ''
    unit: str = ''
    quantity: Decimal
    unit_price: Decimal
    cost_estimate: Optional[Decimal] = None


class QuoteItemOut(Schema):
    """报价明细行输出"""
    id: int
    item_name: str
    specification: str
    unit: str
    quantity: str
    unit_price: str
    amount: str
    cost_estimate: Optional[str] = None


class QuoteDetailOut(Schema):
    """报价详情（含明细）"""
    id: int
    code: str
    project: str
    client: str
    total_amount: str
    status: str
    created_at: str
    valid_until: str
    create_time: str
    version: Optional[int] = None
    parent_quote_id: Optional[int] = None
    items: List[QuoteItemOut] = []


# ============================================================================
# 合同 (Contract)
# ============================================================================
class ContractQueryParams(Schema):
    status: Optional[str] = None
    client: Optional[str] = None
    page: int = 1
    page_size: int = 20


class ContractCreateIn(Schema):
    code: str
    project: str
    client: str
    amount: Decimal
    signed_date: Optional[date] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = ''


class ContractUpdateIn(Schema):
    status: Optional[str] = None
    amount: Optional[Decimal] = None
    signed_date: Optional[date] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ContractPaymentTermIn(Schema):
    """合同付款条款"""
    milestone: str
    percentage: Decimal
    amount: Decimal
    payment_days: int = 30
    trigger_condition: str = ''


class ContractPaymentTermOut(Schema):
    """合同付款条款输出"""
    id: int
    milestone: str
    percentage: str
    amount: str
    payment_days: int
    trigger_condition: str


class ContractChangeIn(Schema):
    """合同变更"""
    change_type: str
    original_amount: Optional[Decimal] = None
    new_amount: Optional[Decimal] = None
    reason: str
    description: str = ''


class ContractChangeOut(Schema):
    """合同变更输出"""
    id: int
    change_no: str
    change_type: str
    original_amount: Optional[str] = None
    new_amount: Optional[str] = None
    reason: str
    approval_status: str
    create_time: str


class ContractDetailOut(Schema):
    """合同详情（含付款条款、变更）"""
    id: int
    code: str
    project: str
    client: str
    amount: str
    signed_date: str
    start_date: str
    end_date: str
    status: str
    create_time: str
    payment_terms: List[ContractPaymentTermOut] = []
    changes: List[ContractChangeOut] = []
    quote_id: Optional[int] = None
    protocol_id: Optional[int] = None


# ============================================================================
# 发票 (Invoice)
# ============================================================================
class InvoiceQueryParams(Schema):
    status: Optional[str] = None
    contract_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


class InvoiceCreateIn(Schema):
    code: str
    contract_id: int
    client: str
    amount: Decimal
    tax_amount: Decimal
    total: Decimal
    type: str
    invoice_date: Optional[date] = None
    notes: Optional[str] = ''


class InvoiceUpdateIn(Schema):
    status: Optional[str] = None
    invoice_date: Optional[date] = None


class InvoiceItemIn(Schema):
    """创建发票明细行"""
    item_name: str
    specification: str = ''
    unit: str = ''
    quantity: Decimal = Decimal('1')
    unit_price: Decimal
    tax_rate: Decimal = Decimal('6')


class InvoiceItemOut(Schema):
    """发票明细行输出"""
    id: int
    item_name: str
    specification: str
    unit: str
    quantity: str
    unit_price: str
    amount: str
    tax_rate: str
    tax_amount: str


class InvoiceDetailOut(Schema):
    """发票详情（含明细）"""
    id: int
    code: str
    contract_id: int
    contract_code: str
    client: str
    amount: str
    tax_amount: str
    total: str
    type: str
    status: str
    invoice_date: str
    create_time: str
    items: List[InvoiceItemOut] = []


# ============================================================================
# 回款 (Payment)
# ============================================================================
class PaymentQueryParams(Schema):
    status: Optional[str] = None
    invoice_id: Optional[int] = None
    page: int = 1
    page_size: int = 20


class PaymentCreateIn(Schema):
    code: str
    invoice_id: int
    client: str
    expected_amount: Decimal
    actual_amount: Optional[Decimal] = None
    payment_date: Optional[date] = None
    method: Optional[str] = ''
    notes: Optional[str] = ''


class PaymentUpdateIn(Schema):
    status: Optional[str] = None
    actual_amount: Optional[Decimal] = None
    payment_date: Optional[date] = None
    method: Optional[str] = None
    days_overdue: Optional[int] = None


# ============================================================================
# 预算 (Budget)
# ============================================================================
class BudgetCategoryCreateIn(Schema):
    code: str
    name: str
    category_type: str
    parent_id: Optional[int] = None
    description: Optional[str] = ''


class BudgetCreateIn(Schema):
    budget_no: str
    budget_name: str
    protocol_id: int
    project_name: Optional[str] = ''
    budget_year: int
    start_date: date
    end_date: date
    total_income: Decimal = Decimal('0')
    total_cost: Decimal = Decimal('0')
    total_expense: Decimal = Decimal('0')
    client_id: Optional[int] = None
    client_name: Optional[str] = ''
    notes: Optional[str] = ''


class BudgetItemCreateIn(Schema):
    category_id: int
    budget_amount: Decimal
    description: Optional[str] = ''


# ============================================================================
# 成本 (Cost)
# ============================================================================
class CostRecordCreateIn(Schema):
    record_no: str
    protocol_id: int
    cost_type: str
    cost_date: date
    amount: Decimal
    description: Optional[str] = ''
    project_name: Optional[str] = ''
    budget_id: Optional[int] = None
    budget_item_id: Optional[int] = None
    reference_no: Optional[str] = ''
    reference_type: Optional[str] = ''
    staff_id: Optional[int] = None
    staff_name: Optional[str] = ''
    work_hours: Optional[Decimal] = None
    hourly_rate: Optional[Decimal] = None


# ============================================================================
# 回款计划 (Payment Plan)
# ============================================================================
class PaymentPlanCreateIn(Schema):
    plan_no: str
    protocol_id: int
    planned_date: date
    planned_amount: Decimal
    project_name: Optional[str] = ''
    contract_id: Optional[int] = None
    client_id: Optional[int] = None
    client_name: Optional[str] = ''
    milestone: Optional[str] = ''
    responsible_id: Optional[int] = None
    responsible_name: Optional[str] = ''
    invoice_id: Optional[int] = None
    notes: Optional[str] = ''


class PaymentRecordCreateIn(Schema):
    record_no: str
    plan_id: int
    payment_date: date
    amount: Decimal
    payment_method: Optional[str] = 'bank_transfer'
    bank_name: Optional[str] = ''
    bank_serial: Optional[str] = ''
    invoice_id: Optional[int] = None
    notes: Optional[str] = ''


class OverdueFollowupCreateIn(Schema):
    plan_id: int
    followup_date: date
    followup_type: str
    content: str
    result: str
    contact_person: Optional[str] = ''
    promise_date: Optional[date] = None
    promise_amount: Optional[Decimal] = None
    next_followup_date: Optional[date] = None
    next_followup_plan: Optional[str] = ''


# ============================================================================
# 财务分析 (Report)
# ============================================================================
class FinReportCreateIn(Schema):
    report_no: str
    report_name: str
    report_type: str
    period_start: date
    period_end: date
    protocol_id: Optional[int] = None


# ============================================================================
# 客户 (Client) — 发票管理（新）
# ============================================================================
class CustomerQueryParams(Schema):
    page: int = 1
    page_size: int = 20
    keyword: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerCreateIn(Schema):
    customer_code: Optional[str] = None
    customer_name: str
    short_name: Optional[str] = None
    payment_term_days: int = 30
    payment_term_description: Optional[str] = None
    remark: Optional[str] = None
    is_active: bool = True


class CustomerUpdateIn(Schema):
    customer_code: Optional[str] = None
    customer_name: Optional[str] = None
    short_name: Optional[str] = None
    payment_term_days: Optional[int] = None
    payment_term_description: Optional[str] = None
    remark: Optional[str] = None
    is_active: Optional[bool] = None


# ============================================================================
# 开票申请 (InvoiceRequest) — 发票管理（新）
# ============================================================================
class InvoiceRequestItemIn(Schema):
    project_code: str
    project_id: Optional[int] = None
    amount: Decimal
    service_content: str = ''


class InvoiceRequestQueryParams(Schema):
    page: int = 1
    page_size: int = 20
    request_by: Optional[str] = None
    customer_name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = None


# 发票类型：vat_special=增值税专用发票, proforma=形式发票
INVOICE_TYPE_VAT_SPECIAL = 'vat_special'
INVOICE_TYPE_PROFORMA = 'proforma'

# 金额类型：客户确认的是不含税还是含税；展示与票面统一为含税金额
AMOUNT_TYPE_INCLUSIVE_OF_TAX = 'inclusive_of_tax'
AMOUNT_TYPE_EXCLUSIVE_OF_TAX = 'exclusive_of_tax'


class InvoiceRequestCreateIn(Schema):
    request_date: date
    customer_name: str
    invoice_type: str = INVOICE_TYPE_VAT_SPECIAL  # 默认增值税专用发票
    amount_type: str = AMOUNT_TYPE_INCLUSIVE_OF_TAX  # 默认含税
    tax_rate: Optional[Decimal] = None  # 如 0.06 表示 6%，默认 0.06
    items: List[InvoiceRequestItemIn]
    po: Optional[str] = None
    request_by: str
    notes: Optional[str] = None


class InvoiceRequestUpdateIn(Schema):
    status: Optional[str] = None
    invoice_ids: Optional[List[int]] = None
    processed_by: Optional[str] = None
    processed_at: Optional[str] = None
    notes: Optional[str] = None
    request_date: Optional[date] = None
    customer_name: Optional[str] = None
    invoice_type: Optional[str] = None
    amount_type: Optional[str] = None
    tax_rate: Optional[Decimal] = None
    items: Optional[List[InvoiceRequestItemIn]] = None
    po: Optional[str] = None
    request_by: Optional[str] = None
