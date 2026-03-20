import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw, AlertCircle, TrendingUp, Target, BarChart3, Award, Zap } from 'lucide-react'
import { getInsightAnalytics, type InsightAnalytics } from '@/api/proactiveInsights'

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
  acted: '#10b981',
  pushed: '#3b82f6',
  approved: '#22c55e',
  pending_review: '#f59e0b',
  draft: '#94a3b8',
  dismissed: '#ef4444',
  expired: '#cbd5e1',
}

type MetricCardProps = {
  label: string
  value: string | number
  sub?: string
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  testId?: string
}

function MetricCard({ label, value, sub, icon, testId }: MetricCardProps) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid={testId}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      {sub && <span className="text-xs text-slate-400">{sub}</span>}
    </div>
  )
}

function BarGroup({
  title, data, labels, colorMap,
}: {
  title: string
  data: Record<string, number>
  labels: Record<string, string>
  colorMap?: Record<string, string>
}) {
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const max = Math.max(...entries.map(([, v]) => v), 1)
  const total = entries.reduce((s, [, v]) => s + v, 0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-400">暂无数据</p>
      ) : (
        <div className="space-y-3">
          {entries.map(([key, val]) => {
            const color = colorMap?.[key] ?? '#3b82f6'
            const pct = total > 0 ? Math.round((val / total) * 100) : 0
            return (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">{labels[key] ?? key}</span>
                  <span className="text-slate-400">{val} <span className="text-slate-300">({pct}%)</span></span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(val / max) * 100}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RateGauge({ value, label }: { value: number; label: string }) {
  const pct = Math.round(value * 100)
  const color = pct >= 60 ? '#10b981' : pct >= 30 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f1f5f9" strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15.9" fill="none"
            stroke={color} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${pct} ${100 - pct}`}
            className="transition-all duration-500"
          />
        </svg>
        <span className="absolute text-sm font-bold" style={{ color }}>{pct}%</span>
      </div>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}

export function ProactiveAnalyticsPage() {
  const [data, setData] = useState<InsightAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getInsightAnalytics()
      .then((r) => {
        const d = (r as unknown as Record<string, unknown>).data as InsightAnalytics | undefined
        if (d) {
          setData(d)
          setLastUpdated(new Date())
        } else {
          setError('数据解析失败')
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载失败，请重试')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  if (loading && !data) {
    return (
      <div className="p-6">
        <div className="mb-6 h-6 w-40 animate-pulse rounded bg-slate-100" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-50" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* 页头 */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">洞察效果看板</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            主动洞察体系的采纳率、行动率与商机转化追踪
            {lastUpdated && <span className="ml-2 text-slate-400">更新于 {formatTime(lastUpdated)}</span>}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 错误 */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={load} className="ml-auto underline hover:no-underline">重试</button>
        </div>
      )}

      {data && (
        <>
          {/* 核心指标卡 */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard
              label="洞察总数"
              value={data.total}
              icon={<Zap className="h-4 w-4" />}
              testId="metric-total"
            />
            <MetricCard
              label="行动率"
              value={`${(data.act_rate * 100).toFixed(0)}%`}
              sub="推送后被行动的比例"
              icon={<Target className="h-4 w-4" />}
              testId="metric-act-rate"
            />
            <MetricCard
              label="忽略率"
              value={`${(data.dismiss_rate * 100).toFixed(0)}%`}
              sub="被忽略的比例"
              icon={<BarChart3 className="h-4 w-4" />}
              testId="metric-dismiss-rate"
            />
            <MetricCard
              label="平均满意度"
              value={data.avg_feedback_score != null ? `${data.avg_feedback_score.toFixed(1)}/5.0` : '-'}
              sub="用户反馈评分"
              icon={<Award className="h-4 w-4" />}
              testId="metric-avg-feedback"
            />
            <MetricCard
              label="商机转化"
              value={data.opportunity_conversions}
              sub="已关联商机数"
              icon={<TrendingUp className="h-4 w-4" />}
              testId="metric-opportunity"
            />
          </div>

          {/* 速率仪表盘 */}
          <div className="mb-6 flex items-center justify-center gap-12 rounded-xl border border-slate-200 bg-white py-6 shadow-sm">
            <RateGauge value={data.act_rate} label="行动率" />
            <div className="h-12 w-px bg-slate-100" />
            <RateGauge value={1 - data.dismiss_rate} label="采纳率" />
            <div className="h-12 w-px bg-slate-100" />
            <RateGauge
              value={data.total > 0 ? data.opportunity_conversions / data.total : 0}
              label="商机转化率"
            />
          </div>

          {/* 分布图 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BarGroup
              title="按状态分布"
              data={data.by_status ?? {}}
              labels={STATUS_LABELS}
              colorMap={STATUS_COLORS}
            />
            <BarGroup
              title="按类型分布"
              data={data.by_type ?? {}}
              labels={TYPE_LABELS}
            />
          </div>

          {/* 导航提示 */}
          {data.total === 0 && (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 p-8 text-center">
              <Zap className="mx-auto mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">尚无洞察数据</p>
              <p className="mt-1 text-xs text-slate-400">前往主动洞察触发扫描，系统将自动分析并生成洞察</p>
              <Link
                to="/proactive-insights"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                前往主动洞察
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  )
}
