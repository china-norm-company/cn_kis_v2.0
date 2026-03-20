/**
 * 数字员工 — 执行回放 API
 * 对应后端：/api/v1/dashboard/assistant/actions/{id}/replay
 * 供秘书台回放页与 admin 执行回放中心统一调用
 */
import { api } from '../client'

export interface ReplayExecutionResult {
  status?: string
  channel?: string
  run_id?: string
  retry_count?: number
  message?: string
  output_artifact_count?: number
  screenshot_count?: number
  skills_used?: string[]
  failed_step?: string
  context_coverage?: { score?: number; missing_items?: string[]; staleness_seconds?: number | null }
  required_vs_granted_scopes?: { required?: string[]; granted?: string[]; missing?: string[] }
}

export interface ReplayExecution {
  execution_id: number
  result?: ReplayExecutionResult
  target_refs?: Array<{ type?: string; items?: Array<Record<string, unknown> | string> }>
  started_at?: string
  finished_at?: string
}

export interface ReplayAction {
  id: number
  action_type: string
  title: string
  status: string
  capability_key?: string
  target_system?: string
  executor?: string
  operator_mode?: string
  permission_proofs?: Array<{ permission: string; granted: boolean }>
  required_feishu_scopes?: string[]
  expected_skills?: string[]
  minimum_context_requirements?: string[]
  context_coverage?: { score?: number; missing_items?: string[]; staleness_seconds?: number | null }
  missing_context_items?: string[]
  required_vs_granted_scopes?: { required?: string[]; granted?: string[]; missing?: string[] }
}

export interface ReplayResponse {
  ok: boolean
  action?: ReplayAction
  executions: ReplayExecution[]
}

export const assistantReplayApi = {
  /** 获取单条动作的执行回放 */
  getByActionId(actionId: number) {
    return api.get<ReplayResponse>(`/dashboard/assistant/actions/${actionId}/replay`)
  },
}
