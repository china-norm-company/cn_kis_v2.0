import { useMemo } from 'react'
import type { SlotItem } from '@cn-kis/api-client'

interface WeekCalendarViewProps {
  slots: SlotItem[]
  weekStart: string
  onSlotClick?: (slot: SlotItem) => void
  onEmptyClick?: (staffId: number, date: string) => void
}

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const PROJECT_COLORS = [
  'bg-violet-100 border-violet-300 text-violet-700',
  'bg-blue-100 border-blue-300 text-blue-700',
  'bg-emerald-100 border-emerald-300 text-emerald-700',
  'bg-amber-100 border-amber-300 text-amber-700',
  'bg-rose-100 border-rose-300 text-rose-700',
  'bg-cyan-100 border-cyan-300 text-cyan-700',
  'bg-orange-100 border-orange-300 text-orange-700',
  'bg-teal-100 border-teal-300 text-teal-700',
]

function getWeekDates(weekStart: string): string[] {
  const start = new Date(weekStart)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

export function WeekCalendarView({ slots, weekStart, onSlotClick, onEmptyClick }: WeekCalendarViewProps) {
  const weekDates = useMemo(() => getWeekDates(weekStart), [weekStart])

  const { staffList, projectColorMap, grid } = useMemo(() => {
    const staffMap = new Map<number, string>()
    const projectSet = new Set<string>()

    for (const slot of slots) {
      staffMap.set(slot.staff_id, slot.staff_name)
      if (slot.project_name) projectSet.add(slot.project_name)
    }

    const staffList = Array.from(staffMap.entries()).map(([id, name]) => ({ id, name }))
    const projectColorMap: Record<string, string> = {}
    Array.from(projectSet).forEach((p, i) => {
      projectColorMap[p] = PROJECT_COLORS[i % PROJECT_COLORS.length]
    })

    const grid: Record<string, SlotItem[]> = {}
    for (const slot of slots) {
      const key = `${slot.staff_id}_${slot.shift_date}`
      if (!grid[key]) grid[key] = []
      grid[key].push(slot)
    }

    return { staffList, projectColorMap, grid }
  }, [slots])

  const today = new Date().toISOString().slice(0, 10)

  if (staffList.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
        <p>本周暂无排班数据</p>
        <p className="text-xs mt-1">请先在排班计划中创建时间槽</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" data-section="week-calendar">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-3 py-3 font-medium text-slate-600 text-sm w-28 sticky left-0 bg-slate-50 z-10">
                人员
              </th>
              {weekDates.map((date, i) => (
                <th
                  key={date}
                  className={`text-center px-2 py-3 font-medium text-sm min-w-[120px] ${
                    date === today ? 'bg-violet-50 text-violet-700' : 'text-slate-600'
                  }`}
                >
                  <div>{WEEKDAY_LABELS[i]}</div>
                  <div className={`text-xs mt-0.5 ${date === today ? 'font-bold' : 'font-normal text-slate-400'}`}>
                    {date.slice(5)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staffList.map((staff) => (
              <tr key={staff.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                <td className="px-3 py-2 text-sm font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-100">
                  {staff.name}
                </td>
                {weekDates.map((date) => {
                  const cellSlots = grid[`${staff.id}_${date}`] || []
                  return (
                    <td
                      key={date}
                      className={`px-1 py-1 align-top min-h-[60px] ${
                        date === today ? 'bg-violet-50/30' : ''
                      } ${cellSlots.length === 0 ? 'cursor-pointer hover:bg-slate-100' : ''}`}
                      onClick={() => cellSlots.length === 0 && onEmptyClick?.(staff.id, date)}
                    >
                      <div className="space-y-1">
                        {cellSlots.map((slot) => {
                          const colorClass = slot.project_name
                            ? projectColorMap[slot.project_name] || PROJECT_COLORS[0]
                            : 'bg-slate-100 border-slate-300 text-slate-600'
                          return (
                            <div
                              key={slot.id}
                              className={`rounded border px-1.5 py-1 text-xs cursor-pointer hover:shadow-sm transition-shadow ${colorClass}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                onSlotClick?.(slot)
                              }}
                              title={`${slot.start_time}-${slot.end_time} ${slot.project_name || '日常工作'}`}
                            >
                              <div className="font-medium truncate">
                                {slot.start_time?.slice(0, 5)}-{slot.end_time?.slice(0, 5)}
                              </div>
                              <div className="truncate opacity-80">
                                {slot.project_name || '日常'}
                              </div>
                              {slot.confirm_status === 'confirmed' && (
                                <span className="text-[10px] opacity-60">✓</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
