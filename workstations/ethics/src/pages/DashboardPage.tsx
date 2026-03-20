import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ethicsApi } from '@/services/ethicsApi'
import { clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { SuggestionItem } from '@cn-kis/api-client'
import { FileText, Award, MessageSquare, AlertTriangle } from 'lucide-react'
import { ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import type { QuickAction } from '@cn-kis/ui-kit'

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

interface TodoItem {
  type: string
  title: string
  urgency: 'high' | 'medium' | 'low'
  link: string
}

export function DashboardPage() {
  const queryClient = useQueryClient()
  const claw = useClawQuickActions('ethics', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['ethics', 'dashboard'],
    queryFn: ethicsApi.getDashboard,
  })
  const { data: pendingAppsRes } = useQuery({
    queryKey: ['ethics', 'applications', 'pending'],
    queryFn: () => ethicsApi.getApplications({ status: 'reviewing', page: 1, page_size: 5 }),
  })

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'ethics'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('ethics'),
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []
  const pendingApps = pendingAppsRes?.data?.items ?? []
  const createReviewOpinionMutation = useMutation({
    mutationFn: () => {
      const app = pendingApps[0]
      if (!app) throw new Error('暂无可预审的伦理申请')
      const today = new Date().toISOString().slice(0, 10)
      return ethicsApi.createReviewOpinion({
        application_id: app.id,
        opinion_type: 'conditional_approve',
        review_date: today,
        summary: `针对申请 ${app.application_no} 的数字员工预审意见`,
        detailed_opinion: '建议优先核对资料完整性、版本一致性与受试者材料。',
        modification_requirements: '如有缺项请补齐后再提交正式审查。',
        reviewer_names: ['数字员工·伦理资料助理'],
        response_required: true,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ethics', 'applications', 'pending'] })
    },
  })

  const stats = data?.data

  return (
    <div className="space-y-5 md:space-y-6">
      <h2 className="text-lg font-semibold text-slate-800 md:text-xl">管理看板</h2>

      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />
      <ClawQuickPanel workstationKey="ethics" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      {Number(stats?.pending_count || 0) > 0 && (
        <DigitalWorkerActionCard
          roleCode="ethics_liaison"
          roleName="伦理资料助理"
          title={`有 ${stats?.pending_count} 份伦理申请待处理`}
          description="伦理资料助理建议优先检查缺项和版本一致性，减少补件次数。"
          items={pendingApps.slice(0, 3).map((app) => ({
            key: String(app.id),
            label: app.application_no,
            value: `${app.protocol_title} · ${app.status_display}`,
          }))}
          onAccept={() => createReviewOpinionMutation.mutate()}
          loading={createReviewOpinionMutation.isPending}
          acceptLabel="创建预审意见草稿"
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard
          icon={FileText}
          label="伦理申请"
          value={stats?.application_count ?? '-'}
          sub={`待处理 ${stats?.pending_count ?? 0}`}
          color="indigo"
          loading={isLoading}
        />
        <StatCard
          icon={Award}
          label="有效批件"
          value={stats?.valid_approval_count ?? '-'}
          sub={`即将到期 ${stats?.expiring_count ?? 0}`}
          color="emerald"
          loading={isLoading}
        />
        <StatCard
          icon={MessageSquare}
          label="待回复意见"
          value={stats?.pending_response_count ?? '-'}
          sub="需要回复"
          color="amber"
          loading={isLoading}
        />
        <StatCard
          icon={AlertTriangle}
          label="到期预警"
          value={stats?.expiring_count ?? '-'}
          sub="30天内到期"
          color="rose"
          loading={isLoading}
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 md:p-6">
        <h3 className="text-base font-medium text-slate-700 mb-4">近期待办</h3>
        {isLoading ? (
          <div className="text-sm text-slate-400">加载中...</div>
        ) : stats?.todo_items?.length ? (
          <ul className="space-y-2">
            {stats.todo_items.map((item: TodoItem, idx: number) => (
              <li key={idx} className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  item.urgency === 'high' ? 'bg-rose-500' :
                  item.urgency === 'medium' ? 'bg-amber-500' : 'bg-blue-400'
                }`} />
                <a href={item.link} className="text-slate-700 hover:text-indigo-600 hover:underline">
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-slate-500">暂无待办事项</div>
        )}
      </div>
    </div>
  )
}

const colorMap: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  rose: 'bg-rose-50 text-rose-600',
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  sub: string
  color: string
  loading: boolean
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 md:p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-800 md:text-2xl">
        {loading ? '...' : value}
      </div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  )
}
