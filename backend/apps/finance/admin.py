from django.contrib import admin
from .models import (
    Quote, QuoteItem,
    Contract, ContractPaymentTerm, ContractChange,
    Invoice, InvoiceItem,
    Payment,
    BudgetCategory, ProjectBudget, BudgetAdjustment,
    CostRecord,
    PaymentPlan, PaymentRecord, OverdueFollowup,
    FinancialReport, ProfitAnalysis, CashFlowRecord,
)
from .models_payable import PayableRecord
from .models_expense import ExpenseRequest
from .models_settlement import ProjectSettlement, AnalysisSnapshot, CreditScore


class QuoteItemInline(admin.TabularInline):
    model = QuoteItem
    extra = 0


@admin.register(Quote)
class QuoteAdmin(admin.ModelAdmin):
    list_display = ['code', 'project', 'client', 'total_amount', 'status', 'created_at']
    list_filter = ['status']
    search_fields = ['code', 'project', 'client']
    inlines = [QuoteItemInline]


class ContractPaymentTermInline(admin.TabularInline):
    model = ContractPaymentTerm
    extra = 0


@admin.register(Contract)
class ContractAdmin(admin.ModelAdmin):
    list_display = ['code', 'project', 'client', 'amount', 'status', 'signed_date']
    list_filter = ['status']
    search_fields = ['code', 'project', 'client']
    inlines = [ContractPaymentTermInline]


@admin.register(ContractChange)
class ContractChangeAdmin(admin.ModelAdmin):
    list_display = ['change_no', 'contract', 'change_type', 'approval_status', 'create_time']
    list_filter = ['change_type', 'approval_status']
    search_fields = ['change_no']


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['code', 'client', 'total', 'type', 'status', 'invoice_date']
    list_filter = ['status', 'type']
    search_fields = ['code', 'client']
    inlines = [InvoiceItemInline]


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['code', 'client', 'expected_amount', 'actual_amount', 'status', 'payment_date']
    list_filter = ['status']
    search_fields = ['code', 'client']


@admin.register(BudgetCategory)
class BudgetCategoryAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'category_type', 'level', 'is_active', 'sort_order']
    list_filter = ['category_type', 'is_active']
    search_fields = ['code', 'name']


@admin.register(ProjectBudget)
class ProjectBudgetAdmin(admin.ModelAdmin):
    list_display = ['budget_no', 'project_name', 'status', 'budget_year', 'total_cost', 'actual_cost']
    list_filter = ['status', 'budget_year']
    search_fields = ['budget_no', 'project_name']


@admin.register(BudgetAdjustment)
class BudgetAdjustmentAdmin(admin.ModelAdmin):
    list_display = ['adjustment_no', 'budget', 'original_amount', 'adjusted_amount', 'status']
    list_filter = ['status']


@admin.register(CostRecord)
class CostRecordAdmin(admin.ModelAdmin):
    list_display = ['record_no', 'project_name', 'cost_type', 'amount', 'status', 'cost_date']
    list_filter = ['cost_type', 'status']
    search_fields = ['record_no', 'project_name']


@admin.register(PaymentPlan)
class PaymentPlanAdmin(admin.ModelAdmin):
    list_display = ['plan_no', 'client_name', 'planned_date', 'planned_amount', 'received_amount', 'status']
    list_filter = ['status']
    search_fields = ['plan_no', 'client_name']


@admin.register(PaymentRecord)
class PaymentRecordAdmin(admin.ModelAdmin):
    list_display = ['record_no', 'client_name', 'amount', 'payment_method', 'status', 'payment_date']
    list_filter = ['status', 'payment_method']
    search_fields = ['record_no', 'client_name', 'bank_serial']


@admin.register(OverdueFollowup)
class OverdueFollowupAdmin(admin.ModelAdmin):
    list_display = ['payment_plan', 'followup_date', 'followup_type', 'result']
    list_filter = ['followup_type', 'result']


@admin.register(FinancialReport)
class FinancialReportAdmin(admin.ModelAdmin):
    list_display = ['report_no', 'report_name', 'report_type', 'status', 'period_start', 'period_end']
    list_filter = ['report_type', 'status']
    search_fields = ['report_no', 'report_name']


@admin.register(ProfitAnalysis)
class ProfitAnalysisAdmin(admin.ModelAdmin):
    list_display = ['project_name', 'analysis_date', 'period_type', 'contract_amount', 'total_cost', 'gross_margin']
    list_filter = ['period_type']
    search_fields = ['project_name']


@admin.register(CashFlowRecord)
class CashFlowRecordAdmin(admin.ModelAdmin):
    list_display = ['record_date', 'flow_type', 'category', 'amount', 'project_name']
    list_filter = ['flow_type', 'category']


@admin.register(PayableRecord)
class PayableRecordAdmin(admin.ModelAdmin):
    list_display = ['record_no', 'supplier_name', 'amount', 'due_date', 'payment_status']
    list_filter = ['payment_status']
    search_fields = ['record_no', 'supplier_name']


@admin.register(ExpenseRequest)
class ExpenseRequestAdmin(admin.ModelAdmin):
    list_display = ['request_no', 'applicant_name', 'expense_type', 'amount', 'approval_status']
    list_filter = ['expense_type', 'approval_status']
    search_fields = ['request_no', 'applicant_name']


@admin.register(ProjectSettlement)
class ProjectSettlementAdmin(admin.ModelAdmin):
    list_display = ['settlement_no', 'project_name', 'contract_amount', 'total_cost', 'gross_margin', 'settlement_status']
    list_filter = ['settlement_status']
    search_fields = ['settlement_no', 'project_name']


@admin.register(AnalysisSnapshot)
class AnalysisSnapshotAdmin(admin.ModelAdmin):
    list_display = ['snapshot_date', 'metric_type', 'dimension_type', 'value']
    list_filter = ['metric_type', 'dimension_type']


@admin.register(CreditScore)
class CreditScoreAdmin(admin.ModelAdmin):
    list_display = ['client_name', 'score_date', 'score', 'grade', 'on_time_rate', 'overdue_count']
    list_filter = ['grade']
    search_fields = ['client_name']
