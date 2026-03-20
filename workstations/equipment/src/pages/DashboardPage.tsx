import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, StatCard, Badge, ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar, DigitalWorkerActionCard } from '@cn-kis/ui-kit'
import type { QuickAction } from '@cn-kis/ui-kit'
import { equipmentApi, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { CalibrationPlanItem, MaintenanceOrder, SuggestionItem } from '@cn-kis/api-client'
import { Monitor, CalendarClock, Wrench, AlertTriangle, Clock } from 'lucide-react'

function daysRemainingColor(days: number): 'success' | 'warning' | 'error' | 'default' {
  if (days < 0) return 'error'
  if (days <= 7) return 'error'
  if (days <= 30) return 'warning'
  return 'success'
}

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

export function DashboardPage() {
  const queryClient = useQueryClient()
  const claw = useClawQuickActions('equipment', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['equipment', 'dashboard'],
    queryFn: () => equipmentApi.dashboard(),
  })

  const { data: calPlanData } = useQuery({
    queryKey: ['equipment', 'calibration-plan'],
    queryFn: () => equipmentApi.getCalibrationPlan(),
  })

  const { data: maintStatsData } = useQuery({
    queryKey: ['equipment', 'maintenance-stats'],
    queryFn: () => equipmentApi.getMaintenanceStats(),
  })

  const { data: maintListData } = useQuery({
    queryKey: ['equipment', 'maintenance-list'],
    queryFn: () =>
      equipmentApi.listMaintenance({ status: 'pending,in_progress', page: 1, page_size: 100 }),
  })

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'equipment'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('equipment'),
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []

  const dash = dashData?.data
  const summary = (dash?.summary ?? {}) as Record<string, any>
  const calAlerts = (dash?.calibration_alerts ?? {}) as Record<string, any>
  const maintOverview = (dash?.maintenance_overview ?? {}) as Record<string, any>
  const maintStats = (maintStatsData?.data ?? {}) as Record<string, any>
  const calPlan = calPlanData?.data
  const maintList = (maintListData?.data as { items?: MaintenanceOrder[] })?.items ?? []

  const calibrationDueSoon =
    (calAlerts.due_in_7_days ?? 0) + (calAlerts.due_in_30_days ?? 0)
  const pendingCount = maintStats.pending ?? maintOverview.pending ?? 0
  const inProgressCount = maintStats.in_progress ?? maintOverview.in_progress ?? 0
  const completedCount = maintStats.completed_this_month ?? maintOverview.completed_this_month ?? 0

  const createCalibrationMaintenanceMutation = useMutation({
    mutationFn: async (payload: Array<{ equipment_id: number; title: string }>) =>
      Promise.all(
        payload.map((item) =>
          equipmentApi.createMaintenance({
            equipment_id: item.equipment_id,
            maintenance_type: 'calibration',
            title: item.title,
            description: '由数字员工建议创建的校准维护工单',
            maintenance_date: new Date().toISOString().slice(0, 10),
          }),
        ),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', 'maintenance-list'] })
      queryClient.invalidateQueries({ queryKey: ['equipment', 'maintenance-stats'] })
    },
  })

  const calItems: Array<{ id: number; name: string; date: string; days: number }> = []
  if (calPlan?.overdue?.items) {
    calPlan.overdue.items.forEach((i: CalibrationPlanItem) => {
      const d = i.next_calibration_date ? new Date(i.next_calibration_date) : new Date()
      calItems.push({
        id: i.id,
        name: i.name ?? i.code ?? '-',
        date: i.next_calibration_date ?? '-',
        days: Math.floor((d.getTime() - Date.now()) / 86400000),
      })
    })
  }
  if (calPlan?.due_in_7_days?.items) {
    calPlan.due_in_7_days.items.forEach((i: CalibrationPlanItem) => {
      const d = i.next_calibration_date ? new Date(i.next_calibration_date) : new Date()
      calItems.push({
        id: i.id,
        name: i.name ?? i.code ?? '-',
        date: i.next_calibration_date ?? '-',
        days: Math.floor((d.getTime() - Date.now()) / 86400000),
      })
    })
  }
  if (calPlan?.due_this_month?.items && calItems.length < 10) {
    calPlan.due_this_month.items.slice(0, 10 - calItems.length).forEach((i: CalibrationPlanItem) => {
      const d = i.next_calibration_date ? new Date(i.next_calibration_date) : new Date()
      calItems.push({
        id: i.id,
        name: i.name ?? i.code ?? '-',
        date: i.next_calibration_date ?? '-',
        days: Math.floor((d.getTime() - Date.now()) / 86400000),
      })
    })
  }

  const calibratingCount = summary.calibrating ?? 0

  if (dashLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> 正在加载仪表盘...
      </div>
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <h1 className="text-lg font-bold text-slate-800 md:text-xl">设备管理概览</h1>
      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />
      <ClawQuickPanel workstationKey="equipment" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard
          title="设备总数"
          value={summary.total ?? 0}
          icon={<Monitor className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="校准到期(即将)"
          value={calibrationDueSoon}
          icon={<CalendarClock className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="维护中"
          value={inProgressCount}
          icon={<Wrench className="w-6 h-6" />}
          color="purple"
        />
        <StatCard
          title="待检设备"
          value={calibratingCount}
          icon={<AlertTriangle className="w-6 h-6" />}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
        <Card>
          <div className="p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              校准到期倒计时
            </h2>
            {calItems.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                暂无即将到期的校准
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {calItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-2 py-2 px-3 rounded-lg bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium text-slate-700">{item.name}</span>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-slate-500">{item.date}</span>
                      <Badge variant={daysRemainingColor(item.days)}>
                        {item.days < 0 ? `逾期 ${Math.abs(item.days)} 天` : `剩余 ${item.days} 天`}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {calItems.length > 0 && (
          <DigitalWorkerActionCard
            roleCode="equipment_manager"
            roleName="设备管理员"
            title={`发现 ${calItems.length} 台设备需关注校准`}
            description="设备管理员建议尽快安排校准计划，避免设备因到期或逾期影响项目执行。"
            items={calItems.slice(0, 5).map((item, idx) => ({
            key: `${item.id}-${idx}`,
              label: item.name,
              value: `${item.date} · ${item.days < 0 ? `逾期 ${Math.abs(item.days)} 天` : `剩余 ${item.days} 天`}`,
            }))}
          onAccept={() => {
            const payload = calItems.slice(0, 5).map((item) => ({
              equipment_id: item.id,
              title: `设备 ${item.name} 校准安排`,
            }))
            if (payload.length === 0) return
            createCalibrationMaintenanceMutation.mutate(payload)
          }}
          loading={createCalibrationMaintenanceMutation.isPending}
          acceptLabel="批量创建校准工单"
          />
        )}

        <Card>
          <div className="p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              维护状态分布
            </h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>待处理</span>
                  <span className="text-slate-600">{pendingCount}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{
                      width: `${pendingCount + inProgressCount + completedCount > 0 ? (pendingCount / (pendingCount + inProgressCount + completedCount)) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>进行中</span>
                  <span className="text-slate-600">{inProgressCount}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{
                      width: `${pendingCount + inProgressCount + completedCount > 0 ? (inProgressCount / (pendingCount + inProgressCount + completedCount)) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>已完成(本月)</span>
                  <span className="text-slate-600">{completedCount}</span>
                </div>
                <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{
                      width: `${pendingCount + inProgressCount + completedCount > 0 ? (completedCount / (pendingCount + inProgressCount + completedCount)) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            {maintList.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-500 mb-2">近期工单</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {maintList.slice(0, 5).map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 text-sm py-1"
                    >
                      <span className="text-slate-700 truncate">{m.equipment_name}</span>
                      <Badge
                        variant={
                          m.status === 'in_progress'
                            ? 'primary'
                            : m.status === 'completed'
                              ? 'success'
                              : 'default'
                        }
                        size="sm"
                      >
                        {m.status_display ?? m.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
