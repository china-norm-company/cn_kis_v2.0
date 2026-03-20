/**
 * 数字员工 — 发布门禁 API
 * 对应后端：/api/v1/dashboard/digital-worker-release-gate
 * 供 admin 发布渠道与验收流程使用
 */
import { api } from '../client'

export interface ReleaseGateVerdict {
  decision?: '可试点' | '需整改' | '禁止上线'
  summary?: string
  readiness_score?: number
  metrics?: Record<string, unknown>
  updated_at?: string
}

export const assistantReleaseGatesApi = {
  /** 获取最近一轮数字员工真实能力验收的发布结论与运营指标 */
  getLatestReleaseGate() {
    return api.get<ReleaseGateVerdict>('/dashboard/digital-worker-release-gate')
  },
}
