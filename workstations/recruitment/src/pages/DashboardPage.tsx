import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { recruitmentApi, preScreeningApi, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import { ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import type { QuickAction } from '@cn-kis/ui-kit'
import type { RecruitmentPlan, SuggestionItem } from '@cn-kis/api-client'
import { ErrorAlert } from '../components/ErrorAlert'
import { RefreshCw, TrendingUp, Users, Filter, UserCheck, UserMinus, ArrowRight, PhoneCall, Stethoscope, ClipboardCheck, AlertTriangle, PhoneForwarded, Microscope } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700', pending_approval: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700', paused: 'bg-orange-100 text-orange-700',
  completed: 'bg-blue-100 text-blue-700',
}
const statusLabels: Record<string, string> = {
  draft: '草稿', pending_approval: '待审批', active: '进行中', paused: '已暂停', completed: '已完成',
}

function isNetworkFailure(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return msg.includes('网络连接失败') || msg.includes('Network Error')
}

async function fetchApiFallback<T>(path: string): Promise<T> {
  const token = localStorage.getItem('auth_token')
  const resp = await fetch(`/api/v1${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const text = await resp.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!resp.ok) {
    throw new Error(body?.msg || `请求失败 (${resp.status})`)
  }
  if (body && typeof body === 'object' && body.code != null && body.code !== 0 && body.code !== 200) {
    throw new Error(body.msg || '请求失败')
  }
  return body as T
}

async function withNetworkFallback<T>(primary: () => Promise<T>, fallbackPath: string): Promise<T> {
  try {
    return await primary()
  } catch (error) {
    if (isNetworkFailure(error)) {
      return fetchApiFallback<T>(fallbackPath)
    }
    throw error
  }
}

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

export default function DashboardPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const claw = useClawQuickActions('recruitment', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)

  const batchCreateScreeningsMutation = useMutation({
    mutationFn: (registrationIds: number[]) =>
      fetch('/api/v1/recruitment/batch/create-screenings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('auth_token')
            ? { Authorization: `Bearer ${localStorage.getItem('auth_token')}` }
            : {}),
        },
        body: JSON.stringify({ registration_ids: registrationIds }),
      }).then(async (res) => {
        const json = await res.json()
        if (!res.ok || json.code !== 200) throw new Error(json.msg || '批量创建筛选失败')
        return json
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'my-tasks'] })
      queryClient.invalidateQueries({ queryKey: ['recruitment', 'plans', 'dashboard'] })
    },
  })

  const tasksQuery = useQuery({
    queryKey: ['recruitment', 'my-tasks'],
    queryFn: async () => {
      const res = await withNetworkFallback(
        () => recruitmentApi.getMyTasks(),
        '/recruitment/my-tasks',
      )
      return res?.data ?? null
    },
  })

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['recruitment', 'plans', 'dashboard'],
    queryFn: async () => {
      const res = await withNetworkFallback(
        () => recruitmentApi.listPlans({ page_size: 50 }),
        '/recruitment/plans?page_size=50',
      )
      if (!res?.data) throw new Error('获取招募计划失败')
      return res
    },
  })

  const preScreeningSummaryQuery = useQuery({
    queryKey: ['pre-screening', 'today-summary'],
    queryFn: async () => {
      const res = await withNetworkFallback(
        () => preScreeningApi.todaySummary(),
        '/pre-screening/today-summary',
      )
      return res?.data ?? null
    },
  })

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'recruitment'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('recruitment'),
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []

  const plans: RecruitmentPlan[] = data?.data?.items ?? []
  const activePlans = plans.filter((p) => p.status === 'active')
  const totalTarget = plans.reduce((s, p) => s + p.target_count, 0)
  const totalRegistered = plans.reduce((s, p) => s + p.registered_count, 0)
  const totalScreened = plans.reduce((s, p) => s + p.screened_count, 0)
  const totalEnrolled = plans.reduce((s, p) => s + p.enrolled_count, 0)
  const psSummary = preScreeningSummaryQuery.data

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 md:text-xl">招募看板</h2>
          <p className="text-sm text-slate-500 mt-1">全局招募进度总览与分析</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />
      <ClawQuickPanel workstationKey="recruitment" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      {error && <ErrorAlert message={(error as Error).message} onRetry={() => refetch()} />}

      <TaskPanel
        tasks={tasksQuery.data}
        loading={tasksQuery.isLoading}
        onNavigate={(status) => navigate(`/registrations?status=${status}`)}
      />

      {Number(tasksQuery.data?.pending_screening?.count || 0) > 0 && (
        <DigitalWorkerActionCard
          roleCode="recruitment_screener"
          roleName="招募助理"
          title={`有 ${tasksQuery.data?.pending_screening?.count || 0} 条报名待筛选`}
          description="招募助理建议尽快完成初筛，以推进报名到筛选阶段的转化。"
          items={(tasksQuery.data?.pending_screening?.items || []).slice(0, 5).map((item) => ({
            key: String(item.id),
            label: `${item.name} (${item.registration_no})`,
            value: `${item.phone} · 当前状态 ${item.status}`,
          }))}
          onAccept={() => {
            const ids = (tasksQuery.data?.pending_screening?.items || []).slice(0, 5).map((item) => item.id)
            if (ids.length === 0) return
            batchCreateScreeningsMutation.mutate(ids)
          }}
          loading={batchCreateScreeningsMutation.isPending}
          acceptLabel="批量发起筛选"
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6 md:gap-4">
        <KPICard icon={<Users className="w-5 h-5" />} title="目标人数" value={totalTarget} color="text-indigo-600" bg="bg-indigo-50" loading={isLoading} />
        <KPICard icon={<TrendingUp className="w-5 h-5" />} title="报名数" value={totalRegistered} color="text-sky-600" bg="bg-sky-50" loading={isLoading} />
        <KPICard icon={<Microscope className="w-5 h-5" />} title="今日初筛" value={psSummary?.total ?? 0} color="text-orange-600" bg="bg-orange-50" loading={preScreeningSummaryQuery.isLoading} subtitle={psSummary ? `通过率 ${psSummary.pass_rate}%` : undefined} />
        <KPICard icon={<Filter className="w-5 h-5" />} title="筛选数" value={totalScreened} color="text-amber-600" bg="bg-amber-50" loading={isLoading} />
        <KPICard icon={<UserCheck className="w-5 h-5" />} title="入组数" value={totalEnrolled} color="text-emerald-600" bg="bg-emerald-50" loading={isLoading} />
        <KPICard icon={<UserMinus className="w-5 h-5" />} title="进行中计划" value={activePlans.length} color="text-violet-600" bg="bg-violet-50" loading={isLoading} />
      </div>

      {!isLoading && totalRegistered > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">全局招募漏斗</h3>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <FunnelStep label="报名" value={totalRegistered} color="bg-sky-500" />
            <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
            <FunnelStep label="初筛" value={psSummary?.completed ?? 0} color="bg-orange-500" rate={totalRegistered > 0 ? ((psSummary?.completed ?? 0) / totalRegistered * 100) : 0} />
            <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
            <FunnelStep label="筛选" value={totalScreened} color="bg-amber-500" rate={(psSummary?.passed ?? 0) > 0 ? (totalScreened / (psSummary?.passed ?? 1) * 100) : 0} />
            <ArrowRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
            <FunnelStep label="入组" value={totalEnrolled} color="bg-emerald-500" rate={totalScreened > 0 ? (totalEnrolled / totalScreened * 100) : 0} />
          </div>
          <div className="mt-3 text-xs text-slate-500">
            总转化率: <span className="font-medium text-emerald-600">{totalRegistered > 0 ? ((totalEnrolled / totalRegistered) * 100).toFixed(1) : 0}%</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">计划分析</h3>
          <select value={selectedPlanId ?? ''} onChange={(e) => setSelectedPlanId(e.target.value ? Number(e.target.value) : null)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white" title="选择计划">
            <option value="">选择计划查看详细分析</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.plan_no} - {p.title}</option>)}
          </select>
        </div>
        {selectedPlanId ? <PlanAnalytics planId={selectedPlanId} /> : <div className="text-sm text-slate-400 py-8 text-center">请选择一个招募计划查看漏斗和退出分析</div>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">各项目招募进度</h3>
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-6 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : plans.length === 0 ? (
          <div className="text-sm text-slate-400 py-8 text-center">暂无招募计划</div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <div key={plan.id} className="flex items-center gap-4">
                <div className="w-48 text-sm text-slate-600 truncate" title={plan.title}>{plan.title}</div>
                <div className="flex-1">
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min(plan.completion_rate * 100, 100)}%` }} />
                  </div>
                </div>
                <div className="w-24 text-right text-xs text-slate-600">{plan.enrolled_count}/{plan.target_count}</div>
                <div className="w-16 text-right text-sm font-medium text-slate-700">{(plan.completion_rate * 100).toFixed(0)}%</div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[plan.status] || 'bg-slate-100 text-slate-600'}`}>{statusLabels[plan.status] || plan.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">近期报名动态</h3>
          <RecentRegistrations />
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">活跃计划概览</h3>
          {activePlans.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">暂无进行中计划</div>
          ) : (
            <div className="space-y-3">
              {activePlans.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{p.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{p.start_date} ~ {p.end_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">{p.enrolled_count}/{p.target_count}</p>
                    <p className="text-xs text-slate-400">入组</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PlanAnalytics({ planId }: { planId: number }) {
  const [trendDays, setTrendDays] = useState(30)
  const funnelQuery = useQuery({
    queryKey: ['recruitment', 'funnel', planId],
    queryFn: () => recruitmentApi.getFunnel(planId),
  })
  const withdrawalQuery = useQuery({
    queryKey: ['recruitment', 'withdrawal-analysis', planId],
    queryFn: () => recruitmentApi.getWithdrawalAnalysis(planId),
  })
  const trendsQuery = useQuery({
    queryKey: ['recruitment', 'trends', planId, trendDays],
    queryFn: () => recruitmentApi.getTrends(planId, trendDays),
  })

  const funnel = funnelQuery.data?.data
  const withdrawal = withdrawalQuery.data?.data
  const trendItems = trendsQuery.data?.data?.items ?? []

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="bg-slate-50 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-medium text-slate-500">招募趋势</h4>
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setTrendDays(d)}
                className={`px-2 py-1 text-xs rounded ${trendDays === d ? 'bg-blue-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-100'}`}
              >
                {d}天
              </button>
            ))}
          </div>
        </div>
        {trendsQuery.isLoading ? (
          <div className="h-48 bg-slate-100 rounded animate-pulse" />
        ) : trendItems.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">暂无趋势数据</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendItems}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip labelFormatter={(d: string) => `日期: ${d}`} />
              <Line type="monotone" dataKey="registered" name="报名" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="screened" name="筛选" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="enrolled" name="入组" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
      <div>
        <h4 className="text-xs font-medium text-slate-500 mb-3">招募漏斗</h4>
        {funnelQuery.isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : funnelQuery.error ? (
          <ErrorAlert message="加载漏斗失败" onRetry={() => funnelQuery.refetch()} />
        ) : funnel ? (
          <div className="space-y-2">
            <FunnelRow label="报名" value={funnel.registered} max={funnel.registered} color="bg-sky-400" />
            <FunnelRow label="筛选通过" value={funnel.screened} max={funnel.registered} color="bg-amber-400" rate={funnel.conversion_rates?.registered_to_screened} />
            <FunnelRow label="已入组" value={funnel.enrolled} max={funnel.registered} color="bg-emerald-400" rate={funnel.conversion_rates?.screened_to_enrolled} />
            <FunnelRow label="已退出" value={funnel.withdrawn} max={funnel.registered} color="bg-red-400" />
            <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
              总转化率: <span className="font-medium text-emerald-600">{funnel.conversion_rates?.overall ?? 0}%</span>
            </div>
          </div>
        ) : null}
      </div>
      <div>
        <h4 className="text-xs font-medium text-slate-500 mb-3">退出分析</h4>
        {withdrawalQuery.isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-6 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : withdrawalQuery.error ? (
          <ErrorAlert message="加载退出分析失败" onRetry={() => withdrawalQuery.refetch()} />
        ) : withdrawal ? (
          <div>
            <p className="text-sm text-slate-600 mb-3">总退出: <span className="font-bold text-red-600">{withdrawal.total_withdrawn}</span> 人</p>
            {withdrawal.reasons && withdrawal.reasons.length > 0 ? (
              <div className="space-y-2">
                {withdrawal.reasons.map((r: { reason: string; count: number; percentage: number }, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-600">{r.reason}</span>
                        <span className="text-slate-500">{r.count}人 ({r.percentage}%)</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-red-400 rounded-full" style={{ width: `${r.percentage}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-400 py-4 text-center">暂无退出记录</div>
            )}
          </div>
        ) : null}
      </div>
    </div>
    </div>
  )
}

function KPICard({ icon, title, value, color, bg, loading, subtitle }: { icon: React.ReactNode; title: string; value: number; color: string; bg: string; loading: boolean; subtitle?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${bg} ${color}`}>{icon}</div>
        <p className="text-xs text-slate-500">{title}</p>
      </div>
      {loading ? <div className="h-8 bg-slate-100 rounded animate-pulse" /> : (
        <div>
          <p className={`text-2xl font-bold ${color}`}>{value}</p>
          {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
      )}
    </div>
  )
}

function FunnelStep({ label, value, color, rate }: { label: string; value: number; color: string; rate?: number }) {
  return (
    <div className="flex-1 text-center">
      <div className={`rounded-lg ${color} text-white py-3 font-bold text-lg`}>{value}</div>
      <p className="text-xs text-slate-600 mt-1">{label}</p>
      {rate !== undefined && <p className="text-xs text-slate-400">{rate.toFixed(1)}%</p>}
    </div>
  )
}

function FunnelRow({ label, value, max, color, rate }: { label: string; value: number; max: number; color: string; rate?: number }) {
  const width = max > 0 ? (value / max) * 100 : 0
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="text-slate-700 font-medium">{value}{rate !== undefined ? ` (${rate}%)` : ''}</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

interface TaskData {
  pending_contact: { count: number; items: Array<{ id: number; registration_no: string; name: string; phone: string; status: string; create_time: string | null; contacted_at: string | null }> }
  pending_screening: { count: number; items: Array<{ id: number; registration_no: string; name: string; phone: string; status: string; create_time: string | null; contacted_at: string | null }> }
  pending_enrollment: { count: number; items: Array<{ id: number; registration_no: string; name: string; phone: string; status: string; create_time: string | null; contacted_at: string | null }> }
  need_callback: { count: number; items: Array<{ id: number; registration_no: string; name: string; phone: string; status: string; create_time: string | null; contacted_at: string | null }> }
  overdue_followup: { count: number; items: Array<{ id: number; registration_no: string; name: string; phone: string; status: string; create_time: string | null; contacted_at: string | null }> }
}

function TaskPanel({ tasks, loading, onNavigate }: { tasks: TaskData | null; loading: boolean; onNavigate: (status: string) => void }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
      </div>
    )
  }
  if (!tasks) return null

  const hasOverdue = (tasks.overdue_followup?.count ?? 0) > 0

  const cards = [
    { key: 'pending', label: '待联系', count: tasks.pending_contact?.count ?? 0, icon: <PhoneCall className="w-5 h-5" />, bg: 'bg-blue-50', color: 'text-blue-600', border: 'border-blue-200', status: 'registered' },
    { key: 'screening', label: '待筛选', count: tasks.pending_screening?.count ?? 0, icon: <Stethoscope className="w-5 h-5" />, bg: 'bg-amber-50', color: 'text-amber-600', border: 'border-amber-200', status: 'screening' },
    { key: 'enrollment', label: '待入组', count: tasks.pending_enrollment?.count ?? 0, icon: <ClipboardCheck className="w-5 h-5" />, bg: 'bg-emerald-50', color: 'text-emerald-600', border: 'border-emerald-200', status: 'screened_pass' },
    { key: 'callback', label: '需回访', count: tasks.need_callback?.count ?? 0, icon: <PhoneForwarded className="w-5 h-5" />, bg: 'bg-purple-50', color: 'text-purple-600', border: 'border-purple-200', status: 'contacted' },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">今日任务</h3>
        {hasOverdue && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-xs font-medium">
            <AlertTriangle className="w-3 h-3" /> {tasks.overdue_followup.count} 条逾期未跟进
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-4">
        {cards.map((c) => (
          <button
            key={c.key}
            onClick={() => onNavigate(c.status)}
            className={`bg-white rounded-xl border ${c.count > 0 ? c.border : 'border-slate-200'} p-4 text-left hover:shadow-md transition-shadow group`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`p-1.5 rounded-lg ${c.bg} ${c.color}`}>{c.icon}</div>
              {c.count > 0 && <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />}
            </div>
            <p className={`text-2xl font-bold ${c.count > 0 ? c.color : 'text-slate-300'}`}>{c.count}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

function RecentRegistrations() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['recruitment', 'registrations', 'recent'],
    queryFn: async () => {
      const res = await withNetworkFallback(
        () => recruitmentApi.listRegistrations({ page_size: 8 }),
        '/recruitment/registrations?page_size=8',
      )
      if (!res?.data) throw new Error('获取报名动态失败')
      return res
    },
  })
  const items = data?.data?.items ?? []
  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}</div>
  if (error) return <div className="text-sm text-red-500 py-4 text-center">{(error as Error).message}</div>
  if (items.length === 0) return <div className="text-sm text-slate-400 py-6 text-center">暂无报名</div>

  const statusLabel: Record<string, string> = { registered: '已报名', contacted: '已联系', pre_screening: '初筛中', pre_screened_pass: '初筛通过', pre_screened_fail: '初筛不通过', screening: '筛选中', screened_pass: '筛选通过', screened_fail: '筛选未通过', enrolled: '已入组', withdrawn: '已退出' }
  const statusColor: Record<string, string> = { registered: 'text-amber-600', contacted: 'text-sky-600', pre_screening: 'text-orange-600', pre_screened_pass: 'text-orange-500', pre_screened_fail: 'text-red-500', screening: 'text-indigo-600', screened_pass: 'text-teal-600', screened_fail: 'text-red-500', enrolled: 'text-emerald-600', withdrawn: 'text-red-500' }

  return (
    <div className="space-y-2">
      {items.map((item: { id: number; name: string; registration_no: string; status: string; create_time?: string }) => (
        <div key={item.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">{item.name[0]}</div>
            <span className="text-sm text-slate-700">{item.name}</span>
            <span className={`text-xs ${statusColor[item.status] || 'text-slate-400'}`}>{statusLabel[item.status] || item.status}</span>
          </div>
          <span className="text-xs text-slate-400">{item.create_time?.slice(0, 10)}</span>
        </div>
      ))}
    </div>
  )
}
