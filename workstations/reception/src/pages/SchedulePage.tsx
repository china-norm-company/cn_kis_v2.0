/**
 * 和序·接待台 — 我的排程
 * 数据来源于执行台解析的实验室排程明细（维周排程管理上传）。
 */
import { useState, useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X } from 'lucide-react'
import { schedulingApi } from '@cn-kis/api-client'
import type { LabScheduleRow } from '@cn-kis/api-client'

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
const MAX_VISIBLE_ITEMS = 3

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

function LabScheduleCellDisplay({ row }: { row: LabScheduleRow }) {
  return (
    <div className="w-full min-h-8 p-1.5 bg-slate-50 rounded border border-slate-200 text-left break-words">
      {row.protocol_code && <p className="text-[10px] font-medium text-slate-700">{row.protocol_code}</p>}
      {row.equipment && <p className="text-[10px] text-slate-600">{row.equipment}</p>}
      {row.person_role && <p className="text-[9px] text-slate-500">{row.person_role}</p>}
    </div>
  )
}

function DayDetailModal({
  open,
  onClose,
  dateLabel,
  items,
}: {
  open: boolean
  onClose: () => void
  dateLabel: string
  items: LabScheduleRow[]
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 shrink-0">
          <h3 className="text-base font-semibold text-slate-800">{dateLabel} 实验室排程</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">该日期暂无排程</p>
          ) : (
            <ul className="space-y-3">
              {items.map((row, idx) => (
                <li key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="space-y-1 text-sm">
                    {row.protocol_code && <p className="text-slate-700"><span className="font-medium text-slate-500">项目编号：</span>{row.protocol_code}</p>}
                    {row.equipment && <p className="text-slate-700"><span className="font-medium text-slate-500">设备：</span>{row.equipment}</p>}
                    {row.person_role && <p className="text-slate-700"><span className="font-medium text-slate-500">人员/岗位：</span>{row.person_role}</p>}
                    {row.room && <p className="text-slate-700"><span className="font-medium text-slate-500">房间：</span>{row.room}</p>}
                    {row.sample_size != null && row.sample_size !== '' && <p className="text-slate-700"><span className="font-medium text-slate-500">样本量：</span>{row.sample_size}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** 拉取实验室排程（整月单次请求） */
async function fetchLabScheduleMonth(yearMonth: string, personRole?: string): Promise<LabScheduleRow[]> {
  const res = await schedulingApi.getLabScheduleByMonth({
    year_month: yearMonth,
    person_role: personRole?.trim() || undefined,
  })
  const data = (res as { data?: { items: LabScheduleRow[] } })?.data
  return data?.items ?? []
}

export default function SchedulePage() {
  const { user } = useFeishuContext()
  const [monthOffset, setMonthOffset] = useState(0)
  const [personName, setPersonName] = useState('')

  const [dayDetail, setDayDetail] = useState<{
    dateStr: string
    dateLabel: string
    items: LabScheduleRow[]
  } | null>(null)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set())

  const toggleExpand = (dateStr: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  const now = new Date()
  const displayDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const displayYear = displayDate.getFullYear()
  const displayMonth = displayDate.getMonth() + 1
  const dateFilter = `${displayYear}-${String(displayMonth).padStart(2, '0')}`

  const { data: labRes, isLoading } = useQuery({
    queryKey: ['reception', 'schedule', 'lab', personName.trim(), dateFilter],
    queryFn: () => fetchLabScheduleMonth(dateFilter, personName.trim() || undefined),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  })

  const allItems: LabScheduleRow[] = useMemo(() => (Array.isArray(labRes) ? labRes : []), [labRes])
  const monthGrid = buildMonthGrid(displayYear, displayMonth)
  const monthTitle = `${displayYear}年${displayMonth}月`
  const today = formatLocalDate(new Date())

  const itemsByDate = useMemo(() => {
    const map: Record<string, LabScheduleRow[]> = {}
    const prefix = `${displayYear}-${String(displayMonth).padStart(2, '0')}`
    for (const row of allItems) {
      const d = (row.date ?? '').toString().slice(0, 10)
      if (!d.startsWith(prefix)) continue
      if (!map[d]) map[d] = []
      map[d].push(row)
    }
    return map
  }, [allItems, displayYear, displayMonth])

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">我的排程</h2>
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
            title={monthOffset === 0 ? '当前月份' : '回到本月'}
            className="min-h-11 shrink-0 px-3 py-1.5 text-sm font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg min-w-[5rem]"
          >
            {monthTitle}
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
        <label className="block text-sm font-medium text-slate-700 mb-2">筛选人员/岗位</label>
        <div className="flex gap-2">
          <input
            value={personName}
            onChange={(e) => setPersonName(e.target.value)}
            placeholder="输入姓名或岗位筛选排程"
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
          />
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPersonName(user?.name ?? '')}
              className="px-4 py-2.5 text-sm text-emerald-600 border border-emerald-300 rounded-lg hover:bg-emerald-50 whitespace-nowrap min-w-[5rem]"
            >
              筛选本人
            </button>
            <button
              type="button"
              onClick={() => setPersonName('')}
              className="px-4 py-2.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap min-w-[5.5rem]"
            >
              清空
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          数据来源：执行台排程管理 — 实验室排期（请先在维周执行台上传「实验室项目运营安排」）
        </p>
      </div>

      {/* 当月月历（实验室排程） */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-200 text-center font-semibold text-slate-800 flex items-center justify-center gap-2">
          {monthTitle}
          {isLoading && <span className="text-xs font-normal text-slate-400">加载中…</span>}
        </div>
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
                  const dayItems = itemsByDate[dateStr] ?? []
                  const hasItems = dayItems.length > 0
                  const isExpanded = expandedDates.has(dateStr)
                  const visibleItems = isExpanded ? dayItems : dayItems.slice(0, MAX_VISIBLE_ITEMS)
                  const hasMore = dayItems.length > MAX_VISIBLE_ITEMS
                  const dateLabel = `${displayYear}年${displayMonth}月${d.getDate()}日`
                  return (
                    <div
                      key={dateStr}
                      role={hasItems ? 'button' : undefined}
                      tabIndex={hasItems ? 0 : undefined}
                      onClick={hasItems ? () => setDayDetail({ dateStr, dateLabel, items: dayItems }) : undefined}
                      className={`min-h-[100px] p-2 border-r border-b border-slate-100 flex flex-col ${dateStr === today ? 'bg-emerald-50/50' : ''} ${hasItems ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                    >
                      <span className={`text-sm font-medium shrink-0 ${dateStr === today ? 'text-emerald-700' : 'text-slate-700'}`}>{d.getDate()}</span>
                      <div className="flex-1 mt-1 space-y-1 overflow-y-auto min-h-0">
                        {visibleItems.map((row, idx) => (
                          <LabScheduleCellDisplay key={idx} row={row} />
                        ))}
                        {hasMore && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleExpand(dateStr)
                            }}
                            className="w-full mt-1 py-0.5 flex items-center justify-center gap-0.5 text-[10px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50/50 rounded transition-colors"
                          >
                            {isExpanded ? (
                              <>收起 <ChevronUp className="w-3 h-3" /></>
                            ) : (
                              <>展开 ({dayItems.length - MAX_VISIBLE_ITEMS}) <ChevronDown className="w-3 h-3" /></>
                            )}
                          </button>
                        )}
                        {!hasItems && <p className="text-xs text-slate-300 text-center mt-2">暂无</p>}
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
          items={dayDetail.items}
        />
      )}
    </div>
  )
}
