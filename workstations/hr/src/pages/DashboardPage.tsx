import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, StatCard, Badge, ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import type { QuickAction } from '@cn-kis/ui-kit'
import { api, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { SuggestionItem } from '@cn-kis/api-client'
import {
  Users,
  Award,
  AlertTriangle,
  BookOpen,
  Clock,
} from 'lucide-react'
import { useState, useCallback } from 'react'
import { Input, Button } from '@cn-kis/ui-kit'

interface StaffStats {
  total: number
  by_gcp_status: { valid?: number; expiring?: number; expired?: number; none?: number }
}

interface StaffItem {
  id: number
  name: string
  position: string
  gcp_expiry: string
  gcp_status: 'valid' | 'expiring' | 'expired' | 'none'
  [key: string]: unknown
}

interface TrainingItem {
  id: number
  course_name: string
  trainee_name: string
  start_date: string
  status: string
  [key: string]: unknown
}

interface TrainingsStats {
  total: number
  by_status?: { scheduled?: number; completed?: number; overdue?: number }
  total_completed_hours?: number
}

interface WorkloadItem {
  staff_name: string
  active_projects: number
  current_hours: number
  max_hours: number
}

interface RiskActionItem {
  id: number
  staff_id: number
  staff_name: string
  action_type: string
  owner: string
  due_date: string
  sync_status: string
  create_time: string
}

interface OpsOverview {
  workforce: { active: number; exited: number; net_change: number }
  recruitment: {
    open_demands: number
    pipeline_candidates: number
    recent_demands: Array<{ id: number; title: string; department: string; status: string }>
  }
  performance: { active_cycles: number; records: number }
  compensation: { payroll_months: number; total_net_salary: number; total_incentive: number }
  culture: { activity_count: number; latest_pulse: { survey_month: string; score: number; risk_level: string } }
  collaboration: { open_snapshots: number }
  risks: {
    recent_exits: Array<{ staff_name: string; exit_date: string; exit_type: string; reason: string }>
    risk_candidates: Array<{ staff_id: number; staff_name: string; latest_score: number; previous_score: number; severity: string; reasons: string[] }>
    org_pulse_risk: boolean
    action_metrics: {
      total: number
      done: number
      overdue: number
      completion_rate: number
      overdue_rate: number
    }
    recent_actions: Array<{
      id: number
      staff_id: number
      staff_name: string
      action_type: string
      owner: string
      due_date: string
      sync_status: string
      create_time: string
      is_overdue: boolean
    }>
  }
}

const gcpStatusMap: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
  valid: { label: '有效', variant: 'success' },
  expiring: { label: '即将过期', variant: 'warning' },
  expired: { label: '已过期', variant: 'error' },
  none: { label: '无证书', variant: 'default' },
}

const trainingStatusMap: Record<string, { label: string; variant: 'success' | 'warning' | 'primary' | 'default' }> = {
  scheduled: { label: '计划中', variant: 'primary' },
  completed: { label: '已完成', variant: 'success' },
  overdue: { label: '已逾期', variant: 'warning' },
}

const riskActionStatusMap: Record<string, { label: string; variant: 'success' | 'warning' | 'primary' | 'default' | 'error' }> = {
  pending: { label: '待执行', variant: 'warning' },
  in_progress: { label: '进行中', variant: 'primary' },
  done: { label: '已完成', variant: 'success' },
  cancelled: { label: '已取消', variant: 'default' },
}

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

export function DashboardPage() {
  const claw = useClawQuickActions('hr', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])
  const [filterMonth, setFilterMonth] = useState('')
  const [filterDept, setFilterDept] = useState('')
  const [appliedMonth, setAppliedMonth] = useState('')
  const [appliedDept, setAppliedDept] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [myOwner, setMyOwner] = useState('HRBP')
  const [onlyOverdue, setOnlyOverdue] = useState(false)
  const [actionStatusFilter, setActionStatusFilter] = useState<string>('')
  const [actionPage, setActionPage] = useState(1)
  const [actionPageSize, setActionPageSize] = useState(8)
  const [actionJumpPageInput, setActionJumpPageInput] = useState('1')
  const [editingActionId, setEditingActionId] = useState<number | null>(null)
  const [editingOwner, setEditingOwner] = useState('')
  const [editingDueDate, setEditingDueDate] = useState('')
  const queryClient = useQueryClient()

  const { data: staffStatsData, isLoading: staffStatsLoading } = useQuery({
    queryKey: ['hr', 'staff', 'stats'],
    queryFn: () => api.get<StaffStats>('/hr/staff/stats'),
  })

  const { data: trainingsStatsData } = useQuery({
    queryKey: ['hr', 'trainings', 'stats'],
    queryFn: () => api.get<TrainingsStats>('/hr/trainings/stats'),
  })

  const { data: expiringStaffData, isLoading: expiringLoading } = useQuery({
    queryKey: ['hr', 'staff', 'list', 'expiring'],
    queryFn: () =>
      api.get<{ items: StaffItem[]; total: number }>('/hr/staff/list', {
        params: { page: 1, page_size: 10, gcp_status: 'expiring' },
      }),
  })

  const { data: trainingsData, isLoading: trainingsLoading } = useQuery({
    queryKey: ['hr', 'trainings', 'list', 'scheduled'],
    queryFn: () =>
      api.get<{ items: TrainingItem[]; total: number }>('/hr/trainings/list', {
        params: { page: 1, page_size: 5, status: 'scheduled' },
      }),
  })

  const { data: workloadData, isLoading: workloadLoading } = useQuery({
    queryKey: ['hr', 'workload'],
    queryFn: () => api.get<{ items: WorkloadItem[] }>('/hr/workload'),
  })

  const { data: opsOverviewData, isLoading: opsOverviewLoading } = useQuery({
    queryKey: ['hr', 'ops', 'overview', appliedMonth, appliedDept],
    queryFn: () => api.get<OpsOverview>('/hr/ops/overview', {
      params: {
        month: appliedMonth || undefined,
        department: appliedDept || undefined,
      },
    }),
  })

  const { data: riskActionsData, isLoading: riskActionsLoading } = useQuery({
    queryKey: ['hr', 'ops', 'risk-actions', actionStatusFilter, actionPage, actionPageSize],
    queryFn: () => api.get<{ items: RiskActionItem[]; total: number; page: number; page_size: number }>(
      '/hr/ops/risk-actions/list',
      {
        params: {
          sync_status: actionStatusFilter || undefined,
          page: actionPage,
          page_size: actionPageSize,
        },
      },
    ),
  })

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'hr'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('hr'),
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []

  const stats = staffStatsData?.data
  const trainingsStats = trainingsStatsData?.data
  const byGcp = stats?.by_gcp_status ?? {}
  const byStatus = trainingsStats?.by_status ?? {}
  const pendingTraining =
    (byStatus.scheduled ?? 0) + (byStatus.overdue ?? 0)

  const expiringList = expiringStaffData?.data?.items ?? []
  const trainingsList = trainingsData?.data?.items ?? []
  const workloadItems = workloadData?.data?.items ?? []
  const ops = opsOverviewData?.data
  const trendItems = [
    { label: '招聘中需求', value: ops?.recruitment?.open_demands ?? 0 },
    { label: '候选人管道', value: ops?.recruitment?.pipeline_candidates ?? 0 },
    { label: '绩效记录', value: ops?.performance?.records ?? 0 },
    { label: '文化活动', value: ops?.culture?.activity_count ?? 0 },
    { label: '协同待办', value: ops?.collaboration?.open_snapshots ?? 0 },
  ]
  const trendMax = Math.max(...trendItems.map((i) => i.value), 1)

  const getDefaultDueDate = () => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    return d.toISOString().slice(0, 10)
  }

  const createRiskAction = useMutation({
    mutationFn: (payload: { staff_id: number; action_type: 'interview' | 'training' }) =>
      api.post('/hr/ops/risk-actions/create', {
        staff_id: payload.staff_id,
        action_type: payload.action_type,
        operator: 'HRD',
        owner: 'HRBP',
        due_date: getDefaultDueDate(),
        note: payload.action_type === 'interview' ? '驾驶舱联合预警触发面谈' : '驾驶舱联合预警触发培训',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'ops', 'overview'] })
      queryClient.invalidateQueries({ queryKey: ['hr', 'trainings', 'list', 'scheduled'] })
      queryClient.invalidateQueries({ queryKey: ['hr-archive-change-logs'] })
      queryClient.invalidateQueries({ queryKey: ['hr', 'ops', 'risk-actions'] })
    },
  })

  const updateRiskAction = useMutation({
    mutationFn: (payload: { actionId: number; syncStatus: 'pending' | 'in_progress' | 'done' | 'cancelled' }) =>
      api.put(`/hr/ops/risk-actions/${payload.actionId}`, {
        sync_status: payload.syncStatus,
        note: '驾驶舱状态更新',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'ops', 'overview'] })
      queryClient.invalidateQueries({ queryKey: ['hr', 'ops', 'risk-actions'] })
    },
  })

  const updateRiskActionMeta = useMutation({
    mutationFn: (payload: { actionId: number; owner: string; dueDate: string }) =>
      api.put(`/hr/ops/risk-actions/${payload.actionId}/meta`, {
        owner: payload.owner,
        due_date: payload.dueDate || undefined,
      }),
    onSuccess: () => {
      setEditingActionId(null)
      setEditingOwner('')
      setEditingDueDate('')
      queryClient.invalidateQueries({ queryKey: ['hr', 'ops', 'overview'] })
      queryClient.invalidateQueries({ queryKey: ['hr', 'ops', 'risk-actions'] })
    },
  })

  const createRenewalTrainingMutation = useMutation({
    mutationFn: async (staffIds: number[]) => {
      const startDate = new Date().toISOString().slice(0, 10)
      return Promise.all(
        staffIds.map((staffId) =>
          api.post('/hr/trainings/create', {
            course_name: 'GCP 续证培训',
            category: 'gcp',
            trainee_id: staffId,
            trainer: '数字员工·人事服务助理',
            start_date: startDate,
            hours: 2,
            end_date: startDate,
          }),
        ),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr', 'trainings', 'list', 'scheduled'] })
      queryClient.invalidateQueries({ queryKey: ['hr', 'trainings', 'stats'] })
    },
  })

  const today = new Date().toISOString().slice(0, 10)
  const actionItems = riskActionsData?.data?.items ?? []
  const actionTotal = riskActionsData?.data?.total ?? 0
  const actionTotalPages = Math.max(Math.ceil(actionTotal / actionPageSize), 1)

  const filteredRecentActions = actionItems.filter((action) => {
    const isOverdue = ['pending', 'in_progress'].includes(action.sync_status) && !!action.due_date && action.due_date < today
    if (onlyMine && action.owner !== myOwner) {
      return false
    }
    if (onlyOverdue && !isOverdue) {
      return false
    }
    return true
  })

  if (staffStatsLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> 正在加载仪表盘...
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-lg font-bold text-slate-800 md:text-2xl">人事管理概览</h1>
      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />
      <ClawQuickPanel workstationKey="hr" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />
      <Card>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Input
            label="月份(YYYY-MM)"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            placeholder="例如 2026-02"
          />
          <Input
            label="部门"
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
            placeholder="例如 人事部"
          />
          <Button onClick={() => { setAppliedMonth(filterMonth); setAppliedDept(filterDept) }}>
            应用筛选
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setFilterMonth('')
              setFilterDept('')
              setAppliedMonth('')
              setAppliedDept('')
            }}
          >
            重置
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard
          title="在职人员"
          value={stats?.total ?? 0}
          icon={<Users className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="GCP有效"
          value={byGcp.valid ?? 0}
          icon={<Award className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="即将过期"
          value={byGcp.expiring ?? 0}
          icon={<AlertTriangle className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="待完成培训"
          value={pendingTraining}
          icon={<BookOpen className="w-6 h-6" />}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard
          title="风险动作总数"
          value={ops?.risks?.action_metrics?.total ?? 0}
          icon={<AlertTriangle className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="动作完成率"
          value={`${ops?.risks?.action_metrics?.completion_rate ?? 0}%`}
          icon={<Award className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="动作超期率"
          value={`${ops?.risks?.action_metrics?.overdue_rate ?? 0}%`}
          icon={<Clock className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="超期动作数"
          value={ops?.risks?.action_metrics?.overdue ?? 0}
          icon={<AlertTriangle className="w-6 h-6" />}
          color="purple"
        />
      </div>

      {expiringList.length > 0 && (
        <DigitalWorkerActionCard
          roleCode="hr_assistant"
          roleName="人事服务助理"
          title={`发现 ${expiringList.length} 位人员 GCP 证书即将到期`}
          description="人事服务助理建议尽快安排续证培训，降低资质失效风险。"
          items={expiringList.slice(0, 5).map((staff) => ({
            key: String(staff.id),
            label: staff.name,
            value: `${staff.position || '-'} · 到期日 ${staff.gcp_expiry || '-'}`,
          }))}
          onAccept={() => {
            const ids = expiringList.slice(0, 5).map((staff) => staff.id)
            if (ids.length === 0) return
            createRenewalTrainingMutation.mutate(ids)
          }}
          loading={createRenewalTrainingMutation.isPending}
          acceptLabel="批量安排续证培训"
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard
          title="招聘中需求"
          value={ops?.recruitment?.open_demands ?? 0}
          icon={<Users className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="候选人管道"
          value={ops?.recruitment?.pipeline_candidates ?? 0}
          icon={<Users className="w-6 h-6" />}
          color="purple"
        />
        <StatCard
          title="薪资总额"
          value={`¥${Math.round(ops?.compensation?.total_net_salary ?? 0)}`}
          icon={<BookOpen className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="激励总额"
          value={`¥${Math.round(ops?.compensation?.total_incentive ?? 0)}`}
          icon={<Award className="w-6 h-6" />}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
        <Card>
          <div className="p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              GCP到期预警列表
            </h2>
            {expiringLoading ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                加载中...
              </p>
            ) : expiringList.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                暂无即将过期的GCP证书
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2 pr-4">姓名</th>
                      <th className="py-2 pr-4">岗位</th>
                      <th className="py-2 pr-4">到期日</th>
                      <th className="py-2">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringList.map((row) => {
                      const info = gcpStatusMap[row.gcp_status] ?? {
                        label: row.gcp_status,
                        variant: 'default' as const,
                      }
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-700">
                            {row.name}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {row.position ?? '-'}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {row.gcp_expiry ?? '-'}
                          </td>
                          <td className="py-3">
                            <Badge variant={info.variant}>{info.label}</Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              近期培训计划
            </h2>
            {trainingsLoading ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                加载中...
              </p>
            ) : trainingsList.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                暂无近期培训计划
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-2 pr-4">课程</th>
                      <th className="py-2 pr-4">参训人</th>
                      <th className="py-2 pr-4">开始日期</th>
                      <th className="py-2">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingsList.map((row) => {
                      const info =
                        trainingStatusMap[row.status] ?? {
                          label: row.status,
                          variant: 'default' as const,
                        }
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-700">
                            {row.course_name ?? '-'}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {row.trainee_name ?? '-'}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {row.start_date ?? '-'}
                          </td>
                          <td className="py-3">
                            <Badge variant={info.variant}>{info.label}</Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-5">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            工作负荷概览
          </h2>
          {workloadLoading ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              加载中...
            </p>
          ) : workloadItems.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">
              暂无工作负荷数据
            </p>
          ) : (
            <div className="space-y-3">
              {workloadItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50"
                >
                  <span className="font-medium text-slate-700">
                    {item.staff_name}
                  </span>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <span>在研项目: {item.active_projects}</span>
                    <span>
                      工时: {item.current_hours}h / {item.max_hours}h
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">经营趋势图（简版）</h2>
          {opsOverviewLoading ? (
            <p className="text-sm text-slate-400 py-6 text-center">加载中...</p>
          ) : (
            <div className="space-y-3">
              {trendItems.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-sm text-slate-600">
                    <span>{item.label}</span>
                    <span>{item.value}</span>
                  </div>
                  <progress
                    className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-indigo-500 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-indigo-500"
                    max={trendMax}
                    value={item.value}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
        <Card>
          <div className="p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">招聘需求动态</h2>
            {opsOverviewLoading ? (
              <p className="text-sm text-slate-400 py-6 text-center">加载中...</p>
            ) : (ops?.recruitment?.recent_demands?.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">暂无招聘需求</p>
            ) : (
              <div className="space-y-2">
                {ops?.recruitment?.recent_demands?.map((d) => (
                  <div key={d.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-slate-700">{d.title}</p>
                      <p className="text-slate-500">{d.department || '-'}</p>
                    </div>
                    <Badge variant="primary">{d.status || 'draft'}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">离职风险追踪</h2>
            {opsOverviewLoading ? (
              <p className="text-sm text-slate-400 py-6 text-center">加载中...</p>
            ) : (ops?.risks?.recent_exits?.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">暂无离职记录</p>
            ) : (
              <div className="space-y-2">
                {ops?.risks?.recent_exits?.map((r, idx) => (
                  <div key={`${r.staff_name}-${idx}`} className="rounded-lg bg-rose-50 px-3 py-2 text-sm">
                    <p className="font-medium text-slate-700">{r.staff_name}</p>
                    <p className="text-slate-600">{r.exit_type} · {r.exit_date}</p>
                    <p className="text-slate-500">{r.reason || '-'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-5">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">联合预警（敬业度 + 绩效）</h2>
          {opsOverviewLoading ? (
            <p className="text-sm text-slate-400 py-6 text-center">加载中...</p>
          ) : (ops?.risks?.risk_candidates?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">暂无联合预警对象</p>
          ) : (
            <div className="space-y-2">
              {ops?.risks?.risk_candidates?.map((item) => (
                <div key={item.staff_id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm">
                  <p className="font-medium text-slate-700">{item.staff_name}</p>
                  <p className="text-slate-600">
                    绩效: {item.previous_score} → {item.latest_score} · 严重度: {item.severity}
                  </p>
                  <p className="text-slate-500">{item.reasons.join('、')}</p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      loading={createRiskAction.isPending}
                      onClick={() => createRiskAction.mutate({ staff_id: item.staff_id, action_type: 'interview' })}
                    >
                      创建面谈任务
                    </Button>
                    <Button
                      size="sm"
                      loading={createRiskAction.isPending}
                      onClick={() => createRiskAction.mutate({ staff_id: item.staff_id, action_type: 'training' })}
                    >
                      创建培训任务
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {ops?.risks?.org_pulse_risk ? (
            <p className="mt-3 text-xs text-rose-600">当前组织敬业度处于风险状态，建议提高面谈和关怀频次。</p>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="p-5">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">预警动作闭环</h2>
          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-4">
            <Input
              label="我的负责人名"
              value={myOwner}
              onChange={(e) => setMyOwner(e.target.value)}
              placeholder="例如 HRBP"
            />
            <Button
              variant={onlyMine ? 'primary' : 'outline'}
              onClick={() => setOnlyMine((v) => !v)}
            >
              {onlyMine ? '已启用：只看我负责' : '只看我负责'}
            </Button>
            <Button
              variant={onlyOverdue ? 'primary' : 'outline'}
              onClick={() => setOnlyOverdue((v) => !v)}
            >
              {onlyOverdue ? '已启用：只看已超期' : '只看已超期'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setOnlyMine(false)
                setOnlyOverdue(false)
                setActionStatusFilter('')
                setActionPage(1)
                setActionJumpPageInput('1')
              }}
            >
              清空动作筛选
            </Button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={actionStatusFilter === '' ? 'primary' : 'outline'}
              onClick={() => {
                setActionStatusFilter('')
                setActionPage(1)
                setActionJumpPageInput('1')
              }}
            >
              全部状态
            </Button>
            <Button
              size="sm"
              variant={actionStatusFilter === 'pending' ? 'primary' : 'outline'}
              onClick={() => {
                setActionStatusFilter('pending')
                setActionPage(1)
                setActionJumpPageInput('1')
              }}
            >
              待执行
            </Button>
            <Button
              size="sm"
              variant={actionStatusFilter === 'in_progress' ? 'primary' : 'outline'}
              onClick={() => {
                setActionStatusFilter('in_progress')
                setActionPage(1)
                setActionJumpPageInput('1')
              }}
            >
              进行中
            </Button>
            <Button
              size="sm"
              variant={actionStatusFilter === 'done' ? 'primary' : 'outline'}
              onClick={() => {
                setActionStatusFilter('done')
                setActionPage(1)
                setActionJumpPageInput('1')
              }}
            >
              已完成
            </Button>
            <Button
              size="sm"
              variant={actionStatusFilter === 'cancelled' ? 'primary' : 'outline'}
              onClick={() => {
                setActionStatusFilter('cancelled')
                setActionPage(1)
                setActionJumpPageInput('1')
              }}
            >
              已取消
            </Button>
          </div>
          {riskActionsLoading ? (
            <p className="text-sm text-slate-400 py-6 text-center">加载中...</p>
          ) : filteredRecentActions.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">暂无预警动作</p>
          ) : (
            <div className="space-y-2">
              {filteredRecentActions.map((action) => {
                const statusInfo = riskActionStatusMap[action.sync_status] ?? { label: action.sync_status, variant: 'default' as const }
                const isOverdue = ['pending', 'in_progress'].includes(action.sync_status) && !!action.due_date && action.due_date < today
                return (
                  <div key={action.id} className="rounded-lg bg-slate-50 px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-700">{action.staff_name || '-'}</p>
                        <p className="text-slate-500">
                          {action.action_type === 'training' ? '培训干预' : '风险面谈'} · 负责人: {action.owner || '-'}
                        </p>
                        <p className="text-slate-500">
                          截止日: {action.due_date || '-'} · 创建日: {action.create_time.slice(0, 10)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isOverdue ? <Badge variant="error">已超期</Badge> : null}
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={updateRiskAction.isPending}
                        onClick={() => updateRiskAction.mutate({ actionId: action.id, syncStatus: 'in_progress' })}
                      >
                        标记进行中
                      </Button>
                      <Button
                        size="sm"
                        loading={updateRiskAction.isPending}
                        onClick={() => updateRiskAction.mutate({ actionId: action.id, syncStatus: 'done' })}
                      >
                        标记完成
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={updateRiskAction.isPending}
                        onClick={() => updateRiskAction.mutate({ actionId: action.id, syncStatus: 'cancelled' })}
                      >
                        取消
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingActionId(action.id)
                          setEditingOwner(action.owner || '')
                          setEditingDueDate(action.due_date || '')
                        }}
                      >
                        编辑负责人/截止日
                      </Button>
                    </div>
                    {editingActionId === action.id ? (
                      <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                          <Input
                            label="负责人"
                            value={editingOwner}
                            onChange={(e) => setEditingOwner(e.target.value)}
                            placeholder="例如 HRBP-A"
                          />
                          <Input
                            label="截止日(YYYY-MM-DD)"
                            value={editingDueDate}
                            onChange={(e) => setEditingDueDate(e.target.value)}
                            placeholder="例如 2026-03-15"
                          />
                          <div className="flex items-end gap-2">
                            <Button
                              size="sm"
                              loading={updateRiskActionMeta.isPending}
                              onClick={() => updateRiskActionMeta.mutate({
                                actionId: action.id,
                                owner: editingOwner,
                                dueDate: editingDueDate,
                              })}
                            >
                              保存
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingActionId(null)}
                            >
                              取消编辑
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              第 {actionPage} / {actionTotalPages} 页 · 共 {actionTotal} 条
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">每页</span>
                <Button
                  size="sm"
                  variant={actionPageSize === 8 ? 'primary' : 'outline'}
                  onClick={() => {
                    setActionPageSize(8)
                    setActionPage(1)
                    setActionJumpPageInput('1')
                  }}
                >
                  8
                </Button>
                <Button
                  size="sm"
                  variant={actionPageSize === 20 ? 'primary' : 'outline'}
                  onClick={() => {
                    setActionPageSize(20)
                    setActionPage(1)
                    setActionJumpPageInput('1')
                  }}
                >
                  20
                </Button>
                <Button
                  size="sm"
                  variant={actionPageSize === 50 ? 'primary' : 'outline'}
                  onClick={() => {
                    setActionPageSize(50)
                    setActionPage(1)
                    setActionJumpPageInput('1')
                  }}
                >
                  50
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={actionPage <= 1}
                onClick={() => {
                  const next = Math.max(1, actionPage - 1)
                  setActionPage(next)
                  setActionJumpPageInput(String(next))
                }}
              >
                上一页
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={actionPage >= actionTotalPages}
                onClick={() => {
                  const next = Math.min(actionTotalPages, actionPage + 1)
                  setActionPage(next)
                  setActionJumpPageInput(String(next))
                }}
              >
                下一页
              </Button>
              <Input
                label="跳转页码"
                value={actionJumpPageInput}
                onChange={(e) => setActionJumpPageInput(e.target.value)}
                placeholder={`1-${actionTotalPages}`}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const parsed = Number(actionJumpPageInput)
                  if (!Number.isFinite(parsed)) {
                    return
                  }
                  const next = Math.min(actionTotalPages, Math.max(1, Math.floor(parsed)))
                  setActionPage(next)
                  setActionJumpPageInput(String(next))
                }}
              >
                跳转
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
