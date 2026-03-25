/**
 * 实验室排期 · 人员日历：日历格内按「人员 | 设备 | 样本量」分行展示（同人不同设备多行）；
 * 导出 Excel 为矩阵：行=人员、列=当月日期，单元格内多行「设备-项目编号」。
 */
import { Fragment, useMemo, useState, useCallback, useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import ExcelJS from 'exceljs'
import { schedulingApi } from '@cn-kis/api-client'
import { Modal, Button } from '@cn-kis/ui-kit'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight, ChevronUp, Download } from 'lucide-react'

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

function formatYmdLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']
/** 折叠时格内最多显示行数；展开后显示全部（可滚动） */
const CELL_PREVIEW_LIMIT = 3
const PERSON_PROTOCOL_POPOVER_HIDE_MS = 220
/** 未排班日期超过该数量时，默认折叠列表，需手动展开 */
const UNSCHEDULED_LIST_COLLAPSE_THRESHOLD = 10

export type LabSchedulePersonCalendarProps = {
  hasAnyLabData: boolean
}

function dateKeyFromRow(d: unknown): string {
  const t = (d ?? '').toString().trim()
  return t.length >= 10 ? t.slice(0, 10) : t
}

/** 当月每个自然日的 yyyy-MM-dd 列表（含首尾全日） */
function listYmdDatesInMonth(year: number, monthIndex0: number): string[] {
  const last = new Date(year, monthIndex0 + 1, 0).getDate()
  const mm = String(monthIndex0 + 1).padStart(2, '0')
  return Array.from({ length: last }, (_, i) => {
    const day = String(i + 1).padStart(2, '0')
    return `${year}-${mm}-${day}`
  })
}

/** 导出单元格内单行文案：设备-项目编号（缺一则只写有值的一侧） */
function formatEquipmentProtocolLine(equipment: string, protocolCode: string): string {
  const eq = equipment.trim()
  const pc = protocolCode.trim()
  if (eq && pc) return `${eq}-${pc}`
  if (eq) return eq
  if (pc) return pc
  return ''
}

/** 估算字符显示宽度：ASCII 1，其余（含中文）按 2 */
function charWidthUnit(ch: string): number {
  return /^[\u0000-\u007f]$/.test(ch) ? 1 : 2
}

/** 多行单元格内取各行最大「显示宽度」之和的上界（用于列宽） */
function cellMaxLineWidthUnits(text: string): number {
  const lines = String(text ?? '').split(/\r?\n/)
  let max = 0
  for (const line of lines) {
    let u = 0
    for (const ch of line) u += charWidthUnit(ch)
    max = Math.max(max, u)
  }
  return max
}

/**
 * 按该列全部单元格内容自适应列宽。
 * 以「按 \\n 分隔的每一行」为单位取最大显示宽度，使每条记录单行显示、不因列宽不足被 Excel 自动折行。
 * 系数与边距需略大于理论值：Excel 列宽单位与默认字体下中英混排实际占位不完全一致，过小会出现「同一行被拆成两行」。
 */
function estimateColumnWidthFromValues(values: string[]): number {
  let maxU = 0
  for (const v of values) {
    maxU = Math.max(maxU, cellMaxLineWidthUnits(String(v)))
  }
  const raw = maxU * 1.12 + 5
  return Math.round(Math.min(100, Math.max(8, raw)) * 100) / 100
}

const EXPORT_CELL_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  left: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } },
  right: { style: 'thin', color: { argb: 'FFBBBBBB' } },
}

/** 从明细行聚合：某日 + 某人 → 去重后的项目编号列表 */
function buildProtocolsByYmdPerson(
  rows: Array<{ date?: unknown; person_role?: string; protocol_code?: string }>
): Map<string, string[]> {
  const acc = new Map<string, Set<string>>()
  for (const r of rows) {
    const dk = dateKeyFromRow(r.date)
    const p = String(r.person_role ?? '').trim()
    const pc = String(r.protocol_code ?? '').trim()
    if (!dk || !p || !pc) continue
    const key = `${dk}\t${p}`
    if (!acc.has(key)) acc.set(key, new Set())
    acc.get(key)!.add(pc)
  }
  const out = new Map<string, string[]>()
  acc.forEach((set, key) => {
    out.set(key, [...set].sort((a, b) => a.localeCompare(b, 'zh-CN')))
  })
  return out
}

export function LabSchedulePersonCalendar({ hasAnyLabData }: LabSchedulePersonCalendarProps) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [filterPerson, setFilterPerson] = useState('')
  const [filterEquipment, setFilterEquipment] = useState('')
  const [appliedPerson, setAppliedPerson] = useState('')
  const [appliedEquipment, setAppliedEquipment] = useState('')
  const [detailDate, setDetailDate] = useState<string | null>(null)
  const [expandedByDay, setExpandedByDay] = useState<Record<string, boolean>>({})
  const [personProtocolPopover, setPersonProtocolPopover] = useState<{
    key: string
    codes: string[]
    left: number
    top: number
    pinned: boolean
  } | null>(null)
  const personPopoverHideTimerRef = useRef<number | null>(null)
  /** 未排班日期列表折叠（列表较长时使用） */
  const [unscheduledDatesOpen, setUnscheduledDatesOpen] = useState(false)

  const yearMonth = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`

  useEffect(() => {
    setExpandedByDay({})
  }, [viewYear, viewMonth])

  useEffect(() => {
    setUnscheduledDatesOpen(false)
  }, [appliedPerson, appliedEquipment, viewYear, viewMonth])

  const { data: apiRes, isLoading } = useQuery({
    queryKey: ['scheduling', 'lab-schedule-person-calendar', yearMonth, appliedPerson, appliedEquipment],
    queryFn: () =>
      schedulingApi.getLabSchedulePersonCalendar({
        year_month: yearMonth,
        person_role: appliedPerson.trim() || undefined,
        equipment: appliedEquipment.trim() || undefined,
      }),
    enabled: hasAnyLabData,
    staleTime: 30_000,
  })

  const payload = apiRes?.data
  const calendarByDate = payload?.calendar_by_date ?? {}
  const detailRows = payload?.detail_rows ?? []
  const sourceName = payload?.source_file_name ?? ''
  const filterOptions = payload?.filter_options ?? { person_roles: [] as string[], equipments: [] as string[] }

  const gridDates = useMemo(() => getMonthGridDates(viewYear, viewMonth), [viewYear, viewMonth])

  const protocolsByYmdPerson = useMemo(() => buildProtocolsByYmdPerson(detailRows), [detailRows])

  /** 在已应用筛选下，当月有排班的日期集合来自 detail_rows；未排班日 = 当月自然日 − 有排班日 */
  const filterUnscheduledResult = useMemo(() => {
    const p = appliedPerson.trim()
    const e = appliedEquipment.trim()
    if (!p && !e) return null
    const monthDays = listYmdDatesInMonth(viewYear, viewMonth)
    const inMonth = new Set(monthDays)
    const scheduled = new Set<string>()
    for (const r of detailRows) {
      const dk = dateKeyFromRow(r.date)
      if (!dk || !inMonth.has(dk)) continue
      scheduled.add(dk)
    }
    const unscheduled = monthDays.filter((d) => !scheduled.has(d))
    return { dates: unscheduled, total: unscheduled.length }
  }, [appliedPerson, appliedEquipment, detailRows, viewYear, viewMonth])

  const clearPersonPopoverHideTimer = useCallback(() => {
    if (personPopoverHideTimerRef.current != null) {
      window.clearTimeout(personPopoverHideTimerRef.current)
      personPopoverHideTimerRef.current = null
    }
  }, [])

  const scheduleClosePersonPopover = useCallback(() => {
    clearPersonPopoverHideTimer()
    personPopoverHideTimerRef.current = window.setTimeout(() => {
      setPersonProtocolPopover((prev) => (prev?.pinned ? prev : null))
    }, PERSON_PROTOCOL_POPOVER_HIDE_MS)
  }, [clearPersonPopoverHideTimer])

  const openPersonProtocolPopover = useCallback(
    (ymd: string, person: string, el: HTMLElement, pinned: boolean) => {
      clearPersonPopoverHideTimer()
      const key = `${ymd}\t${person}`
      const codes = protocolsByYmdPerson.get(key) ?? []
      const r = el.getBoundingClientRect()
      setPersonProtocolPopover((prev) => {
        if (pinned && prev?.key === key) return null
        return { key, codes, left: r.left, top: r.bottom - 2, pinned }
      })
    },
    [clearPersonPopoverHideTimer, protocolsByYmdPerson]
  )

  useEffect(() => {
    if (!personProtocolPopover) return
    const onDown = (ev: Event) => {
      const el = ev.target as HTMLElement | null
      if (!el) return
      if (el.closest('[data-person-protocol-anchor]') || el.closest('[data-person-protocol-popover]')) return
      setPersonProtocolPopover(null)
    }
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setPersonProtocolPopover(null)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [personProtocolPopover])

  useEffect(() => {
    if (!personProtocolPopover) return
    const close = () => setPersonProtocolPopover(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [personProtocolPopover])

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

  const dayEntries = useCallback(
    (dateStr: string) => calendarByDate[dateStr] ?? [],
    [calendarByDate]
  )

  const handleExport = useCallback(async () => {
    if (detailRows.length === 0) return
    const monthDays = listYmdDatesInMonth(viewYear, viewMonth)
    const monthSet = new Set(monthDays)
    const cellLines = new Map<string, string[]>()
    const personSet = new Set<string>()

    for (const r of detailRows) {
      const dk = dateKeyFromRow(r.date)
      if (!dk || !monthSet.has(dk)) continue
      const person = String(r.person_role ?? '').trim()
      if (!person) continue
      personSet.add(person)
      const line = formatEquipmentProtocolLine(String(r.equipment ?? ''), String(r.protocol_code ?? ''))
      if (!line) continue
      const key = `${person}\t${dk}`
      if (!cellLines.has(key)) cellLines.set(key, [])
      cellLines.get(key)!.push(line)
    }

    const persons = [...personSet].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const header = ['人员/岗位', ...monthDays]
    const colCount = header.length
    const columnValues: string[][] = Array.from({ length: colCount }, () => [])

    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('人员日历')

    header.forEach((h, i) => columnValues[i].push(String(h)))
    sheet.addRow(header)

    for (const person of persons) {
      columnValues[0].push(person)
      const rowVals: string[] = [person]
      monthDays.forEach((d, idx) => {
        const lines = cellLines.get(`${person}\t${d}`) ?? []
        const uniq = [...new Set(lines)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
        const cellText = uniq.join('\n')
        columnValues[idx + 1].push(cellText)
        rowVals.push(cellText)
      })
      sheet.addRow(rowVals)
    }

    sheet.getRow(1).font = { bold: true }
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.alignment = { wrapText: true, vertical: 'middle' }
        cell.border = EXPORT_CELL_BORDER
      })
    })

    for (let c = 1; c <= colCount; c++) {
      sheet.getColumn(c).width = estimateColumnWidthFromValues(columnValues[c - 1])
    }

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `实验室排期-人员日历-${yearMonth}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }, [detailRows, yearMonth, viewYear, viewMonth])

  const detailList = detailDate ? dayEntries(detailDate) : []

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
        <span className="text-sm text-slate-600 dark:text-slate-300">人员/岗位</span>
        <input
          type="text"
          className="min-h-10 w-36 px-3 py-1.5 text-sm border border-slate-200 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 rounded-lg"
          value={filterPerson}
          onChange={(e) => setFilterPerson(e.target.value)}
          placeholder="模糊筛选"
          list="person-cal-person-list"
        />
        <span className="text-sm text-slate-600 dark:text-slate-300">设备</span>
        <input
          type="text"
          className="min-h-10 w-36 px-3 py-1.5 text-sm border border-slate-200 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 rounded-lg"
          value={filterEquipment}
          onChange={(e) => setFilterEquipment(e.target.value)}
          placeholder="模糊筛选"
          list="person-cal-equip-list"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-10"
          onClick={() => {
            setAppliedPerson(filterPerson)
            setAppliedEquipment(filterEquipment)
          }}
        >
          查询
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-10"
          onClick={() => {
            setFilterPerson('')
            setFilterEquipment('')
            setAppliedPerson('')
            setAppliedEquipment('')
          }}
        >
          重置
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="min-h-10"
          disabled={detailRows.length === 0}
          onClick={() => void handleExport()}
        >
          <Download className="w-4 h-4 mr-1" />
          导出 Excel
        </Button>
        {sourceName ? (
          <span className="text-sm text-slate-500 dark:text-slate-400 ml-auto">数据来源：{sourceName}</span>
        ) : null}
      </div>

      <datalist id="person-cal-person-list">
        {filterOptions.person_roles.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>
      <datalist id="person-cal-equip-list">
        {filterOptions.equipments.map((opt) => (
          <option key={opt} value={opt} />
        ))}
      </datalist>

      <div className="rounded-xl border border-slate-200 dark:border-[#3b434e] bg-white dark:bg-slate-800 px-4 py-3 shadow-sm">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">筛选结果 · 当月未排班</div>
        {filterUnscheduledResult === null ? (
          <div className="mt-2 min-h-[1.5rem]" aria-label="筛选结果为空" />
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {appliedPerson.trim() && appliedEquipment.trim()
                ? `人员含「${appliedPerson.trim()}」且设备含「${appliedEquipment.trim()}」`
                : appliedPerson.trim()
                  ? `人员含「${appliedPerson.trim()}」`
                  : `设备含「${appliedEquipment.trim()}」`}
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              未排班合计{' '}
              <span className="font-semibold tabular-nums text-primary-600 dark:text-primary-400">
                {filterUnscheduledResult.total}
              </span>{' '}
              天
            </p>
            {filterUnscheduledResult.total === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">当月无未排班日期</p>
            ) : filterUnscheduledResult.total <= UNSCHEDULED_LIST_COLLAPSE_THRESHOLD ? (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
                {filterUnscheduledResult.dates.join('、')}
              </p>
            ) : (
              <div>
                <button
                  type="button"
                  className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
                  onClick={() => setUnscheduledDatesOpen((o) => !o)}
                >
                  {unscheduledDatesOpen
                    ? '收起日期列表'
                    : `展开日期列表（共 ${filterUnscheduledResult.dates.length} 个日期）`}
                </button>
                {unscheduledDatesOpen ? (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded border border-slate-200 dark:border-slate-600 bg-slate-50/90 dark:bg-slate-900/40 px-2 py-2 text-xs text-slate-700 dark:text-slate-200 leading-relaxed break-words">
                    {filterUnscheduledResult.dates.join('、')}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
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
            {viewYear} 年 {viewMonth + 1} 月 · 人员日历
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
                const rowCount = entries.length
                const personCount = new Set(entries.map((e) => e.person_role)).size
                const foldExpanded = expandedByDay[ymd] ?? false
                const showList =
                  foldExpanded || rowCount <= CELL_PREVIEW_LIMIT ? entries : entries.slice(0, CELL_PREVIEW_LIMIT)
                const hasMore = rowCount > CELL_PREVIEW_LIMIT
                const collapse = (ev: MouseEvent) => {
                  ev.stopPropagation()
                  setExpandedByDay((prev) => ({ ...prev, [ymd]: false }))
                }
                const expand = (ev: MouseEvent) => {
                  ev.stopPropagation()
                  setExpandedByDay((prev) => ({ ...prev, [ymd]: true }))
                }

                return (
                  <div
                    key={ymd}
                    className={clsx(
                      'min-h-[104px] sm:min-h-[112px] p-1 sm:p-1.5 text-left transition-colors flex flex-col gap-0.5',
                      inMonth ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/80 dark:bg-slate-900/40',
                      rowCount > 0 && 'hover:bg-primary-50 dark:hover:bg-slate-700/80',
                      rowCount === 0 && 'cursor-default'
                    )}
                  >
                    <button
                      type="button"
                      className={clsx(
                        'flex items-center justify-between gap-1 w-full shrink-0 text-left rounded-md -m-0.5 p-0.5',
                        rowCount > 0 && 'hover:bg-slate-100/80 dark:hover:bg-slate-700/50 cursor-pointer',
                        rowCount === 0 && 'cursor-default'
                      )}
                      onClick={() => rowCount > 0 && setDetailDate(ymd)}
                      title={rowCount > 0 ? '查看当日明细' : undefined}
                    >
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
                            rowCount > 0
                              ? 'font-semibold text-primary-600 dark:text-primary-400'
                              : 'font-medium text-slate-400 dark:text-slate-500'
                          )}
                          title="该日去重后的人数（按人员/岗位）"
                        >
                          人 {personCount}
                        </span>
                      ) : null}
                    </button>
                    {rowCount > 0 ? (
                      <div
                        className="flex flex-col gap-0.5 w-full min-h-0 flex-1"
                        onClick={(ev) => ev.stopPropagation()}
                        role="presentation"
                      >
                        <div className="w-full min-w-0 flex flex-col gap-0.5">
                          {foldExpanded && hasMore ? (
                            <button
                              type="button"
                              className="w-full min-w-0 rounded-t-md overflow-hidden border border-slate-200/70 dark:border-slate-600/50 bg-slate-100/70 dark:bg-slate-700/40 text-left transition-colors hover:bg-slate-200/70 dark:hover:bg-slate-600/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/60"
                              onClick={collapse}
                              title="点击此处折叠为预览"
                              aria-label="折叠为预览列表"
                            >
                              <div className="flex items-center justify-center gap-1 py-1 border-b border-slate-200/60 dark:border-slate-600/50">
                                <ChevronUp className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" aria-hidden />
                              </div>
                              <div
                                className={clsx(
                                  'grid w-full min-w-0 gap-x-0.5 gap-y-0 items-center px-0.5 text-[9px] sm:text-[10px] leading-tight',
                                  'grid-cols-[minmax(0,0.52fr)_minmax(0,1.38fr)_auto]'
                                )}
                              >
                                <div className="font-medium text-slate-500 dark:text-slate-400 truncate border-b border-slate-200/80 dark:border-slate-600/60 pb-0.5">
                                  人员
                                </div>
                                <div className="font-medium text-slate-500 dark:text-slate-400 truncate border-b border-slate-200/80 dark:border-slate-600/60 pb-0.5">
                                  设备
                                </div>
                                <div className="font-medium text-slate-500 dark:text-slate-400 text-right tabular-nums border-b border-slate-200/80 dark:border-slate-600/60 pb-0.5 whitespace-nowrap">
                                  样本
                                </div>
                              </div>
                            </button>
                          ) : (
                            <div
                              className={clsx(
                                'grid w-full min-w-0 gap-x-0.5 gap-y-0 items-center text-[9px] sm:text-[10px] leading-tight',
                                'grid-cols-[minmax(0,0.52fr)_minmax(0,1.38fr)_auto]'
                              )}
                            >
                              <div className="font-medium text-slate-500 dark:text-slate-400 truncate border-b border-slate-200/80 dark:border-slate-600/60 pb-0.5">
                                人员
                              </div>
                              <div className="font-medium text-slate-500 dark:text-slate-400 truncate border-b border-slate-200/80 dark:border-slate-600/60 pb-0.5">
                                设备
                              </div>
                              <div className="font-medium text-slate-500 dark:text-slate-400 text-right tabular-nums border-b border-slate-200/80 dark:border-slate-600/60 pb-0.5 whitespace-nowrap">
                                样本
                              </div>
                            </div>
                          )}

                          <div
                            className={clsx(
                              'grid w-full min-w-0 gap-0 text-[9px] sm:text-[10px] leading-tight border border-slate-200/90 dark:border-slate-600/70 rounded-sm overflow-hidden',
                              'grid-cols-[minmax(0,0.52fr)_minmax(0,1.38fr)_auto]',
                              'min-h-0',
                              foldExpanded && hasMore && 'max-h-[min(176px,32vh)] overflow-y-auto'
                            )}
                          >
                            {showList.map((e, rowIdx) => (
                              <Fragment key={`${e.person_role}-${e.equipment}-${rowIdx}`}>
                                <div
                                  data-person-protocol-anchor
                                  className="truncate font-medium text-slate-800 dark:text-slate-100 px-0.5 py-0.5 border-r border-b border-slate-200/80 dark:border-slate-600/60 min-h-[1.25em] bg-slate-50/90 dark:bg-slate-700/35 cursor-default hover:bg-slate-200/60 dark:hover:bg-slate-600/45"
                                  title={e.person_role}
                                  onMouseEnter={(ev) => {
                                    openPersonProtocolPopover(ymd, e.person_role, ev.currentTarget, false)
                                  }}
                                  onMouseLeave={scheduleClosePersonPopover}
                                  onClick={(ev) => {
                                    ev.stopPropagation()
                                    openPersonProtocolPopover(ymd, e.person_role, ev.currentTarget, true)
                                  }}
                                >
                                  {e.person_role}
                                </div>
                                <div
                                  className="truncate text-slate-600 dark:text-slate-300 px-0.5 py-0.5 border-r border-b border-slate-200/80 dark:border-slate-600/60 min-h-[1.25em] bg-slate-50/90 dark:bg-slate-700/35"
                                  title={e.equipment?.trim() ? e.equipment : '—'}
                                >
                                  {e.equipment?.trim() ? e.equipment : '—'}
                                </div>
                                <div className="text-right tabular-nums text-slate-700 dark:text-slate-200 px-0.5 py-0.5 border-b border-slate-200/80 dark:border-slate-600/60 min-h-[1.25em] bg-slate-50/90 dark:bg-slate-700/35 whitespace-nowrap">
                                  {e.sample_size}
                                </div>
                              </Fragment>
                            ))}
                          </div>
                        </div>

                        {hasMore && !foldExpanded ? (
                          <button
                            type="button"
                            className="w-full py-0.5 mt-0.5 text-[9px] sm:text-[10px] font-medium text-primary-600 dark:text-primary-400 hover:underline text-center rounded border border-transparent hover:border-primary-200 dark:hover:border-primary-800"
                            onClick={expand}
                          >
                            展开全部（共 {rowCount} 条）
                          </button>
                        ) : null}
                        {foldExpanded && hasMore ? (
                          <button
                            type="button"
                            className="w-full py-0.5 text-[9px] sm:text-[10px] font-medium text-primary-600 dark:text-primary-400 hover:underline text-center rounded border border-transparent hover:border-primary-200 dark:hover:border-primary-800"
                            onClick={collapse}
                          >
                            收起
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

      {personProtocolPopover &&
        createPortal(
          <div
            data-person-protocol-popover
            role="dialog"
            aria-label="当日项目编号"
            className="pointer-events-auto fixed z-[200] w-[min(18rem,calc(100vw-1rem))] max-h-[min(16rem,42vh)] overflow-y-auto rounded-lg border border-slate-200 dark:border-[#3b434e] bg-white dark:bg-slate-800 shadow-lg px-2.5 py-2 text-xs text-slate-700 dark:text-slate-200"
            style={{
              left: Math.max(
                8,
                Math.min(
                  personProtocolPopover.left,
                  (typeof window !== 'undefined' ? window.innerWidth : 400) - 8 - 288
                )
              ),
              top: personProtocolPopover.top,
            }}
            onMouseEnter={clearPersonPopoverHideTimer}
            onMouseLeave={scheduleClosePersonPopover}
          >
            <div className="font-medium text-slate-500 dark:text-slate-400 mb-1.5">当日项目编号</div>
            {personProtocolPopover.codes.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">暂无项目编号</p>
            ) : (
              <ul className="m-0 list-none space-y-1 p-0">
                {personProtocolPopover.codes.map((c) => (
                  <li key={c} className="break-all leading-snug">
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body
        )}

      {detailDate && (
        <Modal title={`${detailDate} · 人员与设备明细`} onClose={() => setDetailDate(null)}>
          <div className="max-h-[min(360px,60vh)] overflow-y-auto pr-1">
            <table className="w-full text-sm border-collapse border border-slate-200 dark:border-[#3b434e] rounded-lg overflow-hidden">
              <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="text-left font-medium px-3 py-2 border-b border-slate-200 dark:border-[#3b434e]">
                    人员
                  </th>
                  <th className="text-left font-medium px-3 py-2 border-b border-slate-200 dark:border-[#3b434e]">
                    设备
                  </th>
                  <th className="text-right font-medium px-3 py-2 border-b border-slate-200 dark:border-[#3b434e] whitespace-nowrap">
                    样本量
                  </th>
                </tr>
              </thead>
              <tbody>
                {detailList.map((e, idx) => (
                  <tr
                    key={`${e.person_role}-${e.equipment}-${idx}`}
                    className="border-b border-slate-100 dark:border-slate-700 last:border-b-0"
                  >
                    <td className="px-3 py-2 text-slate-800 dark:text-slate-100 align-top">{e.person_role}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 align-top break-words">
                      {e.equipment?.trim() ? e.equipment : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      {e.sample_size}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
