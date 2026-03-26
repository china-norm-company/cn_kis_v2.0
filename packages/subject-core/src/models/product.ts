export interface MyProductItem {
  dispensing_id: number
  product_name: string | null
  active_state: boolean
  active_recalls: Array<{ recall_title: string }> | null
  quantity_dispensed: number
  status: string
  dispensed_at: string | null
  next_visit_date: string | null
  latest_usage: {
    compliance_status?: string
    compliance_rate?: number | null
  } | null
}

export interface MyProductDetail {
  product_name: string | null
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

/** 格式化为 项目编号-名称-样品-样品编号，如 W26001111-面霜项目-面霜-123 */
export function formatProductDisplayName(item: {
  project_no?: string | null
  project_name?: string | null
  sample_name?: string | null
  sample_no?: string | null
  product_name?: string | null
}): string {
  const no = item.project_no || ''
  const name = item.project_name || ''
  const sample = item.sample_name || ''
  const sampleNo = item.sample_no || ''
  if (no || name || sample || sampleNo) {
    const parts = [no, name, sample, sampleNo].filter(Boolean)
    return parts.join('-')
  }
  return item.product_name || '研究产品'
}
