import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { SuggestionItem } from '@cn-kis/api-client'
import { MaterialCostSummary } from '../components/MaterialCostSummary'
import { StatCard, Badge, Empty, ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar } from '@cn-kis/ui-kit'
import type { QuickAction, SuggestionAction } from '@cn-kis/ui-kit'
import {
  Banknote, FileText, AlertTriangle, TrendingUp, TrendingDown,
  Receipt, Clock, Users, ShieldAlert, ArrowUp, ArrowDown,
  Percent, DollarSign, BarChart3, CheckCircle2, PieChart as PieIcon,
  Bot, ExternalLink,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

type Period = 'month' | 'quarter' | 'year'
const PERIOD_LABELS: Record<Period, string> = { month: '本月', quarter: '本季', year: '本年' }
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']
const AGING_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#f97316', '#ef4444']

function fmtWan(v: number | undefined) {
  if (v == null) return '--'
  return `¥${(v / 10000).toFixed(1)}万`
}

function TrendIndicator({ value, suffix = '' }: { value?: number | null; suffix?: string }) {
  if (value == null) return <span className="text-xs text-slate-400">--</span>
  const up = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(value).toFixed(1)}{suffix}
    </span>
  )
}

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

/** 财务台·数字员工摘要卡：最近报价输入项，跳转中书回放 */
function FinanceDigitalWorkforceCard() {
  const { data: runsRes } = useQuery({
    queryKey: ['digital-workforce', 'replay-runs', 'finance'],
    queryFn: () => digitalWorkforcePortalApi.getReplayRuns({ workstation_key: 'finance', limit: 1 }),
  })
  const run = runsRes?.data?.data?.items?.[0]
  const { data: replayRes } = useQuery({
    queryKey: ['digital-workforce', 'replay', run?.task_id],
    queryFn: () => digitalWorkforcePortalApi.getReplay(run!.task_id),
    enabled: !!run?.task_id,
  })
  const replay = replayRes?.data?.data
  const artifacts = (replay?.structured_artifacts ?? {}) as Record<string, unknown>
  const quoteInputs = artifacts.quote_inputs as string[] | undefined

  if (!run) return null
  const replayHref = getWorkstationUrl('digital-workforce', `#/replay/${run.task_id}`)
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4" data-testid="finance-digital-workforce-card">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <DollarSign className="h-4 w-4 text-blue-600" />
        报价拆解/草稿（数字员工）
      </h3>
      <div className="mt-2 text-xs text-slate-600">
        {Array.isArray(quoteInputs) && quoteInputs.length > 0 ? (
          <ul className="list-inside list-disc space-y-0.5">
            {quoteInputs.slice(0, 4).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
            {quoteInputs.length > 4 && <li className="text-slate-400">等 {quoteInputs.length} 项</li>}
          </ul>
        ) : (
          <p>最近一次编排结果，可进入回放查看详情</p>
        )}
      </div>
      <a href={replayHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
        进入回放 <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

export function FinanceDashboardPage() {
  const [period, setPeriod] = useState<Period>('month')
  const claw = useClawQuickActions('finance', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'finance'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('finance'),
    staleTime: 60_000,
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []
  const handleSuggestionAction = useCallback((item: SuggestionItem, action: SuggestionAction) => {
    if (action.action_id === 'view') {
      window.open(action.endpoint, '_blank')
    } else {
      window.location.href = action.endpoint
    }
  }, [])

  const { data: dashRes, isLoading } = useQuery({
    queryKey: ['finance', 'dashboard', period],
    queryFn: () => api.get<any>('/finance/dashboard', { params: { period } }),
  })

  const { data: costRes } = useQuery({
    queryKey: ['finance', 'cost-structure'],
    queryFn: () => api.get<any>('/finance/analytics/cost/structure'),
  })

  const { data: profitRes } = useQuery({
    queryKey: ['finance', 'profit-ranking'],
    queryFn: () => api.get<any>('/finance/analytics/profit/ranking', { params: { limit: 10 } }),
  })

  const { data: concentrationRes } = useQuery({
    queryKey: ['finance', 'concentration'],
    queryFn: () => api.get<any>('/finance/analytics/revenue/concentration', { params: { top_n: 5 } }),
  })

  const dash = dashRes?.data ?? {}
  const kpis = dash.kpis ?? {}
  const trends: any[] = dash.trends ?? []
  const arAging = dash.ar_aging ?? {}
  const alerts: any[] = dash.alerts ?? []
  const todos: any[] = dash.todos ?? []
  const expiring: any[] = dash.expiring ?? []

  const costStructure: any[] = costRes?.data?.breakdown ?? []
  const profitRankings: any[] = profitRes?.data?.rankings ?? []
  const avgMargin = profitRes?.data?.average_margin
  const concentrationItems: any[] = concentrationRes?.data?.items ?? []

  const agingData = [
    { name: '当期', value: parseFloat(arAging.current || 0) },
    { name: '1-30天', value: parseFloat(arAging['1_30'] || 0) },
    { name: '31-60天', value: parseFloat(arAging['31_60'] || 0) },
    { name: '61-90天', value: parseFloat(arAging['61_90'] || 0) },
    { name: '90天+', value: parseFloat(arAging['over_90'] || 0) },
  ]

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header + Period Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">财务驾驶舱</h2>
          <p className="text-sm text-slate-500 mt-1">全局财务指标与实时动态</p>
        </div>
      </div>

      <DigitalWorkerSuggestionBar
        items={suggestions}
        loading={suggestionsLoading}
        onAction={handleSuggestionAction}
      />

      <ClawQuickPanel workstationKey="finance" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      <FinanceDigitalWorkforceCard />

      <div className="flex flex-wrap gap-2">
        <a
          href={getWorkstationUrl('digital-workforce', '#/portal')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
        >
          <Bot className="h-4 w-4" />
          进入中书·数字员工中心
        </a>
        <a
          href={getWorkstationUrl('digital-workforce', '#/replay')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <DollarSign className="h-4 w-4" />
          报价拆解（回放）
        </a>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div />
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20 text-slate-400">加载中...</div>
      ) : (
        <>
          {/* Row 1: 收入类 KPI */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">收入</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
              <StatCard
                title="合同总额"
                value={fmtWan(kpis.total_contract_amount)}
                icon={<FileText className="w-5 h-5" />}
                color="blue"
                footer={<span className="text-xs text-slate-400">{kpis.active_contracts ?? 0} 个活跃合同</span>}
              />
              <StatCard
                title="已开票额"
                value={fmtWan(kpis.total_invoiced)}
                icon={<Receipt className="w-5 h-5" />}
                color="green"
              />
              <StatCard
                title="已回款额"
                value={fmtWan(kpis.total_received)}
                icon={<Banknote className="w-5 h-5" />}
                color="emerald"
              />
              <StatCard
                title="回款率"
                value={kpis.collection_rate != null ? `${kpis.collection_rate.toFixed(1)}%` : '--'}
                icon={<Percent className="w-5 h-5" />}
                color="teal"
              />
            </div>
          </div>

          {/* Row 2: 成本/效率类 KPI */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">成本与效率</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
              <StatCard
                title="总成本"
                value={fmtWan(kpis.total_cost)}
                icon={<TrendingDown className="w-5 h-5" />}
                color="red"
              />
              <StatCard
                title="综合毛利率"
                value={kpis.gross_margin != null ? `${kpis.gross_margin.toFixed(1)}%` : '--'}
                icon={<TrendingUp className="w-5 h-5" />}
                color="green"
              />
              <StatCard
                title="逾期金额"
                value={fmtWan(kpis.overdue_amount)}
                icon={<AlertTriangle className="w-5 h-5" />}
                color="amber"
                footer={<span className="text-xs text-amber-600">{kpis.overdue_count ?? 0} 笔逾期</span>}
              />
              <StatCard
                title="DSO 天数"
                value={kpis.dso != null ? `${kpis.dso.toFixed(0)} 天` : '--'}
                icon={<Clock className="w-5 h-5" />}
                color="blue"
              />
            </div>
          </div>

          {/* Row 3: 管线/风险类 KPI */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">管线与风险</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
              <StatCard
                title="在手订单"
                value={fmtWan(kpis.backlog)}
                icon={<FileText className="w-5 h-5" />}
                color="blue"
                footer={<span className="text-xs text-slate-400">未确认收入</span>}
              />
              <StatCard
                title="收入管线"
                value={fmtWan(kpis.pipeline)}
                icon={<BarChart3 className="w-5 h-5" />}
                color="indigo"
                footer={<span className="text-xs text-slate-400">报价在途</span>}
              />
              <StatCard
                title="风险敞口"
                value={fmtWan(kpis.risk_exposure)}
                icon={<ShieldAlert className="w-5 h-5" />}
                color="red"
              />
              <StatCard
                title="活跃合同"
                value={kpis.active_contracts ?? '--'}
                icon={<Users className="w-5 h-5" />}
                color="violet"
              />
            </div>
          </div>

          {/* M4 跨工作台：物料成本概览 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <MaterialCostSummary />
          </div>

          {/* Charts Grid: 3x2 */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
            {/* 1. 收入/成本/利润趋势 */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">收入/成本/利润月度趋势</h3>
              {trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5, 7) + '月'} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                    <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="收入" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cost" name="成本" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="profit" name="利润" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Empty message="暂无趋势数据" />
              )}
            </div>

            {/* 2. 应收账龄柱图 */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">应收账龄分布</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={agingData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                  <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                  <Bar dataKey="value" name="应收金额" radius={[4, 4, 0, 0]}>
                    {agingData.map((_, idx) => (
                      <Cell key={idx} fill={AGING_COLORS[idx]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 3. 项目毛利率排行 */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">项目毛利率排行 Top 10</h3>
              {profitRankings.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={profitRankings.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} domain={['auto', 'auto']}
                      tickFormatter={(v) => `${v}%`} />
                    <YAxis type="category" dataKey="project" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip formatter={(v: number) => `${v}%`} />
                    {avgMargin != null && (
                      <Line type="monotone" dataKey={() => avgMargin} stroke="#94a3b8" strokeDasharray="5 5" />
                    )}
                    <Bar dataKey="gross_margin" name="毛利率" radius={[0, 4, 4, 0]}>
                      {profitRankings.slice(0, 10).map((r: any, i: number) => (
                        <Cell key={i} fill={r.is_loss ? '#ef4444' : r.gross_margin < 15 ? '#f59e0b' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty message="暂无排行数据" />
              )}
            </div>

            {/* 4. 成本结构环形图 */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">成本结构分布</h3>
              {costStructure.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={costStructure}
                      dataKey="amount"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={100}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {costStructure.map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty message="暂无成本数据" />
              )}
            </div>

            {/* 5. 客户收入集中度 */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">客户收入集中度 Top 5</h3>
              {concentrationItems.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={concentrationItems}
                      dataKey="amount"
                      nameKey="client"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ client, percentage }) => `${client} ${percentage}%`}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {concentrationItems.map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Empty message="暂无数据" />
              )}
            </div>

            {/* 6. 现金流瀑布（placeholder using trend data） */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">月度净利润趋势</h3>
              {trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5, 7) + '月'} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                    <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                    <Bar dataKey="profit" name="净利润" radius={[4, 4, 0, 0]}>
                      {trends.map((t: any, i: number) => (
                        <Cell key={i} fill={t.profit >= 0 ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Empty message="暂无数据" />
              )}
            </div>
          </div>

          {/* Bottom Lists: 3 columns */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 md:gap-6">
            {/* Risk Alerts */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                风险预警
              </h3>
              {alerts.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {alerts.map((a: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 text-sm">
                      <ShieldAlert className={`w-4 h-4 mt-0.5 shrink-0 ${
                        a.level === 'error' ? 'text-red-500' : 'text-amber-500'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-700 truncate">{a.message}</div>
                      </div>
                      <Badge variant={a.level === 'error' ? 'error' : 'warning'}>
                        {a.type === 'budget' ? '预算' : '逾期'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-400 text-center py-6">暂无预警</div>
              )}
            </div>

            {/* Pending Todos */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-500" />
                待办事项
              </h3>
              {todos.length > 0 ? (
                <div className="space-y-2">
                  {todos.map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                      <span className="text-sm text-slate-600">{item.label}</span>
                      <span className={`text-sm font-semibold ${item.count > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-400 text-center py-6">暂无待办</div>
              )}
            </div>

            {/* Expiring Items */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-500" />
                近期到期
              </h3>
              {expiring.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {expiring.map((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-700 truncate">{item.client_name}</div>
                        <div className="text-xs text-slate-400">¥{Number(item.remaining_amount).toLocaleString()}</div>
                      </div>
                      <Badge variant={item.days_until <= 3 ? 'error' : 'warning'}>
                        {item.days_until}天后
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-400 text-center py-6">暂无到期事项</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
