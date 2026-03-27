import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Card, StatCard, Badge, DataTable, type Column, Empty, ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar } from '@cn-kis/ui-kit'
import type { QuickAction } from '@cn-kis/ui-kit'
import { api, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { SuggestionItem } from '@cn-kis/api-client'
import {
  Users, TrendingUp, AlertTriangle, Activity, Shield, Lightbulb,
  ArrowRight, Clock,
} from 'lucide-react'

const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-500',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
}

const RISK_LABELS: Record<string, string> = {
  low: '低', medium: '中', high: '高', critical: '危急',
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  churn_risk: '流失风险', revenue_decline: '收入下降',
  contact_gap: '联系中断', complaint_surge: '投诉激增',
  competitor_threat: '竞争威胁', payment_overdue: '回款逾期',
  key_person_change: '关键人变动', contract_expiring: '合同到期',
}

const SEVERITY_VARIANT: Record<string, 'default' | 'warning' | 'error'> = {
  info: 'default', warning: 'warning', critical: 'error',
}

interface AlertItem {
  id: number
  client_name: string
  alert_type: string
  severity: string
  description: string
  create_time: string
  [key: string]: unknown
}

interface ContactItem {
  id: number
  client_id: number
  name: string
  title: string
  role_type: string
  last_contact_date: string | null
  contact_frequency_days: number
  [key: string]: unknown
}

const alertColumns: Column<AlertItem>[] = [
  { key: 'client_name', title: '客户' },
  {
    key: 'alert_type', title: '类型',
    render: (_, r) => <Badge>{ALERT_TYPE_LABELS[r.alert_type] ?? r.alert_type}</Badge>,
  },
  {
    key: 'severity', title: '严重度',
    render: (_, r) => <Badge variant={SEVERITY_VARIANT[r.severity] ?? 'default'}>{r.severity}</Badge>,
  },
  { key: 'description', title: '描述', render: (_, r) => <span className="text-xs">{r.description?.slice(0, 60)}</span> },
]

const overdueColumns: Column<ContactItem>[] = [
  { key: 'name', title: '联系人' },
  { key: 'title', title: '职位' },
  {
    key: 'last_contact_date', title: '最近联系',
    render: (_, r) => r.last_contact_date ? new Date(r.last_contact_date).toLocaleDateString('zh-CN') : '从未联系',
  },
]

const clawFetcher = (key: string) =>
  clawRegistryApi.getByWorkstation(key).catch(() => ({ data: { quick_actions: [] } }))

export function DashboardPage() {
  const navigate = useNavigate()
  const claw = useClawQuickActions('crm', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])

  const { data: clientsStats } = useQuery({
    queryKey: ['crm', 'clients', 'stats'],
    queryFn: () => api.get<{
      total: number; by_level: Record<string, number>; total_revenue: number
    }>('/crm/clients/stats'),
    retry: false,
  })

  const { data: healthOverview } = useQuery({
    queryKey: ['crm', 'health-overview'],
    queryFn: () => api.get<{
      total_clients: number; scored_clients: number; avg_score: number
      risk_distribution: Record<string, number>; tier_avg_scores: Record<string, number>
    }>('/crm/health-scores/overview'),
    retry: false,
  })

  const { data: alertStats } = useQuery({
    queryKey: ['crm', 'alerts', 'stats'],
    queryFn: () => api.get<{
      total_unresolved: number
      by_type: Record<string, number>
      by_severity: Record<string, number>
    }>('/crm/alerts/stats'),
    retry: false,
  })

  const { data: alertsRes } = useQuery({
    queryKey: ['crm', 'alerts', 'recent'],
    queryFn: () => api.get<{ items: AlertItem[] }>('/crm/alerts/list', {
      params: { resolved: false, page: 1, page_size: 5 },
    }),
    retry: false,
  })

  const { data: overdueRes } = useQuery({
    queryKey: ['crm', 'contacts', 'overdue'],
    queryFn: () => api.get<ContactItem[]>('/crm/contacts/overdue'),
    retry: false,
  })

  const { data: oppsStats } = useQuery({
    queryKey: ['crm', 'opportunities', 'stats'],
    queryFn: () =>
      api.get<{
        total: number
        by_stage: Record<string, number>
        pipeline_value: number
        reserve_amount: number
      }>('/crm/opportunities/stats'),
    retry: false,
  })

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'crm'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('crm').catch(() => ({ data: { data: { items: [] } } })),
    retry: false,
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []

  const totalClients = clientsStats?.data?.total ?? 0
  const avgScore = healthOverview?.data?.avg_score ?? 0
  const totalUnresolved = alertStats?.data?.total_unresolved ?? 0
  const reserveAmount = oppsStats?.data?.reserve_amount ?? oppsStats?.data?.pipeline_value ?? 0
  const riskDist = healthOverview?.data?.risk_distribution ?? {}
  const alerts = alertsRes?.data?.items ?? []
  const overdue = (overdueRes?.data ?? []).slice(0, 8)

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-bold text-slate-800 md:text-2xl">管理驾驶舱</h1>
        <div className="text-sm text-slate-400">
          已评分客户: {healthOverview?.data?.scored_clients ?? 0}/{totalClients}
        </div>
      </div>

      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />
      <ClawQuickPanel workstationKey="crm" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard
          title="客户总数"
          value={totalClients}
          icon={<Users className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="健康度均分"
          value={avgScore}
          icon={<Activity className="w-5 h-5" />}
          color={avgScore >= 70 ? 'green' : avgScore >= 50 ? 'amber' : 'red'}
        />
        <StatCard
          title="待处理预警"
          value={totalUnresolved}
          icon={<AlertTriangle className="w-5 h-5" />}
          color={totalUnresolved > 5 ? 'red' : totalUnresolved > 0 ? 'amber' : 'green'}
        />
        <StatCard
          title="储备商机"
          value={`¥${Number(reserveAmount).toLocaleString()}`}
          icon={<TrendingUp className="w-5 h-5" />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 md:gap-6">
        <Card title="风险分布" className="p-5">
          <div className="space-y-3">
            {Object.entries(riskDist).length > 0 ? (
              Object.entries(riskDist).map(([risk, count]) => (
                <div key={risk} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${RISK_COLORS[risk] ?? 'bg-slate-400'}`} />
                    <span className="text-sm">{RISK_LABELS[risk] ?? risk}</span>
                  </div>
                  <span className="text-sm font-semibold">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">暂无评分数据</p>
            )}
          </div>
        </Card>

        <Card title="预警类型分布" className="p-5">
          <div className="space-y-2">
            {alertStats?.data?.by_type && Object.entries(alertStats.data.by_type).length > 0 ? (
              Object.entries(alertStats.data.by_type).slice(0, 5).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{ALERT_TYPE_LABELS[type] ?? type}</span>
                  <Badge variant="warning">{count as number}</Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400">暂无预警</p>
            )}
          </div>
        </Card>

        <Card title="合作等级均分" className="p-5">
          <div className="space-y-3">
            {healthOverview?.data?.tier_avg_scores && Object.entries(healthOverview.data.tier_avg_scores).length > 0 ? (
              Object.entries(healthOverview.data.tier_avg_scores).map(([tier, avg]) => {
                const tierLabels: Record<string, string> = {
                  platinum: '铂金', gold: '黄金', silver: '银牌',
                  developing: '发展中', prospect: '潜在',
                }
                return (
                  <div key={tier}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{tierLabels[tier] ?? tier}</span>
                      <span className="font-semibold">{avg}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${avg}%` }}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <p className="text-sm text-slate-400">暂无数据</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              最新预警
            </h3>
            <button
              onClick={() => navigate('/alerts')}
              className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
            >
              查看全部 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {alerts.length > 0 ? (
            <DataTable<AlertItem>
              columns={alertColumns}
              data={alerts}
              onRowClick={(r) => navigate('/alerts')}
            />
          ) : (
            <Empty message="暂无待处理预警" />
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              超期联系提醒
            </h3>
          </div>
          {overdue.length > 0 ? (
            <DataTable<ContactItem>
              columns={overdueColumns}
              data={overdue}
            />
          ) : (
            <Empty message="暂无超期联系人" />
          )}
        </Card>
      </div>
    </div>
  )
}
