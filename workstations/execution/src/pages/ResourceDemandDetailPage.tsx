/**
 * 资源需求详情页：展示单条执行订单解析结果（按计划模块：项目信息、场地计划、样品计划等）
 * 路由：/project-management/resource-demand/detail（通过 state 传入 id、headers、rows、rowIndex）
 * 支持编辑后保存回后端。
 */
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Button } from '@cn-kis/ui-kit'
import { ArrowLeft, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { schedulingApi } from '@cn-kis/api-client'
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
import { useTheme } from '../contexts/ThemeContext'

const VISIT_TABLE_COLUMNS = [
  { key: '样本组别', label: '样本组别' },
  { key: '访视时间点', label: '访视时间点' },
  { key: '访视次数', label: '访视次数' },
  { key: '当日测量时间点', label: '当日测试时间点' },
  { key: '访视顺序', label: '访视顺序' },
  { key: '访视类型', label: '访视类型' },
  { key: '允许窗口期', label: '允许超窗期' },
] as const

/** 访视时间点：明亮模式不填充；暗夜模式按图2样式用高亮色块（圆角块）展示 */
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

/** 拆分字段多值：分号分段，逗号分项；仅将相邻的 T0 与 Timm 合并为同一单元格 */
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

interface LocationState {
  id?: number
  headers: string[]
  rows: unknown[]
  rowIndex: number
}

/** 将行规范化为数组（与 headers 一一对应，长度始终等于 headers.length） */
function rowToArray(headers: string[], row: unknown): string[] {
  if (row == null) return headers.map(() => '')
  if (Array.isArray(row))
    return headers.map((_, i) => String((row as unknown[])[i] ?? ''))
  const obj = row as Record<string, unknown>
  return headers.map((h) => String(obj[h] ?? ''))
}

export default function ResourceDemandDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const state = location.state as LocationState | null

  const headers = state?.headers ?? []
  const rows = Array.isArray(state?.rows) ? state.rows : []
  const rowIndex = typeof state?.rowIndex === 'number' ? state.rowIndex : 0
  const row = rows[rowIndex] ?? null
  const recordId = state?.id ?? 0

  const rowAsArray = useMemo(() => rowToArray(headers, row), [headers, row])
  const [isEditing, setIsEditing] = useState(false)
  const [lastSavedHeaders, setLastSavedHeaders] = useState<string[] | null>(null)
  const [lastSavedRow, setLastSavedRow] = useState<string[] | null>(null)
  const [editedHeaders, setEditedHeaders] = useState<string[]>(() => [...headers])
  const [editedRow, setEditedRow] = useState<string[]>(() => [...rowAsArray])
  const displayHeaders = lastSavedHeaders ?? headers
  const displayRow = lastSavedRow ?? rowAsArray
  const currentHeaders = isEditing ? editedHeaders : displayHeaders
  const rowForDisplay = isEditing ? editedRow : displayRow

  const setEditedRowByLabel = useCallback(
    (label: string, value: string) => {
      const i = currentHeaders.indexOf(label)
      if (i >= 0) {
        setEditedRow((prev) => {
          const next = [...prev]
          next[i] = value
          return next
        })
      } else {
        setEditedHeaders((prev) => [...prev, label])
        setEditedRow((prev) => [...prev, value])
      }
    },
    [currentHeaders]
  )
  const setEditedRowByIndex = useCallback((index: number, value: string) => {
    setEditedRow((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }, [])

  const [saveError, setSaveError] = useState<string | null>(null)
  const updateMutation = useMutation({
    mutationFn: (payload: { headers: string[]; rows: unknown[] }) =>
      schedulingApi.updateExecutionOrder(recordId, payload),
    onSuccess: () => {
      setSaveError(null)
      setIsEditing(false)
      setLastSavedHeaders([...editedHeaders])
      setLastSavedRow([...editedRow])
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'execution-orders'] })
      queryClient.invalidateQueries({ queryKey: ['scheduling', 'execution-order-pending'] })
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { msg?: string } }; message?: string })?.response?.data?.msg ??
        (err as Error)?.message ??
        '保存失败，请重试'
      setSaveError(msg)
    },
  })

  const handleStartEdit = useCallback(() => {
    setEditedHeaders([...(lastSavedHeaders ?? headers)])
    setEditedRow([...(lastSavedRow ?? rowAsArray)])
    setIsEditing(true)
  }, [lastSavedHeaders, lastSavedRow, headers, rowAsArray])
  const handleCancelEdit = useCallback(() => {
    setEditedRow([...displayRow])
    setIsEditing(false)
    setSaveError(null)
  }, [displayRow])
  const handleSave = useCallback(() => {
    const newRows = rows.map((r, i) =>
      i === rowIndex ? editedRow : rowToArray(currentHeaders, r)
    )
    updateMutation.mutate({ headers: currentHeaders, rows: newRows })
  }, [currentHeaders, rows, rowIndex, editedRow, updateMutation])

  /** 表格类模块新增一行；若该表头不存在则先追加表头与单元格。initialListWhenNew：新加表头时使用的已有行（避免覆盖解析出的数据） */
  const handleAddTableRow = useCallback(
    (tableKey: string, emptyRow: Record<string, string>, initialListWhenNew?: Record<string, string>[]) => {
      const i = currentHeaders.indexOf(tableKey)
      if (i < 0) {
        const list = initialListWhenNew && initialListWhenNew.length > 0 ? [...initialListWhenNew, { ...emptyRow }] : [emptyRow]
        setEditedHeaders((prev) => [...prev, tableKey])
        setEditedRow((prev) => [...prev, JSON.stringify(list)])
        return
      }
      const raw = editedRow[i]
      let list: Record<string, string>[] = []
      if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw) as unknown
          list = Array.isArray(parsed) ? (parsed as Record<string, string>[]) : []
        } catch {
          list = []
        }
      }
      setEditedRow((prev) => {
        const next = [...prev]
        next[i] = JSON.stringify([...list, { ...emptyRow }])
        return next
      })
    },
    [currentHeaders, editedRow]
  )

  /** 表格类模块删除一行 */
  const handleRemoveTableRow = useCallback(
    (tableKey: string, rowIndex: number) => {
      const i = currentHeaders.indexOf(tableKey)
      if (i < 0) return
      const raw = editedRow[i]
      let list: Record<string, string>[] = []
      if (typeof raw === 'string' && raw.trim()) {
        try {
          const parsed = JSON.parse(raw) as unknown
          list = Array.isArray(parsed) ? (parsed as Record<string, string>[]) : []
        } catch {
          list = []
        }
      }
      list = list.filter((_, idx) => idx !== rowIndex)
      setEditedRow((prev) => {
        const next = [...prev]
        next[i] = JSON.stringify(list)
        return next
      })
    },
    [currentHeaders, editedRow]
  )

  /** 访视计划：为每个访视相关字段追加一个空段（分号分隔） */
  const handleAddVisitRow = useCallback(() => {
    const visitLabels = VISIT_TABLE_COLUMNS.map((c) => c.key)
    setEditedRow((prev) => {
      const next = [...prev]
      visitLabels.forEach((label) => {
        const i = currentHeaders.indexOf(label)
        if (i < 0) return
        const cur = (next[i] ?? '').toString().trim()
        next[i] = cur ? `${cur}; ` : ''
      })
      return next
    })
  }, [currentHeaders])

  /** 访视计划：删除第 rowIndex 行（从各字段分号分段中移除对应段） */
  const handleRemoveVisitRow = useCallback(
    (rowIndex: number) => {
      const visitLabels = VISIT_TABLE_COLUMNS.map((c) => c.key)
      setEditedRow((prev) => {
        const next = [...prev]
        visitLabels.forEach((label) => {
          const i = currentHeaders.indexOf(label)
          if (i < 0) return
          const cur = (next[i] ?? '').toString().trim()
          const segments = cur ? cur.split(/\s*[;；]\s*/).filter(Boolean) : []
          segments.splice(rowIndex, 1)
          next[i] = segments.join('; ')
        })
        return next
      })
    },
    [currentHeaders]
  )

  /** 访视计划：某单元格编辑后，将表格行数据同步回 7 个字段（分号分隔） */
  const syncVisitTableToEditedRow = useCallback(
    (rows: { cells: string[] }[]) => {
      setEditedRow((prev) => {
        const next = [...prev]
        VISIT_TABLE_COLUMNS.forEach((col, cj) => {
          const i = currentHeaders.indexOf(col.key)
          if (i >= 0) next[i] = rows.map((r) => (r.cells[cj] ?? '').trim()).join('; ')
        })
        return next
      })
    },
    [currentHeaders]
  )

  /** 键值类模块新增一项（新列） */
  const handleAddKeyValuePair = useCallback(() => {
    setEditedHeaders((prev) => [...prev, '新项'])
    setEditedRow((prev) => [...prev, ''])
  }, [])

  const sectionsRaw = currentHeaders.length && rowForDisplay.length > 0 ? mapExecutionOrderToSectionsForRow(currentHeaders, rowForDisplay) : []
  const allSectionLabels = useMemo(
    () => new Set(sectionsRaw.flatMap((s) => s.pairs.map((p) => p.label))),
    [sectionsRaw]
  )
  /** 内部表格存储键，仅用于设备/评估/辅助/耗材/项目访视表格，不在「其他」中展示 */
  const internalTableKeys = new Set(['__equipmentTable', '__evaluationTable', '__auxiliaryTable', '__consumableTable', '__projectVisitTable'])
  const otherPairs = useMemo(
    () =>
      currentHeaders
        .map((h, i) => ({ label: h, value: (rowForDisplay[i] ?? '').toString() }))
        .filter((p) => !allSectionLabels.has(p.label) && !internalTableKeys.has(p.label)),
    [currentHeaders, rowForDisplay, allSectionLabels]
  )
  const sections =
    otherPairs.length > 0
      ? [...sectionsRaw, { sectionKey: 'other', sectionTitle: '其他', pairs: otherPairs }]
      : sectionsRaw

  /** 在第一个区块（通常为「项目信息」）后插入「项目访视」模块，保证详情页始终展示 */
  const sectionsWithProjectVisit = useMemo(() => {
    const projectVisitSection = { sectionKey: 'project_visit', sectionTitle: '项目访视', pairs: [] as { label: string; value: string }[] }
    if (sections.length === 0) return [projectVisitSection]
    return [...sections.slice(0, 1), projectVisitSection, ...sections.slice(1)]
  }, [sections])

  function parseTableFromRow<T>(key: string, rowData: unknown): T[] | null {
    if (!currentHeaders.length || rowData == null) return null
    const i = currentHeaders.indexOf(key)
    if (i < 0) return null
    const raw = Array.isArray(rowData) ? (rowData as unknown[])[i] : (rowData as Record<string, unknown>)[key]
    if (typeof raw !== 'string' || !raw.trim()) return null
    try {
      const parsed = JSON.parse(raw) as unknown
      return Array.isArray(parsed) ? (parsed as T[]) : null
    } catch {
      return null
    }
  }

  const equipmentTable = useMemo(
    () => parseTableFromRow<EquipmentTableRow>('__equipmentTable', rowForDisplay),
    [currentHeaders, rowForDisplay]
  )
  const evaluationTable = useMemo(
    () => parseTableFromRow<EvaluationTableRow>('__evaluationTable', rowForDisplay),
    [currentHeaders, rowForDisplay]
  )
  const auxiliaryTable = useMemo(
    () => parseTableFromRow<AuxiliaryTableRow>('__auxiliaryTable', rowForDisplay),
    [currentHeaders, rowForDisplay]
  )
  const consumableTable = useMemo(
    () => parseTableFromRow<ConsumableTableRow>('__consumableTable', rowForDisplay),
    [currentHeaders, rowForDisplay]
  )

  /** 项目访视：优先用 __projectVisitTable，否则遍历整表找锚点「访视点」后解析 */
  const projectVisitTable = useMemo((): { 访视时间点: string; 访视层次: string }[] => {
    const fromRow = parseTableFromRow<{ 访视时间点: string; 访视层次: string }>('__projectVisitTable', rowForDisplay)
    if (fromRow && fromRow.length > 0) return fromRow
    const rowsToScan = isEditing ? [editedRow] : rows
    return parseProjectVisitFromVisitPointRightCell(currentHeaders, rowsToScan)
  }, [currentHeaders, rowForDisplay, isEditing, editedRow, rows])

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

  useEffect(() => {
    if (!state || !Array.isArray(state.rows) || state.rows.length === 0) {
      navigate('/project-management', { replace: true })
      return
    }
    if (state.rowIndex < 0 || state.rowIndex >= state.rows.length) {
      navigate('/project-management', { replace: true })
    }
  }, [state, navigate])

  const handleBack = () => {
    navigate('/project-management')
  }

  if (!state || rows.length === 0) {
    return null
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" className="min-h-11" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          返回
        </Button>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          执行订单解析详情
        </h2>
        {recordId > 0 && (
          <div className="ml-auto flex items-center gap-2">
            {!isEditing ? (
              <Button type="button" variant="primary" className="min-h-11" onClick={handleStartEdit}>
                <Pencil className="w-4 h-4 mr-1" />
                编辑
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="primary"
                  className="min-h-11"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-1" />
                  {updateMutation.isPending ? '保存中…' : '保存'}
                </Button>
                <Button type="button" variant="secondary" className="min-h-11" onClick={handleCancelEdit}>
                  <X className="w-4 h-4 mr-1" />
                  取消
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {saveError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {saveError}
        </div>
      )}

      <div className={clsx('bg-white dark:bg-slate-800 rounded-xl overflow-hidden', !isDark && 'border border-slate-200')}>
        <div className="p-4 space-y-6">
          {sectionsWithProjectVisit.map((sec) => {
            if (sec.sectionKey === 'project_visit') {
              const projectVisitCols = [
                { key: '访视时间点', label: '访视时间点' },
                { key: '访视层次', label: '访视层次' },
              ]
              const emptyProjectVisitRow = { 访视时间点: '', 访视层次: '' }
              if (isEditing) {
                return (
                  <div
                    key={sec.sectionKey}
                    className={clsx(
                      'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                      'bg-slate-50/50 dark:bg-slate-800/50'
                    )}
                  >
                    <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e] flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{sec.sectionTitle}</span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="shrink-0"
                        onClick={() => handleAddTableRow('__projectVisitTable', emptyProjectVisitRow, projectVisitTable)}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        新增行
                      </Button>
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
                            <th className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 min-w-[5.5rem]">
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectVisitTable.map((r, ri) => (
                            <tr key={ri} className="border-b border-slate-100 dark:border-slate-700">
                              {projectVisitCols.map((col) => (
                                <td
                                  key={col.key}
                                  className="px-3 py-2 align-top border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                                >
                                  <input
                                    type="text"
                                    className={clsx(
                                      'w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 min-h-[2rem] focus:ring-2 focus:ring-primary-500'
                                    )}
                                    value={r[col.key as keyof typeof r] ?? ''}
                                    onChange={(e) => {
                                      const next = projectVisitTable.map((row, i) =>
                                        i === ri ? { ...row, [col.key]: e.target.value } : row
                                      )
                                      setEditedRowByLabel('__projectVisitTable', JSON.stringify(next))
                                    }}
                                  />
                                </td>
                              ))}
                              <td className="px-3 py-2 align-middle border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/30">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (currentHeaders.includes('__projectVisitTable')) {
                                      handleRemoveTableRow('__projectVisitTable', ri)
                                    } else {
                                      const next = projectVisitTable.filter((_, i) => i !== ri)
                                      setEditedRowByLabel('__projectVisitTable', JSON.stringify(next))
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                  <span className="whitespace-nowrap">删除本行</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              }
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
              if (isEditing) {
                const inputCellClsVisit =
                  'w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 min-h-[2rem] focus:ring-2 focus:ring-primary-500'
                const editRows = visitTableRows.length > 0 ? visitTableRows : [{ cells: VISIT_TABLE_COLUMNS.map(() => '') }]
                return (
                  <div
                    key={sec.sectionKey}
                    className={clsx(
                      'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                      'bg-slate-50/50 dark:bg-slate-800/50',
                      'mt-6 pt-4'
                    )}
                  >
                    <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e] flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        {sec.sectionTitle}
                      </span>
                      <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={handleAddVisitRow}>
                        <Plus className="w-4 h-4 mr-1" />
                        新增行
                      </Button>
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
                            <th className="px-3 py-3 text-left font-medium text-slate-700 dark:text-slate-200 min-w-[5.5rem]">
                              操作
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {editRows.map((row, ri) => (
                            <tr key={ri} className="border-b border-slate-100 dark:border-slate-700">
                              {VISIT_TABLE_COLUMNS.map((col, ci) => (
                                <td
                                  key={col.key}
                                  className="px-3 py-2 align-top border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                                >
                                  <input
                                    type="text"
                                    className={inputCellClsVisit}
                                    value={row.cells[ci] ?? ''}
                                    onChange={(e) => {
                                      const next = editRows.map((r, i) =>
                                        i === ri ? { cells: r.cells.map((c, j) => (j === ci ? e.target.value : c)) } : r
                                      )
                                      syncVisitTableToEditedRow(next)
                                    }}
                                  />
                                </td>
                              ))}
                              <td className="px-3 py-2 align-middle border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/30">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveVisitRow(ri)}
                                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                  <span className="whitespace-nowrap">删除本行</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              }
              const rows = visitTableRows.length > 0 ? visitTableRows : [{ cells: VISIT_TABLE_COLUMNS.map((c) => '') }]
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
                        {rows.map((row, ri) => (
                          <tr key={ri} className="border-b border-slate-100 dark:border-slate-700">
                            {VISIT_TABLE_COLUMNS.map((col, ci) => {
                              const cellVal = row.cells[ci] ?? ''
                              return (
                                <td
                                  key={col.key}
                                  className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                                >
                                  {col.key === '访视时间点' ? (
                                    <VisitTimePointChips value={cellVal} isDark={isDark} />
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
            const inputCellCls =
              'w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 min-h-[2rem] focus:ring-2 focus:ring-primary-500'
            const renderEditablePlanTable = (
              tableKey: string,
              cols: { key: string; label: string }[],
              data: Record<string, string>[],
              emptyRow: Record<string, string>
            ) => (
              <div
                key={sec.sectionKey}
                className={clsx(
                  'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                  'bg-slate-50/50 dark:bg-slate-800/50'
                )}
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e] flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {sec.sectionTitle}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => handleAddTableRow(tableKey, emptyRow)}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    新增行
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-[#3b434e] bg-slate-100 dark:bg-slate-700/50">
                        {cols.map((c) => (
                          <th
                            key={c.key}
                            className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0"
                          >
                            {c.label}
                          </th>
                        ))}
                        <th className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 min-w-[5.5rem]">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((r, ri) => (
                        <tr key={ri} className="border-b border-slate-100 dark:border-slate-700">
                          {cols.map((col) => (
                            <td
                              key={col.key}
                              className="px-3 py-2 align-top border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                            >
                              <input
                                type="text"
                                className={inputCellCls}
                                value={r[col.key] ?? ''}
                                onChange={(e) => {
                                  const next = data.map((row, i) =>
                                    i === ri ? { ...row, [col.key]: e.target.value } : row
                                  )
                                  setEditedRowByLabel(tableKey, JSON.stringify(next))
                                }}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 align-middle border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/30">
                            <button
                              type="button"
                              onClick={() => handleRemoveTableRow(tableKey, ri)}
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="whitespace-nowrap">删除本行</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
            const renderPlanTable = <T extends Record<string, string>>(
              cols: { key: keyof T; label: string }[],
              data: T[],
              visitKey: string
            ) => (
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
                        {cols.map((c) => (
                          <th
                            key={String(c.key)}
                            className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0"
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((r, ri) => (
                        <tr key={ri} className="border-b border-slate-100 dark:border-slate-700">
                          {cols.map((col) => (
                            <td
                              key={String(col.key)}
                              className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30"
                            >
                              {col.key === visitKey ? (
                                <VisitTimePointChips value={r[col.key] || ''} isDark={isDark} />
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

            if (sec.sectionKey === 'equipment') {
              const eqCols = [
                { key: '测试设备', label: '测试设备' },
                { key: '测试指标', label: '测试指标' },
                { key: '测试部位', label: '测试部位' },
                { key: '测试点位', label: '测试点位' },
                { key: '访视时间点', label: '访视时间点' },
              ]
              const emptyEqRow = { 测试设备: '', 测试指标: '', 测试部位: '', 测试点位: '', 访视时间点: '' }
              if (isEditing) {
                return renderEditablePlanTable(
                  '__equipmentTable',
                  eqCols,
                  (equipmentTable ?? []) as unknown as Record<string, string>[],
                  emptyEqRow,
                )
              }
              if (equipmentTable && equipmentTable.length > 0) {
                return renderPlanTable(eqCols, equipmentTable as unknown as Record<string, string>[], '访视时间点')
              }
              return (
                <div key={sec.sectionKey} className={clsx('rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden', 'bg-slate-50/50 dark:bg-slate-800/50')}>
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{sec.sectionTitle}</span>
                  </div>
                  <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">暂无数据</div>
                </div>
              )
            }
            if (sec.sectionKey === 'evaluation') {
              const evCols = [
                { key: '评估人员类别', label: '评估人员类别' },
                { key: '评估指标类别', label: '评估指标类别' },
                { key: '评估指标', label: '评估指标' },
                { key: '访视时间点', label: '访视时间点' },
                { key: '比如特殊人员资质', label: '比如特殊人员资质' },
              ]
              const emptyEvRow = { 评估人员类别: '', 评估指标类别: '', 评估指标: '', 访视时间点: '', 比如特殊人员资质: '' }
              if (isEditing) {
                return renderEditablePlanTable(
                  '__evaluationTable',
                  evCols,
                  (evaluationTable ?? []) as unknown as Record<string, string>[],
                  emptyEvRow,
                )
              }
              if (evaluationTable && evaluationTable.length > 0) {
                return renderPlanTable(evCols, evaluationTable as unknown as Record<string, string>[], '访视时间点')
              }
              return (
                <div key={sec.sectionKey} className={clsx('rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden', 'bg-slate-50/50 dark:bg-slate-800/50')}>
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{sec.sectionTitle}</span>
                  </div>
                  <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">暂无数据</div>
                </div>
              )
            }
            if (sec.sectionKey === 'auxiliary') {
              const auxCols = [
                { key: '辅助操作名称', label: '辅助操作名称' },
                { key: '操作部位', label: '操作部位' },
                { key: '操作方法', label: '操作方法' },
                { key: '访视时间点', label: '访视时间点' },
              ]
              const emptyAuxRow = { 辅助操作名称: '', 操作部位: '', 操作方法: '', 访视时间点: '' }
              if (isEditing) {
                return renderEditablePlanTable(
                  '__auxiliaryTable',
                  auxCols,
                  (auxiliaryTable ?? []) as unknown as Record<string, string>[],
                  emptyAuxRow,
                )
              }
              if (auxiliaryTable && auxiliaryTable.length > 0) {
                return renderPlanTable(auxCols, auxiliaryTable as unknown as Record<string, string>[], '访视时间点')
              }
              return (
                <div key={sec.sectionKey} className={clsx('rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden', 'bg-slate-50/50 dark:bg-slate-800/50')}>
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{sec.sectionTitle}</span>
                  </div>
                  <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">暂无数据</div>
                </div>
              )
            }
            if (sec.sectionKey === 'consumable') {
              const conCols = [
                { key: '耗材名称', label: '耗材名称' },
                { key: '耗材数量', label: '耗材数量' },
                { key: '特殊要求', label: '特殊要求' },
                { key: '耗材使用访视点', label: '耗材使用访视点' },
                { key: '耗材使用场景', label: '耗材使用场景' },
                { key: '耗材使用要求', label: '耗材使用要求' },
              ]
              const emptyConRow = { 耗材名称: '', 耗材数量: '', 特殊要求: '', 耗材使用访视点: '', 耗材使用场景: '', 耗材使用要求: '' }
              if (isEditing) {
                return renderEditablePlanTable(
                  '__consumableTable',
                  conCols,
                  (consumableTable ?? []) as unknown as Record<string, string>[],
                  emptyConRow,
                )
              }
              if (consumableTable && consumableTable.length > 0) {
                return renderPlanTable(conCols, consumableTable as unknown as Record<string, string>[], '耗材使用访视点')
              }
              return (
                <div key={sec.sectionKey} className={clsx('rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden', 'bg-slate-50/50 dark:bg-slate-800/50')}>
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{sec.sectionTitle}</span>
                  </div>
                  <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">暂无数据</div>
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
                  <div key={sec.sectionKey} className={clsx('rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden', 'bg-slate-50/50 dark:bg-slate-800/50')}>
                    <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{sec.sectionTitle}</span>
                    </div>
                    <div className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">暂无数据</div>
                  </div>
                )
              }
              return (
                <div key={sec.sectionKey} className={clsx('rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden', 'bg-slate-50/50 dark:bg-slate-800/50')}>
                  <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e]">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{sec.sectionTitle}</span>
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
                            <th key={c.key} className="px-3 py-2.5 text-left font-medium text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-[#3b434e] last:border-r-0">
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleRows.map((row, ri) => (
                          <tr key={ri} className="border-b border-slate-100 dark:border-slate-700">
                            <td className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 bg-white/50 dark:bg-slate-800/30">
                              {row.visitPoint}
                            </td>
                            {dateCols.map((_, di) => (
                              <td key={di} className="px-3 py-2 align-top text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-700 last:border-r-0 bg-white/50 dark:bg-slate-800/30">
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
            const isProject = sec.sectionKey === 'project'
            const oneRowSectionKeys = new Set(['project', 'equipment', 'sample', 'consumable', 'evaluation', 'auxiliary', 'recruitment'])
            const oneRowLayout = oneRowSectionKeys.has(sec.sectionKey)
            // 样品计划、招募计划：尽量一行显示，放不下再换行（弹性列数）
            const flowWrapLayout = sec.sectionKey === 'sample' || sec.sectionKey === 'recruitment'
            return (
              <div
                key={sec.sectionKey}
                className={clsx(
                  'rounded-lg border border-slate-200 dark:border-[#3b434e] overflow-hidden',
                  'bg-slate-50/50 dark:bg-slate-800/50'
                )}
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#3b434e] flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {sec.sectionTitle}
                  </span>
                  {isEditing && (
                    <Button type="button" variant="secondary" size="sm" className="shrink-0" onClick={handleAddKeyValuePair}>
                      <Plus className="w-4 h-4 mr-1" />
                      新增行
                    </Button>
                  )}
                </div>
                <div
                  className={clsx(
                    'px-4 py-3 grid items-stretch min-w-0',
                    flowWrapLayout
                      ? 'grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2'
                      : oneRowLayout
                        ? 'grid-cols-5 gap-2'
                        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
                  )}
                >
                  {sec.pairs.map(({ label, value }) => {
                    const idx = currentHeaders.indexOf(label)
                    const rawValue = (value ?? '').toString().trim()
                    // 评估/辅助无表数据时，访视时间点显示为空
                    let displayValue = rawValue
                    if (label === '访视时间点') {
                      if (sec.sectionKey === 'evaluation' && !evaluationTable?.length) displayValue = ''
                      if (sec.sectionKey === 'auxiliary' && !auxiliaryTable?.length) displayValue = ''
                    }
                    // 预计到样时间、生产日期、保质期/有效日期：Excel 序列数转年月日展示（兜底旧数据）
                    if (['预计到样时间', '生产日期', '保质期/有效日期'].includes(label) && rawValue) {
                      const formatted = formatExcelSerialToDateDisplay(rawValue)
                      if (formatted) displayValue = formatted
                    }
                    const isExecutionPeriod = label === '执行时间周期' || label === '执行周期'
                    const isDeliveryNode = label === '交付节点'
                    const items = isExecutionPeriod
                      ? (displayValue ? [formatExecutionPeriodToMMMMDDYY(displayValue)] : [])
                      : isDeliveryNode
                        ? (displayValue ? [displayValue] : [])
                        : splitFieldValues(displayValue)
                    const displayItems = items.length > 0 ? items : displayValue ? [displayValue] : []
                    const valueMinH = oneRowLayout ? 'min-h-[2rem]' : 'min-h-[2.5rem]'
                    const cellCls = oneRowLayout
                      ? 'px-2 py-2 text-xs'
                      : 'px-3 py-3'
                    const inputCls =
                      'w-full text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1.5 focus:ring-2 focus:ring-primary-500'
                    return (
                      <div key={label} className="flex flex-col h-full min-w-0 gap-1.5">
                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
                        <div className={clsx('flex flex-col justify-start', valueMinH)}>
                          {isEditing ? (
                            <textarea
                              className={clsx(inputCls, 'resize-y flex-1 min-h-[2.5rem]')}
                              value={idx >= 0 ? (editedRow[idx] ?? '') : (displayValue ?? '')}
                              onChange={(e) => setEditedRowByLabel(label, e.target.value)}
                              rows={2}
                            />
                          ) : displayItems.length === 0 ? (
                            <span
                              className={clsx(
                                'block text-sm text-slate-700 dark:text-slate-300 bg-white/50 dark:bg-slate-700/30 rounded border border-slate-100 dark:border-slate-600 h-full',
                                cellCls,
                                valueMinH
                              )}
                            />
                          ) : displayItems.length === 1 ? (
                            <span
                              className={clsx(
                                'block text-sm text-slate-700 dark:text-slate-300 break-words bg-white/50 dark:bg-slate-700/30 rounded border border-slate-100 dark:border-slate-600 h-full',
                                cellCls,
                                valueMinH
                              )}
                            >
                              {displayItems[0]}
                            </span>
                          ) : (
                            <div className={clsx('flex flex-col gap-1.5', valueMinH)}>
                              {displayItems.map((item, i) => (
                                <span
                                  key={`${label}-${i}`}
                                  className={clsx(
                                    'text-sm text-slate-700 dark:text-slate-300 break-words bg-white/50 dark:bg-slate-700/30 rounded border border-slate-100 dark:border-slate-600',
                                    oneRowLayout ? 'px-2 py-1.5 text-xs' : 'px-3 py-2.5'
                                  )}
                                >
                                  {item.trim()}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
