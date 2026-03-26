/**
 * 财务台·发票大模块权限码（与后端 seed_roles / Django 权限一致）
 */
export const FINANCE_PERMS = {
  invoiceRead: 'finance.invoice.read',
  invoiceCreate: 'finance.invoice.create',
  invoiceEinvoice: 'finance.invoice.einvoice',
  invoiceRequestSubmit: 'finance.invoice_request.submit',
  paymentRead: 'finance.payment.read',
  paymentCreate: 'finance.payment.create',
  reportRead: 'finance.report.read',
} as const
