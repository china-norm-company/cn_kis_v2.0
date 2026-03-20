/**
 * Phase 2：通道健康 — Agent 通道稳定性与 fallback 率
 */
import { useQuery } from '@tanstack/react-query'
import { agentApi } from '@cn-kis/api-client'
import { Activity, AlertTriangle, TrendingUp } from 'lucide-react'

const FALLBACK_DAYS = 7

export default function ChannelHealthPage() {
  const { data: res } = useQuery({
    queryKey: ['digital-workforce', 'fallback-metrics', FALLBACK_DAYS],
    queryFn: () => agentApi.getFallbackMetrics({ days: FALLBACK_DAYS }),
  })

  const payload = (res as { data?: { summary?: { total_calls: number; fallback_success: number; fallback_failed: number; fallback_rate: number; success_rate: number }; by_agent?: Array<{ agent_id: string; total_calls: number; fallback_success: number; fallback_failed: number; fallback_rate: number; success_rate: number }>; error_types?: Array<{ type: string; count: number }> } })?.data
  const summary = payload?.summary
  const byAgent = payload?.by_agent ?? []
  const errorTypes = payload?.error_types ?? []

  return (
    <div data-testid="channel-health-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">通道健康</h2>
        <p className="mt-1 text-sm text-slate-500">近 {FALLBACK_DAYS} 天 Agent 通道稳定性与回退率</p>
      </div>
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-slate-600">
              <Activity className="h-4 w-4" />
              <span className="text-sm font-medium">总调用</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-slate-800">{summary.total_calls}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-slate-600">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-medium">成功率</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-slate-800">{((summary.success_rate ?? 0) * 100).toFixed(1)}%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-slate-600">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">回退率</span>
            </div>
            <p className="mt-1 text-2xl font-semibold text-slate-800">{((summary.fallback_rate ?? 0) * 100).toFixed(1)}%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <span className="text-sm font-medium text-slate-600">回退失败</span>
            <p className="mt-1 text-2xl font-semibold text-slate-800">{summary.fallback_failed ?? 0}</p>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">按 Agent</h3>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">
            {byAgent.length === 0 ? (
              <li className="text-slate-500">暂无数据</li>
            ) : (
              byAgent.map((a) => (
                <li key={a.agent_id} className="flex justify-between rounded bg-slate-50 px-2 py-1">
                  <span className="truncate font-mono text-slate-700">{a.agent_id}</span>
                  <span className="shrink-0 text-slate-600">成功率 {(a.success_rate * 100).toFixed(0)}% · 回退 {(a.fallback_rate * 100).toFixed(0)}%</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">错误类型分布</h3>
          <ul className="mt-2 max-h-64 space-y-1 text-sm">
            {errorTypes.length === 0 ? (
              <li className="text-slate-500">暂无</li>
            ) : (
              errorTypes.map((e) => (
                <li key={e.type} className="flex justify-between">
                  <span className="text-slate-700">{e.type}</span>
                  <span className="text-slate-600">{e.count}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
