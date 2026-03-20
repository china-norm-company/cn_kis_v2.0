/**
 * 管理驾驶舱（升级版）
 *
 * A1: 趋势分析引擎 — 入组/工单/偏差/营收趋势图
 * A2: 多维预警中心 — 8 种预警类型
 * C3: CRM 与研究台打通 — 客户与商务区域
 *
 * 研究经理一页纵览：KPI + 趋势图 + 项目健康度 + 预警中心 + AI洞察
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { StatCard, Badge, Empty, Tabs, AIInsightWidget } from '@cn-kis/ui-kit'
import { Link, useNavigate } from 'react-router-dom'
import {
  FlaskConical, Users, CheckCircle, AlertTriangle,
  Banknote, ShieldAlert, ChevronRight, Activity,
  Brain, TrendingUp, Bell, ExternalLink, GitPullRequest,
  SendHorizonal, Building2,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Legend,
  ComposedChart,
} from 'recharts'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
interface ProjectHealth {
  id: number; title: string; code: string; product_category: string
  sample_size: number; enrolled: number; enrollment_rate: number
  wo_total: number; wo_done: number; completion_rate: number
  deviation_count: number; capa_count: number; overdue_wo: number
  health: 'healthy' | 'warning' | 'critical'; risk_score: number
}

interface Alert {
  type: string; severity: string; title: string; detail: string
  entity_id: number; entity_type?: string; link?: string
}

interface ManagerOverview {
  kpi: {
    active_projects: number; total_subjects: number; week_completed: number
    overdue_workorders: number; pending_payment: number; open_deviations: number
  }
  project_health: ProjectHealth[]
  alerts: Alert[]
}

interface TrendPoint { date: string; count: number }
interface WOTrendPoint { date: string; created: number; completed: number; backlog: number }
interface RevPoint { month: string; contracted: number; received: number; receivable: number }

interface TrendsData {
  enrollment?: { plan: TrendPoint[]; actual: TrendPoint[]; predicted: TrendPoint[]; summary: any }
  workorder?: { series: WOTrendPoint[]; granularity: string }
  deviation?: { series: any[] }
  revenue?: { series: RevPoint[] }
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */
const HEALTH_CONFIG = {
  healthy: { label: '健康', color: 'success' as const, bg: 'bg-green-50 border-green-200' },
  warning: { label: '关注', color: 'warning' as const, bg: 'bg-amber-50 border-amber-200' },
  critical: { label: '风险', color: 'error' as const, bg: 'bg-red-50 border-red-200' },
}

const ALERT_ICON: Record<string, string> = {
  high: '🚨', medium: '⚠️', low: 'ℹ️',
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export default function ManagerDashboardPage() {
  const [trendTab, setTrendTab] = useState<'workorder' | 'revenue'>('workorder')

  const queryOpts = { staleTime: 60_000, refetchOnWindowFocus: false } as const

  const { data: overviewRes, isLoading, isError } = useQuery({
    queryKey: ['manager-overview'],
    queryFn: () => api.get<ManagerOverview>('/dashboard/manager-overview'),
    ...queryOpts,
  })

  const { data: trendsRes } = useQuery({
    queryKey: ['dashboard-trends'],
    queryFn: () => api.get<TrendsData>('/dashboard/trends'),
    ...queryOpts,
  })

  const { data: alertsRes } = useQuery({
    queryKey: ['dashboard-alerts'],
    queryFn: () => api.get<Alert[]>('/dashboard/alerts'),
    ...queryOpts,
  })

  const { data: analysisRes } = useQuery({
    queryKey: ['project-analysis'],
    queryFn: () => api.get<{ analysis?: string }>('/dashboard/project-analysis'),
    staleTime: 300_000, refetchOnWindowFocus: false,
  })

  const { data: activitiesRes } = useQuery({
    queryKey: ['dashboard-activities'],
    queryFn: () => api.get<Array<{ id: number; title: string; type: string; time: string }>>('/dashboard/activities'),
    ...queryOpts,
  })

  const overview = overviewRes?.data
  const kpi = overview?.kpi
  const projects = overview?.project_health ?? []
  const trends = trendsRes?.data
  const alerts = alertsRes?.data ?? overview?.alerts ?? []
  const analysis = (analysisRes?.data as any)?.analysis || ''
  const activities = activitiesRes?.data ?? []

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="text-red-500 text-sm font-medium">数据加载失败</div>
        <p className="text-xs text-slate-400">请检查网络连接或后端服务状态</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-1.5 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition"
        >
          重新加载
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">管理驾驶舱</h2>
          <p className="text-sm text-slate-500 mt-1">项目全景 · 趋势分析 · 风险预警 · 智能洞察</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 md:gap-4">
        <StatCard title="活跃项目" value={kpi?.active_projects ?? 0} icon={<FlaskConical className="w-5 h-5" />} color="blue" />
        <StatCard title="受试者总数" value={kpi?.total_subjects ?? 0} icon={<Users className="w-5 h-5" />} color="green" />
        <StatCard title="本周完成" value={kpi?.week_completed ?? 0} icon={<CheckCircle className="w-5 h-5" />} color="emerald" />
        <StatCard title="逾期工单" value={kpi?.overdue_workorders ?? 0} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
        <StatCard title="待回款(万)" value={kpi?.pending_payment ? `${(kpi.pending_payment / 10000).toFixed(1)}` : '0'} icon={<Banknote className="w-5 h-5" />} color="amber" />
        <StatCard title="未关闭偏差" value={kpi?.open_deviations ?? 0} icon={<ShieldAlert className="w-5 h-5" />} color="purple" />
      </div>

      {/* Trend Charts (A1) */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            工单趋势
          </h3>
          {trends?.workorder?.series?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trends.workorder.series.slice(-14)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="created" name="新增" fill="#60a5fa" radius={[2, 2, 0, 0]} />
                <Bar dataKey="completed" name="完成" fill="#34d399" radius={[2, 2, 0, 0]} />
                <Line type="monotone" dataKey="backlog" name="积压" stroke="#f97316" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">暂无趋势数据</div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
            <Banknote className="w-4 h-4 text-amber-500" />
            营收趋势
          </h3>
          {trends?.revenue?.series?.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={trends.revenue.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(value: number) => `¥${value.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="contracted" name="合同额" stroke="#3b82f6" fill="#93c5fd" fillOpacity={0.3} />
                <Area type="monotone" dataKey="received" name="回款额" stroke="#10b981" fill="#6ee7b7" fillOpacity={0.3} />
                <Line type="monotone" dataKey="receivable" name="应收余额" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-sm text-slate-400">暂无营收数据</div>
          )}
        </div>
      </div>

      {/* Main Content: Projects + Alerts + AI */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 md:gap-6">
        {/* Left: Project Health */}
        <div className="space-y-4 xl:col-span-2">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">项目健康度</h3>
            {isLoading ? (
              <div className="text-sm text-slate-400 text-center py-8">加载中...</div>
            ) : projects.length === 0 ? (
              <Empty description="暂无活跃项目" />
            ) : (
              <div className="space-y-3">
                {projects.map((p) => {
                  const hc = HEALTH_CONFIG[p.health]
                  return (
                    <div
                      key={p.id}
                      className={`block border rounded-lg p-4 hover:shadow-sm transition group relative ${hc.bg}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Link to={`/projects/${p.id}/dashboard`} className="font-medium text-sm text-slate-800 hover:text-blue-600">
                            {p.title}
                          </Link>
                          {p.code && <span className="text-xs text-slate-400">{p.code}</span>}
                          <Badge variant={hc.color}>{hc.label}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="hidden group-hover:flex items-center gap-1">
                            <Link to={`/projects/${p.id}/dashboard`} className="p-1 text-blue-500 hover:bg-blue-100 rounded" title="查看详情">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>
                            <Link to={`/clients`} className="p-1 text-amber-500 hover:bg-amber-100 rounded" title="联系客户">
                              <Building2 className="w-3.5 h-3.5" />
                            </Link>
                            <Link to={`/business`} className="p-1 text-green-500 hover:bg-green-100 rounded" title="查看商务">
                              <Banknote className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4 md:gap-4">
                        <div>
                          <span className="text-slate-500">入组率</span>
                          <div className="mt-1">
                            <div className="w-full bg-slate-200 rounded-full h-2">
                              <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(p.enrollment_rate, 100)}%` }} />
                            </div>
                            <span className="text-slate-700 font-medium">{p.enrolled}/{p.sample_size} ({p.enrollment_rate}%)</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">工单完成率</span>
                          <div className="mt-1 font-medium text-slate-700">{p.completion_rate}% ({p.wo_done}/{p.wo_total})</div>
                        </div>
                        <div>
                          <span className="text-slate-500">偏差/CAPA</span>
                          <div className="mt-1 font-medium text-slate-700">{p.deviation_count} / {p.capa_count}</div>
                        </div>
                        <div>
                          <span className="text-slate-500">逾期工单</span>
                          <div className={`mt-1 font-medium ${p.overdue_wo > 0 ? 'text-red-600' : 'text-slate-700'}`}>{p.overdue_wo}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* AI Insight (D1 — 真实连通) */}
          <AIInsightWidget
            agentId="insight-agent"
            contextType="manager_overview"
            contextData={{
              active_projects: projects.length,
              high_risk_count: projects.filter(p => p.health === 'critical').length,
              alert_count: alerts.length,
            }}
            title="AI 项目分析洞察"
            onTrigger={async (agentId, contextType, contextData) => {
              const res = await api.post<{ data: { content: string } }>('/agents/trigger-insight', {
                agent_id: agentId,
                context_type: contextType,
                context_data: contextData,
              })
              return (res.data as any)?.data?.content || '暂无洞察'
            }}
          />
        </div>

        {/* Right: Alerts + Activities */}
        <div className="space-y-4">
          {/* Multi-dimensional Alerts (A2) */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <Bell className="w-4 h-4 text-red-500" />
              风险预警中心
              {alerts.length > 0 && (
                <Badge variant="error">{alerts.length}</Badge>
              )}
            </h3>
            {alerts.length === 0 ? (
              <p className="text-xs text-slate-400">暂无风险预警</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {alerts.slice(0, 12).map((a, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg text-xs hover:shadow-sm transition ${
                      a.severity === 'high'
                        ? 'bg-red-50 border border-red-200'
                        : a.severity === 'medium'
                        ? 'bg-amber-50 border border-amber-200'
                        : 'bg-blue-50 border border-blue-200'
                    }`}
                  >
                    <div className="flex items-start gap-1.5">
                      <span>{ALERT_ICON[a.severity] || 'ℹ️'}</span>
                      <div className="flex-1">
                        <div className={`font-medium ${
                          a.severity === 'high' ? 'text-red-700' : a.severity === 'medium' ? 'text-amber-700' : 'text-blue-700'
                        }`}>
                          {a.title}
                        </div>
                        <div className={
                          a.severity === 'high' ? 'text-red-500' : a.severity === 'medium' ? 'text-amber-500' : 'text-blue-500'
                        }>
                          {a.detail}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          {a.type && (
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                              {a.type.replace(/_/g, ' ')}
                            </span>
                          )}
                          <div className="flex gap-1 ml-auto">
                            {a.entity_id && (
                              <Link
                                to={a.link || `/projects/${a.entity_id}/dashboard`}
                                className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-600 hover:text-blue-600 hover:border-blue-200"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="w-2.5 h-2.5" />
                                详情
                              </Link>
                            )}
                            <Link
                              to="/changes"
                              className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-600 hover:text-purple-600 hover:border-purple-200"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <GitPullRequest className="w-2.5 h-2.5" />
                              变更
                            </Link>
                            <Link
                              to="/tasks"
                              className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-600 hover:text-amber-600 hover:border-amber-200"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <SendHorizonal className="w-2.5 h-2.5" />
                              委派
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activities */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
              <Activity className="w-4 h-4 text-blue-500" />
              本周动态
            </h3>
            {(activities as any[]).length === 0 ? (
              <p className="text-xs text-slate-400">暂无动态</p>
            ) : (
              <div className="space-y-2">
                {(activities as any[]).slice(0, 8).map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <span className="text-slate-700">{a.title}</span>
                      <span className="text-slate-400 ml-2">{a.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
