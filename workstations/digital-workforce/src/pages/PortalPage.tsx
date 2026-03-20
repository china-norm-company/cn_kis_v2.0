import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bot, Eye, History, Inbox, Mail, PieChart, RefreshCw,
  ShieldAlert, Sparkles, TrendingUp, Zap,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { mailSignalsApi } from '@/api/mailSignals'

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  inquiry: '询价',
  competitor_pressure: '竞品压力',
  complaint: '投诉',
  project_followup: '项目跟进',
  relationship_signal: '关系信号',
  unknown: '待识别',
}

/** 所有工作台模块 — 与侧边栏导航保持一致 */
const ALL_MODULES = [
  {
    title: '邮件事件',
    description: '外部邮件信号识别、类型分类与关联确认',
    to: '/mail-signals',
    icon: Inbox,
    badge: null as string | null,
  },
  {
    title: '任务草稿',
    description: '由邮件自动生成的专项任务与动作草稿',
    to: '/mail-tasks',
    icon: Sparkles,
    badge: null as string | null,
  },
  {
    title: '执行回放',
    description: '已完成专项分析的执行历史与结果',
    to: '/replay',
    icon: History,
    badge: null as string | null,
  },
  {
    title: '复盘看板',
    description: '邮件处理效果、采纳率与商机贡献统计',
    to: '/analytics',
    icon: TrendingUp,
    badge: null as string | null,
  },
  {
    title: '主动洞察',
    description: '系统主动发现的市场趋势、客户机会与项目推荐',
    to: '/proactive-insights',
    icon: Eye,
    badge: null as string | null,
  },
  {
    title: '洞察看板',
    description: '主动洞察的行动率、商机转化与满意度追踪',
    to: '/proactive-analytics',
    icon: PieChart,
    badge: null as string | null,
  },
]

export function PortalPage() {
  const queryClient = useQueryClient()

  const signalQuery = useQuery({
    queryKey: ['digital-workforce', 'mail-signals', 'portal'],
    queryFn: () => mailSignalsApi.getList({ page_size: 20 }),
    staleTime: 30_000,
  })
  const taskQuery = useQuery({
    queryKey: ['digital-workforce', 'mail-task-plans', 'portal'],
    queryFn: mailSignalsApi.getTaskPlans,
    staleTime: 30_000,
  })

  const signalItems = signalQuery.data?.items ?? []
  const signalTotal = signalQuery.data?.pagination?.total ?? signalItems.length
  const taskItems = taskQuery.data?.items ?? []
  const taskTotal = taskQuery.data?.pagination?.total ?? taskItems.length
  const highRiskCount = signalItems.filter(
    (item) => item.mail_signal_type === 'competitor_pressure' || item.mail_signal_type === 'complaint',
  ).length
  const pendingConfirmCount = signalItems.reduce((sum, item) => sum + item.pending_confirm_count, 0)

  const isRefreshing = signalQuery.isFetching || taskQuery.isFetching

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['digital-workforce'] })
  }

  return (
    <div className="space-y-6">
      {/* 欢迎 banner */}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-700 p-6 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-white/10 p-3">
              <Bot className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">中书·智能台</h1>
              <p className="max-w-2xl text-sm text-slate-300">
                邮件驱动的客户价值创造中枢 — 信号理解 · 任务编排 · 专项分析 · 主动洞察
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white/80 hover:bg-white/20 disabled:opacity-50"
            aria-label="刷新全部数据"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </section>

      {/* 关键指标 */}
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="portal-stats">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Mail className="h-3.5 w-3.5" /> 邮件事件
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-800" data-testid="stat-total-signals">
            {signalQuery.isLoading ? '—' : signalTotal}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-xs text-amber-600">
            <Zap className="h-3.5 w-3.5" /> 待确认
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700" data-testid="stat-pending-confirm">
            {signalQuery.isLoading ? '—' : pendingConfirmCount}
          </div>
        </div>
        <div className="rounded-2xl border border-red-100 bg-red-50 p-5">
          <div className="flex items-center gap-2 text-xs text-red-600">
            <ShieldAlert className="h-3.5 w-3.5" /> 高风险信号
          </div>
          <div className="mt-2 text-2xl font-bold text-red-700" data-testid="stat-high-risk">
            {signalQuery.isLoading ? '—' : highRiskCount}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Sparkles className="h-3.5 w-3.5" /> 任务草稿
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-800" data-testid="stat-task-drafts">
            {taskQuery.isLoading ? '—' : taskTotal}
          </div>
        </div>
      </section>

      {/* 全部功能模块 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-500 uppercase tracking-wide">功能模块</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_MODULES.map((mod) => {
            const Icon = mod.icon
            return (
              <Link
                key={mod.to}
                to={mod.to}
                className="group relative flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-primary-200 hover:shadow-sm"
                data-testid={`portal-module-${mod.to.replace('/', '')}`}
              >
                <div className="shrink-0 rounded-xl bg-primary-50 p-2.5 text-primary-600 group-hover:bg-primary-100">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800 group-hover:text-primary-700">
                    {mod.title}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{mod.description}</p>
                </div>
                {mod.badge && (
                  <span className="absolute right-3 top-3 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                    {mod.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </div>
      </section>

      {/* 最近待处理邮件 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">最近待处理邮件</h2>
          <Link to="/mail-signals" className="text-xs text-primary-600 hover:underline">
            查看全部
          </Link>
        </div>
        <div className="space-y-2">
          {signalQuery.isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-50" />
              ))}
            </div>
          ) : signalItems.length === 0 ? (
            <div className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-500">
              当前还没有可供处理的邮件事件。
            </div>
          ) : (
            signalItems.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                to={`/mail-signals/${item.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3.5 transition hover:bg-slate-50"
                data-testid={`recent-mail-${item.id}`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {item.subject || '(无主题)'}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                    <span>{item.sender_name || item.sender_email}</span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600">
                      {SIGNAL_TYPE_LABELS[item.mail_signal_type] ?? item.mail_signal_type}
                    </span>
                    {item.pending_confirm_count > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700">
                        {item.pending_confirm_count} 待确认
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-slate-400">
                  {item.received_at ? item.received_at.slice(0, 10) : '—'}
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
