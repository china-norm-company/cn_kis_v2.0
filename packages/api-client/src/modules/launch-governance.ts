/**
 * 鹿鸣·上线治理 API（/auth/…）
 */
import { api } from '../client'
import type { ApiResponse } from '../types'

export interface WorkstationRegistryItem {
  key: string
  name: string
  description: string
  path: string
  port?: number
  package?: string
  category: string
}

export interface LaunchLifecycleNode {
  key: string
  name: string
  status: string
  total: number
  recent_7d: number
  primary_workstations: string[]
}

export interface LaunchGapItem {
  id: number
  title: string
  description: string
  gap_type: string
  severity: string
  related_node: string
  related_workstation: string
  blocked_loop: boolean
  status: string
  owner_domain: string
  github_issue_url: string
  feishu_ref: string
  next_action: string
  verification_status: string
  days_open: number
  create_time: string
  update_time: string
}

export interface LaunchGoalItem {
  id: number
  title: string
  description: string
  scope: string
  target_date: string | null
  progress_percent: number
  status: string
  gap_links: number[]
  rhythm_notes: string
  create_time: string
  update_time: string
}

function unwrap<T>(p: Promise<ApiResponse<T>>): Promise<T> {
  return p.then((res) => {
    if (res.code !== 200 || res.data === undefined || res.data === null) {
      throw new Error((res as { msg?: string }).msg || '请求失败')
    }
    return res.data as T
  })
}

export const launchGovernanceApi = {
  getRegistry() {
    return unwrap(api.get<{ items: WorkstationRegistryItem[]; total: number }>('/auth/workstations/registry'))
  },
  getOverview() {
    return unwrap(api.get<Record<string, unknown>>('/auth/governance/launch/overview'))
  },
  getLifecycle() {
    return unwrap(api.get<{ nodes: LaunchLifecycleNode[]; generated_at: string }>(
      '/auth/governance/launch/lifecycle',
    ))
  },
  getWorkstationsMap() {
    return unwrap(api.get<{
      items: Array<WorkstationRegistryItem & {
        accounts_assigned: number
        active_7d: number
        stage_level: string
        stage_label: string
      }>
      total: number
      registry_total: number
    }>('/auth/governance/launch/workstations'))
  },
  listGaps(params?: { status?: string; blocked_loop?: boolean }) {
    const sp = new URLSearchParams()
    if (params?.status) sp.set('status', params.status)
    if (params?.blocked_loop !== undefined) sp.set('blocked_loop', String(params.blocked_loop))
    const q = sp.toString()
    return unwrap(api.get<{ items: LaunchGapItem[]; total: number }>(
      `/auth/governance/launch/gaps${q ? `?${q}` : ''}`,
    ))
  },
  createGap(body: {
    title: string
    description?: string
    gap_type?: string
    severity?: string
    related_node?: string
    related_workstation?: string
    blocked_loop?: boolean
    owner_domain?: string
    github_issue_url?: string
    feishu_ref?: string
    next_action?: string
    verification_status?: string
  }) {
    return unwrap(api.post<{ id: number }>('/auth/governance/launch/gaps', body))
  },
  updateGap(
    id: number,
    body: Partial<{
      title: string
      description: string
      gap_type: string
      severity: string
      related_node: string
      related_workstation: string
      blocked_loop: boolean
      status: string
      owner_domain: string
      github_issue_url: string
      feishu_ref: string
      next_action: string
      verification_status: string
    }>,
  ) {
    return unwrap(api.put<{ id: number }>(`/auth/governance/launch/gaps/${id}`, body))
  },
  listGoals(params?: { scope?: string; status?: string }) {
    const sp = new URLSearchParams()
    if (params?.scope) sp.set('scope', params.scope)
    if (params?.status) sp.set('status', params.status)
    const q = sp.toString()
    return unwrap(api.get<{ items: LaunchGoalItem[]; total: number }>(
      `/auth/governance/launch/goals${q ? `?${q}` : ''}`,
    ))
  },
  createGoal(body: {
    title: string
    description?: string
    scope?: string
    target_date?: string | null
    progress_percent?: number
    gap_links?: number[]
    rhythm_notes?: string
  }) {
    return unwrap(api.post<{ id: number }>('/auth/governance/launch/goals', body))
  },
  updateGoal(
    id: number,
    body: Partial<{
      title: string
      description: string
      scope: string
      target_date: string | null
      progress_percent: number
      status: string
      gap_links: number[]
      rhythm_notes: string
    }>,
  ) {
    return unwrap(api.put<{ id: number }>(`/auth/governance/launch/goals/${id}`, body))
  },
}
