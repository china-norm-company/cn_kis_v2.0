export interface MyProductItem {
  dispensing_id: number
  product_name: string | null
  project_no?: string | null
  project_name?: string | null
  sample_name?: string | null
  sample_no?: string | null
  active_state: boolean
  active_recalls: Array<{ recall_title: string }> | null
  quantity_dispensed: number
  status: string
  dispensed_at: string | null
  confirmed_at?: string | null
  latest_return?: { status?: string } | null
  next_visit_date: string | null
  latest_usage: {
    compliance_status?: string
    compliance_rate?: number | null
  } | null
}

export interface MyProductDetail {
  product_name: string | null
  project_no?: string | null
  project_name?: string | null
  sample_name?: string | null
  sample_no?: string | null
  status: string
  quantity_dispensed: number
  dispensed_at: string | null
  usage_instructions: string | null
  active_recalls: Array<{ recall_title: string; recall_level: string }> | null
  confirmed_at: string | null
  latest_return: { status?: string } | null
  timeline: Array<{
    type: string
    title: string
    description: string
    time: string
  }> | null
}

export interface MyProductReminderItem {
  title: string
  description: string
}
