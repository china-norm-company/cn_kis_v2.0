/**
 * Phase 3：反馈汇总 — 全局 Agent 反馈统计趋势
 */
import { useQuery } from '@tanstack/react-query'
import { agentApi } from '@cn-kis/api-client'
import { Star, MessageSquare } from 'lucide-react'

const FEEDBACK_DAYS = 30

export default function FeedbackSummaryPage() {
  const { data: res } = useQuery({
    queryKey: ['digital-workforce', 'feedback-summary', FEEDBACK_DAYS],
    queryFn: () => agentApi.getFeedbackStats({ days: FEEDBACK_DAYS }),
  })

  const payload = (res as { data?: { agents?: Array<{ agent_id: string; avg_rating?: number; total_feedback?: number; rating_distribution?: Record<string, number> }>; period_days?: number } })?.data
  const agents = payload?.agents ?? []
  const periodDays = payload?.period_days ?? FEEDBACK_DAYS

  return (
    <div data-testid="feedback-summary-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">反馈汇总</h2>
        <p className="mt-1 text-sm text-slate-500">近 {periodDays} 天全局 Agent 用户满意度统计</p>
      </div>
      {agents.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">暂无反馈数据</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <div
              key={a.agent_id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-sm font-medium text-slate-800">{a.agent_id}</p>
                <span className="flex items-center gap-1 text-amber-500">
                  <Star className="h-4 w-4" />
                  <span className="text-sm font-semibold">{a.avg_rating != null ? a.avg_rating.toFixed(1) : '-'}</span>
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-slate-600">
                <MessageSquare className="h-4 w-4" />
                <span className="text-sm">反馈数 {a.total_feedback ?? 0}</span>
              </div>
              {a.rating_distribution && Object.keys(a.rating_distribution).length > 0 && (
                <div className="mt-2 flex gap-2 text-xs text-slate-500">
                  {Object.entries(a.rating_distribution).map(([k, v]) => (
                    <span key={k}>{k}星: {v}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
