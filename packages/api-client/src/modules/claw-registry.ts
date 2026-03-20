/**
 * Claw 注册表 API 模块
 *
 * 对应后端：/api/v1/dashboard/claw/registry
 * 提供工作台与 Claw 技能、AI Agent 的绑定查询
 */
import { api } from '../client'

export interface ClawQuickAction {
  id: string
  label: string
  skill: string
  script: string | null
  icon: string
}

export interface WorkstationClawConfig {
  key: string
  display_name: string
  agents: string[]
  skills: string[]
  quick_actions: ClawQuickAction[]
}

export interface ClawRegistryFull {
  shared_skills: string[]
  workstations: Record<string, WorkstationClawConfig>
}

export const clawRegistryApi = {
  getFullRegistry() {
    return api.get<ClawRegistryFull>('/dashboard/claw/registry')
  },

  getByWorkstation(workstationKey: string) {
    return api.get<WorkstationClawConfig>(`/dashboard/claw/registry/${workstationKey}`)
  },

  reload() {
    return api.post<{ workstation_count: number; workstation_keys: string[] }>(
      '/dashboard/claw/registry/reload',
    )
  },
}
