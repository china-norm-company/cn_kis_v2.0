/**
 * 时间线表格：折叠展示 14 列，展开后展示回访时间点（含该段天数、单天样本量）
 */
import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { TimelineRow } from '../utils/timelineTableMapping'
import { Empty } from '@cn-kis/ui-kit'
import { useTheme } from '../contexts/ThemeContext'

/** 将测量要求字符串按顿号/逗号拆成单项，暗色模式下以高亮色块展示 */
function parseMeasurementItems(str: string): string[] {
  if (!str || typeof str !== 'string') return []
  return str
    .split(/[、,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const COLLAPSED_COLUMNS: { key: keyof TimelineRow; label: string }[] = [
  { key: '询期编号', label: '询期编号' },
  { key: '申办方', label: '申办方' },
  { key: '项目状态', label: '项目状态' },
  { key: '项目名称', label: '项目名称' },
  { key: '项目编号', label: '项目编号' },
  { key: '项目编号2', label: '督导' },
  { key: '研究', label: '研究' },
  { key: '组别', label: '组别' },
  { key: '样本量', label: '样本量' },
  { key: '测量要求', label: '测量要求' },
  { key: '项目开始时间', label: '项目开始时间' },
  { key: '项目结束时间', label: '项目结束时间' },
  { key: '交付情况', label: '交付情况' },
  { key: '备注', label: '备注' },
]

type Props = {
  rows: TimelineRow[]
  /** 是否展示可展开的「回访时间点」区块（列表视图下为 false，回访时间点改在甘特图展示） */
  showVisitPoints?: boolean
  /** 列表视图下点击行时跳转详情页 */
  onRowClick?: (row: TimelineRow) => void
}

export function TimelineTableView({ rows, showVisitPoints = true, onRowClick }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-[#3b434e] bg-white dark:bg-slate-800 p-12">
        <Empty message="暂无时间线数据，请通过「创建排程」上传 Timeline 表格（明细表）" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-[#3b434e] bg-white dark:bg-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-[#3b434e]">
              {showVisitPoints && <th className="w-10 shrink-0 px-2 py-3 text-left font-medium text-slate-600 dark:text-slate-300" />}
              {COLLAPSED_COLUMNS.map(({ key, label }) => (
                <th
                  key={key}
                  className={`px-3 py-3 font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0 ${key === '测量要求' ? 'min-w-[200px] text-left' : 'whitespace-nowrap text-center'}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isExpanded = showVisitPoints && expandedId === row.id
              return (
                <React.Fragment key={row.id}>
                  <tr
                    key={row.id}
                    className="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-700/30 cursor-pointer"
                    onClick={
                      onRowClick && !showVisitPoints
                        ? () => onRowClick(row)
                        : showVisitPoints
                          ? () => setExpandedId(isExpanded ? null : row.id)
                          : undefined
                    }
                  >
                    {showVisitPoints && (
                      <td className="w-10 shrink-0 px-2 py-2 text-slate-500">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </td>
                    )}
                    {COLLAPSED_COLUMNS.map(({ key }) => {
                      const isMeasurement = key === '测量要求'
                      const cellCls = `px-3 py-2 text-slate-600 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 ${isMeasurement ? 'min-w-[220px] align-top text-left' : 'max-w-[200px] text-center'}`
                      const content = key === '样本量' ? (
                        row[key]
                      ) : key === '测量要求' && isDark ? (
                            (() => {
                              const raw = (row[key] as string) || ''
                              const items = parseMeasurementItems(raw)
                              if (items.length === 0) return raw || '-'
                              return (
                                <span className="flex flex-wrap gap-1">
                                  {items.map((item, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-medium bg-amber-100 text-amber-800 shadow-[0_0_10px_rgba(251,191,36,0.35)] border border-amber-200/60"
                                    >
                                      {item}
                                    </span>
                                  ))}
                                </span>
                              )
                            })()
                          ) : (
                            (row[key] as string) || '-'
                          )
                      return (
                        <td key={key} className={cellCls} title={!isMeasurement ? String((row[key] as string) ?? '') : undefined}>
                          {isMeasurement ? content : <span className="block whitespace-nowrap truncate text-center">{content}</span>}
                        </td>
                      )
                    })}
                  </tr>
                  {isExpanded && showVisitPoints && (
                    <tr key={`${row.id}-expanded`} className="bg-slate-50/80 dark:bg-slate-800/80">
                      <td className="shrink-0 px-2 py-0" />
                      <td colSpan={COLLAPSED_COLUMNS.length} className="px-4 py-3 align-top">
                        <div className="text-sm">
                          <div className="font-medium text-slate-600 dark:text-slate-300 mb-3">
                            回访时间点
                          </div>
                          {row.segments.length === 0 ? (
                            <p className="text-slate-500 dark:text-slate-400">无回访时间点数据</p>
                          ) : (
                            <div className="space-y-2">
                              {row.segments.map((seg, i) => (
                                <div
                                  key={i}
                                  className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700/30 px-3 py-2 text-sm"
                                >
                                  <span className="font-medium text-slate-700 dark:text-slate-200 shrink-0">
                                    {seg.label}：
                                  </span>
                                  <span className="text-slate-600 dark:text-slate-300">
                                    {seg.formattedDates || '—'}
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                                    该段天数：<strong className="text-slate-600 dark:text-slate-300">{seg.dayCount}</strong>
                                    <span className="mx-2">|</span>
                                    单天样本量：<strong className="text-slate-600 dark:text-slate-300">{seg.单天样本量}</strong>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-slate-100 dark:border-[#3b434e] text-xs text-slate-500 dark:text-slate-400">
        共 {rows.length} 条
      </div>
    </div>
  )
}
