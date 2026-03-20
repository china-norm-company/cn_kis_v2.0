/**
 * 数字员工 — 个人偏好 API
 * 对应后端：/api/v1/dashboard/assistant/preferences、/dashboard/assistant/digest/trigger
 * 供秘书台偏好中心使用
 */
import { api } from '../client'

export interface AssistantPreferenceValue {
  summary_tone?: string
  focus_action_types?: string[]
  blocked_action_types?: string[]
  daily_digest_hour?: number
  chat_default_provider?: 'auto' | 'ark' | 'kimi'
  chat_allow_fallback?: boolean
  chat_fallback_provider?: 'auto' | 'ark' | 'kimi'
  route_governance_auto_execute_enabled?: boolean
  route_governance_auto_execute_max_risk?: 'low' | 'medium' | 'high'
  route_governance_auto_execute_min_confidence?: number
  route_governance_auto_execute_min_priority?: number
  route_governance_auto_execute_approval_mode?: 'graded' | 'direct'
  [key: string]: unknown
}

export interface AssistantPreferenceResponse {
  preference_key?: string
  value?: AssistantPreferenceValue
  updated_at?: string | null
}

export const assistantPreferencesApi = {
  /** 获取当前用户子衿偏好 */
  getPreferences() {
    return api.get<AssistantPreferenceResponse>('/dashboard/assistant/preferences')
  },

  /** 更新子衿偏好 */
  savePreferences(value: AssistantPreferenceValue) {
    return api.post<unknown>('/dashboard/assistant/preferences', value)
  },

  /** 触发日报动作生成 */
  triggerDigest(force: boolean) {
    return api.post<unknown>('/dashboard/assistant/digest/trigger', { force })
  },
}
