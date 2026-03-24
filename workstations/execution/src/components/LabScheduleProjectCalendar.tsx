/**
 * 实验室排期 · 项目日历：按日汇总去重；格内左项目编号、右 day_group（如 组7-唐圆媛），默认 4 条可展开。
 * 规则：项目编号 trim 后取前 9 位为 key；同日同 key 去重保留首条 day_group；督导筛选为 day_group 第一个 - 之后全文。
 * 项目编号含「外借」「内部使用」「内部借用」的不展示（与后端列表一致）。
 */
import { useMemo, useState, useCallback, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { schedulingApi } from '@cn-kis/api-client'
import type { LabScheduleRow } from '@cn-kis/api-client'
import { Modal, Button } from '@cn-kis/ui-kit'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'

function normalizeProtocolKey(code: string | undefined): string {
  const t = (code ?? '').trim()
  if (!t) return ''
  return t.length <= 9 ? t : t.slice(0, 9)
}

/** 与后端一致：不统计、不展示外借/内部使用/内部借用类项目编号 */
function shouldExcludeProtocolCode(code: string | undefined): boolean {
  const s = (code ?? '').trim()
  if (!s) return false
  return s.includes('外借') || s.includes('内部使用') || s.includes('内部借用')
}

/** 督导：day_group 中第一个 - 之后的全部文字 */
function supervisorFromDayGroup(dayGroup: string | undefined): string {
  const s = (dayGroup ?? '').trim()
  const i = s.indexOf('-')
  if (i < 0) return ''
  return s.slice(i + 1).trim()
}

function rowDateKey(dateVal: unknown): string {
  const d = (dateVal ?? '').toString().trim()
  if (!d) return ''
  return d.length >= 10 ? d.slice(0, 10) : d
}

function getMonthGridDates(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const startDay = firstDay.getDay() || 7
  const start = new Date(year, month, 1 - (startDay - 1))
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

/** 本地日历日，避免 toISOString 跨日区错位 */
function formatYmdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

/** 日期格内默认展示条数，超出可展开 */
const CELL_PREVIEW_LIMIT = 4

export type LabScheduleProjectCalendarProps = {
  /** 无实验室排期数据时为 true，用于外层空态 */
  hasAnyLabData: boolean
}

export function LabScheduleProjectCalendar({ hasAnyLabData }: LabScheduleProjectCalendarProps) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [projectFilter, setProjectFilter] = useState('')
  const [supervisorFilter, setSupervisorFilter] = useState('')
  const [detailDate, setDetailDate] = useState<string | null>(null)
  /** 各日是否展开显示全部项目（仅 >CELL_PREVIEW_LIMIT 时有效） */
  const [expandedByDay, setExpandedByDay] = useState<Record<string, boolean>>({})

  const yearMonth = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`

  useEffect(() => {
    setExpandedByDay({})
  }, [viewYear, viewMonth])

  const { data: monthRes, isLoading } = useQuery({
    queryKey: ['scheduling', 'lab-schedule-month', yearMonth],
    queryFn: () => schedulingApi.getLabScheduleByMonth({ year_month: yearMonth }),
    enabled: hasAnyLabData,
    staleTime: 30_000,
  })

  const rawItems: LabScheduleRow[] = monthRes?.data?.items ?? []
  const sourceName: string = monthRes?.data?.source_file_name ?? ''

  const projectPrefix = useMemo(() => normalizeProtocolKey(projectFilter), [projectFilter])

  const filteredItems = useMemo(() => {
    const sup = supervisorFilter.trim()
    return rawItems.filter((row) => {
      if (shouldExcludeProtocolCode(row.protocol_code)) return false
      const key = normalizeProtocolKey(row.protocol_code)
      if (!key) return false
      if (projectPrefix && !key.startsWith(projectPrefix)) return false
      if (sup) {
        const s = supervisorFromDayGroup(row.day_group as string | undefined)
        if (!s.includes(sup)) return false
      }
      return true
    })
  }, [rawItems, projectPrefix, supervisorFilter])

  const byDateRows = useMemo(() => {
    const m = new Map<string, LabScheduleRow[]>()
    for (const row of filteredItems) {
      const dk = rowDateKey(row.date)
      if (!dk) continue
      const list = m.get(dk) ?? []
      list.push(row)
      m.set(dk, list)
    }
    return m
  }, [filteredItems])

  const dayEntries = useCallback(
    (dateStr: string) => {
      const rows = byDateRows.get(dateStr) ?? []
      const seen = new Map<string, { normalizedCode: string; dayGroup: string }>()
      for (const row of rows) {
        const key = normalizeProtocolKey(row.protocol_code)
        if (!key || seen.has(key)) continue
        seen.set(key, {
          normalizedCode: key,
          dayGroup: (row.day_group ?? '').toString().trim() || '—',
        })
      }
      return Array.from(seen.values())
    },
    [byDateRows]
  )

  const gridDates = useMemo(() => getMonthGridDates(viewYear, viewMonth), [viewYear, viewMonth])

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const detailList = detailDate ? dayEntries(detailDate) : []
  const detailCount = detailList.length

  if (!hasAnyLabData) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-[#3b434e] bg-white dark:bg-slate-800 p-12 text-center text-sm text-slate-500 dark:text-slate-400">
        暂无数据，请先上传实验室排期
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-600 dark:text-slate-300">项目编号</span>
        <input
          type="text"
          className="min-h-10 w-40 px-3 py-1.5 text-sm border border-slate-200 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 rounded-lg"
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          placeholder="如 ABC12"
        />
        <span className="text-sm text-slate-600 dark:text-slate-300">督导</span>
        <input
          type="text"
          className="min-h-10 w-40 px-3 py-1.5 text-sm border border-slate-200 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 rounded-lg"
          value={supervisorFilter}
          onChange={(e) => setSupervisorFilter(e.target.value)}
          placeholder="督导关键字"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-10"
          onClick={() => {
            setProjectFilter('')
            setSupervisorFilter('')
          }}
        >
          重置筛选
        </Button>
        {sourceName ? (
          <span className="text-sm text-slate-500 dark:text-slate-400 ml-auto">数据来源：{sourceName}</span>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-[#3b434e] bg-white dark:bg-slate-800 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-[#3b434e] bg-slate-50 dark:bg-slate-700/30">
          <button
            type="button"
            className="min-h-10 min-w-10 flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#3b434e] hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={prevMonth}
            aria-label="上一月"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
            {viewYear} 年 {viewMonth + 1} 月
          </span>
          <button
            type="button"
            className="min-h-10 min-w-10 flex items-center justify-center rounded-lg border border-slate-200 dark:border-[#3b434e] hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={nextMonth}
            aria-label="下一月"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">加载中...</div>
        ) : (
          <div className="p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-600 rounded-lg overflow-hidden">
              {WEEK_LABELS.map((w) => (
                <div
                  key={w}
                  className="bg-slate-100 dark:bg-slate-700/80 py-2 text-center text-xs font-medium text-slate-600 dark:text-slate-300"
                >
                  {w}
                </div>
              ))}
              {gridDates.map((d) => {
                const ymd = formatYmdLocal(d)
                const inMonth = d.getMonth() === viewMonth
                const entries = dayEntries(ymd)
                const n = entries.length
                const expanded = expandedByDay[ymd] ?? false
                const showList = expanded || n <= CELL_PREVIEW_LIMIT ? entries : entries.slice(0, CELL_PREVIEW_LIMIT)
                const hasMore = n > CELL_PREVIEW_LIMIT

                return (
                  <div
                    key={ymd}
                    onClick={() => n > 0 && setDetailDate(ymd)}
                    className={clsx(
                      'min-h-[120px] sm:min-h-[132px] p-1 sm:p-1.5 text-left transition-colors flex flex-col gap-0.5',
                      inMonth ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/80 dark:bg-slate-900/40',
                      n > 0 && 'hover:bg-primary-50 dark:hover:bg-slate-700/80 cursor-pointer',
                      n === 0 && 'cursor-default'
                    )}
                  >
                    <div className="flex items-center justify-between gap-1 w-full shrink-0">
                      <span
                        className={clsx(
                          'text-sm font-medium',
                          inMonth ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'
                        )}
                      >
                        {d.getDate()}
                      </span>
                      {inMonth ? (
                        <span
                          className={clsx(
                            'text-[10px] sm:text-[11px] tabular-nums shrink-0',
                            n > 0
                              ? 'font-semibold text-primary-600 dark:text-primary-400'
                              : 'font-medium text-slate-400 dark:text-slate-500'
                          )}
                          title="该日去重后的项目数"
                        >
                          项目 {n}
                        </span>
                      ) : null}
                    </div>
                    {n > 0 ? (
                      <div className="flex flex-col gap-0.5 w-full min-h-0 flex-1">
                        <div className="space-y-0.5 w-full">
                          {showList.map((e) => (
                            <div
                              key={e.normalizedCode}
                              className="flex justify-between items-start gap-1 text-[10px] sm:text-[11px] leading-tight"
                            >
                              <span
                                className="font-mono font-medium text-slate-800 dark:text-slate-100 shrink-0 max-w-[42%] truncate"
                                title={e.normalizedCode}
                              >
                                {e.normalizedCode}
                              </span>
                              <span
                                className="text-slate-600 dark:text-slate-300 text-right min-w-0 flex-1 pl-0.5 break-words [word-break:break-word]"
                                title={e.dayGroup}
                              >
                                {e.dayGroup}
                              </span>
                            </div>
                          ))}
                        </div>
                        {hasMore ? (
                          <button
                            type="button"
                            className="mt-0.5 text-[10px] sm:text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:underline text-left"
                            onClick={(ev) => {
                              ev.stopPropagation()
                              setExpandedByDay((prev) => ({ ...prev, [ymd]: !expanded }))
                            }}
                          >
                            {expanded ? '收起' : `还有 ${n - CELL_PREVIEW_LIMIT} 项，展开`}
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500"> </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {detailDate && (
        <Modal
          title={`${detailDate} · 共 ${detailCount} 个项目（已去重）`}
          onClose={() => setDetailDate(null)}
        >
          <div className="max-h-[min(360px,60vh)] overflow-y-auto space-y-2 pr-1">
            {detailList.map((e) => (
              <div
                key={e.normalizedCode}
                className="rounded-lg border border-slate-200 dark:border-[#3b434e] bg-slate-50 dark:bg-slate-900/40 px-3 py-2 text-sm"
              >
                <div className="font-mono font-medium text-slate-800 dark:text-slate-100">{e.normalizedCode}</div>
                <div className="text-slate-600 dark:text-slate-300 mt-1 break-words whitespace-pre-wrap">{e.dayGroup}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
