/**
 * Phase 3：Agent 目录 — 完整画像 + 暂停/恢复/预算控制
 * 需 dashboard.admin.manage 权限
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { agentApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Bot, Star, Pause, Play, DollarSign, GraduationCap } from 'lucide-react'
import { AdminNoPermission } from '../components/AdminNoPermission'
import React, { useState } from 'react'

type AgentItem = {
  agent_id: string
  name: string
  description: string
  capabilities: string[]
  provider: string
}

type CostItem = {
  agent_id: string
  name: string
  paused: boolean
  monthly_budget_usd: number | null
  current_month_spend_usd: number
  remaining_usd: number | null
  utilization_pct: number
}

export default function AgentDirectoryPage() {
  const queryClient = useQueryClient()

  const { data: agentsRes } = useQuery({
    queryKey: ['digital-workforce', 'agents-list'],
    queryFn: () => agentApi.listAgents(),
  })
  const { data: statsRes } = useQuery({
    queryKey: ['digital-workforce', 'agents-feedback-stats', 30],
    queryFn: () => agentApi.getFeedbackStats({ days: 30 }),
  })
  const { data: costRes } = useQuery({
    queryKey: ['digital-workforce', 'agent-cost-overview'],
    queryFn: () => digitalWorkforcePortalApi.getAgentCostOverview(),
  })

  const agents = (agentsRes as { data?: { items?: AgentItem[] } })?.data?.items ?? []
  const statsList = (statsRes as { data?: { agents?: Array<{ agent_id: string; avg_rating?: number; total_feedback?: number }> } })?.data
  const statsByAgent = (statsList?.agents ?? []).reduce(
    (acc, s) => { acc[s.agent_id] = s; return acc },
    {} as Record<string, { avg_rating?: number; total_feedback?: number }>,
  )
  const costItems = ((costRes as { data?: { data?: { items?: CostItem[] } } })?.data?.data?.items ?? [])
  const costByAgent = costItems.reduce(
    (acc, c) => { acc[c.agent_id] = c; return acc },
    {} as Record<string, CostItem>,
  )

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'agent-cost-overview'] })
    queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'agents-list'] })
  }

  const pauseMut = useMutation({
    mutationFn: (agentId: string) => digitalWorkforcePortalApi.pauseAgent(agentId, '管理员暂停'),
    onSuccess: invalidate,
  })
  const resumeMut = useMutation({
    mutationFn: (agentId: string) => digitalWorkforcePortalApi.resumeAgent(agentId),
    onSuccess: invalidate,
  })

  const isPending = pauseMut.isPending || resumeMut.isPending
  const [trainingAgentId, setTrainingAgentId] = useState<string | null>(null)

  return (
    <PermissionGuard permission="dashboard.admin.manage" fallback={<AdminNoPermission />}>
    <div data-testid="agent-directory-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Agent 目录</h2>
        <p className="mt-1 text-sm text-slate-500">全部智能体画像 · 暂停/恢复/预算控制</p>
      </div>

      {/* 成本概览卡片 */}
      {costItems.length > 0 && (
        <div data-testid="agent-cost-overview" className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <DollarSign className="h-4 w-4" /> Agent 成本概览
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {costItems.filter(c => c.monthly_budget_usd).map(c => (
              <div key={c.agent_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-slate-700">{c.name}</p>
                  <p className="text-xs text-slate-400">${c.current_month_spend_usd.toFixed(2)} / ${c.monthly_budget_usd?.toFixed(0)}</p>
                </div>
                <span className={`text-sm font-semibold ${
                  c.utilization_pct >= 100 ? 'text-red-500' :
                  c.utilization_pct >= 80 ? 'text-amber-500' : 'text-green-600'
                }`}>
                  {c.utilization_pct.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">暂无 Agent 数据</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => {
            const stat = statsByAgent[a.agent_id]
            const cost = costByAgent[a.agent_id]
            const paused = cost?.paused ?? false

            return (
              <div
                key={a.agent_id}
                className={`rounded-xl border bg-white p-4 shadow-sm ${paused ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${paused ? 'bg-red-100 text-red-500' : 'bg-violet-100 text-violet-600'}`}>
                    {paused ? <Pause className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.agent_id} · {a.provider}</p>
                  </div>
                  {/* 暂停/恢复按钮 */}
                  <button
                    disabled={isPending}
                    onClick={() => paused ? resumeMut.mutate(a.agent_id) : pauseMut.mutate(a.agent_id)}
                    className={`rounded px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                      paused
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    title={paused ? '恢复' : '暂停'}
                  >
                    {paused ? (
                      <span className="flex items-center gap-1"><Play className="h-3 w-3" /> 恢复</span>
                    ) : (
                      <span className="flex items-center gap-1"><Pause className="h-3 w-3" /> 暂停</span>
                    )}
                  </button>
                  {/* 训练按钮 */}
                  <button
                    onClick={() => setTrainingAgentId(a.agent_id)}
                    className="rounded px-2 py-1 text-xs font-medium bg-violet-50 text-violet-700 hover:bg-violet-100"
                    title="训练模式"
                  >
                    <span className="flex items-center gap-1"><GraduationCap className="h-3 w-3" /> 训练</span>
                  </button>
                </div>

                {paused && (
                  <div className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
                    已暂停：{cost?.paused ? '管理员暂停' : '预算耗尽'}
                  </div>
                )}

                {a.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{a.description}</p>
                )}
                {Array.isArray(a.capabilities) && a.capabilities.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.capabilities.slice(0, 3).map((c) => (
                      <span key={c} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{c}</span>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-4 text-sm text-slate-500">
                  {stat?.total_feedback != null && (
                    <span className="flex items-center gap-1">
                      <Star className="h-4 w-4" />
                      反馈 {stat.total_feedback} 次
                      {stat.avg_rating != null && ` · 均分 ${stat.avg_rating.toFixed(1)}`}
                    </span>
                  )}
                  {cost?.monthly_budget_usd && (
                    <span className="text-xs text-slate-400">
                      ${cost.current_month_spend_usd.toFixed(2)} / ${cost.monthly_budget_usd.toFixed(0)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 训练面板 */}
      {trainingAgentId && <TrainingPanel agentId={trainingAgentId} onClose={() => setTrainingAgentId(null)} />}
    </div>
    </PermissionGuard>
  )
}


function TrainingPanel({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [agentOutput, setAgentOutput] = React.useState('')
  const [scenarioId, setScenarioId] = React.useState('')
  const [feedback, setFeedback] = React.useState('')
  const [score, setScore] = React.useState(7)

  const startMut = useMutation({
    mutationFn: () => digitalWorkforcePortalApi.startAgentTraining(agentId),
    onSuccess: (res: { data?: { data?: { session_id?: string; agent_output?: string; scenario_id?: string } } }) => {
      const d = res?.data?.data
      setSessionId(d?.session_id ?? null)
      setAgentOutput(d?.agent_output ?? '')
      setScenarioId(d?.scenario_id ?? '')
    },
  })

  const feedbackMut = useMutation({
    mutationFn: () => digitalWorkforcePortalApi.submitTrainingFeedback(agentId, sessionId!, {
      scenario_id: scenarioId, agent_output: agentOutput, score: score / 10, feedback,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-training-history', agentId] })
      setFeedback('')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">训练模式 — {agentId}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>

        {!sessionId ? (
          <div className="text-center py-8">
            <p className="text-slate-500 mb-4">启动训练会话，Agent 将使用标准场景生成输出供你评分。</p>
            <button
              onClick={() => startMut.mutate()}
              disabled={startMut.isPending}
              className="rounded-lg bg-violet-600 px-6 py-2 text-sm text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {startMut.isPending ? '加载中...' : '开始训练'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">场景 ID: {scenarioId}</p>
              <div className="max-h-48 overflow-y-auto rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                {agentOutput || '（无输出）'}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">评分: {score}/10</label>
              <input type="range" min={1} max={10} value={score} onChange={e => setScore(Number(e.target.value))}
                className="w-full mt-1" aria-label={`评分 ${score}/10`} />
            </div>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="修正建议（可选，留空则仅记录评分）..."
              className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:outline-none focus:ring-1 focus:ring-violet-400"
              rows={3}
            />
            <button
              onClick={() => feedbackMut.mutate()}
              disabled={feedbackMut.isPending}
              className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {feedbackMut.isPending ? '保存中...' : '提交反馈'}
            </button>
            {feedbackMut.isSuccess && <p className="text-center text-xs text-green-600">反馈已保存</p>}
          </div>
        )}
      </div>
    </div>
  )
}
