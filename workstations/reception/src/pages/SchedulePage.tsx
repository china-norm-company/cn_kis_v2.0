/**
 * 和序·接待台 — 我的排程
 * 布局与功能参考衡技工作台，数据调用维周（execution）排班接口。
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { executionApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

interface ScheduleNote {
  id: number
  title?: string
  equipment?: string
  project_no?: string
  room_no?: string
}

interface ScheduleWorkOrder {
  id: number
  title: string
  status: string
  scheduled_date?: string | null
}

interface WeeklySchedule {
  week_start: string
  week_end: string
  daily_schedule: Record<string, ScheduleWorkOrder[]>
  daily_notes?: Record<string, ScheduleNote[]>
  total_this_week: number
  next_week_count: number
  query_person_name?: string
  is_fallback_to_current_user?: boolean
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const firstWeekday = (first.getDay() + 6) % 7
  const lastDate = last.getDate()
  const rows: (Date | null)[][] = []
  let row: (Date | null)[] = []
  for (let i = 0; i < firstWeekday; i++) row.push(null)
  for (let d = 1; d <= lastDate; d++) {
    row.push(new Date(year, month - 1, d))
    if (row.length === 7) {
      rows.push(row)
      row = []
    }
  }
  if (row.length > 0) {
    while (row.length < 7) row.push(null)
    rows.push(row)
  }
  return rows
}

function NoteCellDisplay({ n }: { n: ScheduleNote }) {
  const hasDetail = !!(n.equipment || n.project_no || n.room_no)
  return (
    <div className="w-full min-h-8 p-1.5 bg-slate-50 rounded border border-slate-200 border-dashed text-left break-words">
      {hasDetail ? (
        <>
          {n.project_no && <p className="text-[10px] font-medium text-slate-700">{n.project_no}</p>}
          {n.equipment && <p className="text-[10px] font-medium text-slate-700">{n.equipment}</p>}
          {n.room_no && <p className="text-[10px] font-medium text-slate-700">{n.room_no}</p>}
        </>
      ) : (
        <p className="text-[10px] font-medium text-slate-600">{n.title ?? ''}</p>
      )}
      <span className="text-[9px] text-slate-400">参考</span>
    </div>
  )
}

function DayDetailModal({
  open,
  onClose,
  dateLabel,
  workOrders,
  notes,
}: {
  open: boolean
  onClose: () => void
  dateLabel: string
  workOrders: ScheduleWorkOrder[]
  notes: ScheduleNote[]
}) {
  if (!open) return null
  const hasItems = workOrders.length > 0 || notes.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <h3 className="text-base font-semibold text-slate-800">{dateLabel} 排程详情</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!hasItems && <p className="text-sm text-slate-500 text-center py-8">该日期暂无排程</p>}
          {workOrders.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2">工单</h4>
              <ul className="space-y-2">
                {workOrders.map((wo) => (
                  <li key={wo.id}>
                    <a
                      href={getWorkstationUrl('execution', `#/execute/${wo.id}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-left p-3 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors"
                    >
                      <p className="text-sm font-medium text-slate-800">{wo.title}</p>
                      <span className="text-xs text-slate-500 mt-1 block">状态: {wo.status}</span>
                      <span className="text-xs text-emerald-600 mt-1 block">在维周执行台打开 →</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {notes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-slate-700 mb-2">参考备注</h4>
              <ul className="space-y-3">
                {notes.map((n) => (
                  <li key={n.id} className="p-3 rounded-lg border border-slate-200 border-dashed bg-slate-50">
                    {(n.equipment || n.project_no || n.room_no) ? (
                      <div className="space-y-1 text-sm">
                        {n.project_no && <p className="text-slate-700"><span className="font-medium text-slate-500">项目编号：</span>{n.project_no}</p>}
                        {n.equipment && <p className="text-slate-700"><span className="font-medium text-slate-500">设备：</span>{n.equipment}</p>}
                        {n.room_no && <p className="text-slate-700"><span className="font-medium text-slate-500">房间号：</span>{n.room_no}</p>}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-700 break-words">{n.title ?? ''}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SchedulePage() {
  const [monthOffset, setMonthOffset] = useState(0)
  const [personName, setPersonName] = useState('')
  const [dayDetail, setDayDetail] = useState<{
    dateStr: string
    dateLabel: string
    workOrders: ScheduleWorkOrder[]
    notes: ScheduleNote[]
  } | null>(null)

  const { data: scheduleRes, isLoading } = useQuery({
    queryKey: ['reception', 'schedule', 'month', monthOffset, personName],
    queryFn: () => executionApi.mySchedule(0, monthOffset, personName.trim() || undefined),
  })
  const { data: prevScheduleRes } = useQuery({
    queryKey: ['reception', 'schedule', 'month', monthOffset - 1, personName],
    queryFn: () => executionApi.mySchedule(0, monthOffset - 1, personName.trim() || undefined),
  })

  const schedule = (scheduleRes as { data?: WeeklySchedule })?.data
  const prevSchedule = (prevScheduleRes as { data?: WeeklySchedule })?.data
  const today = formatLocalDate(new Date())

  const now = new Date()
  const displayDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const displayYear = displayDate.getFullYear()
  const displayMonth = displayDate.getMonth() + 1
  const prevDate = new Date(now.getFullYear(), now.getMonth() + monthOffset - 1, 1)
  const prevYear = prevDate.getFullYear()
  const prevMonth = prevDate.getMonth() + 1
  const monthGrid = buildMonthGrid(displayYear, displayMonth)
  const prevMonthGrid = buildMonthGrid(prevYear, prevMonth)
  const monthTitle = `${displayYear}年${displayMonth}月`
  const prevMonthTitle = `${prevYear}年${prevMonth}月`

  const statusColors: Record<string, string> = {
    pending: 'bg-blue-100 text-blue-700',
    assigned: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-orange-100 text-orange-700',
    completed: 'bg-green-100 text-green-700',
    review: 'bg-amber-100 text-amber-700',
    approved: 'bg-green-100 text-green-700',
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">我的排程</h2>
          <p className="text-sm text-slate-500 mt-1">查看维周排班与本月工作安排</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setMonthOffset((m) => m - 1)}
            title="上月"
            className="min-h-11 min-w-11 p-2 hover:bg-slate-100 rounded-lg"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => setMonthOffset(0)}
            title="本月"
            className="min-h-11 shrink-0 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg"
          >
            本月
          </button>
          <button
            onClick={() => setMonthOffset((m) => m + 1)}
            title="下月"
            className="min-h-11 min-w-11 p-2 hover:bg-slate-100 rounded-lg"
          >
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 md:p-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">工作人员姓名</label>
        <div className="flex gap-2">
          <input
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            placeholder="输入姓名后显示该工作人员排程"
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
          />
          {personName && (
            <button
              onClick={() => setPersonName('')}
              className="px-3 py-2.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              清空
            </button>
          )}
        </div>
        {schedule?.is_fallback_to_current_user && personName.trim() && (
          <p className="text-xs text-amber-600 mt-2">
            未匹配到“{personName.trim()}”对应账号，当前显示的是你的排程。
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">本月工单</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{isLoading ? '--' : schedule?.total_this_week ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">下月预排</p>
          <p className="text-2xl font-bold text-slate-600 mt-1">{isLoading ? '--' : schedule?.next_week_count ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">当前月份</p>
          <p className="text-sm font-medium text-slate-700 mt-2">{monthTitle}</p>
        </div>
      </div>

      {/* 上月月历 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-200 text-center font-semibold text-slate-700 text-sm">{prevMonthTitle}（上月）</div>
        <div className="overflow-x-auto">
          <div className="min-w-[320px]">
            <div className="grid grid-cols-7 border-b border-slate-200">
              {WEEKDAY_LABELS.map((label) => (
                <div key={`prev-${label}`} className="p-2 text-center text-xs font-medium text-slate-500 border-r border-slate-100 last:border-r-0">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {prevMonthGrid.flatMap((row, rowIdx) =>
                row.map((d, colIdx) => {
                  if (!d) return <div key={`prev-e-${rowIdx}-${colIdx}`} className="min-h-[80px] p-2 border-r border-b border-slate-100 bg-slate-50/50" />
                  const dateStr = formatLocalDate(d)
                  const dayWOs = prevSchedule?.daily_schedule?.[dateStr] ?? []
                  const dayNotes = prevSchedule?.daily_notes?.[dateStr] ?? []
                  const hasItems = dayWOs.length > 0 || dayNotes.length > 0
                  const dateLabel = `${prevYear}年${prevMonth}月${d.getDate()}日`
                  return (
                    <div
                      key={`prev-${dateStr}`}
                      role={hasItems ? 'button' : undefined}
                      tabIndex={hasItems ? 0 : undefined}
                      onClick={hasItems ? () => setDayDetail({ dateStr, dateLabel, workOrders: dayWOs, notes: dayNotes }) : undefined}
                      className={`min-h-[80px] p-2 border-r border-b border-slate-100 flex flex-col ${dateStr === today ? 'bg-emerald-50/50' : ''} ${hasItems ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                    >
                      <span className={`text-xs font-medium shrink-0 ${dateStr === today ? 'text-emerald-700' : 'text-slate-600'}`}>{d.getDate()}</span>
                      <div className="flex-1 mt-0.5 space-y-0.5 overflow-y-auto min-h-0">
                        {dayWOs.map((wo) => (
                          <div key={wo.id} className="w-full min-h-7 p-1 bg-white rounded border border-slate-200 text-left">
                            <p className="text-[9px] font-medium text-slate-700 truncate">{wo.title}</p>
                          </div>
                        ))}
                        {dayNotes.map((n) => <NoteCellDisplay key={n.id} n={n} />)}
                        {!hasItems && <p className="text-[10px] text-slate-300 text-center">—</p>}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 当月月历 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-200 text-center font-semibold text-slate-800">{monthTitle}</div>
        <div className="overflow-x-auto">
          <div className="min-w-[320px]">
            <div className="grid grid-cols-7 border-b border-slate-200">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="p-2 text-center text-xs font-medium text-slate-500 border-r border-slate-100 last:border-r-0">{label}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthGrid.flatMap((row, rowIdx) =>
                row.map((d, colIdx) => {
                  if (!d) return <div key={`e-${rowIdx}-${colIdx}`} className="min-h-[100px] p-2 border-r border-b border-slate-100 bg-slate-50/50" />
                  const dateStr = formatLocalDate(d)
                  const dayWOs = schedule?.daily_schedule?.[dateStr] ?? []
                  const dayNotes = schedule?.daily_notes?.[dateStr] ?? []
                  const hasItemsMain = dayWOs.length > 0 || dayNotes.length > 0
                  const dateLabelMain = `${displayYear}年${displayMonth}月${d.getDate()}日`
                  return (
                    <div
                      key={dateStr}
                      role={hasItemsMain ? 'button' : undefined}
                      tabIndex={hasItemsMain ? 0 : undefined}
                      onClick={hasItemsMain ? () => setDayDetail({ dateStr, dateLabel: dateLabelMain, workOrders: dayWOs, notes: dayNotes }) : undefined}
                      className={`min-h-[100px] p-2 border-r border-b border-slate-100 flex flex-col ${dateStr === today ? 'bg-emerald-50/50' : ''} ${hasItemsMain ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                    >
                      <span className={`text-sm font-medium shrink-0 ${dateStr === today ? 'text-emerald-700' : 'text-slate-700'}`}>{d.getDate()}</span>
                      <div className="flex-1 mt-1 space-y-1 overflow-y-auto min-h-0">
                        {dayWOs.map((wo) => (
                          <div key={wo.id} className="w-full min-h-9 p-1.5 bg-white rounded border border-slate-200 hover:border-emerald-300 text-left">
                            <p className="text-[10px] font-medium text-slate-700 truncate">{wo.title}</p>
                            <span className={`inline-block px-1 py-0.5 text-[9px] rounded ${statusColors[wo.status] ?? 'bg-slate-100 text-slate-600'}`}>{wo.status}</span>
                          </div>
                        ))}
                        {dayNotes.map((n) => <NoteCellDisplay key={n.id} n={n} />)}
                        {!hasItemsMain && <p className="text-xs text-slate-300 text-center mt-2">暂无</p>}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {dayDetail && (
        <DayDetailModal
          open={!!dayDetail}
          onClose={() => setDayDetail(null)}
          dateLabel={dayDetail.dateLabel}
          workOrders={dayDetail.workOrders}
          notes={dayDetail.notes}
        />
      )}
    </div>
  )
}
