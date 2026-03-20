/**
 * 安全管理 API 模块
 *
 * 对接后端 /safety/ 端点：AE 上报、列表、详情、随访
 */
import { api } from '../client'
import type { ApiResponse } from '../types'

export interface AdverseEvent {
  id: number
  enrollment_id: number
  work_order_id: number | null
  description: string
  start_date: string
  end_date: string | null
  severity: 'mild' | 'moderate' | 'severe'
  relation: 'unrelated' | 'possible' | 'probable' | 'certain'
  action_taken: string
  outcome: string
  is_sae: boolean
  status: 'reported' | 'under_review' | 'approved' | 'following' | 'closed'
  report_date: string
  create_time: string
  deviation_id?: number | null
  change_request_id?: number | null
  follow_ups?: AEFollowUp[]
}

export interface AEFollowUp {
  id: number
  adverse_event_id: number
  sequence: number
  followup_date: string
  current_status: string
  outcome_update: string
  requires_further_followup: boolean
  create_time: string
}

export interface AECreateIn {
  enrollment_id: number
  description: string
  start_date: string
  severity: string
  relation: string
  work_order_id?: number
  action_taken?: string
  outcome?: string
  is_sae?: boolean
  open_id?: string
}

export interface AEFollowUpCreateIn {
  followup_date: string
  current_status: string
  outcome_update?: string
  severity_change?: string
  treatment_update?: string
  requires_further_followup?: boolean
  next_followup_date?: string
  notes?: string
}

export interface AEQueryParams {
  enrollment_id?: number
  status?: string
  is_sae?: boolean
  page?: number
  page_size?: number
}

export interface AEListResult {
  items: AdverseEvent[]
  total: number
}

export interface AEStats {
  total: number
  by_severity: Record<string, number>
  by_status: Record<string, number>
  by_relation: Record<string, number>
  sae_count: number
  open_count: number
}

export const safetyApi = {
  createAdverseEvent(data: AECreateIn): Promise<ApiResponse<AdverseEvent>> {
    return api.post('/safety/adverse-events/create', data)
  },

  listAdverseEvents(params?: AEQueryParams): Promise<ApiResponse<AEListResult>> {
    return api.get('/safety/adverse-events/list', { params })
  },

  getAdverseEvent(id: number): Promise<ApiResponse<AdverseEvent>> {
    return api.get(`/safety/adverse-events/${id}`)
  },

  addFollowUp(aeId: number, data: AEFollowUpCreateIn): Promise<ApiResponse<AEFollowUp>> {
    return api.post(`/safety/adverse-events/${aeId}/follow-up`, data)
  },

  getStats(params?: { enrollment_id?: number }): Promise<ApiResponse<AEStats>> {
    return api.get('/safety/adverse-events/stats', { params })
  },
}
