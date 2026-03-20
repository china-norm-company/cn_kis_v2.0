/**
 * 财务管理 API 模块
 *
 * 对应后端：/api/v1/finance/
 * 研究经理场景：报价 / 合同 / 发票 / 回款
 */
import { api } from '../client'
import type { ApiListResponse } from '../types'

// ============================================================================
// 类型定义
// ============================================================================

export interface Quote {
  id: number
  code: string
  project: string
  client: string
  total_amount: string
  status: string
  created_at: string
  valid_until: string
  create_time: string
}

export interface QuoteCreateIn {
  code: string
  project: string
  client: string
  total_amount: number
  created_at: string
  valid_until?: string
  notes?: string
}

export interface QuoteItem {
  id: number
  item_name: string
  specification: string
  unit: string
  quantity: string
  unit_price: string
  amount: string
  cost_estimate: string | null
}

export interface Contract {
  id: number
  code: string
  project: string
  client: string
  amount: string
  signed_date: string
  start_date: string
  end_date: string
  status: string
  create_time: string
}

export interface ContractPaymentTerm {
  id: number
  milestone: string
  percentage: string
  amount: string
  payment_days: number
  trigger_condition: string
}

export interface ContractChange {
  id: number
  change_type: string
  description: string
  status: string
  create_time: string
}

export interface Invoice {
  id: number
  code: string
  contract_id: number
  contract_code: string
  client: string
  amount: string
  tax_amount: string
  total: string
  type: string
  status: string
  invoice_date: string
  create_time: string
}

export interface InvoiceCreateIn {
  code: string
  contract_id: number
  client: string
  amount: number
  tax_amount: number
  total: number
  type: string
  invoice_date?: string
  notes?: string
}

export interface Payment {
  id: number
  code: string
  invoice_id: number
  invoice_code: string
  client: string
  expected_amount: string
  actual_amount: string
  payment_date: string
  method: string
  status: string
  days_overdue: number
  create_time: string
}

export interface PaymentCreateIn {
  code: string
  invoice_id: number
  client: string
  expected_amount: number
  actual_amount?: number
  payment_date?: string
  method?: string
  notes?: string
}

// ============================================================================
// API 定义
// ============================================================================

export const financeApi = {
  // ===== 报价 =====

  listQuotes(params?: { status?: string; client?: string; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<Quote>['data']>('/finance/quotes/list', { params })
  },

  createQuote(data: QuoteCreateIn) {
    return api.post<Quote>('/finance/quotes/create', data)
  },

  getQuote(id: number) {
    return api.get<Quote>(`/finance/quotes/${id}`)
  },

  getQuoteItems(quoteId: number) {
    return api.get<{ items: QuoteItem[] }>(`/finance/quotes/${quoteId}/items`)
  },

  reviseQuote(quoteId: number) {
    return api.post<Quote>(`/finance/quotes/${quoteId}/revise`)
  },

  convertToContract(quoteId: number) {
    return api.post<Contract>(`/finance/quotes/${quoteId}/convert-to-contract`)
  },

  getQuoteStats() {
    return api.get('/finance/quotes/stats')
  },

  // ===== 合同 =====

  listContracts(params?: { status?: string; client?: string; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<Contract>['data']>('/finance/contracts/list', { params })
  },

  getContract(id: number) {
    return api.get<Contract>(`/finance/contracts/${id}`)
  },

  listPaymentTerms(contractId: number) {
    return api.get<{ items: ContractPaymentTerm[] }>(`/finance/contracts/${contractId}/payment-terms`)
  },

  // ===== 发票 =====

  listInvoices(params?: { status?: string; contract_id?: number; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<Invoice>['data']>('/finance/invoices/list', { params })
  },

  createInvoice(data: InvoiceCreateIn) {
    return api.post<Invoice>('/finance/invoices/create', data)
  },

  getInvoice(id: number) {
    return api.get<Invoice>(`/finance/invoices/${id}`)
  },

  getInvoiceStats() {
    return api.get('/finance/invoices/stats')
  },

  // ===== 回款 =====

  listPayments(params?: { status?: string; invoice_id?: number; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<Payment>['data']>('/finance/payments/list', { params })
  },

  createPayment(data: PaymentCreateIn) {
    return api.post<Payment>('/finance/payments/create', data)
  },

  getPayment(id: number) {
    return api.get<Payment>(`/finance/payments/${id}`)
  },

  getPaymentStats() {
    return api.get('/finance/payments/stats')
  },
}
