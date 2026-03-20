/**
 * 资源日历组件
 *
 * 按人员或设备维度展示资源占用情况：
 * - 纵轴：资源（人员/设备）
 * - 横轴：日期
 * - 单元格：占用情况（槽位数、冲突标记）
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { schedulingApi } from '@cn-kis/api-client'
import type { ScheduleSlot } from '@cn-kis/api-client'
import { Badge, Empty } from '@cn-kis/ui-kit'
import { ChevronLeft, ChevronRight, Users, Wrench } from 'lucide-react'

type ResourceMode = 'personnel' | 'equipment'

interface ResourceCalendarProps {
  planId?: number
}

function getWeekDates(baseDate: Date): Date[] {
  const d = new Date(baseDate)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return date
  })
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

const WEEKDAY_SHORT = ['一', '二', '三', '四', '五', '六', '日']

export default function ResourceCalendar({ planId }: ResourceCalendarProps) {
  const [mode, setMode] = useState<ResourceMode>('personnel')
  const [currentWeek, setCurrentWeek] = useState(new Date())

  const weekDates = useMemo(() => getWeekDates(currentWeek), [currentWeek])

  const { data: slotsRes, isLoading } = useQuery({
    queryKey: ['scheduling', 'slots', 'resource-cal', formatDate(weekDates[0]), formatDate(weekDates[6]), planId],
    queryFn: () => schedulingApi.listSlots({
      start_date: formatDate(weekDates[0]),
      end_date: formatDate(weekDates[6]),
      plan_id: planId ?? undefined,
      page: 1,
      page_size: 500,
    }),
  })

  const slots = ((slotsRes?.data as any)?.items ?? []) as ScheduleSlot[]

  // Group by resource (assigned_to_id for personnel)
  const resourceRows = useMemo(() => {
    if (mode === 'personnel') {
      const byPerson: Record<number, ScheduleSlot[]> = {}
      for (const s of slots) {
        if (s.assigned_to_id) {
          if (!byPerson[s.assigned_to_id]) byPerson[s.assigned_to_id] = []
          byPerson[s.assigned_to_id].push(s)
        }
      }
      return Object.entries(byPerson).map(([id, pSlots]) => ({
        id: Number(id),
        label: `执行人 #${id}`,
        slots: pSlots,
      }))
    }
    // Equipment mode: group by visit_node (simplified)
    const byNode: Record<number, ScheduleSlot[]> = {}
    for (const s of slots) {
      if (!byNode[s.visit_node_id]) byNode[s.visit_node_id] = []
      byNode[s.visit_node_id].push(s)
    }
    return Object.entries(byNode).map(([id, nSlots]) => ({
      id: Number(id),
      label: nSlots[0]?.visit_node_name || `节点 #${id}`,
      slots: nSlots,
    }))
  }, [slots, mode])

  const prevWeek = () => setCurrentWeek(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d })
  const nextWeek = () => setCurrentWeek(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d })

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setMode('personnel')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm ${mode === 'personnel' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            <Users className="w-3.5 h-3.5" /> 人员
          </button>
          <button
            onClick={() => setMode('equipment')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm ${mode === 'equipment' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          >
            <Wrench className="w-3.5 h-3.5" /> 设备/节点
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-1 rounded hover:bg-slate-100"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm text-slate-600">
            {weekDates[0].toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            {' - '}
            {weekDates[6].toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
          </span>
          <button onClick={nextWeek} className="p-1 rounded hover:bg-slate-100"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 text-center py-8">加载中...</p>
      ) : resourceRows.length === 0 ? (
        <Empty message="暂无资源占用数据" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 w-36 text-slate-500 font-medium">资源</th>
                {weekDates.map((d, i) => {
                  const isToday = formatDate(new Date()) === formatDate(d)
                  return (
                    <th key={i} className={`text-center py-2 px-2 font-medium ${isToday ? 'text-primary-600' : 'text-slate-500'}`}>
                      周{WEEKDAY_SHORT[i]}<br />
                      <span className="text-xs">{d.getMonth() + 1}/{d.getDate()}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {resourceRows.map(row => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-2 px-3 text-slate-700 font-medium truncate max-w-[144px]">{row.label}</td>
                  {weekDates.map((d, i) => {
                    const key = formatDate(d)
                    const daySlots = row.slots.filter(s => s.scheduled_date === key)
                    const hasConflict = daySlots.some(s => s.status === 'conflict')
                    const count = daySlots.length
                    return (
                      <td key={i} className="text-center py-2 px-2">
                        {count === 0 ? (
                          <span className="text-slate-300">-</span>
                        ) : (
                          <div className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium ${
                            hasConflict ? 'bg-red-100 text-red-700 ring-2 ring-red-300'
                            : count >= 3 ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-50 text-blue-600'
                          }`}>
                            {count}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <div className="w-3 h-3 rounded-full bg-blue-50 border border-blue-200" /> 正常
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <div className="w-3 h-3 rounded-full bg-amber-100 border border-amber-200" /> 繁忙
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <div className="w-3 h-3 rounded-full bg-red-100 border border-red-300 ring-1 ring-red-300" /> 冲突
        </div>
      </div>
    </div>
  )
}
