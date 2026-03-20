import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart2, ClipboardList, RefreshCw, Sparkles } from 'lucide-react'
import { mailSignalsApi } from '@/api/mailSignals'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

const PHASE2_TASK_KEYS = new Set(['market_trend_brief', 'competitive_intel_brief', 'claim_strategy_brief'])

const TASK_LABEL: Record<string, string> = {
  opportunity_draft: '商机草稿',
  client_profile_update: '客户画像更新',
  research_context_sync: '研究上下文同步',
  client_risk_alert: '客户风险提醒',
  followup_action_draft: '跟进动作草稿',
  market_trend_brief: '品类趋势简报',
  competitive_intel_brief: '竞品情报简报',
  claim_strategy_brief: '宣称策略建议',
}

const TASK_PHASE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '全部任务' },
  { value: 'phase2', label: 'Phase 2 专项' },
  { value: 'phase1', label: 'Phase 1 业务' },
]

const AI_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  done: { label: 'AI 已增强', color: 'text-emerald-600' },
  done_kw: { label: '关键词模式', color: 'text-amber-600' },
  running: { label: '分析中…', color: 'text-indigo-600' },
  failed: { label: 'AI 失败', color: 'text-red-500' },
  pending: { label: '待执行', color: 'text-slate-400' },
}

const STATUS_LABELS: Record<string, string> = {
  suggested: '草稿',
  pending_confirm: '待确认',
  confirmed: '已确认',
  rejected: '已拒绝',
  executed: '已执行',
  failed: '执行失败',
  cancelled: '已取消',
}

function getTaskLabel(taskKey: string): string {
  return TASK_LABEL[taskKey] || taskKey
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

function AiStatusTag({ status }: { status?: string }) {
  const s = status || 'pending'
  const info = AI_STATUS_LABEL[s] ?? { label: s, color: 'text-slate-400' }
  return <span className={`text-xs font-medium ${info.color}`}>{info.label}</span>
}

function Phase2ExecuteButton({
  item,
}: {
  item: { id: number; task_key: string; source_event_id?: number; ai_analysis_status?: string; has_result?: unknown }
}) {
  const queryClient = useQueryClient()
  const signalId = String(item.source_event_id ?? '')
  const taskId = item.id
  const alreadyDone = item.ai_analysis_status === 'done' || item.ai_analysis_status === 'done_kw'

  const executeMutation = useMutation({
    mutationFn: () => mailSignalsApi.executeAnalysis(signalId, taskId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'mail-task-plans'] })
    },
  })

  if (!signalId || alreadyDone) return null

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        executeMutation.mutate()
      }}
      disabled={executeMutation.isPending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
      data-testid={`btn-execute-${taskId}`}
    >
      <Sparkles className="h-3 w-3" />
      {executeMutation.isPending ? '分析中…' : '执行分析'}
    </button>
  )
}

export function MailTaskDraftPage() {
  const queryClient = useQueryClient()
  const [phaseFilter, setPhaseFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const QUERY_KEY = ['digital-workforce', 'mail-task-plans']
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: mailSignalsApi.getTaskPlans,
    refetchInterval: 30000,
  })

  if (isLoading) return <QueryLoading loadingText="正在加载邮件任务草稿..." />
  if (error) return <QueryError error={error} />

  const rawItems = [...(data?.items ?? [])].sort((a, b) => {
    const aPriority = Number(a.priority_score ?? 0)
    const bPriority = Number(b.priority_score ?? 0)
    if (aPriority !== bPriority) return bPriority - aPriority
    return String(b.created_at || '').localeCompare(String(a.created_at || ''))
  })

  // 应用过滤
  const items = rawItems
    .filter((i) => {
      if (phaseFilter === 'phase2') return PHASE2_TASK_KEYS.has(i.task_key)
      if (phaseFilter === 'phase1') return !PHASE2_TASK_KEYS.has(i.task_key)
      return true
    })
    .filter((i) => {
      if (statusFilter === 'all') return true
      return i.status === statusFilter
    })

  const phase2Items = items.filter((i) => PHASE2_TASK_KEYS.has(i.task_key))
  const phase1Items = items.filter((i) => !PHASE2_TASK_KEYS.has(i.task_key))

  const statusOptions = Array.from(new Set(rawItems.map((i) => i.status))).sort()

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary-50 p-3 text-primary-600">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">邮件任务草稿</h1>
            <p className="mt-1 text-sm text-slate-500">
              查看并执行由邮件信号生成的动作箱任务草稿。
              共 <strong>{rawItems.length}</strong> 条
              {items.length !== rawItems.length && <>，已筛选 <strong>{items.length}</strong> 条</>}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void queryClient.invalidateQueries({ queryKey: QUERY_KEY })}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          data-testid="btn-refresh-tasks"
          aria-label="刷新任务草稿"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </section>

      {/* 过滤栏 */}
      <section className="rounded-xl border border-slate-100 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">阶段：</span>
            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700"
              aria-label="任务阶段过滤"
            >
              {TASK_PHASE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">状态：</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700"
              aria-label="任务状态过滤"
            >
              <option value="all">全部状态</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
              ))}
            </select>
          </label>
          {(phaseFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => { setPhaseFilter('all'); setStatusFilter('all') }}
              className="text-xs text-slate-400 hover:text-slate-600 underline"
            >
              清除筛选
            </button>
          )}
        </div>
      </section>

      {phase2Items.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <BarChart2 className="h-4 w-4 text-indigo-500" />
            Phase 2 专项分析任务
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600">{phase2Items.length}</span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-white">
            <div className="divide-y divide-slate-100">
              {phase2Items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 px-6 py-4 hover:bg-slate-50" data-testid={`task-item-${item.id}`}>
                  <Link
                    to={item.source_event_id ? `/mail-signals/${item.source_event_id}` : '/mail-signals'}
                    className="min-w-0 flex-1 space-y-1"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-800">{item.title}</h2>
                      <StatusBadge tone={item.risk_level === 'high' ? 'high' : item.risk_level === 'medium' ? 'medium' : 'low'}>
                        {item.risk_level}
                      </StatusBadge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{getTaskLabel(item.task_key)}</span>
                      <span>状态：{STATUS_LABELS[item.status] ?? item.status}</span>
                      <AiStatusTag status={item.ai_analysis_status} />
                      <span>来源事件：{item.source_event_id ?? '-'}</span>
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-xs text-slate-400">{formatTime(item.created_at)}</span>
                    <Phase2ExecuteButton item={item} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          Phase 1 业务回写任务
          {phase1Items.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{phase1Items.length}</span>
          )}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {phase1Items.length === 0 && phase2Items.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-slate-500">
              当前还没有由邮件生成的任务草稿。
            </div>
          ) : phase1Items.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-400">
              {phaseFilter !== 'all' || statusFilter !== 'all' ? '当前筛选条件下无 Phase 1 任务。' : '暂无 Phase 1 任务。'}
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {phase1Items.map((item) => (
                <Link
                  key={item.id}
                  to={item.source_event_id ? `/mail-signals/${item.source_event_id}` : '/mail-signals'}
                  className="block px-6 py-4 transition hover:bg-slate-50"
                  data-testid={`task-item-${item.id}`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-slate-800">{item.title}</h2>
                        <StatusBadge tone={item.risk_level === 'high' ? 'high' : item.risk_level === 'medium' ? 'medium' : 'low'}>
                          {item.risk_level}
                        </StatusBadge>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>任务：{getTaskLabel(item.task_key)}</span>
                        <span>状态：{STATUS_LABELS[item.status] ?? item.status}</span>
                        <span>来源事件：{item.source_event_id ?? '-'}</span>
                        <span>优先级：{String(item.priority_score ?? '-')}</span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 whitespace-nowrap">
                      {formatTime(item.created_at)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
