/**
 * 智能体网关 API 模块
 *
 * 对应后端：/api/v1/agents/
 * 双通道：火山引擎 ARK + Kimi
 */
import { api } from '../client'

export interface AgentDefinition {
  agent_id: string
  name: string
  description: string
  capabilities: string[]
  provider: 'ark' | 'kimi'
  is_active: boolean
}

export interface AgentSession {
  session_id: string
  account_id: number
  agent_id: string
  context: Record<string, unknown>
  created_at: string
  call_count: number
}

export interface AgentCall {
  id: number
  input_text: string
  output_text: string
  provider: string
  status: string
  duration_ms: number
  created_at: string
}

export interface ChatResponse {
  response: string
  session_id: string
  agent_id: string
  provider: string
  call_id: number
  duration_ms: number
  status: string
}

export interface InsightResponse {
  insight: string
  agent_id: string
}

export const agentApi = {
  /** 发送消息给智能体 */
  chat(data: {
    agent_id: string; message: string;
    context?: Record<string, unknown>; session_id?: string
  }) {
    return api.post<ChatResponse>('/agents/chat', data)
  },

  /** 列出可用智能体 */
  listAgents() {
    return api.get<{ items: AgentDefinition[] }>('/agents/list')
  },

  /** 列出聊天会话 */
  listSessions() {
    return api.get<{ items: AgentSession[] }>('/agents/sessions')
  },

  /** 获取聊天历史 */
  getSessionHistory(sessionId: string) {
    return api.get<{
      session_id: string; agent_id: string; context: Record<string, unknown>;
      created_at: string; history: AgentCall[]
    }>(`/agents/sessions/${sessionId}/history`)
  },

  /** D1: 上下文 AI 触发 */
  triggerInsight(data: {
    agent_id: string; context_type: string;
    context_data: Record<string, unknown>
  }) {
    return api.post<InsightResponse>('/agents/trigger-insight', data)
  },

  /** 对 Agent 回复打分（1-5），可选文字反馈 */
  submitCallFeedback(callId: number, payload: { rating: number; feedback_text?: string }) {
    return api.post<{ code: number; msg: string; data?: { call_id: number; rating: number } }>(
      `/agents/calls/${callId}/feedback`,
      { call_id: callId, ...payload }
    )
  },

  /** 获取 Agent 反馈统计（不传 agent_id 时返回全部） */
  getFeedbackStats(params?: { agent_id?: string; days?: number }) {
    return api.get<{
      code: number
      msg: string
      data: { agents?: Array<{ agent_id: string; avg_rating?: number; total_feedback?: number; rating_distribution?: Record<string, number> }>; period_days?: number }
        | { avg_rating?: number; total_feedback?: number; rating_distribution?: Record<string, number> }
    }>('/agents/feedback/stats', { params: params ?? { days: 30 } })
  },

  /** 通道回退监控指标（按天、按 Agent、错误类型） */
  getFallbackMetrics(params?: { days?: number; agent_id?: string }) {
    return api.get<{
      code: number
      msg: string
      data: {
        window_days: number
        agent_filter?: string
        summary: { total_calls: number; fallback_success: number; fallback_failed: number; fallback_rate: number; success_rate: number }
        by_agent: Array<{ agent_id: string; total_calls: number; fallback_success: number; fallback_failed: number; fallback_rate: number; success_rate: number; success_calls: number }>
        by_day: Array<{ date: string; total_calls: number; fallback_success: number; fallback_failed: number }>
        error_types: Array<{ type: string; count: number }>
      }
    }>('/agents/fallback/metrics', { params: params ?? { days: 7 } })
  },
}
