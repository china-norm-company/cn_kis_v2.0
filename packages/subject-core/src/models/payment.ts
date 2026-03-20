export interface MyPaymentItem {
  id: number
  payment_type: string
  payment_no: string
  status: string
  amount: string
  paid_at: string | null
}

export interface MyPaymentSummary {
  paid_amount: string
  pending_amount: string
  by_type: Array<{ type: string; count: number; amount: string }>
}
