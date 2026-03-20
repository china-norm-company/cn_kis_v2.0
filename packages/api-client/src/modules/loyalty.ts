/**
 * 忠诚度/留存 API 模块
 *
 * 对应后端：/api/v1/loyalty/
 */
import { api } from '../client'

export interface LoyaltyScore {
  id: number
  subject_id: number
  total_score: number
  participation_count: number
  completion_count: number
  compliance_avg: string
  last_activity_date: string | null
  risk_level: 'low' | 'medium' | 'high'
}

export const loyaltyApi = {
  getLoyalty(subjectId: number) {
    return api.get<LoyaltyScore>(`/loyalty/subject/${subjectId}`)
  },

  listRetentionRisk(params?: { risk_level?: string }) {
    return api.get<{ items: LoyaltyScore[] }>('/loyalty/retention-risk', { params })
  },

  getRanking(limit?: number) {
    return api.get<{ items: LoyaltyScore[] }>('/loyalty/ranking', { params: { limit } })
  },

  createReferral(data: { referrer_id: number; referred_id: number; plan_id?: number }) {
    return api.post<{ id: number }>('/loyalty/referral', data)
  },

  listReferrals(subjectId: number) {
    return api.get<{ referrals_made: unknown[]; referred_by: unknown[] }>(`/loyalty/referrals/${subjectId}`)
  },
}
