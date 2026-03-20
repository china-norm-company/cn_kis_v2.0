import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { facilityApi } from '@cn-kis/api-client'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = []
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = firstDay.getDay()
  for (let i = 0; i < startPad; i++) days.push(new Date(year, month, -startPad + i + 1))
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))
  return days
}

export function ReservationCalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const { data } = useQuery({
    queryKey: ['reservation-calendar', year, month],
    queryFn: () => facilityApi.getCalendar({
      year: String(year),
      month: String(month + 1),
    }),
  })

  const entries = (data?.data as any)?.entries ?? []
  const days = getMonthDays(year, month)
  const monthLabel = `${year}年${month + 1}月`
  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  const entryMap: Record<string, number> = {}
  entries.forEach((e: any) => {
    const key = e.start_date ?? e.date
    if (key) entryMap[key] = (entryMap[key] ?? 0) + 1
  })

  const prevMonth = () => { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">预约日历</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-lg">
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="text-base font-semibold text-slate-800">{monthLabel}</span>
          <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg">
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {weekDays.map(d => (
            <div key={d} className="text-center text-xs font-medium text-slate-500 py-2">{d}</div>
          ))}
          {days.map((day, idx) => {
            const isCurrentMonth = day.getMonth() === month
            const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
            const count = entryMap[key] ?? 0
            const isToday = day.toDateString() === now.toDateString()
            return (
              <div
                key={idx}
                className={`relative min-h-[52px] p-1 rounded-lg border ${
                  isToday ? 'border-blue-400 bg-blue-50' :
                  isCurrentMonth ? 'border-slate-100 hover:bg-slate-50' : 'border-transparent'
                }`}
              >
                <span className={`text-xs font-medium ${isCurrentMonth ? 'text-slate-700' : 'text-slate-300'} ${isToday ? 'text-blue-700' : ''}`}>
                  {day.getDate()}
                </span>
                {count > 0 && (
                  <div className="mt-1 text-center">
                    <span className="inline-block w-5 h-5 rounded-full bg-blue-600 text-white text-xs leading-5 text-center">{count}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-4 text-xs text-slate-500">
          共 {entries.length} 个预约
        </div>
      </div>
    </div>
  )
}
