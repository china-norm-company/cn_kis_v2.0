import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, RefreshCw, TrendingUp, Users, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react'
import { listInsights, type ProactiveInsightItem } from '@/api/proactiveInsights'

const TYPE_LABELS: Record<string, string> = {
  trend_alert: '趋势预警',
  client_periodic: '客户洞察',
  project_recommendation: '项目推荐',
}

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  pending_review: '待审核',
  approved: '已审核',
  pushed: '已推送',
  acted: '已行动',
  dismissed: '已忽略',
  expired: '已过期',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  pushed: 'bg-blue-100 text-blue-700',
  acted: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-red-100 text-red-600',
  expired: 'bg-slate-100 text-slate-400',
}

const PRIORITY_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  critical: { label: '紧急', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  high:     { label: '高', cls: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  medium:   { label: '中', cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  low:      { label: '低', cls: 'bg-slate-100 text-slate-500', dot: 'bg-slate-400' },
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  trend_alert: <TrendingUp className="h-3.5 w-3.5" />,
  client_periodic: <Users className="h-3.5 w-3.5" />,
  project_recommendation: <Lightbulb className="h-3.5 w-3.5" />,
}

const PAGE_SIZE = 20

export function ProactiveInsightListPage() {
  const [items, setItems] = useState<ProactiveInsightItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [page, setPage] = useState(1)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    listInsights({
      insight_type: typeFilter || undefined,
      status: statusFilter || undefined,
      priority: priorityFilter || undefined,
      page,
      page_size: PAGE_SIZE,
    })
      .then((r) => {
        const d = (r as unknown as Record<string, unknown>).data as
          | { items: ProactiveInsightItem[]; total: number }
          | undefined
        if (d && Array.isArray(d.items)) {
          setItems(d.items)
          setTotal(d.total || 0)
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载失败，请稍后重试')
        setItems([])
        setTotal(0)
      })
      .finally(() => setLoading(false))
  }, [typeFilter, statusFilter, priorityFilter, page])

  useEffect(() => { load() }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6">
      {/* 页头 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">主动洞察</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            系统主动发现的市场趋势、客户机会与项目推荐
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          aria-label="刷新洞察列表"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 过滤栏 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1) }}
          aria-label="洞察类型过滤"
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">全部类型</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          aria-label="状态过滤"
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1) }}
          aria-label="优先级过滤"
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">全部优先级</option>
          <option value="critical">紧急</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>

        <span className="ml-auto text-sm text-slate-500">共 {total} 条</span>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto text-red-600 underline hover:no-underline">重试</button>
        </div>
      )}

      {/* 内容区 */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-slate-100 bg-slate-50" />
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Lightbulb className="mb-3 h-10 w-10 opacity-40" />
          <p className="text-sm">暂无洞察数据</p>
          <p className="mt-1 text-xs">触发扫描后，系统将自动分析并推送洞察</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const priorityCfg = PRIORITY_CONFIG[item.priority] ?? PRIORITY_CONFIG.medium
            return (
              <Link
                key={item.id}
                to={`/proactive-insights/${item.id}`}
                className="group block rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                data-testid={`insight-card-${item.id}`}
              >
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  {/* 类型标签 */}
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    {TYPE_ICON[item.insight_type]}
                    {TYPE_LABELS[item.insight_type] ?? item.insight_type}
                  </span>
                  {/* 优先级 */}
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${priorityCfg.cls}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${priorityCfg.dot}`} />
                    {priorityCfg.label}
                  </span>
                  {/* 状态 */}
                  <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_COLORS[item.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                  {item.client_name && (
                    <span className="ml-auto text-xs text-slate-400">{item.client_name}</span>
                  )}
                </div>
                <h3 className="mb-1 text-sm font-medium text-slate-800 group-hover:text-primary-700">
                  {item.title}
                </h3>
                <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">
                  {item.summary}
                </p>
                <div className="mt-2.5 flex items-center gap-4 text-xs text-slate-400">
                  <span>相关性 {(item.relevance_score * 100).toFixed(0)}%</span>
                  <span>{item.created_at?.slice(0, 16) ?? '—'}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
            上一页
          </button>
          <span className="min-w-[5rem] text-center text-sm text-slate-600">
            第 {page} / {totalPages} 页
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 disabled:cursor-not-allowed disabled:opacity-40 hover:enabled:bg-slate-50"
          >
            下一页
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
