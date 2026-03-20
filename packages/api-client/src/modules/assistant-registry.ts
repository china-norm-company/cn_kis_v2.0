/**
 * 数字员工 — 注册表与 Claw 配置 API
 * 对应后端：/api/v1/dashboard/claw/*、/dashboard/assistant/claw/*
 * 供 admin 资产组与秘书台偏好中心统一调用
 */
import { api } from '../client'

export interface ClawTemplate {
  id: string
  name: string
  description?: string
}

export interface ClawPreset {
  id: string
  name: string
  description?: string
}

export interface ClawSkillBundle {
  id: string
  name: string
  installed?: boolean
}

export interface ClawIterationMetrics {
  success_rate?: number
  fallback_rate?: number
  [key: string]: unknown
}

/** 后端 /dashboard/assistant/claw/templates 返回结构 */
export interface ClawTemplateItem {
  template_id: string
  name: string
  use_case: string
  category: string
}

export interface ClawTemplateResponse {
  categories: string[]
  templates: ClawTemplateItem[]
  delegable_action_types: string[]
}

/** 后端 /dashboard/assistant/claw/presets 返回结构 */
export interface ClawPresetItem {
  preset_id: string
  label: string
  recommended: boolean
}

export interface ClawPresetResponse {
  detected_preset: string
  items: ClawPresetItem[]
}

/** 后端 /dashboard/assistant/claw/skills/bundles 返回结构 */
export interface ClawSkillBundleItem {
  slug: string
  value: string
  installed: boolean
}

export interface ClawSkillBundleGroup {
  role: string
  recommended: boolean
  items: ClawSkillBundleItem[]
}

export interface ClawSkillBundleResponse {
  detected_role: string
  installed_skill_slugs: string[]
  bundles: ClawSkillBundleGroup[]
  recommended_install_command: string
}

/** 后端 /dashboard/assistant/claw/iteration-metrics 返回结构 */
export interface ClawIterationMetricItem {
  name?: string
  count?: number
}

export interface ClawSkillSuccessItem {
  skill: string
  success: number
  total: number
  rate: number
}

export interface ClawIterationMetricsResponse {
  window_days: number
  runtime_success_rate: number
  runtime_total: number
  scope_gap_top: ClawIterationMetricItem[]
  context_gap_top: ClawIterationMetricItem[]
  skills_success_rate: ClawSkillSuccessItem[]
}

export const assistantRegistryApi = {
  /** Claw 注册表（全部工作台） */
  getClawRegistry() {
    return api.get<{ workstations?: Record<string, unknown>; shared_skills?: string[] }>(
      '/dashboard/claw/registry',
    )
  },

  /** Claw 注册表（单工作台） */
  getClawRegistryByWorkstation(workstationKey: string) {
    return api.get<Record<string, unknown>>(`/dashboard/claw/registry/${workstationKey}`)
  },

  /** 重载 Claw 注册表 */
  reloadClawRegistry() {
    return api.post<{ workstation_count?: number; workstation_keys?: string[] }>(
      '/dashboard/claw/registry/reload',
    )
  },

  /** Kimi Claw 角色模板库 */
  getClawTemplates() {
    return api.get<ClawTemplateResponse>('/dashboard/assistant/claw/templates')
  },

  /** Kimi Claw 角色预设列表 */
  getClawPresets() {
    return api.get<ClawPresetResponse>('/dashboard/assistant/claw/presets')
  },

  /** 应用 Kimi Claw 角色预设 */
  applyClawPreset(presetId: string) {
    return api.post('/dashboard/assistant/claw/presets/apply', { preset_id: presetId })
  },

  /** Claw 技能包状态 */
  getClawSkillBundles() {
    return api.get<ClawSkillBundleResponse>('/dashboard/assistant/claw/skills/bundles')
  },

  /** Claw 复盘迭代指标 */
  getClawIterationMetrics(params?: { days?: number }) {
    return api.get<ClawIterationMetricsResponse>('/dashboard/assistant/claw/iteration-metrics', {
      params: params ?? { days: 7 },
    })
  },
}
