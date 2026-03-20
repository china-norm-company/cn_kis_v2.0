import { useQueryClient, useQuery } from '@tanstack/react-query'
import { Clock, FlaskConical, RefreshCw, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import { mailSignalsApi } from '@/api/mailSignals'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

const PHASE2_TASK_KEYS = new Set(['market_trend_brief', 'competitive_intel_brief', 'claim_strategy_brief'])

const TASK_LABEL: Record<string, string> = {
  market_trend_brief: '品类趋势简报',
  competitive_intel_brief: '竞品情报简报',
  claim_strategy_brief: '宣称策略建议',
}

const AI_STATUS_INFO: Record<string, { label: string; tone: 'completed' | 'new' | 'error' | 'parsed' | 'tasked' }> = {
  done: { label: 'AI 增强完成', tone: 'completed' },
  done_kw: { label: '关键词模式', tone: 'parsed' },
  running: { label: '分析中…', tone: 'tasked' },
  failed: { label: 'AI 分析失败', tone: 'error' },
  pending: { label: '待执行', tone: 'new' },
}

function formatTime(raw?: string): string {
  if (!raw) return '时间待补'
  try {
    return new Date(raw).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return raw.slice(0, 16)
  }
}

export function ReplayPage() {
  const queryClient = useQueryClient()
  const QUERY_KEY = ['digital-workforce', 'mail-task-plans', 'replay']

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: mailSignalsApi.getTaskPlans,
    refetchInterval: 30000,
  })

  if (isLoading) return <QueryLoading loadingText="正在加载执行回放记录..." />
  if (error) return <QueryError error={error} />

  const allItems = data?.items ?? []
  // 显示所有 Phase 2 任务，包括 failed/running — 不再用 has_result 过滤
  const phase2Items = allItems
    .filter((i) => PHASE2_TASK_KEYS.has(i.task_key))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))

  const completedCount = phase2Items.filter((i) => i.has_result).length
  const failedCount = phase2Items.filter((i) => i.ai_analysis_status === 'failed').length
  const runningCount = phase2Items.filter((i) => i.ai_analysis_status === 'running').length

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary-50 p-3 text-primary-600">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">执行回放</h1>
            <p className="mt-1 text-sm text-slate-500">
              Phase 2 专项分析执行历史 —
              <span className="ml-1 text-emerald-600">完成 {completedCount}</span>
              {runningCount > 0 && <span className="ml-1 text-blue-600">· 执行中 {runningCount}</span>}
              {failedCount > 0 && <span className="ml-1 text-red-600">· 失败 {failedCount}</span>}
            </p>
          </div>
        </div>
        <button
          onClick={() => void queryClient.invalidateQueries({ queryKey: QUERY_KEY })}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          data-testid="btn-refresh-replay"
          aria-label="刷新执行记录"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {phase2Items.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
            <Clock className="h-10 w-10 text-slate-300" />
            <div>
              <p className="text-sm font-medium text-slate-600">还没有执行记录</p>
              <p className="mt-1 text-xs text-slate-400">
                在邮件事件详情页执行品类趋势/竞品情报/宣称策略分析后，记录将出现在这里。
              </p>
            </div>
            <Link
              to="/mail-signals"
              className="mt-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              前往邮件事件列表
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {phase2Items.map((item) => {
              const aiStatus = item.ai_analysis_status || 'pending'
              const statusInfo = AI_STATUS_INFO[aiStatus] ?? { label: aiStatus, tone: 'new' as const }
              const isFailed = aiStatus === 'failed'
              const isRunning = aiStatus === 'running'
              return (
                <Link
                  key={item.id}
                  to={item.source_event_id ? `/mail-signals/${item.source_event_id}` : '/mail-tasks'}
                  className={`block px-6 py-4 transition hover:bg-slate-50 ${isFailed ? 'border-l-2 border-l-red-400' : ''}`}
                  data-testid={`replay-item-${item.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-800 truncate max-w-xs">{item.title}</h2>
                        <StatusBadge tone={statusInfo.tone}>{statusInfo.label}</StatusBadge>
                        {isRunning && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            分析中
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        <span className="font-medium text-indigo-600">
                          {TASK_LABEL[item.task_key] ?? item.task_key}
                        </span>
                        <span>任务状态：{item.status}</span>
                        <span>来源事件：{item.source_event_id ?? '-'}</span>
                        {item.priority_score != null && (
                          <span>优先级：{item.priority_score}</span>
                        )}
                      </div>
                      {isFailed && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <RotateCcw className="h-3 w-3" />
                          分析失败 — 点击进入详情页重新执行
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-xs text-slate-400 whitespace-nowrap">
                      {formatTime(item.created_at)}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {allItems.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          共 {phase2Items.length} 条 Phase 2 专项任务：完成 {completedCount}
          {runningCount > 0 && ` · 执行中 ${runningCount}`}
          {failedCount > 0 && ` · 失败 ${failedCount}`}
        </p>
      )}
    </div>
  )
}
