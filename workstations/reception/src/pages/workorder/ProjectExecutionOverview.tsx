/**
 * 项目执行概览 - 月历 + 当日项目列表
 * 参考工单执行页面预约列表下的月历布局
 */
import { useState, useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, CalendarCheck } from 'lucide-react'
import { Card } from '@cn-kis/ui-kit'
import { productDistributionApi } from '@cn-kis/api-client'

const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

interface ExecutionOverviewRow {
  project_no?: string
  project_name?: string
  visit_point?: string
  sample_size?: string | number
  visit_sequence?: string
  daily_progress?: string
}

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

function formatMonthKey(year: number, month: number) {
  return `${year}-${pad2(month)}`
}

function formatMonthLabel(monthKey: string) {
  const [y, m] = monthKey.split('-').map((x) => parseInt(x, 10))
  return `${y}年${pad2(m)}月`
}

function buildMonthCells(monthKey: string) {
  const [year, month] = monthKey.split('-').map((x) => parseInt(x, 10))
  const firstDay = new Date(year, month - 1, 1)
  const weekdayOffset = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: Array<{ date: string; day: number } | null> = []
  for (let i = 0; i < weekdayOffset; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: `${monthKey}-${pad2(day)}`, day })
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function ProjectExecutionOverview() {
  const todayStr = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [visibleMonth, setVisibleMonth] = useState(todayStr.slice(0, 7))

  const monthCells = useMemo(() => buildMonthCells(visibleMonth), [visibleMonth])

  const handleChangeMonth = (offset: number) => {
    const [y, m] = visibleMonth.split('-').map((x) => parseInt(x, 10))
    const next = new Date(y, m - 1 + offset, 1)
    const nextKey = formatMonthKey(next.getFullYear(), next.getMonth() + 1)
    setVisibleMonth(nextKey)
    setSelectedDate(`${nextKey}-01`)
  }

  const handleSelectToday = () => {
    setSelectedDate(todayStr)
    setVisibleMonth(todayStr.slice(0, 7))
  }

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['reception', 'execution-overview', selectedDate],
    queryFn: () => productDistributionApi.getExecutionOverview(selectedDate),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const { data: countsData } = useQuery({
    queryKey: ['reception', 'execution-overview-counts', visibleMonth],
    queryFn: () => productDistributionApi.getExecutionOverviewCounts(visibleMonth),
    staleTime: 60_000,
  })

  const raw = data as { items?: ExecutionOverviewRow[] } | null | undefined
  const items = Array.isArray(raw) ? raw : (raw?.items ?? [])
  const countByDate = (countsData as Record<string, number> | undefined) ?? {}

  return (
    <div className="space-y-4">
      <Card variant="elevated" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-slate-800">月历</h3>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSelectToday}
                className="text-sm text-slate-600 hover:text-slate-800"
              >
                今天
              </button>
            </div>
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                onClick={() => handleChangeMonth(-1)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                aria-label="上个月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="text-base font-semibold text-slate-800">{formatMonthLabel(visibleMonth)}</div>
              <button
                type="button"
                onClick={() => handleChangeMonth(1)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                aria-label="下个月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="px-1 py-0.5 text-center text-[11px] font-medium text-slate-500">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthCells.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="min-h-14 rounded-lg bg-transparent" />
                }
                const isSelected = cell.date === selectedDate
                const isToday = cell.date === todayStr
                const total = countByDate[cell.date] ?? 0
                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => setSelectedDate(cell.date)}
                    className={`min-h-14 rounded-lg border px-2 py-1.5 text-left transition ${
                      isSelected
                        ? 'border-blue-300 bg-blue-100 text-blue-900'
                        : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-sm font-semibold leading-none ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                        {cell.day}
                      </span>
                      <div className="flex items-center gap-1">
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[11px] font-medium leading-none ${
                            total > 0
                              ? isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-500 text-white'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {total}项
                        </span>
                        {isToday && (
                          <span className={`text-[10px] leading-none ${isSelected ? 'text-blue-700' : 'text-emerald-600'}`}>
                            今
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div className="px-4 py-3 border-b border-slate-200 text-sm text-slate-600">
          当前日期：{selectedDate}
        </div>

        {isError ? (
          <div className="px-4 py-6 text-center text-sm text-red-600">
            加载失败：{error instanceof Error ? error.message : '请稍后重试'}
          </div>
        ) : isLoading && !items.length ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">加载中…</div>
        ) : items.length > 0 ? (
          <div className="relative overflow-x-auto">
            {isFetching && !isLoading && (
              <div className="absolute right-3 top-0 text-xs text-slate-400">更新中…</div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">项目编号</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">项目名称</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">访视点</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-600">样本量</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-600">访视序号</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600">当日进展</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-800">{row.project_no}</td>
                    <td className="px-3 py-2 text-slate-800 max-w-[180px] truncate" title={row.project_name}>{row.project_name}</td>
                    <td className="px-3 py-2 text-slate-700">{row.visit_point || '—'}</td>
                    <td className="px-3 py-2 text-center text-slate-700">{row.sample_size ?? '—'}</td>
                    <td className="px-3 py-2 text-center text-slate-700">{row.visit_sequence || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{row.daily_progress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-slate-500">
            <CalendarCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>{selectedDate} 暂无项目执行安排</p>
          </div>
        )}
      </Card>
    </div>
  )
}
