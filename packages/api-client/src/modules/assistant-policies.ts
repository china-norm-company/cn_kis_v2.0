/**
 * 数字员工 — 策略中心 API
 * 对应后端：/api/v1/dashboard/assistant/policies
 * 供秘书台策略页与 admin 策略中心统一调用
 */
import { api } from '../client'

export type RiskLevel = 'low' | 'medium' | 'high'

export interface PolicyItem {
  policy_id?: number | null
  action_type: string
  enabled: boolean
  requires_confirmation: boolean
  allowed_risk_levels: RiskLevel[]
  min_priority_score: number
  min_confidence_score: number
  source: 'default' | 'custom'
  capability_key?: string
  target_system?: string
  executor?: string
  operator_mode?: string
  required_permissions?: string[]
  required_feishu_scopes?: string[]
  expected_skills?: string[]
  minimum_context_requirements?: string[]
  updated_at?: string | null
}

export interface PolicyListResponse {
  items: PolicyItem[]
}

export interface PolicyUpsertIn {
  enabled: boolean
  requires_confirmation: boolean
  allowed_risk_levels: RiskLevel[]
  min_priority_score: number
  min_confidence_score: number
}

export const assistantPoliciesApi = {
  /** 策略列表 */
  list() {
    return api.get<PolicyListResponse>('/dashboard/assistant/policies')
  },

  /** 更新单条策略 */
  upsert(actionType: string, data: PolicyUpsertIn) {
    return api.post(`/dashboard/assistant/policies/${actionType}`, data)
  },
}
