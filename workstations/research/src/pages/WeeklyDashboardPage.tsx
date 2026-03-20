/**
 * 周报 - 管理者看板
 *
 * 周期总览（提交率、完成率、延期率、风险项目占比）；项目健康；团队热力图；按用户/项目/周报下钻；催办
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { weeklyReportApi, getCurrentISOWeek } from '@cn-kis/api-client'
import { StatCard, Empty, Badge } from '@cn-kis/ui-kit'
import { BarChart3, AlertTriangle, CheckCircle, Send } from 'lucide-react'

function useWeekKey() {
  const cur = getCurrentISOWeek()
  return `${cur.year}-W${String(cur.week).padStart(2, '0')}`
}

export default function WeeklyDashboardPage() {
  const queryClient = useQueryClient()
  const [periodKey, setPeriodKey] = useState(useWeekKey())
  const [projectFilter, setProjectFilter] = useState<'all' | 'mine' | 'others'>('all')
  const [nudgeUserIds, setNudgeUserIds] = useState<number[]>([])
  const [nudgeSent, setNudgeSent] = useState<string | null>(null)

  const { data: overviewRes } = useQuery({
    queryKey: ['weekly-dashboard', 'overview', periodKey],
    queryFn: () => weeklyReportApi.dashboardOverview({ period_type: 'week', period_key: periodKey }),
  })
  const { data: healthRes } = useQuery({
    queryKey: ['weekly-dashboard', 'health', periodKey, projectFilter],
    queryFn: () =>
      weeklyReportApi.dashboardProjectHealth({
        period_type: 'week',
        period_key: periodKey,
        created_by: projectFilter,
      }),
  })
  const { data: heatmapRes } = useQuery({
    queryKey: ['weekly-dashboard', 'heatmap', periodKey],
    queryFn: () => weeklyReportApi.dashboardTeamHeatmap({ period_type: 'week', period_key: periodKey }),
  })
  const { data: usersRes } = useQuery({
    queryKey: ['weekly-report', 'users'],
    queryFn: () => weeklyReportApi.listUsers(),
  })

  const nudgeMutation = useMutation({
    mutationFn: (userIds: number[]) =>
      weeklyReportApi.nudge({ week_key: periodKey, user_ids: userIds, remind_type: 'nudge' }),
    onSuccess: (_, userIds) => {
      setNudgeSent(`已向 ${userIds.length} 人发送催办`)
      setNudgeUserIds([])
      queryClient.invalidateQueries({ queryKey: ['weekly-dashboard'] })
    },
  })

  const overview = (overviewRes as any)?.data?.data ?? (overviewRes as any)?.data ?? (overviewRes as any)?.data
  const healthPayload = (healthRes as any)?.data?.data ?? (healthRes as any)?.data
  const healthItems = healthPayload?.items ?? []
  const heatmapPayload = (heatmapRes as any)?.data?.data ?? (heatmapRes as any)?.data
  const heatmapUsers = heatmapPayload?.users ?? []
  const users: { id: number; name: string }[] = Array.isArray((usersRes as any)?.data?.data)
    ? (usersRes as any).data.data
    : Array.isArray((usersRes as any)?.data)
    ? (usersRes as any).data
    : []

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">周报看板</h2>
          <p className="text-sm text-slate-500 mt-1">周期总览、项目健康、团队活跃与催办</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          周期
          <input
            type="text"
            value={periodKey}
            onChange={(e) => setPeriodKey(e.target.value)}
            placeholder="2025-W10"
            className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
      </div>

      {/* 周期总览 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="提交率"
          value={overview ? `${(overview.submit_rate * 100).toFixed(1)}%` : '-'}
          icon={<CheckCircle className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="完成率"
          value={overview ? `${(overview.completion_rate * 100).toFixed(1)}%` : '-'}
          icon={<BarChart3 className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="延期率"
          value={overview ? `${(overview.overdue_rate * 100).toFixed(1)}%` : '-'}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
        />
        <div className="group relative">
          <StatCard
            title="风险项目占比"
            value={overview ? `${(overview.risk_rate * 100).toFixed(1)}%` : '-'}
            icon={<AlertTriangle className="w-5 h-5" />}
            color="amber"
          />
          <div className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
            <p className="mb-1.5 font-semibold text-slate-700">风险等级判定规则</p>
            <div className="space-y-1">
              <p><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5 align-middle" />高风险：延期率 &gt; 30% 或阻塞任务 &gt; 3 个</p>
              <p><span className="inline-block w-2 h-2 rounded-full bg-yellow-400 mr-1.5 align-middle" />中风险：延期率 10%~30%（含边界）</p>
              <p><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5 align-middle" />低风险：延期率 &lt; 10% 且阻塞 ≤ 3，或无任务</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 项目健康 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">项目健康</h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {(['all', 'mine', 'others'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setProjectFilter(key)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  projectFilter === key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {key === 'all' ? '全部' : key === 'mine' ? '我创建的' : '用户创建的'}
              </button>
            ))}
          </div>
          {healthItems.length === 0 ? (
            <Empty description="暂无项目数据" />
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {healthItems.map((item: { project: { id: number; name: string; created_by_name?: string }; delayed_ratio: number; blocked_count: number }) => (
                <div
                  key={item.project.id}
                  className="flex items-center justify-between rounded border border-slate-200 p-2 text-sm"
                >
                  <div>
                    <span className="font-medium text-slate-800">{item.project.name}</span>
                    <span className="ml-2 text-slate-500 text-xs">{item.project.created_by_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-amber-600 text-xs">延期 {(item.delayed_ratio * 100).toFixed(0)}%</span>
                    <span className="text-red-600 text-xs">阻塞 {item.blocked_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 团队热力图 + 催办 */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">团队活跃</h3>
          {heatmapUsers.length === 0 ? (
            <Empty description="暂无数据" />
          ) : (
            <div className="space-y-2">
              {heatmapUsers.slice(0, 10).map((u: { user_id: number; task_updates: number; report_submits: number; heat: number }) => (
                <div
                  key={u.user_id}
                  className="flex items-center justify-between rounded border border-slate-200 p-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{users.find((x) => x.id === u.user_id)?.name ?? `用户${u.user_id}`}</span>
                    <span className="text-slate-500 text-xs">任务{u.task_updates} 周报{u.report_submits} 热度{u.heat}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={nudgeUserIds.includes(u.user_id)}
                        onChange={(e) =>
                          setNudgeUserIds((prev) =>
                            e.target.checked ? [...prev, u.user_id] : prev.filter((id) => id !== u.user_id)
                          )
                        }
                      />
                      <span className="text-xs text-slate-500">催办</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={() => nudgeMutation.mutate(nudgeUserIds.length ? nudgeUserIds : heatmapUsers.map((u: { user_id: number }) => u.user_id))}
              disabled={nudgeMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
            >
              <Send className="w-4 h-4" />
              {nudgeUserIds.length ? `催办 ${nudgeUserIds.length} 人` : '催办全部'}
            </button>
            {nudgeSent && <span className="ml-2 text-sm text-emerald-600">{nudgeSent}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
