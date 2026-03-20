/**
 * 数字员工 — 动作箱 API
 * 对应后端：/api/v1/dashboard/assistant/actions/*
 * 供秘书台与 admin 动作中心统一调用
 */
import { api } from '../client'

export interface ActionItem {
  id: number
  action_type: string
  title: string
  description: string
  risk_level: 'low' | 'medium' | 'high'
  status: string
  requires_confirmation: boolean
  reason?: string
  next_actions?: string[]
  recommended_route?: string
  recommended_reason?: string
  priority_score?: number
  can_delegate_to_claw?: boolean
  capability_key?: string
  target_system?: string
  executor?: string
  operator_mode?: string
  expected_skills?: string[]
  minimum_context_requirements?: string[]
  context_coverage?: { score?: number; missing_items?: string[]; staleness_seconds?: number | null }
  missing_context_items?: string[]
  required_vs_granted_scopes?: { required?: string[]; granted?: string[]; missing?: string[] }
  latest_execution?: {
    execution_id: number
    result?: {
      status?: string
      channel?: string
      run_id?: string
      retry_count?: number
      output_artifact_count?: number
      screenshot_count?: number
      failed_step?: string
    }
  } | null
}

export interface ActionInboxResponse {
  items: ActionItem[]
}

export interface RouteRecommendedIn {
  dry_run_preferred?: boolean
}

export const assistantActionsApi = {
  /** 动作箱列表（支持 status 筛选，admin 可扩展 account_id / workstation 等） */
  getInbox(params?: { status?: string; account_id?: number; workstation?: string }) {
    return api.get<ActionInboxResponse>('/dashboard/assistant/actions/inbox', { params })
  },

  /** 确认动作 */
  confirm(actionId: number) {
    return api.post(`/dashboard/assistant/actions/${actionId}/confirm`, {})
  },

  /** 批量确认 */
  batchConfirm(actionIds: number[]) {
    return api.post('/dashboard/assistant/actions/batch-confirm', { action_ids: actionIds })
  },

  /** 拒绝动作 */
  reject(actionId: number, reason?: string) {
    return api.post(`/dashboard/assistant/actions/${actionId}/reject`, { reason: reason ?? '' })
  },

  /** 执行动作 */
  execute(actionId: number, overridePayload?: Record<string, unknown>) {
    return api.post(`/dashboard/assistant/actions/${actionId}/execute`, {
      override_payload: overridePayload ?? undefined,
    })
  },

  /** 按推荐路径处理 */
  routeRecommended(actionId: number, data?: RouteRecommendedIn) {
    return api.post(`/dashboard/assistant/actions/${actionId}/route-recommended`, {
      dry_run_preferred: data?.dry_run_preferred ?? true,
    })
  },

  /** 提交反馈 */
  feedback(actionId: number, adopted: boolean, score?: number) {
    return api.post(`/dashboard/assistant/actions/${actionId}/feedback`, { adopted, score })
  },

  /** 回写 Claw 执行回执 */
  clawReceipt(
    actionId: number,
    payload: {
      run_id?: string
      status?: string
      retry_count?: number
      output_artifacts?: unknown[]
      screenshot_refs?: string[]
      message?: string
      skills_used?: string[]
      step_traces?: unknown[]
      failed_step?: string
      context_coverage?: Record<string, unknown>
      required_vs_granted_scopes?: Record<string, unknown>
    },
  ) {
    return api.post(`/dashboard/assistant/actions/${actionId}/claw-receipt`, {
      run_id: payload.run_id ?? '',
      status: payload.status ?? 'success',
      retry_count: payload.retry_count ?? 0,
      output_artifacts: payload.output_artifacts ?? [],
      screenshot_refs: payload.screenshot_refs ?? [],
      message: payload.message ?? '',
      skills_used: payload.skills_used ?? [],
      step_traces: payload.step_traces ?? [],
      failed_step: payload.failed_step ?? '',
      context_coverage: payload.context_coverage ?? {},
      required_vs_granted_scopes: payload.required_vs_granted_scopes ?? {},
    })
  },

  /** 委派 Kimi Claw 执行 */
  delegateClaw(actionId: number, dryRun: boolean) {
    return api.post(`/dashboard/assistant/actions/${actionId}/delegate-claw`, { dry_run: dryRun })
  },

  /** 子衿上下文快照（供对话/建议注入） */
  getContext(params?: { time_range?: string }) {
    return api.get<{ context_payload?: Record<string, unknown>; window?: string }>(
      '/dashboard/assistant/context',
      { params: params ?? { time_range: '7d' } },
    )
  },

  /** 生成动作建议（基于上下文） */
  suggestAction(payload?: { intent?: string; include_explanation?: boolean }) {
    return api.post<{ created_count?: number; items?: unknown[] }>(
      '/dashboard/assistant/actions/suggest',
      { intent: payload?.intent ?? 'routine_ops', include_explanation: payload?.include_explanation ?? true },
    )
  },
}
