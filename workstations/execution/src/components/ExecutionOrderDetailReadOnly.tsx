/**
 * 执行订单解析详情只读展示（与项目管理详情页布局一致，无编辑能力）
 * 用于排程核心页的「项目信息」Tab。
 */
import { useMemo } from 'react'
import { clsx } from 'clsx'
import {
  mapExecutionOrderToSectionsForRow,
  formatExecutionPeriodToMMMMDDYY,
  formatExcelSerialToDateDisplay,
  parseExecutionScheduleText,
  getSchedulePlanOverallStartEnd,
  parseProjectVisitFromVisitPointRightCell,
  type EquipmentTableRow,
  type EvaluationTableRow,
  type AuxiliaryTableRow,
  type ConsumableTableRow,
} from '../utils/executionOrderPlanConfig'

const VISIT_TABLE_COLUMNS = [
  { key: '样本组别', label: '样本组别' },
  { key: '访视时间点', label: '访视时间点' },
  { key: '访视次数', label: '访视次数' },
  { key: '当日测量时间点', label: '当日测试时间点' },
  { key: '访视顺序', label: '访视顺序' },
  { key: '访视类型', label: '访视类型' },
  { key: '允许窗口期', label: '允许超窗期' },
] as const

function VisitTimePointChips({ value, isDark }: { value: string; isDark: boolean }) {
  const parts = (value || '')
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 0) return <>{value || ''}</>
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {parts.map((p, i) => (
        <span
          key={`${p}-${i}`}
          className={clsx(
            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
            isDark && 'bg-amber-400/75 text-amber-950 dark:bg-[#f5e6c8] dark:text-[#b8860b]'
          )}
        >
          {p}
        </span>
      ))}
    </span>
  )
}

function splitFieldValues(raw: string): string[] {
  const s = raw.trim()
  if (!s) return []
  const segments = s.split(/\s*[;；]\s*/).filter(Boolean)
  const result: string[] = []
  for (const seg of segments) {
    const tokens = seg.split(/\s*[,，]\s*/).map((t) => t.trim()).filter(Boolean)
    let i = 0
    while (i < tokens.length) {
      const a = tokens[i]
      const b = tokens[i + 1]
      const aNorm = a.toLowerCase()
      const bNorm = (b ?? '').toLowerCase()
      if ((aNorm === 't0' && bNorm === 'timm') || (aNorm === 'timm' && bNorm === 't0')) {
        result.push(`${a}，${b}`)
        i += 2
      } else {
        result.push(a)
        i += 1
      }
    }
  }
  return result
}

const internalTableKeys = new Set([
  '__equipmentTable',
  '__evaluationTable',
  '__auxiliaryTable',
  '__consumableTable',
  '__projectVisitTable',
])

function parseTableFromRow<T>(
  key: string,
  headers: string[],
  rowArray: string[]
): T[] | null {
  if (!headers.length || !rowArray.length) return null
  const i = headers.indexOf(key)
  if (i < 0) return null
  const raw = rowArray[i]
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : null
  } catch {
    return null
  }
}

export interface ExecutionOrderDetailReadOnlyProps {
  headers: string[]
  row: Record<string, string>
  isDark: boolean
}

export function ExecutionOrderDetailReadOnly({
  headers,
  row,
  isDark,
}: ExecutionOrderDetailReadOnlyProps) {
  const rowArray = useMemo(
    () => headers.map((h) => row[h] ?? ''),
    [headers, row]
  )

  const sectionsRaw = useMemo(
    () => (headers.length ? mapExecutionOrderToSectionsForRow(headers, row) : []),
    [headers, row]
  )

  const allSectionLabels = useMemo(
    () => new Set(sectionsRaw.flatMap((s) => s.pairs.map((p) => p.label))),
    [sectionsRaw]
  )

  const otherPairs = useMemo(
    () =>
      headers
        .map((h, i) => ({ label: h, value: rowArray[i] ?? '' }))
        .filter(
          (p) => !allSectionLabels.has(p.label) && !internalTableKeys.has(p.label)
        ),
    [headers, rowArray, allSectionLabels]
  )

  const sections =
    otherPairs.length > 0
      ? [...sectionsRaw, { sectionKey: 'other', sectionTitle: '其他', pairs: otherPairs }]
      : sectionsRaw

  /** 在第一个区块后插入「项目访视」模块 */
  const sectionsWithProjectVisit = useMemo(() => {
    const projectVisitSection = { sectionKey: 'project_visit', sectionTitle: '项目访视', pairs: [] as { label: string; value: string }[] }
    if (sections.length === 0) return [projectVisitSection]
    return [...sections.slice(0, 1), projectVisitSection, ...sections.slice(1)]
  }, [sections])

  /** 项目访视：优先 __projectVisitTable，否则遍历整表找锚点「访视点」后解析 */
  const projectVisitTable = useMemo((): { 访视时间点: string; 访视层次: string }[] => {
    const fromRow = parseTableFromRow<{ 访视时间点: string; 访视层次: string }>('__projectVisitTable', headers, rowArray)
    if (fromRow && fromRow.length > 0) return fromRow
    return parseProjectVisitFromVisitPointRightCell(headers, [row])
  }, [headers, row, rowArray])

  const equipmentTable = useMemo(
    () => parseTableFromRow<EquipmentTableRow>('__equipmentTable', headers, rowArray),
    [headers, rowArray]
  )
  const evaluationTable = useMemo(
    () => parseTableFromRow<EvaluationTableRow>('__evaluationTable', headers, rowArray),
    [headers, rowArray]
  )
  const auxiliaryTable = useMemo(
    () => parseTableFromRow<AuxiliaryTableRow>('__auxiliaryTable', headers, rowArray),
    [headers, rowArray]
  )
  const consumableTable = useMemo(
    () => parseTableFromRow<ConsumableTableRow>('__consumableTable', headers, rowArray),
    [headers, rowArray]
  )

  const visitSection = sections.find((s) => s.sectionKey === 'visit')
  const visitTableRows = useMemo(() => {
    if (!visitSection) return []
    const valueByKey: Record<string, string> = {}
    for (const { label, value } of visitSection.pairs) {
      valueByKey[label] = value || ''
    }
    const timepoints = (valueByKey['访视时间点'] || '').split(/\s*[;；]\s*/).filter(Boolean)
    const others = VISIT_TABLE_COLUMNS.filter((c) => c.key !== '访视时间点').map((c) => ({
      key: c.key,
      values: (valueByKey[c.key] || '').split(/\s*[;；]\s*/).filter(Boolean),
    }))
    if (timepoints.length === 0) {
      return [{ cells: VISIT_TABLE_COLUMNS.map((c) => valueByKey[c.key] || '') }]
    }
    const maxLen = Math.max(timepoints.length, ...others.map((o) => o.values.length), 1)
    return Array.from({ length: maxLen }, (_, i) => ({
      cells: VISIT_TABLE_COLUMNS.map((col) => {
        if (col.key === '访视时间点') return timepoints[i] ?? ''
        const o = others.find((x) => x.key === col.key)
        return o ? (o.values[i] ?? '') : ''
      }),
    }))
  }, [visitSection])

  const eqCols = [
    { key: '测试设备', label: '测试设备' },
    { key: '测试指标', label: '测试指标' },
    { key: '测试部位', label: '测试部位' },
    { key: '测试点位', label: '测试点位' },
    { key: '访视时间点', label: '访视时间点' },
  ]
  const evCols = [
    { key: '评估人员类别', label: '评估人员类别' },
    { key: '评估指标类别', label: '评估指标类别' },
    { key: '评估指标', label: '评估指标' },
    { key: '访视时间点', label: '访视时间点' },
    { key: '比如特殊人员资质', label: '比如特殊人员资质' },
  ]
  const auxCols = [
    { key: '辅助操作名称', label: '辅助操作名称' },
    { key: '操作部位', label: '操作部位' },
    { key: '操作方法', label: '操作方法' },
    { key: '访视时间点', label: '访视时间点' },
  ]
  const conCols = [
    { key: '耗材名称', label: '耗材名称' },
    { key: '耗材数量', label: '耗材数量' },
    { key: '特殊要求', label: '特殊要求' },
    { key: '耗材使用访视点', label: '耗材使用访视点' },
    { key: '耗材使用场景', label: '耗材使用场景' },
    { key: '耗材使用要求', label: '耗材使用要求' },
  ]

  const oneRowSectionKeys = new Set([
    'project',
    'equipment',
    'sample',
    'consumable',
    'evaluation',
    'auxiliary',
    'recruitment',
  ])
  const flowWrapLayout = (key: string) =>
    key === 'sample' || key === 'recruitment'

  const renderPairValue = (
    label: string,
    value: string,
    secKey: string,
    cellCls: string,
    valueMinH: string
  ) => {
    let displayValue = (value ?? '').toString().trim()
    if (label === '访视时间点') {
      if (secKey === 'evaluation' && !evaluationTable?.length) displayValue = ''
      if (secKey === 'auxiliary' && !auxiliaryTable?.length) displayValue = ''
    }
    if (
      ['预计到样时间', '生产日期', '保质期/有效日期'].includes(label) &&
      displayValue
    ) {
      const formatted = formatExcelSerialToDateDisplay(displayValue)
      if (formatted) displayValue = formatted
    }
    const isExecutionPeriod =
      label === '执行时间周期' || label === '执行周期'
    const isDeliveryNode = label === '交付节点'
    const items = isExecutionPeriod
      ? displayValue
        ? [formatExecutionPeriodToMMMMDDYY(displayValue)]
        : []
      : isDeliveryNode
        ? (displayValue ? [displayValue] : [])
        : splitFieldValues(displayValue)
    const displayItems =
      items.length > 0 ? items : displayValue ? [displayValue] : []

    if (displayItems.length === 0) {
      return (
        <span
          className={clsx(
            'block text-sm text-slate-700 dark:text-slate-300 bg-white/50 dark:bg-slate-700/30 rounded border border-slate-100 dark:border-slate-600 h-full',
            cellCls,
            valueMinH
          )}
        />
      )
    }
    if (displayItems.length === 1) {
      return (
        <span
          className={clsx(
            'block text-sm text-slate-700 dark:text-slate-300 break-words bg-white/50 dark:bg-slate-700/30 rounded border border-slate-100 dark:border-slate-600 h-full',
            cellCls,
            valueMinH
          )}
        >
          {displayItems[0]}
        </span>
      )
    }
    return (
      <div className={clsx('flex flex-col gap-1.5', valueMinH)}>
        {displayItems.map((item, i) => (
          <span
            key={`${label}-${i}`}
            className={clsx(
              'text-sm text-slate-700 dark:text-slate-300 break-words bg-white/50 dark:bg-slate-700/30 rounded border border-slate-100 dark:border-slate-600',
              oneRowSectionKeys.has(secKey)
                ? 'px-2 py-1.5 text-xs'
                : 'px-3 py-2.5'
            )}
          >
            {item.trim()}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div
      className={clsx(
        'bg-white dark:bg-slate-800 rounded-xl overflow-hidden',
        !isDark && 'border border-slate-200'
      )}
    >
      <div className="p-4 space-y-6">
        {sectionsWithProjectVisit.map((sec) => {
          if (sec.sectionKey === 'project_visit') {
            const projectVisitCols = [
              { key: '访视时间点', label: '访视时间点' },
              { key: '访视层次', label: '访视层次' },
            ]
            if (projectVisitTable.length === 0) {
              return (
                <div
                  key={sec.sectionKey}
                  className={clsx(
                    'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                    'bg-slate-50/50 dark:bg-slate-800/50'
                  )}
                >
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{sec.sectionTitle}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-[#3b434e] bg-slate-100 dark:bg-slate-700/50">
                          {projectVisitCols.map((c) => (
                            <th
                              key={c.key}
                              className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0"
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={2} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                            暂无数据
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={sec.sectionKey}
                className={clsx(
                  'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                  'bg-slate-50/50 dark:bg-slate-800/50'
                )}
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{sec.sectionTitle}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[#3b434e] bg-slate-100 dark:bg-slate-700/50">
                        {projectVisitCols.map((c) => (
                          <th
                            key={c.key}
                            className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0"
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projectVisitTable.map((r, ri) => (
                        <tr key={ri} className="border-b border-slate-100 dark:border-slate-700">
                          {projectVisitCols.map((col) => (
                            <td
                              key={col.key}
                              className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                            >
                              {r[col.key as keyof typeof r] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }
          if (sec.sectionKey === 'visit') {
            const rows =
              visitTableRows.length > 0
                ? visitTableRows
                : [{ cells: VISIT_TABLE_COLUMNS.map((c) => '') }]
            return (
              <div
                key={sec.sectionKey}
                className={clsx(
                  'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                  'bg-slate-50/50 dark:bg-slate-800/50',
                  'mt-6 pt-4'
                )}
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {sec.sectionTitle}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[#3b434e] bg-slate-100 dark:bg-slate-700/50">
                        {VISIT_TABLE_COLUMNS.map((c) => (
                          <th
                            key={c.key}
                            className="px-3 py-3 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0"
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((rowR, ri) => (
                        <tr
                          key={ri}
                          className="border-b border-slate-100 dark:border-slate-700"
                        >
                          {VISIT_TABLE_COLUMNS.map((col, ci) => {
                            const cellVal = rowR.cells[ci] ?? ''
                            return (
                              <td
                                key={col.key}
                                className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                              >
                                {col.key === '访视时间点' ? (
                                  <VisitTimePointChips
                                    value={cellVal}
                                    isDark={isDark}
                                  />
                                ) : (
                                  cellVal || ''
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }

          if (sec.sectionKey === 'equipment') {
            if (equipmentTable && equipmentTable.length > 0) {
              return (
                <div
                  key={sec.sectionKey}
                  className={clsx(
                    'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                    'bg-slate-50/50 dark:bg-slate-800/50'
                  )}
                >
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {sec.sectionTitle}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-[#3b434e] bg-slate-100 dark:bg-slate-700/50">
                          {eqCols.map((c) => (
                            <th
                              key={c.key}
                              className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0"
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentTable.map((r, ri) => (
                          <tr
                            key={ri}
                            className="border-b border-slate-100 dark:border-slate-700"
                          >
                            {eqCols.map((col) => (
                              <td
                                key={col.key}
                                className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                              >
                                {col.key === '访视时间点' ? (
                                  <VisitTimePointChips
                                    value={r[col.key] || ''}
                                    isDark={isDark}
                                  />
                                ) : (
                                  r[col.key] || ''
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={sec.sectionKey}
                className={clsx(
                  'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                  'bg-slate-50/50 dark:bg-slate-800/50'
                )}
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {sec.sectionTitle}
                  </span>
                </div>
                <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  暂无数据
                </div>
              </div>
            )
          }

          if (sec.sectionKey === 'evaluation') {
            if (evaluationTable && evaluationTable.length > 0) {
              return (
                <div
                  key={sec.sectionKey}
                  className={clsx(
                    'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                    'bg-slate-50/50 dark:bg-slate-800/50'
                  )}
                >
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {sec.sectionTitle}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-[#3b434e] bg-slate-100 dark:bg-slate-700/50">
                          {evCols.map((c) => (
                            <th
                              key={c.key}
                              className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0"
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {evaluationTable.map((r, ri) => (
                          <tr
                            key={ri}
                            className="border-b border-slate-100 dark:border-slate-700"
                          >
                            {evCols.map((col) => (
                              <td
                                key={col.key}
                                className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                              >
                                {col.key === '访视时间点' ? (
                                  <VisitTimePointChips
                                    value={r[col.key] || ''}
                                    isDark={isDark}
                                  />
                                ) : (
                                  r[col.key] || ''
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={sec.sectionKey}
                className={clsx(
                  'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                  'bg-slate-50/50 dark:bg-slate-800/50'
                )}
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {sec.sectionTitle}
                  </span>
                </div>
                <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  暂无数据
                </div>
              </div>
            )
          }

          if (sec.sectionKey === 'auxiliary') {
            if (auxiliaryTable && auxiliaryTable.length > 0) {
              return (
                <div
                  key={sec.sectionKey}
                  className={clsx(
                    'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                    'bg-slate-50/50 dark:bg-slate-800/50'
                  )}
                >
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {sec.sectionTitle}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-[#3b434e] bg-slate-100 dark:bg-slate-700/50">
                          {auxCols.map((c) => (
                            <th
                              key={c.key}
                              className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0"
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {auxiliaryTable.map((r, ri) => (
                          <tr
                            key={ri}
                            className="border-b border-slate-100 dark:border-slate-700"
                          >
                            {auxCols.map((col) => (
                              <td
                                key={col.key}
                                className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                              >
                                {col.key === '访视时间点' ? (
                                  <VisitTimePointChips
                                    value={r[col.key] || ''}
                                    isDark={isDark}
                                  />
                                ) : (
                                  r[col.key] || ''
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={sec.sectionKey}
                className={clsx(
                  'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                  'bg-slate-50/50 dark:bg-slate-800/50'
                )}
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {sec.sectionTitle}
                  </span>
                </div>
                <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  暂无数据
                </div>
              </div>
            )
          }

          if (sec.sectionKey === 'consumable') {
            if (consumableTable && consumableTable.length > 0) {
              return (
                <div
                  key={sec.sectionKey}
                  className={clsx(
                    'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                    'bg-slate-50/50 dark:bg-slate-800/50'
                  )}
                >
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {sec.sectionTitle}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-[#3b434e] bg-slate-100 dark:bg-slate-700/50">
                          {conCols.map((c) => (
                            <th
                              key={c.key}
                              className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0"
                            >
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {consumableTable.map((r, ri) => (
                          <tr
                            key={ri}
                            className="border-b border-slate-100 dark:border-slate-700"
                          >
                            {conCols.map((col) => (
                              <td
                                key={col.key}
                                className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                              >
                                {col.key === '耗材使用访视点' ? (
                                  <VisitTimePointChips
                                    value={r[col.key] || ''}
                                    isDark={isDark}
                                  />
                                ) : (
                                  r[col.key] || ''
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            }
            return (
              <div
                key={sec.sectionKey}
                className={clsx(
                  'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                  'bg-slate-50/50 dark:bg-slate-800/50'
                )}
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {sec.sectionTitle}
                  </span>
                </div>
                <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                  暂无数据
                </div>
              </div>
            )
          }

          if (sec.sectionKey === 'schedule_plan') {
            const rawSchedule = sec.pairs.find((p) => p.label === '执行排期')?.value ?? ''
            const scheduleRows = parseExecutionScheduleText(String(rawSchedule))
            const { overallStart, overallEnd } = getSchedulePlanOverallStartEnd(scheduleRows)
            const maxDates = scheduleRows.length
              ? Math.max(...scheduleRows.map((r) => r.dates.length))
              : 0
            const dateCols = Array.from({ length: maxDates }, (_, i) => `执行日期${i + 1}`)
            const scheduleCols = [
              { key: 'visitPoint', label: '访视时间点' },
              ...dateCols.map((k, i) => ({ key: `date${i}`, label: k })),
            ]
            if (scheduleRows.length === 0) {
              return (
                <div
                  key={sec.sectionKey}
                  className={clsx(
                    'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                    'bg-slate-50/50 dark:bg-slate-800/50'
                  )}
                >
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {sec.sectionTitle}
                    </span>
                  </div>
                  <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    暂无数据
                  </div>
                </div>
              )
            }
            return (
              <div
                key={sec.sectionKey}
                className={clsx(
                  'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                  'bg-slate-50/50 dark:bg-slate-800/50'
                )}
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {sec.sectionTitle}
                  </span>
                </div>
                {(overallStart || overallEnd) && (
                  <div className="border-b border-slate-100 dark:border-slate-700/50 overflow-hidden">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-700/50">
                          <th className="px-4 py-2.5 text-center font-medium text-slate-700 dark:text-slate-200 border-b border-r border-slate-200 dark:border-slate-600">
                            执行开始日期
                          </th>
                          <th className="px-4 py-2.5 text-center font-medium text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600">
                            执行结束日期
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-4 py-2.5 text-center text-slate-700 dark:text-slate-300 border-r border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/30">
                            {overallStart || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-center text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/30">
                            {overallEnd || '-'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[#3b434e] bg-slate-100 dark:bg-slate-700/50">
                        {scheduleCols.map((c) => (
                          <th
                            key={c.key}
                            className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0"
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {scheduleRows.map((row, ri) => (
                        <tr
                          key={ri}
                          className="border-b border-slate-100 dark:border-slate-700"
                        >
                          <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/30">
                            {row.visitPoint}
                          </td>
                          {dateCols.map((_, di) => (
                            <td
                              key={di}
                              className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                            >
                              {row.dates[di] ?? ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }

          const oneRowLayout = oneRowSectionKeys.has(sec.sectionKey)
          const flowWrap = flowWrapLayout(sec.sectionKey)
          const valueMinH = oneRowLayout ? 'min-h-[2rem]' : 'min-h-[2.5rem]'
          const cellCls = oneRowLayout ? 'px-2 py-2 text-xs' : 'px-3 py-3'

          return (
            <div
              key={sec.sectionKey}
              className={clsx(
                'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                'bg-slate-50/50 dark:bg-slate-800/50'
              )}
            >
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {sec.sectionTitle}
                </span>
              </div>
              <div
                className={clsx(
                  'px-4 py-3 grid items-stretch min-w-0',
                  flowWrap
                    ? 'grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2'
                    : oneRowLayout
                      ? 'grid-cols-5 gap-2'
                      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
                )}
              >
                {sec.pairs.map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex flex-col h-full min-w-0 gap-1.5"
                  >
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">
                      {label}
                    </span>
                    <div
                      className={clsx(
                        'flex flex-col justify-start',
                        valueMinH
                      )}
                    >
                      {renderPairValue(
                        label,
                        value,
                        sec.sectionKey,
                        cellCls,
                        valueMinH
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
