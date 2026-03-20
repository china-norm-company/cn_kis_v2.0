import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MailWarning, RefreshCw } from 'lucide-react'
import { mailSignalsApi } from '@/api/mailSignals'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

const STATUS_LABELS: Record<string, string> = {
  new: '新邮件',
  parsed: '已解析',
  linked: '已关联',
  tasked: '已建任务',
  completed: '已完成',
  ignored: '已忽略',
  error: '处理出错',
}

const SIGNAL_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '全部类型' },
  { value: 'inquiry', label: '询价/合作意向' },
  { value: 'project_followup', label: '项目执行沟通' },
  { value: 'competitor_pressure', label: '竞品/市场压力' },
  { value: 'complaint', label: '投诉/强负反馈' },
  { value: 'relationship_signal', label: '关系变化信号' },
  { value: 'unknown', label: '未分类' },
]

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: '全部状态' },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

function getTone(status: string): 'new' | 'parsed' | 'linked' | 'tasked' | 'completed' | 'ignored' | 'error' {
  if (status === 'parsed' || status === 'linked' || status === 'tasked' || status === 'completed' || status === 'ignored' || status === 'error') {
    return status
  }
  return 'new'
}

function formatTime(raw?: string, fallback?: string): string {
  const src = raw || fallback
  if (!src) return '—'
  try {
    return new Date(src).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return src.slice(0, 16)
  }
}

export function MailSignalListPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [signalTypeFilter, setSignalTypeFilter] = useState<string>('all')
  const [externalFilter, setExternalFilter] = useState<string>('all')
  const queryClient = useQueryClient()

  const queryKey = ['digital-workforce', 'mail-signals', { statusFilter, signalTypeFilter, externalFilter }]

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey,
    queryFn: () => mailSignalsApi.getList({
      status: statusFilter !== 'all' ? statusFilter : undefined,
      mail_signal_type: signalTypeFilter !== 'all' ? signalTypeFilter : undefined,
      is_external: externalFilter === 'external' ? true : externalFilter === 'internal' ? false : undefined,
    }),
  })

  if (isLoading) return <QueryLoading loadingText="正在加载邮件事件..." />
  if (error) return <QueryError error={error} />

  const items = data?.items ?? []
  const items_sorted = [...items].sort((a, b) => {
    const aScore = (a.importance_score ?? 0) + (a.pending_confirm_count * 10)
    const bScore = (b.importance_score ?? 0) + (b.pending_confirm_count * 10)
    return bScore - aScore
  })
  const pendingCount = items.filter((item) => item.pending_confirm_count > 0).length
  const highRiskCount = items.filter((item) =>
    item.mail_signal_type === 'competitor_pressure' || item.mail_signal_type === 'complaint'
  ).length

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">邮件事件中心</h1>
          <p className="mt-1 text-sm text-slate-500">查看外部邮件信号、关联客户和动作箱任务草稿入口。</p>
        </div>
        <button
          onClick={() => void queryClient.invalidateQueries({ queryKey })}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          data-testid="btn-refresh-signals"
          aria-label="刷新邮件事件"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="stat-signal-total">
          <div className="text-xs text-slate-500">邮件事件总数</div>
          <div className="mt-2 text-xl font-semibold text-slate-800">{items.length}</div>
        </div>
        <div className="rounded-2xl border border-amber-50 bg-amber-50 p-4" data-testid="stat-signal-pending">
          <div className="text-xs text-amber-600">需确认事件</div>
          <div className="mt-2 text-xl font-semibold text-amber-700">{pendingCount}</div>
        </div>
        <div className="rounded-2xl border border-red-50 bg-red-50 p-4" data-testid="stat-signal-high-risk">
          <div className="text-xs text-red-600">高风险信号</div>
          <div className="mt-2 text-xl font-semibold text-red-700">{highRiskCount}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">状态筛选</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              aria-label="状态筛选"
            >
              {STATUS_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">邮件类型</span>
            <select
              value={signalTypeFilter}
              onChange={(e) => setSignalTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              aria-label="邮件类型筛选"
            >
              {SIGNAL_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">内外部</span>
            <select
              value={externalFilter}
              onChange={(e) => setExternalFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
              aria-label="内外部筛选"
            >
              <option value="all">全部</option>
              <option value="external">外部邮件</option>
              <option value="internal">内部邮件</option>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <MailWarning className="h-8 w-8 text-slate-300" />
            <div>
              <h2 className="text-base font-medium text-slate-700">当前筛选条件下暂无邮件事件</h2>
              <p className="mt-1 text-sm text-slate-500">可以切换状态、邮件类型或内外部筛选，查看其他邮件信号。</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {items_sorted.map((item) => (
              <Link
                key={item.id}
                to={`/mail-signals/${item.id}`}
                className="block px-6 py-4 transition hover:bg-slate-50"
                data-testid={`mail-card-${item.id}`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-800">{item.subject || '(无主题)'}</h2>
                      <StatusBadge tone={getTone(item.status)}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </StatusBadge>
                    </div>
                    <p className="text-sm text-slate-500">
                      {item.sender_name || item.sender_email}
                      {' · '}
                      {item.sender_email}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>类型：{SIGNAL_TYPE_OPTIONS.find(o => o.value === item.mail_signal_type)?.label ?? item.mail_signal_type}</span>
                      <span>客户：{item.primary_client?.label || '未关联'}</span>
                      <span>任务：{item.task_count}</span>
                      <span>待确认：{item.pending_confirm_count}</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 whitespace-nowrap">
                    {formatTime(item.received_at)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
