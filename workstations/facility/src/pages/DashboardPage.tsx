import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, StatCard, Badge, ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar } from '@cn-kis/ui-kit'
import type { QuickAction } from '@cn-kis/ui-kit'
import { facilityApi, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { EnvironmentReading, IncidentItem } from '@cn-kis/api-client'
import { Building2, CalendarCheck, Thermometer, AlertOctagon, Clock } from 'lucide-react'

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

export function DashboardPage() {
  const claw = useClawQuickActions('facility', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])

  const { data: dashData, isLoading: dashLoading } = useQuery({
    queryKey: ['facility', 'dashboard'],
    queryFn: () => facilityApi.getDashboard(),
  })

  const today = new Date().toISOString().slice(0, 10)
  const { data: calendarData } = useQuery({
    queryKey: ['facility', 'calendar', today],
    queryFn: () => facilityApi.getCalendar({ date: today }),
  })

  const { data: envData } = useQuery({
    queryKey: ['facility', 'environment-current'],
    queryFn: () => facilityApi.getCurrentEnvironment(),
  })

  const { data: incidentsData } = useQuery({
    queryKey: ['facility', 'incidents', 'open'],
    queryFn: () =>
      facilityApi.getIncidents({ status: 'open', page: 1, page_size: 20 }),
  })

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'facility'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('facility'),
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []

  const dash = dashData?.data
  const venues = (dash?.venues ?? {}) as Record<string, any>
  const reservations = (dash?.reservations ?? {}) as Record<string, any>
  const environment = (dash?.environment ?? {}) as Record<string, any>
  const incidents = (dash?.incidents ?? {}) as Record<string, any>

  const totalVenues = venues.total ?? 0
  const calendarEntries = (calendarData?.data as { entries?: Array<{ venue_name: string; start_time: string; end_time: string; purpose: string }> })?.entries ?? []
  const todayReservations =
    reservations.today_count ?? calendarEntries.length
  const envAbnormal = environment.non_compliant_venues ?? 0
  const incidentCount = incidents.open_count ?? 0

  const reservationList: Array<{ venue: string; time: string; purpose: string }> =
    []
  calendarEntries.forEach((r) => {
    const start = r.start_time ? new Date(r.start_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-'
    const end = r.end_time ? new Date(r.end_time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-'
    reservationList.push({
      venue: r.venue_name ?? '-',
      time: `${start} - ${end}`,
      purpose: r.purpose ?? '-',
    })
  })

  const envReadings = (envData?.data as { readings?: EnvironmentReading[] })?.readings ?? []
  const abnormalList: Array<{
    venue: string
    parameter: string
    value: number
    status: string
  }> = []
  envReadings
    .filter((r) => !r.is_compliant)
    .forEach((r) => {
      if (r.temperature !== undefined && (r.temperature < r.target_temp - r.temp_tolerance || r.temperature > r.target_temp + r.temp_tolerance)) {
        abnormalList.push({
          venue: r.venue_name ?? '-',
          parameter: '温度',
          value: r.temperature,
          status: '异常',
        })
      }
      if (r.humidity !== undefined && (r.humidity < r.target_humidity - r.humidity_tolerance || r.humidity > r.target_humidity + r.humidity_tolerance)) {
        abnormalList.push({
          venue: r.venue_name ?? '-',
          parameter: '湿度',
          value: r.humidity,
          status: '异常',
        })
      }
    })
  const incidentItems = (incidentsData?.data as { items?: IncidentItem[] })?.items ?? []
  incidentItems.slice(0, 5).forEach((i) => {
    abnormalList.push({
      venue: i.venue_name ?? '-',
      parameter: i.deviation_param ?? '不合规',
      value: 0,
      status: i.severity_display ?? i.status_display ?? '待处理',
    })
  })

  if (dashLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> 正在加载仪表盘...
      </div>
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <h1 className="text-lg font-bold text-slate-800 md:text-xl">设施管理概览</h1>
      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />
      <ClawQuickPanel workstationKey="facility" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard
          title="场地总数"
          value={totalVenues}
          icon={<Building2 className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="今日预约"
          value={todayReservations}
          icon={<CalendarCheck className="w-6 h-6" />}
          color="green"
        />
        <StatCard
          title="环境异常"
          value={envAbnormal}
          icon={<Thermometer className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="不合规事件"
          value={incidentCount}
          icon={<AlertOctagon className="w-6 h-6" />}
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
        <Card>
          <div className="p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              今日预约时间线
            </h2>
            {reservationList.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                今日暂无预约
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {reservationList.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 py-2 px-3 rounded-lg bg-slate-50"
                  >
                    <div className="shrink-0 w-24 text-sm text-slate-500 font-mono">
                      {item.time}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-700 block">
                        {item.venue}
                      </span>
                      <span className="text-sm text-slate-500">
                        {item.purpose}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              环境异常列表
            </h2>
            {abnormalList.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">
                暂无环境异常
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {abnormalList.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-2 py-2 px-3 rounded-lg bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-slate-700 block">
                        {item.venue}
                      </span>
                      <span className="text-sm text-slate-500">
                        {item.parameter}
                        {item.value !== 0 ? `: ${item.value}` : ''}
                      </span>
                    </div>
                    <Badge
                      variant={
                        item.status === '异常' || item.status.includes('严重')
                          ? 'error'
                          : 'warning'
                      }
                      size="sm"
                    >
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
