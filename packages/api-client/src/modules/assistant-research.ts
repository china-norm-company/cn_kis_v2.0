/**
 * 数字员工 — 研究洞察与路径偏好 API
 * 对应后端：/api/v1/dashboard/assistant/research/*
 * 供秘书台 Dashboard 与研究洞察卡片使用
 */
import { api } from '../client'

export interface ResearchInsightsResponse {
  cards?: Array<Record<string, unknown>>
  [key: string]: unknown
}

export interface ResearchRoutePreferenceResponse {
  overrides?: Record<string, string>
  [key: string]: unknown
}

export const assistantResearchApi = {
  /** 研究中台洞察卡片 */
  getInsights(params?: { include_llm?: boolean }) {
    return api.get<ResearchInsightsResponse>('/dashboard/assistant/research/insights', {
      params: params ?? { include_llm: false },
    })
  },

  /** 研究洞察一键入箱 */
  postInsightsActions(payload: { card_id?: string; card_type?: string; [key: string]: unknown }) {
    return api.post<unknown>('/dashboard/assistant/research/insights/actions', payload)
  },

  /** 研究路径覆写偏好 */
  getRoutePreferences() {
    return api.get<ResearchRoutePreferenceResponse>('/dashboard/assistant/research/routes/preferences')
  },

  /** 保存研究路径覆写偏好 */
  saveRoutePreferences(payload: Record<string, unknown>) {
    return api.post<unknown>('/dashboard/assistant/research/routes/preferences', payload)
  },
}
