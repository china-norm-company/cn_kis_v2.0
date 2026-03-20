import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { labPersonnelApi, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { PersonnelDashboard } from '@cn-kis/api-client'
import { Users, ShieldCheck, CalendarDays, AlertTriangle, Clock, ClipboardList } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar } from '@cn-kis/ui-kit'
import type { QuickAction } from '@cn-kis/ui-kit'

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

export function DashboardPage() {
  const navigate = useNavigate()
  const claw = useClawQuickActions('lab-personnel', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])

  const { data: dashData } = useQuery({
    queryKey: ['lab-personnel', 'dashboard'],
    queryFn: () => labPersonnelApi.getDashboard(),
  })
  const dash = (dashData as any)?.data as PersonnelDashboard | undefined

  const today = new Date().toISOString().slice(0, 10)
  const { data: todaySlotsData } = useQuery({
    queryKey: ['lab-personnel', 'today-slots', today],
    queryFn: () => labPersonnelApi.getSlots({ shift_date: today }),
  })
  const todaySlots = ((todaySlotsData as any)?.data as { items: Array<{ id: number; staff_name: string; start_time: string; end_time: string; project_name: string; confirm_status: string }> } | undefined)?.items ?? []

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'lab-personnel'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('lab-personnel'),
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []

  const staffStats = [
    { key: 'total', label: '在册人员', value: dash?.staff?.total ?? '--', color: 'text-blue-600', icon: Users },
    { key: 'active', label: '在岗', value: dash?.staff?.active ?? '--', color: 'text-green-600', icon: Users },
    { key: 'cert_expiring', label: '证书即将到期', value: dash?.certificates?.expiring_soon ?? '--', color: 'text-amber-600', icon: ShieldCheck },
    { key: 'risks_open', label: '待处理风险', value: dash?.risks?.open_total ?? '--', color: 'text-red-600', icon: AlertTriangle },
  ]

  const moduleCards = [
    {
      key: 'qualifications',
      title: '资质概览',
      icon: ShieldCheck,
      color: 'bg-violet-50 text-violet-600',
      items: [
        { label: '独立及以上资质', value: dash?.qualifications?.independent_or_above ?? '--' },
        { label: '学习期', value: dash?.qualifications?.learning ?? '--' },
        { label: '即将到期', value: dash?.qualifications?.expiring_soon ?? '--' },
      ],
      link: '/qualifications',
    },
    {
      key: 'schedules',
      title: '本周排班',
      icon: CalendarDays,
      color: 'bg-blue-50 text-blue-600',
      items: [
        { label: '排班时间槽', value: dash?.schedules?.current_week_slots ?? '--' },
        { label: '已确认', value: dash?.schedules?.confirmed ?? '--' },
        { label: '冲突', value: dash?.schedules?.conflicts ?? '--' },
      ],
      link: '/schedules',
    },
    {
      key: 'worktime',
      title: '工时效率',
      icon: Clock,
      color: 'bg-emerald-50 text-emerald-600',
      items: [
        { label: '平均利用率', value: dash?.worktime?.avg_utilization != null ? `${(dash.worktime.avg_utilization * 100).toFixed(0)}%` : '--' },
        { label: '超负荷', value: dash?.worktime?.overloaded_count ?? '--' },
        { label: '低负荷', value: dash?.worktime?.underloaded_count ?? '--' },
      ],
      link: '/worktime',
    },
    {
      key: 'dispatch',
      title: '工单执行',
      icon: ClipboardList,
      color: 'bg-amber-50 text-amber-600',
      items: [
        { label: '今日完成', value: '--' },
        { label: '待派发', value: '--' },
        { label: '逾期', value: '--' },
      ],
      link: '/dispatch',
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">人员管理看板</h2>
        <p className="text-sm text-slate-500 mt-1">实验室人员资质、排班、工时、风险一站式管理总览</p>
      </div>

      <DigitalWorkerSuggestionBar items={suggestions} loading={suggestionsLoading} />
      <ClawQuickPanel workstationKey="lab-personnel" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 md:gap-4">
        {staffStats.map((s) => {
          const linkMap: Record<string, string> = { total: '/staff', active: '/staff', cert_expiring: '/qualifications', risks_open: '/risks' }
          return (
            <div key={s.key} className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md transition-shadow" data-stat={s.key} onClick={() => navigate(linkMap[s.key] || '/')}>
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{s.label}</p>
                <s.icon className={`w-5 h-5 ${s.color} opacity-60`} />
              </div>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          )
        })}
      </div>

      {/* Module Cards */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
        {moduleCards.map((card) => (
          <div key={card.key} className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 cursor-pointer hover:shadow-md transition-shadow" data-module={card.key} onClick={() => navigate(card.link)}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-lg ${card.color} flex items-center justify-center`}>
                <card.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-slate-800">{card.title}</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {card.items.map((item) => (
                <div key={item.label} className="text-center">
                  <p className="text-lg font-bold text-slate-800">{item.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Risk Summary */}
      {dash?.risks && dash.risks.open_total > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5" data-section="risk-summary">
          <h3 className="font-semibold text-slate-800 mb-3">风险预警摘要</h3>
          <div className="flex flex-wrap gap-3">
            {dash.risks.red > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg cursor-pointer" onClick={() => navigate('/risks')}>
                <span className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm font-medium text-red-700">{dash.risks.red} 个红色风险</span>
              </div>
            )}
            {dash.risks.yellow > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 rounded-lg cursor-pointer" onClick={() => navigate('/risks')}>
                <span className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-sm font-medium text-yellow-700">{dash.risks.yellow} 个黄色风险</span>
              </div>
            )}
            {dash.risks.blue > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg cursor-pointer" onClick={() => navigate('/risks')}>
                <span className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-sm font-medium text-blue-700">{dash.risks.blue} 个蓝色风险</span>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Today's Schedule Timeline */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5" data-section="today-timeline">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-800">
            <Clock className="w-4 h-4 inline mr-1.5 text-violet-500" />
            今日排班 ({todaySlots.length})
          </h3>
          <button onClick={() => navigate('/schedules')} className="min-h-10 px-2 text-xs text-violet-600 hover:underline" title="查看全部排班">查看全部</button>
        </div>
        {todaySlots.length > 0 ? (
          <div className="space-y-2">
            {todaySlots.slice(0, 8).map(slot => (
              <div key={slot.id} className="flex flex-col gap-2 px-3 py-2 bg-slate-50 rounded-lg text-sm sm:flex-row sm:items-center sm:gap-3">
                <span className="font-mono text-xs text-slate-500 w-24 shrink-0">
                  {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                </span>
                <span className="font-medium text-slate-700">{slot.staff_name}</span>
                <span className="hidden text-slate-400 sm:inline">·</span>
                <span className="text-slate-600 truncate">{slot.project_name || '日常工作'}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded sm:ml-auto ${
                  slot.confirm_status === 'confirmed' ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-600'
                }`}>
                  {slot.confirm_status === 'confirmed' ? '已确认' : '待确认'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-4">今日暂无排班</p>
        )}
      </div>
    </div>
  )
}
