/**
 * 数字员工 — 路径治理与运营指标 API
 * 对应后端：/api/v1/dashboard/assistant/route-governance*、/manager-overview、/assistant/metrics 等
 * 供秘书台偏好/管理驾驶舱与 admin 运营总览统一调用
 */
import { api } from '../client'

export interface RouteGovernancePreset {
  id: string
  name: string
  description?: string
}

export interface RouteGovernanceThresholds {
  coverage_rate_min?: number
  applied_7d_min?: number
  alert_days?: number
  override_hit_rate_threshold?: number
  override_success_rate_threshold?: number
  fallback_rate_threshold?: number
  min_applied_threshold?: number
  cooldown_hours?: number
}

/** 后端 /dashboard/assistant/route-governance/presets 返回结构 */
export interface RouteGovernancePresetItem {
  preset_id: string
  label: string
  recommended: boolean
}

export interface RouteGovernancePresetResponse {
  detected_preset: string
  items: RouteGovernancePresetItem[]
}

/** 后端 /dashboard/assistant/route-governance-alert/thresholds 返回结构 */
export interface RouteGovernanceThresholdResponse {
  thresholds: RouteGovernanceThresholds
}

export interface ManagerOverviewResponse {
  channel_health?: Record<string, unknown>
  fallback_metrics?: Record<string, unknown>
  governance_presets?: unknown[]
  governance_trends?: unknown[]
  alerts?: unknown[]
  projects?: Array<{ status?: string; [k: string]: unknown }>
  summary?: {
    total_projects?: number
    active_projects?: number
    completion_rate?: number
    [k: string]: unknown
  }
  route_governance_preset_coverage?: {
    total_accounts?: number
    enabled_accounts?: number
    coverage_rate?: number
    approval_modes?: { graded?: number; direct?: number }
    [k: string]: unknown
  }
  route_governance_preset_trend?: {
    applied_7d?: number
    applied_30d?: number
    applied_window?: number
    window_days?: number
    daily_window?: Array<{ date: string; applied: number }>
    [k: string]: unknown
  }
  route_governance_preset_alert?: {
    enabled?: boolean
    level?: string
    message?: string
    thresholds?: { coverage_rate_min?: number; applied_7d_min?: number }
    [k: string]: unknown
  }
  route_governance_threshold_change_timeline?: {
    total?: number
    window_days?: number
    items?: Array<{
      operator_name?: string
      operator_id?: string | number
      changed_fields?: string[]
      change_time?: string
      at?: string
      description?: string
      old_value?: Record<string, unknown>
      new_value?: Record<string, unknown>
      diff_summary?: string
      [k: string]: unknown
    }>
  }
  route_governance_threshold_change_summary?: {
    total_changes?: number
    operators_count?: number
    top_changed_fields?: Array<{ field: string; count: number }>
    [k: string]: unknown
  }
}

export interface AssistantMetricsResponse {
  adoption_rate?: number
  automation_success_rate?: number
  [key: string]: unknown
}

export const assistantGovernanceApi = {
  /** 路径治理角色预设列表 */
  getPresets() {
    return api.get<RouteGovernancePresetResponse>('/dashboard/assistant/route-governance/presets')
  },

  /** 应用路径治理预设 */
  applyPreset(presetId: string) {
    return api.post('/dashboard/assistant/route-governance/presets/apply', { preset_id: presetId })
  },

  /** 获取路径治理告警阈值 */
  getThresholds() {
    return api.get<RouteGovernanceThresholdResponse>('/dashboard/assistant/route-governance-alert/thresholds')
  },

  /** 更新路径治理告警阈值 */
  updateThresholds(payload: RouteGovernanceThresholds) {
    return api.post<unknown>('/dashboard/assistant/route-governance-alert/thresholds', payload)
  },

  /** 触发路径治理告警动作 */
  triggerGovernanceAlert(params?: { days?: number; force?: boolean }) {
    return api.post('/dashboard/assistant/route-governance-alert/trigger', params ?? {})
  },

  /** 管理驾驶舱总览（通道健康、fallback、治理趋势、告警） */
  getManagerOverview(params?: {
    days?: number
    preset_trend_days?: number
    threshold_timeline_days?: number
    threshold_timeline_limit?: number
  }) {
    return api.get<ManagerOverviewResponse>('/dashboard/manager-overview', { params })
  },

  /** 子衿策略效果指标 */
  getMetrics(params?: { days?: number }) {
    return api.get<AssistantMetricsResponse>('/dashboard/assistant/metrics', { params })
  },
}
