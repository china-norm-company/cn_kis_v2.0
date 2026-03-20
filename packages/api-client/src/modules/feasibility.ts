/**
 * 可行性评估 API 模块
 *
 * 对应后端：/api/v1/feasibility/
 */
import { api } from '../client'
import type { ApiListResponse } from '../types'

export interface AssessmentItem {
  id: number
  dimension: string
  score: number
  weight: number
  auto_check_passed: boolean | null
  auto_check_detail: Record<string, unknown>
  manual_notes: string
  create_time: string
}

export interface FeasibilityAssessment {
  id: number
  opportunity_id: number
  opportunity_title: string
  protocol_id: number | null
  protocol_title: string | null
  title: string
  status: 'draft' | 'submitted' | 'approved' | 'rejected'
  overall_score: number | null
  auto_check_result: Record<string, unknown>
  notes: string
  created_by_id: number | null
  create_time: string
  update_time: string
  items: AssessmentItem[]
}

export interface AssessmentCreateIn {
  opportunity_id: number
  title: string
  protocol_id?: number
}

export const feasibilityApi = {
  /** 创建可行性评估 */
  create(data: AssessmentCreateIn) {
    return api.post<FeasibilityAssessment>('/feasibility/create', data)
  },

  /** 评估列表 */
  list(params?: { status?: string; page?: number; page_size?: number }) {
    return api.get<ApiListResponse<FeasibilityAssessment>['data']>('/feasibility/list', { params })
  },

  /** 评估详情 */
  get(id: number) {
    return api.get<FeasibilityAssessment>(`/feasibility/${id}`)
  },

  /** 触发自动检查 */
  autoCheck(id: number) {
    return api.post<FeasibilityAssessment>(`/feasibility/${id}/auto-check`)
  },

  /** 提交审批 */
  submit(id: number) {
    return api.post<FeasibilityAssessment>(`/feasibility/${id}/submit`)
  },

  /** 批准 */
  approve(id: number) {
    return api.post<FeasibilityAssessment>(`/feasibility/${id}/approve`)
  },

  /** 驳回 */
  reject(id: number) {
    return api.post<FeasibilityAssessment>(`/feasibility/${id}/reject`)
  },
}
