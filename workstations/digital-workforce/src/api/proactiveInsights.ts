import { api } from '@cn-kis/api-client'

export interface ProactiveInsightItem {
  id: number
  insight_type: string
  title: string
  summary: string
  priority: string
  relevance_score: number
  client_id?: number
  client_name?: string
  status: string
  created_at: string
  expires_at?: string
  scan_batch_id?: string
}

export interface ProactiveInsightDetail extends ProactiveInsightItem {
  detail: Record<string, unknown>
  related_categories: string[]
  related_claim_types: string[]
  trigger_source: string
  source_evidence_refs: Array<Record<string, string>>
  urgency_score: number
  impact_score: number
  reviewed_by?: number
  reviewed_at?: string
  pushed_at?: string
  push_channel?: string
  action_taken?: string
  action_result?: string
  linked_opportunity_id?: number
  feedback_score?: number
  feedback_note?: string
  governance_level: string
  updated_at: string
}

export interface ScanConfig {
  id: number
  name: string
  scan_type: string
  enabled: boolean
  frequency: string
  data_sources: string[]
  last_run_at?: string
  run_count: number
  created_at: string
}

export interface InsightAnalytics {
  total: number
  by_status: Record<string, number>
  by_type: Record<string, number>
  act_rate: number
  dismiss_rate: number
  avg_feedback_score?: number
  opportunity_conversions: number
}

export function listInsights(params?: {
  insight_type?: string
  status?: string
  client_id?: number
  priority?: string
  page?: number
  page_size?: number
}) {
  return api.get<{ total: number; items: ProactiveInsightItem[] }>(
    '/proactive-insights',
    { params },
  )
}

export function getInsight(id: number) {
  return api.get<ProactiveInsightDetail>(`/proactive-insights/${id}`)
}

export function reviewInsight(id: number, action: string, note?: string) {
  return api.post(`/proactive-insights/${id}/review`, { action, note })
}

export function actInsight(id: number, payload: {
  action_taken: string
  action_result?: string
  opportunity_id?: number
}) {
  return api.post(`/proactive-insights/${id}/act`, payload)
}

export function feedbackInsight(id: number, score: number, note?: string) {
  return api.post(`/proactive-insights/${id}/feedback`, { score, note })
}

export function convertToAction(id: number) {
  return api.post(`/proactive-insights/${id}/convert-to-action`, {})
}

export function getInsightAnalytics() {
  return api.get<InsightAnalytics>('/proactive-insight-analytics')
}

export function listScanConfigs() {
  return api.get<ScanConfig[]>('/proactive-scan-configs')
}

export function triggerScan(configId: number) {
  return api.post(`/proactive-scan-configs/${configId}/trigger`, {})
}

export function listScanRuns(configId: number, params?: { page?: number; page_size?: number }) {
  return api.get<{ total: number; items: Array<Record<string, unknown>> }>(
    `/proactive-scan-configs/${configId}/runs`,
    { params },
  )
}
