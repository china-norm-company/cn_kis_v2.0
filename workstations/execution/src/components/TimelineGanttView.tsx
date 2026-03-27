/**
 * 时间线甘特图：按上传的时间线数据展示「回访时间点」各阶段在时间轴上的分布
 */
import { useMemo } from 'react'
import type { TimelineRow } from '../utils/timelineTableMapping'
import { Empty } from '@cn-kis/ui-kit'

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

type Props = {
  rows: TimelineRow[]
}

export function TimelineGanttView({ rows }: Props) {
  const { minDate, maxDate, totalDays } = useMemo(() => {
    let min = ''
    let max = ''
    for (const row of rows) {
      for (const seg of row.segments) {
        if (seg.startDate) {
          if (!min || seg.startDate < min) min = seg.startDate
          if (!max || seg.endDate! > max) max = seg.endDate || seg.startDate
        }
      }
    }
    if (!min || !max) {
      const today = formatDate(new Date())
      return { minDate: today, maxDate: today, totalDays: 1 }
    }
    const startD = new Date(min)
    const endD = new Date(max)
    const totalDays = Math.max(1, Math.ceil((endD.getTime() - startD.getTime()) / 86400000) + 1)
    return { minDate: min, maxDate: max, totalDays }
  }, [rows])

  const startD = useMemo(() => new Date(minDate), [minDate])
  const dateHeaders = useMemo(() => {
    const list: string[] = []
    for (let i = 0; i < totalDays; i += Math.max(1, Math.floor(totalDays / 12))) {
      const d = new Date(startD)
      d.setDate(d.getDate() + i)
      list.push(formatDate(d))
    }
    return list
  }, [startD, totalDays])

  function dayOffset(dateStr: string): number {
    return Math.max(0, Math.ceil((new Date(dateStr).getTime() - startD.getTime()) / 86400000))
  }

  const hasAnySegments = rows.some((r) => r.segments.some((s) => s.startDate && s.endDate))
  if (rows.length === 0 || !hasAnySegments) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-12">
        <Empty message="暂无回访时间点数据，请先在「列表」中通过「创建排程」上传 Timeline 表格" />
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-4 overflow-x-auto">
      <div className="min-w-[800px]">
        <div className="flex border-b border-slate-200 dark:border-b-[#3b434e] pb-2 mb-3">
          <div className="w-48 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">项目 / 回访时间点</div>
          <div className="flex-1 relative h-6">
            {dateHeaders.map((dh) => {
              const left = (dayOffset(dh) / totalDays) * 100
              return (
                <span key={dh} className="absolute text-[10px] text-slate-400 dark:text-slate-500" style={{ left: `${left}%` }}>
                  {dh.slice(5)}
                </span>
              )
            })}
          </div>
        </div>
        {rows.map((row) => {
          const rowLabel = (row.项目编号 || row.询期编号 || row.id || '').toString().trim() || '—'
          return (
          <div key={row.id} className="flex items-center mb-3">
            <div className="w-48 shrink-0 text-sm text-slate-700 dark:text-slate-200 truncate pr-2" title={rowLabel}>
              {rowLabel}
            </div>
            <div className="flex-1 relative h-8 bg-slate-50 dark:bg-slate-700/30 rounded">
              {row.segments
                .filter((s) => s.startDate && s.endDate)
                .map((seg, i) => {
                  const left = (dayOffset(seg.startDate!) / totalDays) * 100
                  const endOffset = dayOffset(seg.endDate!)
                  const width = Math.max(2, ((endOffset - dayOffset(seg.startDate!) + 1) / totalDays) * 100)
                  const hue = (i * 60 + 200) % 360
                  return (
                    <div
                      key={`${seg.label}-${i}`}
                      className="absolute top-1 h-6 rounded opacity-90 hover:opacity-100 transition-opacity cursor-pointer"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        minWidth: '12px',
                        backgroundColor: `hsl(${hue}, 65%, 55%)`,
                      }}
                      title={`${seg.label}：${seg.formattedDates}（该段${seg.dayCount}天，单天样本量${seg.单天样本量}）`}
                    >
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white truncate px-1">
                        {seg.label}
                      </span>
                    </div>
                  )
                })}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}
