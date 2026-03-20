import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { labPersonnelApi } from '@cn-kis/api-client'
import type { ScheduleItem, SlotItem, ConflictResult } from '@cn-kis/api-client'
import { CalendarDays, Plus, AlertTriangle, CheckCircle2, Clock, Send, ChevronLeft, ChevronRight } from 'lucide-react'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { WeekCalendarView } from '../components/WeekCalendarView'

function getMonday(d: Date): string {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d)
  monday.setDate(diff)
  return monday.toISOString().slice(0, 10)
}

export function SchedulePage() {
  const [activeTab, setActiveTab] = useState<'schedules' | 'week' | 'slots' | 'conflicts'>('schedules')
  const [calendarWeek, setCalendarWeek] = useState(() => getMonday(new Date()))
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ week_start_date: '', notes: '' })
  const [createMsg, setCreateMsg] = useState('')

  const { data: scheduleData } = useQuery({
    queryKey: ['lab-personnel', 'schedules'],
    queryFn: () => labPersonnelApi.getSchedules({}),
  })
  const schedules = ((scheduleData as any)?.data as { items: ScheduleItem[] } | undefined)?.items ?? []

  const { data: slotData } = useQuery({
    queryKey: ['lab-personnel', 'slots'],
    queryFn: () => labPersonnelApi.getSlots({}),
  })
  const slots = ((slotData as any)?.data as { items: SlotItem[] } | undefined)?.items ?? []

  const { data: conflictData } = useQuery({
    queryKey: ['lab-personnel', 'conflicts'],
    queryFn: () => labPersonnelApi.detectConflicts({}),
  })
  const conflicts = ((conflictData as any)?.data as ConflictResult[] | undefined) ?? []

  const calendarWeekEnd = useMemo(() => {
    const d = new Date(calendarWeek)
    d.setDate(d.getDate() + 6)
    return d.toISOString().slice(0, 10)
  }, [calendarWeek])

  const { data: calendarSlotData } = useQuery({
    queryKey: ['lab-personnel', 'calendar-slots', calendarWeek],
    queryFn: () => labPersonnelApi.getSlots({ date_from: calendarWeek, date_to: calendarWeekEnd }),
    enabled: activeTab === 'week',
  })
  const calendarSlots = ((calendarSlotData as any)?.data as { items: SlotItem[] } | undefined)?.items ?? []

  const statusBadge = (status: string, display: string) => {
    const cls: Record<string, string> = {
      draft: 'bg-slate-100 text-slate-600',
      published: 'bg-green-50 text-green-600',
      archived: 'bg-blue-50 text-blue-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[status] || 'bg-slate-100 text-slate-600'}`}>{display}</span>
  }

  const confirmBadge = (status: string, display: string) => {
    const cls: Record<string, string> = {
      pending: 'bg-yellow-50 text-yellow-600',
      confirmed: 'bg-green-50 text-green-600',
      rejected: 'bg-red-50 text-red-600',
    }
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls[status] || 'bg-slate-100 text-slate-600'}`}>{display}</span>
  }

  const statCards = [
    { key: 'total_schedules', label: '排班计划', value: schedules.length, color: 'text-blue-600', icon: CalendarDays },
    { key: 'published', label: '已发布', value: schedules.filter(s => s.status === 'published').length, color: 'text-green-600', icon: Send },
    { key: 'total_slots', label: '排班时间槽', value: slots.length, color: 'text-violet-600', icon: Clock },
    { key: 'conflicts', label: '冲突', value: conflicts.length, color: conflicts.length > 0 ? 'text-red-600' : 'text-slate-400', icon: AlertTriangle },
  ]

  async function handleCreate() {
    try {
      await labPersonnelApi.createSchedule({ week_start_date: createForm.week_start_date, notes: createForm.notes })
      setCreateMsg('排班计划创建成功')
      setTimeout(() => { setShowCreate(false); setCreateMsg('') }, 1500)
    } catch { setCreateMsg('创建失败') }
  }

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">排班管理</h2>
          <p className="text-sm text-slate-500 mt-1">周级排班计划，支持冲突检测、资质校验、飞书日历同步</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => window.open('/api/v1/lab-personnel/export/schedule', '_blank')}
            className="flex min-h-11 items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <CalendarDays className="w-4 h-4" />导出 Excel
          </button>
          <PermissionGuard permission="lab-personnel.schedule.create">
            <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors">
              <Plus className="w-4 h-4" />新建排班
            </button>
          </PermissionGuard>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        {statCards.map(s => (
          <div key={s.key} className="bg-white rounded-xl border border-slate-200 p-4" data-stat={s.key}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{s.label}</p>
              <s.icon className={`w-5 h-5 ${s.color} opacity-60`} />
            </div>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto bg-slate-100 rounded-lg p-1 w-full sm:w-fit">
        {[
          { key: 'schedules' as const, label: '排班计划' },
          { key: 'week' as const, label: '周视图' },
          { key: 'slots' as const, label: '时间槽' },
          { key: 'conflicts' as const, label: `冲突检测${conflicts.length > 0 ? ` (${conflicts.length})` : ''}` },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`shrink-0 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            data-tab={tab.key}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Schedule List */}
      {activeTab === 'schedules' && (
        <div className="space-y-3" data-section="schedule-list">
          {schedules.map(s => (
            <div key={s.id} className="schedule-card bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow" data-schedule-item>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-slate-800">{s.week_start_date} ~ {s.week_end_date}</h3>
                  <p className="text-xs text-slate-500 mt-1">{s.slot_count} 个时间槽 · {s.notes || '无备注'}</p>
                </div>
                <div className="flex items-center gap-3">
                  {statusBadge(s.status, s.status_display)}
                  {s.status === 'draft' && (
                    <button onClick={() => labPersonnelApi.publishSchedule(s.id)} className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-xs font-medium hover:bg-violet-700">
                      <Send className="w-3 h-3 inline mr-1" />发布
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {schedules.length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
              <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-50" /><p>暂无排班计划</p>
            </div>
          )}
        </div>
      )}

      {/* Week Calendar View */}
      {activeTab === 'week' && (
        <div className="space-y-4" data-section="week-view">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                const d = new Date(calendarWeek)
                d.setDate(d.getDate() - 7)
                setCalendarWeek(d.toISOString().slice(0, 10))
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
            >
              <ChevronLeft className="w-4 h-4" />上一周
            </button>
            <span className="text-sm font-medium text-slate-700">
              {calendarWeek} ~ {calendarWeekEnd}
            </span>
            <button
              onClick={() => {
                const d = new Date(calendarWeek)
                d.setDate(d.getDate() + 7)
                setCalendarWeek(d.toISOString().slice(0, 10))
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm hover:bg-slate-50"
            >
              下一周<ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <WeekCalendarView
            slots={calendarSlots}
            weekStart={calendarWeek}
            onSlotClick={(slot) => {
              console.log('slot clicked', slot)
            }}
            onEmptyClick={(staffId, date) => {
              console.log('empty cell clicked', staffId, date)
            }}
          />
        </div>
      )}

      {/* Slot List */}
      {activeTab === 'slots' && (
        <div className="bg-white rounded-xl border border-slate-200" data-section="slots">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">人员</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">日期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">时段</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">项目</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">工时</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">确认</th>
              </tr>
            </thead>
            <tbody>
              {slots.map(slot => (
                <tr key={slot.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{slot.staff_name}</td>
                  <td className="px-4 py-3 text-slate-600">{slot.shift_date}</td>
                  <td className="px-4 py-3 text-slate-600">{slot.start_time} - {slot.end_time}</td>
                  <td className="px-4 py-3 text-slate-600">{slot.project_name || '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{slot.planned_hours}h</td>
                  <td className="px-4 py-3">{confirmBadge(slot.confirm_status, slot.confirm_status_display)}</td>
                </tr>
              ))}
              {slots.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">暂无排班时间槽</td></tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Conflicts */}
      {activeTab === 'conflicts' && (
        <div className="space-y-3" data-section="conflicts">
          {conflicts.length > 0 ? conflicts.map((c, i) => (
            <div key={i} className="bg-red-50 rounded-xl border border-red-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-700">{c.conflict_type}</span>
              </div>
              <p className="text-sm text-red-600">{c.staff_name} · {c.shift_date} · {c.description}</p>
            </div>
          )) : (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
              <p className="text-slate-500">未检测到排班冲突</p>
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/30" onClick={() => { setShowCreate(false); setCreateMsg('') }} />
          <div className="bg-white rounded-xl shadow-xl p-4 md:p-6 w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto relative z-10">
            <h3 className="text-lg font-semibold mb-4">新建排班计划</h3>
            {createMsg && <div className="mb-4 p-3 bg-violet-50 text-violet-700 rounded-lg text-sm">{createMsg}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">周起始日期</label>
                <input type="date" aria-label="周起始日期" value={createForm.week_start_date} onChange={e => setCreateForm(p => ({ ...p, week_start_date: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">备注</label>
                <input type="text" aria-label="备注" value={createForm.notes} onChange={e => setCreateForm(p => ({ ...p, notes: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowCreate(false); setCreateMsg('') }} className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={handleCreate} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
