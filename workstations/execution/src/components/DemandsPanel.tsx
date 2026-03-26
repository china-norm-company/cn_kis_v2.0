/**
 * 资源需求列表：与排程管理「排程计划」Tab 相同的 DataTable + 分页样式，每页 10 条
 */
import { useState, useMemo, useEffect, useRef, useCallback, useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clsx } from 'clsx'
import { Empty, DataTable, Badge, Button } from '@cn-kis/ui-kit'
import type { Column } from '@cn-kis/ui-kit'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import {
  getResourceDemandSummaryRow,
  formatExecutionPeriodToMMMMDDYY,
  type ResourceDemandSummary,
} from '../utils/executionOrderPlanConfig'

export type DemandItem = { id: number; headers: string[]; rows: unknown[] }

const DEMANDS_PAGE_SIZE = 10

/** 测试设备列：表头与单元格内容区宽度（px），偏窄；全文见悬停自定义浮层 */
const TEST_EQUIPMENT_COLUMN_WIDTH = 120

const TOOLTIP_HIDE_DELAY_MS = 200

/** 单行 Badge + 横向裁切（无滚动条）；悬停 portal 浮层展示全部条目，可换行 */
function ClippedBadgesWithTooltip({
  maxWidthPx,
  tooltipLines,
  children,
}: {
  maxWidthPx: number
  tooltipLines: string[]
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  /** 浏览器环境用 number，避免与 NodeJS.Timeout 混用导致赋值报错 */
  const hideTimerRef = useRef<number | null>(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const updatePosition = useCallback(() => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const half = 168
    const margin = 8
    const left = Math.min(window.innerWidth - margin - half, Math.max(margin + half, cx))
    // 与锚区略重叠，便于鼠标从单元格移入浮层不断触
    setCoords({ top: r.bottom - 4, left })
  }, [])

  const handleOpen = useCallback(() => {
    clearHideTimer()
    updatePosition()
    setOpen(true)
  }, [clearHideTimer, updatePosition])

  const scheduleClose = useCallback(() => {
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => setOpen(false), TOOLTIP_HIDE_DELAY_MS)
  }, [clearHideTimer])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const onScrollOrResize = () => setOpen(false)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  useEffect(() => () => clearHideTimer(), [clearHideTimer])

  const portal =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        role="tooltip"
        className="pointer-events-auto fixed z-[9999] max-h-[min(22rem,70vh)] max-w-sm overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-left text-sm text-neutral-900 shadow-lg dark:border-[#3b434e] dark:bg-slate-800 dark:text-neutral-100"
        style={{ top: coords.top, left: coords.left, transform: 'translateX(-50%)' }}
        onMouseEnter={clearHideTimer}
        onMouseLeave={scheduleClose}
      >
        <ul className="list-none space-y-1.5">
          {tooltipLines.map((line, i) => (
            <li key={i} className="break-words leading-snug">
              {line}
            </li>
          ))}
        </ul>
      </div>,
      document.body
    )

  return (
    <>
      <div
        ref={anchorRef}
        className="flex w-full min-w-0 justify-center mx-auto cursor-help"
        style={{ maxWidth: maxWidthPx }}
        onMouseEnter={handleOpen}
        onMouseLeave={scheduleClose}
      >
        <div className="inline-flex w-full max-w-full flex-nowrap gap-1.5 overflow-x-hidden py-0.5">{children}</div>
      </div>
      {portal}
    </>
  )
}

type DemandTableRow = ResourceDemandSummary & {
  id: number
  _itemIndex: number
}

type SemicolonChipsOptions = {
  /** 单行排列，溢出裁切无滚动条；悬停 portal 浮层展示全文 */
  singleLine?: boolean
  /** 与列宽一致，限制可视区域 */
  maxWidthPx?: number
}

/** 与「执行周期」列一致：有内容用 info 徽章，无内容用 default（字色即 text-info-600 / text-slate-700） */
function renderSemicolonChips(val: string, center: boolean, opts?: SemicolonChipsOptions) {
  const parts = (val || '')
    .split(/\s*[;；]\s*/)
    .filter(Boolean)
    .map((s) => s.trim())
  if (parts.length === 0) {
    return (
      <Badge variant="field" size="sm" className="opacity-75">
        -
      </Badge>
    )
  }

  const badges = parts.map((name, i) => (
    <Badge key={`${i}-${name}`} variant="field" size="sm" className="shrink-0 whitespace-nowrap">
      {name}
    </Badge>
  ))

  if (opts?.singleLine) {
    const maxPx = opts.maxWidthPx ?? 200
    return (
      <ClippedBadgesWithTooltip maxWidthPx={maxPx} tooltipLines={parts}>
        {badges}
      </ClippedBadgesWithTooltip>
    )
  }

  return (
    <span
      className={clsx(
        'inline-flex flex-wrap gap-1.5',
        center && 'justify-center max-w-[200px] mx-auto'
      )}
    >
      {badges}
    </span>
  )
}

type ItemWithIndex = { item: DemandItem; itemIndex: number }

export function DemandsPanel({
  items,
  onViewDetail,
}: {
  items: DemandItem[]
  onViewDetail: (itemIndex: number) => void
}) {
  const [page, setPage] = useState(1)
  const [projectCodeFilter, setProjectCodeFilter] = useState('')

  const filteredEntries: ItemWithIndex[] = useMemo(() => {
    const q = projectCodeFilter.trim().toLowerCase()
    if (!q) {
      return items.map((item, itemIndex) => ({ item, itemIndex }))
    }
    return items
      .map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item }) => {
        const row = Array.isArray(item.rows) ? item.rows[0] : null
        const code = (row != null ? getResourceDemandSummaryRow(item.headers, row).project_code : '')
          .toString()
          .trim()
          .toLowerCase()
        return code.includes(q)
      })
  }, [items, projectCodeFilter])

  useEffect(() => {
    setPage(1)
  }, [projectCodeFilter])

  const total = filteredEntries.length
  const totalPages = Math.max(1, Math.ceil(total / DEMANDS_PAGE_SIZE))

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages))
  }, [totalPages, total])

  const start = (page - 1) * DEMANDS_PAGE_SIZE

  const pageRows: DemandTableRow[] = useMemo(() => {
    return filteredEntries.slice(start, start + DEMANDS_PAGE_SIZE).map((entry) => ({
      ...getResourceDemandSummaryRow(
        entry.item.headers,
        Array.isArray(entry.item.rows) ? (entry.item.rows[0] ?? []) : []
      ),
      id: entry.item.id,
      _itemIndex: entry.itemIndex,
    }))
  }, [filteredEntries, start])

  const hasPrev = page > 1
  const hasNext = page < totalPages

  const handlePageJump = (value: string) => {
    const n = parseInt(value, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) setPage(n)
  }

  const columns: Column<DemandTableRow>[] = useMemo(
    () => [
      {
        key: 'project_code',
        header: '项目编号',
        align: 'center',
        render: (r: DemandTableRow) => (
          <span className="text-sm text-slate-700 dark:text-slate-300">{r.project_code || '-'}</span>
        ),
      },
      {
        key: 'business_type',
        header: '业务类型',
        align: 'center',
        render: (r: DemandTableRow) => (
          <span className="text-sm text-slate-700 dark:text-slate-300">{r.business_type || '-'}</span>
        ),
      },
      {
        key: 'group',
        header: '组别',
        align: 'center',
        render: (r: DemandTableRow) => (
          <span className="text-sm text-slate-700 dark:text-slate-300">{r.group || '-'}</span>
        ),
      },
      {
        key: 'sample_size',
        header: '样本量',
        align: 'center',
        render: (r: DemandTableRow) => (
          <span className="text-sm text-slate-600 dark:text-slate-300">{r.sample_size || '-'}</span>
        ),
      },
      {
        key: 'backup_sample_size',
        header: '备份样本量',
        align: 'center',
        render: (r: DemandTableRow) => (
          <span className="text-sm text-slate-600 dark:text-slate-300">{r.backup_sample_size || '-'}</span>
        ),
      },
      {
        key: 'visit_timepoint',
        header: '访视时间点',
        align: 'center',
        render: (r: DemandTableRow) => renderSemicolonChips(r.visit_timepoint, true),
      },
      {
        key: 'execution_period',
        header: '执行周期',
        align: 'center',
        render: (r: DemandTableRow) =>
          r.execution_period ? (
            <Badge variant="field" size="sm">
              {formatExecutionPeriodToMMMMDDYY(r.execution_period)}
            </Badge>
          ) : (
            <Badge variant="field" size="sm" className="opacity-75">
              -
            </Badge>
          ),
      },
      {
        key: 'test_equipment',
        header: '测试设备',
        width: TEST_EQUIPMENT_COLUMN_WIDTH,
        align: 'center',
        render: (r: DemandTableRow) =>
          renderSemicolonChips(r.test_equipment, true, {
            singleLine: true,
            maxWidthPx: TEST_EQUIPMENT_COLUMN_WIDTH,
          }),
      },
      {
        key: 'evaluator_category',
        header: '评估人员类别',
        align: 'center',
        render: (r: DemandTableRow) => renderSemicolonChips(r.evaluator_category, true),
      },
      {
        key: 'actions',
        header: '操作',
        align: 'center',
        render: (r: DemandTableRow) => (
          <Button
            size="xs"
            variant="primary"
            className="whitespace-nowrap shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onViewDetail(r._itemIndex)
            }}
          >
            详情
          </Button>
        ),
      },
    ],
    [onViewDetail]
  )

  if (!items.length) {
    return (
      <div className="cnkis-project-list bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-12">
        <Empty message="暂无资源需求数据，请点击「上传执行订单」上传测试执行订单文件" />
      </div>
    )
  }

  if (filteredEntries.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="demands-project-code-filter" className="text-sm font-medium text-slate-600 dark:text-slate-400 shrink-0">
            项目编号
          </label>
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="demands-project-code-filter"
              type="search"
              value={projectCodeFilter}
              onChange={(e) => setProjectCodeFilter(e.target.value)}
              placeholder="模糊筛选项目编号"
              className="w-full min-h-10 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
              autoComplete="off"
            />
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-[#3b434e] p-12">
          <Empty message="无匹配项目编号，请调整筛选条件" />
        </div>
      </div>
    )
  }

  return (
    <div className="cnkis-project-list rounded-xl border border-slate-200 bg-white dark:border-[#3b434e] dark:bg-slate-800">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-[#3b434e]">
        <label htmlFor="demands-project-code-filter" className="text-sm font-medium text-slate-600 dark:text-slate-400 shrink-0">
          项目编号
        </label>
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id="demands-project-code-filter"
            type="search"
            value={projectCodeFilter}
            onChange={(e) => setProjectCodeFilter(e.target.value)}
            placeholder="模糊筛选项目编号"
            className="w-full min-h-10 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="overflow-x-auto" role="grid" aria-label="资源需求列表">
        <div className="min-w-[1200px]">
          <DataTable
            columns={columns}
            data={pageRows}
            rowKey={(r) => `${r.id}-${r._itemIndex}`}
            onRowClick={(r) => onViewDetail(r._itemIndex)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-3 text-xs text-slate-500 dark:border-[#3b434e] dark:text-slate-400">
        <span>共 {total} 条</span>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() => hasPrev && setPage((p) => p - 1)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            <ChevronLeft className="w-4 h-4" /> 上一页
          </button>
          <span className="text-slate-500 dark:text-slate-400">
            第 {page} / {totalPages} 页
          </span>
          <span className="flex items-center gap-1">
            <input
              key={page}
              type="number"
              min={1}
              max={totalPages}
              defaultValue={page}
              onKeyDown={(e) => e.key === 'Enter' && handlePageJump((e.target as HTMLInputElement).value)}
              className="w-12 rounded border border-slate-200 bg-white px-1.5 py-1 text-center text-slate-700 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:focus:ring-1 dark:focus:ring-slate-400"
              aria-label="跳转到页码"
            />
            <button
              type="button"
              onClick={(e) => {
                const input = e.currentTarget.previousElementSibling as HTMLInputElement | null
                if (input) handlePageJump(input.value)
              }}
              className="rounded border border-slate-200 bg-white px-2 py-1 text-slate-600 hover:bg-slate-50 dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              跳转
            </button>
          </span>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() => hasNext && setPage((p) => p + 1)}
            className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-[#3b434e] dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            下一页 <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
