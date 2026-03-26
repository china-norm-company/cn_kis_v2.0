/**
 * DataTable - IBKD规范数据表格组件
 */
import { useRef, useEffect, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

export interface Column<T> {
  key: string | number
  title?: string
  header?: string
  /** 自定义表头内容，优先于 title/header */
  headerRender?: React.ReactNode
  width?: string | number
  align?: 'left' | 'center' | 'right'
  /** 追加到表头 th（如压缩前几列与下一列的视觉间距） */
  headerClassName?: string
  /** 追加到数据 td（桌面端表格） */
  cellClassName?: string
  /**
   * 单元格内容垂直对齐（表头与数据列一致用 middle；多行大块内容如「签署进度」可用 top；
   * 与 top 同列搭配时，操作列可用 bottom 使按钮与左侧大块内容底部对齐）
   */
  cellVAlign?: 'top' | 'middle' | 'bottom'
  render?: ((value: unknown, record: T, index: number) => React.ReactNode) | ((record: T) => React.ReactNode)
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyText?: string
  rowKey?: string | ((record: T) => string)
  /** 自定义行 className（如新建高亮） */
  rowClassName?: (record: T, index: number) => string | undefined
  onRowClick?: (record: T) => void
  currentPage?: number
  page?: number
  pageSize?: number
  total?: number
  onPageChange?: (page: number) => void
  pagination?: {
    current: number
    pageSize: number
    total: number
    onChange: (page: number) => void
  }
  /**
   * 桌面端将 thead / tbody 拆成两个同源 table（colgroup 对齐），并同步横向滚动。
   * 传入的回调用于把「仅表头」表格与页面标题、筛选等放在一起；与表体之间用 flex 分区，表体区域单独 overflow，避免整页滚动 + sticky 时表行叠在标题之上。
   */
  renderDesktopStickyCluster?: (headerTable: ReactNode) => ReactNode
  /**
   * 紧凑模式：减小单元格左右内边距，便于宽表在小屏一屏内展示（仍依赖列宽总和与横向滚动容器）。
   */
  density?: 'default' | 'compact'
  /**
   * 桌面端 sticky 布局下，表体横向滚动容器的外侧负边距与内边距（需与 renderDesktopStickyCluster 内层与分页条对齐）。
   * 默认略宽；知情管理等宽表可传 `-mx-2 px-2 md:-mx-5 md:px-5` 让出横向像素。
   */
  desktopStickyScrollGutterClassName?: string
}

export function DataTable<T extends object>({
  columns,
  data,
  loading = false,
  emptyText = '暂无数据',
  rowKey = 'id',
  rowClassName,
  onRowClick,
  currentPage,
  page,
  pageSize,
  total,
  onPageChange,
  pagination,
  renderDesktopStickyCluster,
  density = 'default',
  desktopStickyScrollGutterClassName = '-mx-3 px-3 md:-mx-6 md:px-6',
}: DataTableProps<T>) {
  const compact = density === 'compact'
  const desktopHeadScrollRef = useRef<HTMLDivElement>(null)
  const desktopBodyScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!renderDesktopStickyCluster) return
    const headEl = desktopHeadScrollRef.current
    const bodyEl = desktopBodyScrollRef.current
    if (!headEl || !bodyEl) return
    const syncHead = () => {
      bodyEl.scrollLeft = headEl.scrollLeft
    }
    const syncBody = () => {
      headEl.scrollLeft = bodyEl.scrollLeft
    }
    headEl.addEventListener('scroll', syncHead, { passive: true })
    bodyEl.addEventListener('scroll', syncBody, { passive: true })
    return () => {
      headEl.removeEventListener('scroll', syncHead)
      bodyEl.removeEventListener('scroll', syncBody)
    }
  }, [renderDesktopStickyCluster, columns, data, loading])
  const resolvedPagination = pagination ?? (
    typeof (currentPage ?? page) === 'number' &&
    typeof pageSize === 'number' &&
    typeof total === 'number' &&
    typeof onPageChange === 'function'
      ? { current: (currentPage ?? page) as number, pageSize, total, onChange: onPageChange }
      : undefined
  )

  const getRowKey = (record: T, index: number): string => {
    if (typeof rowKey === 'function') return rowKey(record)
    return String((record as Record<string, unknown>)[rowKey] ?? index)
  }

  const getValue = (record: T, key: string): unknown => {
    return key.split('.').reduce<unknown>(
      (obj, k) => (obj != null && typeof obj === 'object' ? (obj as Record<string, unknown>)[k] : undefined),
      record
    )
  }

  const totalPages = resolvedPagination
    ? Math.ceil(resolvedPagination.total / resolvedPagination.pageSize)
    : 0

  const headerCellClass = (col: Column<T>) =>
    clsx(
      compact ? 'px-2 py-2 text-xs font-semibold text-slate-700 whitespace-nowrap' : 'px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap',
      'border-b border-slate-200',
      col.cellVAlign === 'top' ? 'align-top' : 'align-middle',
      col.align === 'center' && 'text-center',
      col.align === 'right' && 'text-right',
      (!col.align || col.align === 'left') && 'text-left',
    )

  const bodyCellClass = (col: Column<T>) =>
    clsx(
      compact ? 'px-2 py-2 text-sm text-slate-600' : 'px-4 py-3 text-sm text-slate-600',
      'border-b border-slate-200',
      col.cellVAlign === 'top'
        ? 'align-top'
        : col.cellVAlign === 'bottom'
          ? 'align-bottom'
          : 'align-middle',
      col.align === 'center' && 'text-center',
      col.align === 'right' && 'text-right',
      (!col.align || col.align === 'left') && 'text-left',
    )

  const colgroup = (
    <colgroup>
      {columns.map((col) => (
        <col key={String(col.key)} style={col.width != null ? { width: col.width } : undefined} />
      ))}
    </colgroup>
  )

  const theadRow = (
    <thead className="bg-slate-50">
      <tr>
        {columns.map((col) => (
          <th
            key={String(col.key)}
            className={clsx(headerCellClass(col), col.headerClassName)}
            style={col.width != null ? { width: col.width, minWidth: col.width } : undefined}
          >
            {col.headerRender ?? col.title ?? col.header ?? String(col.key)}
          </th>
        ))}
      </tr>
    </thead>
  )

  /** 行间分隔画在 td/th 上：border-separate + table-fixed 时 divide-y 对 tr 常不生效 */
  const tbodySection = (
    <tbody className="bg-white [&>tr:last-child>td]:border-b-0">
      {loading ? (
        <tr>
          <td colSpan={columns.length} className={compact ? 'px-2 py-6 text-center' : 'px-4 py-8 text-center'}>
            <div className="flex items-center justify-center gap-2 text-slate-500">
              <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <span>加载中...</span>
            </div>
          </td>
        </tr>
      ) : data.length === 0 ? (
        <tr>
          <td colSpan={columns.length} className={compact ? 'px-2 py-6 text-center text-slate-500' : 'px-4 py-8 text-center text-slate-500'}>
            {emptyText}
          </td>
        </tr>
      ) : (
        data.map((record, index) => (
          <tr
            key={getRowKey(record, index)}
            className={clsx(
              'hover:bg-slate-50 transition-colors',
              onRowClick && 'cursor-pointer',
              rowClassName?.(record, index)
            )}
            onClick={() => onRowClick?.(record)}
          >
            {columns.map((col) => (
              <td key={String(col.key)} className={clsx(bodyCellClass(col), col.cellClassName)}>
                {col.render
                  ? ((col.render as any).length <= 1
                    ? (col.render as (record: T) => React.ReactNode)(record)
                    : (col.render as (value: unknown, record: T, index: number) => React.ReactNode)(
                      getValue(record, String(col.key)),
                      record,
                      index
                    ))
                  : String(getValue(record, String(col.key)) ?? '-')}
              </td>
            ))}
          </tr>
        ))
      )}
    </tbody>
  )

  const rootClass = clsx(
    'w-full',
    renderDesktopStickyCluster && 'flex min-h-0 flex-1 flex-col isolate',
  )

  return (
    <div className={rootClass}>
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div
            className={
              compact
                ? 'rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500'
                : 'rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500'
            }
          >
            <div className="inline-flex items-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              <span>加载中...</span>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div
            className={
              compact
                ? 'rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500'
                : 'rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500'
            }
          >
            {emptyText}
          </div>
        ) : (
          data.map((record, index) => (
            <div
              key={getRowKey(record, index)}
              className={clsx(
                compact ? 'space-y-1.5 rounded-lg border border-slate-200 bg-white p-3' : 'space-y-2 rounded-lg border border-slate-200 bg-white p-4',
                'hover:bg-slate-50 transition-colors',
                onRowClick && 'cursor-pointer',
                rowClassName?.(record, index)
              )}
              onClick={() => onRowClick?.(record)}
            >
              {columns.map((col) => {
                const title = col.title ?? col.header ?? String(col.key)
                const rendered = col.render
                  ? ((col.render as any).length <= 1
                    ? (col.render as (record: T) => React.ReactNode)(record)
                    : (col.render as (value: unknown, record: T, index: number) => React.ReactNode)(
                      getValue(record, String(col.key)),
                      record,
                      index
                    ))
                  : String(getValue(record, String(col.key)) ?? '-')
                return (
                  <div key={String(col.key)} className="flex items-start justify-between gap-3">
                    <span className="shrink-0 text-xs font-medium text-slate-500 whitespace-nowrap">{title}</span>
                    <div className="min-w-0 text-right text-sm text-slate-700">{rendered}</div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      {renderDesktopStickyCluster ? (
        <div className="hidden min-h-0 flex-1 flex-col overflow-hidden md:flex md:min-h-0">
          <div className="relative z-10 shrink-0">
            {renderDesktopStickyCluster(
              <div ref={desktopHeadScrollRef} className="overflow-x-auto">
                <table className="w-full table-fixed border-separate border-spacing-0">
                  {colgroup}
                  {theadRow}
                </table>
              </div>,
            )}
          </div>
          <div
            ref={desktopBodyScrollRef}
            className={clsx(
              'relative z-0 min-h-0 flex-1 overflow-auto',
              desktopStickyScrollGutterClassName,
            )}
          >
            <div className="rounded-b-xl border border-t-0 border-slate-200 bg-white">
              <table className="w-full table-fixed border-separate border-spacing-0">
                {colgroup}
                {tbodySection}
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
          <table className="w-full">
            {colgroup}
            {theadRow}
            {tbodySection}
          </table>
        </div>
      )}

      {/* 分页 */}
      {resolvedPagination && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <span className="text-sm text-slate-500">
            共 {resolvedPagination.total} 条
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={resolvedPagination.current <= 1}
              onClick={() => resolvedPagination.onChange(resolvedPagination.current - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-600">
              {resolvedPagination.current} / {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={resolvedPagination.current >= totalPages}
              onClick={() => resolvedPagination.onChange(resolvedPagination.current + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

