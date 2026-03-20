/**
 * 粗筛管理 API 模块
 *
 * 对应后端：/api/v1/pre-screening/
 */
import { api } from '../client'

export interface PreScreeningRecord {
  id: number
  pre_screening_no: string
  registration_id: number
  registration_no: string
  subject_id: number
  subject_name: string
  subject_no: string
  protocol_id: number
  protocol_title: string
  pre_screening_date: string | null
  start_time: string | null
  end_time: string | null
  location: string
  hard_exclusion_checks: Array<{ item: string; met: boolean; value: string }> | null
  skin_visual_assessment: Record<string, unknown> | null
  instrument_summary: Record<string, unknown> | null
  medical_summary: Record<string, unknown> | null
  lifestyle_summary: Record<string, unknown> | null
  result: 'pending' | 'pass' | 'fail' | 'refer'
  result_display: string
  fail_reasons: string[] | null
  reviewer_decision: string
  reviewer_notes: string
  reviewed_at: string | null
  screening_appointment_id: number | null
  compensation_amount: string | null
  compensation_paid: boolean
  screener_id: number | null
  reviewer_id: number | null
  notes: string
  create_time: string
  update_time: string
}

export interface PreScreeningDraftIn {
  hard_exclusion_checks?: Array<{ item: string; met: boolean; value: string }>
  skin_visual_assessment?: Record<string, unknown>
  instrument_summary?: Record<string, unknown>
  medical_summary?: Record<string, unknown>
  lifestyle_summary?: Record<string, unknown>
  location?: string
  notes?: string
}

export interface PreScreeningSummary {
  total: number
  pending: number
  passed: number
  failed: number
  referred: number
  completed: number
  pass_rate: number
}

export interface PreScreeningFunnel {
  registered: number
  pre_screened: number
  pre_screened_pass: number
  screened_pass: number
  enrolled: number
  pre_screening_rate: number
  pre_screening_pass_rate: number
  screening_pass_rate: number
  enrollment_rate: number
}

export const preScreeningApi = {
  /** 发起粗筛 */
  start(data: { registration_id: number; protocol_id: number }) {
    return api.post<PreScreeningRecord>('/pre-screening/start', data)
  },

  /** 粗筛记录列表 */
  list(params?: {
    pre_screening_date?: string
    result?: string
    plan_id?: number
    screener_id?: number
    page?: number
    page_size?: number
  }) {
    return api.get<{ items: PreScreeningRecord[]; total: number; page: number; page_size: number }>(
      '/pre-screening/', { params },
    )
  },

  /** 粗筛记录详情 */
  getDetail(id: number) {
    return api.get<PreScreeningRecord>(`/pre-screening/records/${id}`)
  },

  /** 保存粗筛草稿 */
  saveDraft(id: number, data: PreScreeningDraftIn) {
    return api.put<PreScreeningRecord>(`/pre-screening/records/${id}`, data)
  },

  /** 完成粗筛判定 */
  complete(id: number, data: { result: string; fail_reasons?: string[]; notes?: string }) {
    return api.post<PreScreeningRecord>(`/pre-screening/records/${id}/complete`, data)
  },

  /** PI 复核判定 */
  review(id: number, data: { decision: string; notes: string }) {
    return api.post<PreScreeningRecord>(`/pre-screening/records/${id}/review`, data)
  },

  /** 今日粗筛摘要 */
  todaySummary() {
    return api.get<PreScreeningSummary>('/pre-screening/today-summary')
  },

  /** 粗筛漏斗数据 */
  funnel(planId?: number) {
    return api.get<PreScreeningFunnel>('/pre-screening/funnel', { params: planId ? { plan_id: planId } : undefined })
  },
}
