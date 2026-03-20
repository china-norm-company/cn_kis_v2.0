import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FileSpreadsheet, ImagePlus, Trash2 } from 'lucide-react'
import { evaluatorApi } from '@cn-kis/api-client'
import type { WeeklySchedule, EvaluatorWorkOrder, ScheduleNote } from '@cn-kis/api-client'
import { ImportExcelDialog } from '../components/ImportExcelDialog'
import { ImportImageDialog } from '../components/ImportImageDialog'
import { ScheduleImageUpload } from '../components/ScheduleImageUpload'
import { DayDetailModal } from '../components/DayDetailModal'

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/** 使用本地时区格式化日期，避免 toISOString 带来的跨天偏移 */
function formatLocalDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 生成月份日历网格：每月行 x 7 列，含上月尾、下月首的占位 */
function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  // 周一=0, 周日=6
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

/** 渲染备注在格内显示：项目编号+设备+房间号，完整显示 */
function NoteCellDisplay({ n }: { n: ScheduleNote }) {
  const hasDetail = (n.equipment || n.project_no || n.room_no)
  return (
    <div className="w-full min-h-8 p-1.5 bg-slate-50 rounded border border-slate-200 border-dashed text-left break-words">
      {hasDetail ? (
        <>
          {n.project_no && <p className="text-[10px] font-medium text-slate-700">{n.project_no}</p>}
          {n.equipment && <p className="text-[10px] font-medium text-slate-700">{n.equipment}</p>}
          {n.room_no && <p className="text-[10px] font-medium text-slate-700">{n.room_no}</p>}
        </>
      ) : (
        <p className="text-[10px] font-medium text-slate-600">{n.title}</p>
      )}
      <span className="text-[9px] text-slate-400">参考</span>
    </div>
  )
}

export function SchedulePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [monthOffset, setMonthOffset] = useState(0)
  const [excelDialogOpen, setExcelDialogOpen] = useState(false)
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [viewingPersonName, setViewingPersonName] = useState('')
  const [personNameInput, setPersonNameInput] = useState('') // 工作人员姓名输入框，失焦/回车后同步到 viewingPersonName
  const [showAttachments, setShowAttachments] = useState(false)
  const [dayDetail, setDayDetail] = useState<{
    dateStr: string
    dateLabel: string
    workOrders: EvaluatorWorkOrder[]
    notes: ScheduleNote[]
  } | null>(null)
  const [clearingNotes, setClearingNotes] = useState(false)

  const handleClearAllNotes = async () => {
    if (!window.confirm('确定要清空所有图片识别记录吗？清空后可重新上传图片识别。')) return
    setClearingNotes(true)
    try {
      await evaluatorApi.deleteAllScheduleNotes()
      queryClient.invalidateQueries({ queryKey: ['evaluator', 'schedule'] })
      setDayDetail(null)
    } finally {
      setClearingNotes(false)
    }
  }

  const { data: scheduleRes, isLoading } = useQuery({
    queryKey: ['evaluator', 'schedule', 'month', monthOffset, viewingPersonName],
    queryFn: () =>
      viewingPersonName
        ? evaluatorApi.myScheduleByPerson(viewingPersonName, 0, monthOffset)
        : evaluatorApi.mySchedule(0, monthOffset),
  })
  const { data: prevScheduleRes } = useQuery({
    queryKey: ['evaluator', 'schedule', 'month', monthOffset - 1, viewingPersonName],
    queryFn: () =>
      viewingPersonName
        ? evaluatorApi.myScheduleByPerson(viewingPersonName, 0, monthOffset - 1)
        : evaluatorApi.mySchedule(0, monthOffset - 1),
  })

  const schedule = (scheduleRes as any)?.data as WeeklySchedule | undefined
  const prevSchedule = (prevScheduleRes as any)?.data as WeeklySchedule | undefined
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
          <p className="text-sm text-slate-500 mt-1">
            查看本月和未来的工作安排
            {viewingPersonName ? `（当前按姓名查看：${viewingPersonName}）` : ''}
          </p>
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
            className="min-h-11 shrink-0 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg"
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

      {/* 工作人员姓名：标签在上一行，与输入框一起包在一个框内 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-medium text-slate-700 mb-2">工作人员姓名</p>
        <input
          id="schedule-person-name"
          type="text"
          value={personNameInput}
          onChange={(e) => setPersonNameInput(e.target.value)}
          onBlur={() => setViewingPersonName(personNameInput.trim())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setViewingPersonName(personNameInput.trim())
              ;(e.target as HTMLInputElement).blur()
            }
          }}
          placeholder="输入姓名后显示该工作人员排程，例如：林紫倩"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setExcelDialogOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
        >
          <FileSpreadsheet className="w-4 h-4" />
          导入 Excel
        </button>
        <button
          onClick={() => setImageDialogOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm"
        >
          <ImagePlus className="w-4 h-4" />
          导入图片
        </button>
        <button
          onClick={handleClearAllNotes}
          disabled={clearingNotes}
          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          title="清空所有图片识别记录，便于重新识别"
        >
          <Trash2 className="w-4 h-4" />
          {clearingNotes ? '清空中…' : '清空识别记录'}
        </button>
        <button
          onClick={() => setShowAttachments((s) => !s)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg border ${
            showAttachments
              ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
          }`}
        >
          附件区
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">本月工单</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {isLoading ? '--' : schedule?.total_this_week ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">下月预排</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">
            {isLoading ? '--' : schedule?.next_week_count ?? 0}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">当前月份</p>
          <p className="text-sm font-medium text-slate-700 mt-2">{monthTitle}</p>
        </div>
      </div>

      {/* 上月月历 - 方便查看相邻月（如 2 月） */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-200 text-center font-semibold text-slate-700 text-sm">
          {prevMonthTitle}（上月）
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[320px]">
            <div className="grid grid-cols-7 border-b border-slate-200">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={`prev-${label}`}
                  className="p-2 text-center text-xs font-medium text-slate-500 border-r border-slate-100 last:border-r-0"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {prevMonthGrid.flatMap((row, rowIdx) =>
                row.map((d, colIdx) => {
                  if (!d) {
                    return (
                      <div
                        key={`prev-e-${rowIdx}-${colIdx}`}
                        className="min-h-[80px] p-2 border-r border-b border-slate-100 bg-slate-50/50"
                      />
                    )
                  }
                  const dateStr = formatLocalDate(d)
                  const dayWOs = (prevSchedule?.daily_schedule?.[dateStr] ?? []) as EvaluatorWorkOrder[]
                  const dayNotes = (prevSchedule?.daily_notes?.[dateStr] ?? []) as ScheduleNote[]
                  const isToday = dateStr === today
                  const dayNum = d.getDate()
                  const hasItems = dayWOs.length > 0 || dayNotes.length > 0
                  const dateLabel = `${prevYear}年${prevMonth}月${dayNum}日`
                  return (
                    <div
                      key={`prev-${dateStr}`}
                      role={hasItems ? 'button' : undefined}
                      tabIndex={hasItems ? 0 : undefined}
                      onClick={hasItems ? () => setDayDetail({ dateStr, dateLabel, workOrders: dayWOs, notes: dayNotes }) : undefined}
                      className={`min-h-[80px] p-2 border-r border-b border-slate-100 flex flex-col ${
                        isToday ? 'bg-indigo-50/50' : ''
                      } ${hasItems ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                    >
                      <span
                        className={`text-xs font-medium shrink-0 ${
                          isToday ? 'text-indigo-700' : 'text-slate-600'
                        }`}
                      >
                        {dayNum}
                      </span>
                      <div className="flex-1 mt-0.5 space-y-0.5 overflow-y-auto min-h-0">
                        {dayWOs.map((wo) => (
                          <button
                            key={wo.id}
                            onClick={(e) => { e.stopPropagation(); navigate(`/execute/${wo.id}`) }}
                            className="w-full min-h-7 p-1 bg-white rounded border border-slate-200 hover:border-indigo-300 text-left block"
                          >
                            <p className="text-[9px] font-medium text-slate-700 truncate">{wo.title}</p>
                          </button>
                        ))}
                        {dayNotes.map((n) => (
                          <NoteCellDisplay key={n.id} n={n} />
                        ))}
                        {!hasItems && (
                          <p className="text-[10px] text-slate-300 text-center">—</p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 月历视图 - 完整显示 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="p-3 border-b border-slate-200 text-center font-semibold text-slate-800">
          {monthTitle}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[320px]">
            <div className="grid grid-cols-7 border-b border-slate-200">
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="p-2 text-center text-xs font-medium text-slate-500 border-r border-slate-100 last:border-r-0"
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthGrid.flatMap((row, rowIdx) =>
                row.map((d, colIdx) => {
                  if (!d) {
                    return (
                      <div
                        key={`e-${rowIdx}-${colIdx}`}
                        className="min-h-[100px] p-2 border-r border-b border-slate-100 bg-slate-50/50"
                      />
                    )
                  }
                  const dateStr = formatLocalDate(d)
                  const dayWOs = (schedule?.daily_schedule?.[dateStr] ?? []) as EvaluatorWorkOrder[]
                  const dayNotes = (schedule?.daily_notes?.[dateStr] ?? []) as ScheduleNote[]
                  const isToday = dateStr === today
                  const dayNum = d.getDate()
                  const hasItemsMain = dayWOs.length > 0 || dayNotes.length > 0
                  const dateLabelMain = `${displayYear}年${displayMonth}月${dayNum}日`
                  return (
                    <div
                      key={dateStr}
                      role={hasItemsMain ? 'button' : undefined}
                      tabIndex={hasItemsMain ? 0 : undefined}
                      onClick={hasItemsMain ? () => setDayDetail({ dateStr, dateLabel: dateLabelMain, workOrders: dayWOs, notes: dayNotes }) : undefined}
                      className={`min-h-[100px] p-2 border-r border-b border-slate-100 flex flex-col ${
                        isToday ? 'bg-indigo-50/50' : ''
                      } ${hasItemsMain ? 'cursor-pointer hover:bg-slate-50' : ''}`}
                    >
                      <span
                        className={`text-sm font-medium shrink-0 ${
                          isToday ? 'text-indigo-700' : 'text-slate-700'
                        }`}
                      >
                        {dayNum}
                      </span>
                      <div className="flex-1 mt-1 space-y-1 overflow-y-auto min-h-0">
                        {dayWOs.map((wo) => (
                          <button
                            key={wo.id}
                            onClick={(e) => { e.stopPropagation(); navigate(`/execute/${wo.id}`) }}
                            className="w-full min-h-9 p-1.5 bg-white rounded border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition-all text-left block"
                          >
                            <p className="text-[10px] font-medium text-slate-700 truncate">{wo.title}</p>
                            <span
                              className={`inline-block px-1 py-0.5 text-[9px] rounded ${
                                statusColors[wo.status] ?? 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {wo.status}
                            </span>
                          </button>
                        ))}
                        {dayNotes.map((n) => (
                          <NoteCellDisplay key={n.id} n={n} />
                        ))}
                        {!hasItemsMain && (
                          <p className="text-xs text-slate-300 text-center mt-2">暂无</p>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {showAttachments && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">排程图片附件</h3>
          <ScheduleImageUpload
            attachments={[
              ...(schedule?.global_attachments ?? []),
              ...Object.values(schedule?.daily_attachments ?? {}).flat(),
            ]}
          />
        </div>
      )}

      <ImportExcelDialog
        open={excelDialogOpen}
        onOpenChange={setExcelDialogOpen}
        onConfirmPerson={(name) => {
            setViewingPersonName(name)
            setPersonNameInput(name)
          }}
      />
      <ImportImageDialog
        open={imageDialogOpen}
        onOpenChange={setImageDialogOpen}
        weekStart={schedule?.week_start}
      />
      {dayDetail && (
        <DayDetailModal
          open={!!dayDetail}
          onClose={() => setDayDetail(null)}
          dateStr={dayDetail.dateStr}
          dateLabel={dayDetail.dateLabel}
          workOrders={dayDetail.workOrders}
          notes={dayDetail.notes}
          onNoteDeleted={(deletedId) => {
            queryClient.invalidateQueries({ queryKey: ['evaluator', 'schedule'] })
            setDayDetail((prev) =>
              prev ? { ...prev, notes: prev.notes.filter((n) => n.id !== deletedId) } : null
            )
          }}
        />
      )}
    </div>
  )
}
