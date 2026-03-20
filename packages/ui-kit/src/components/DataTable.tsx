/**
 * DataTable - IBKD规范数据表格组件
 */
import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './Button'

export interface Column<T> {
  key: string | number
  title?: string
  header?: string
  width?: string | number
  align?: 'left' | 'center' | 'right'
  render?: ((value: unknown, record: T, index: number) => React.ReactNode) | ((record: T) => React.ReactNode)
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  emptyText?: string
  rowKey?: string | ((record: T) => string)
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
}

export function DataTable<T extends object>({
  columns,
  data,
  loading = false,
  emptyText = '暂无数据',
  rowKey = 'id',
  onRowClick,
  currentPage,
  page,
  pageSize,
  total,
  onPageChange,
  pagination,
}: DataTableProps<T>) {
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

  return (
    <div className="w-full">
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            <div className="inline-flex items-center gap-2">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              <span>加载中...</span>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {emptyText}
          </div>
        ) : (
          data.map((record, index) => (
            <div
              key={getRowKey(record, index)}
              className={clsx(
                'space-y-2 rounded-lg border border-slate-200 bg-white p-4',
                onRowClick && 'cursor-pointer'
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
                    <span className="shrink-0 text-xs font-medium text-slate-500">{title}</span>
                    <div className="min-w-0 text-right text-sm text-slate-700">{rendered}</div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 md:block">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={clsx(
                    'px-4 py-3 text-sm font-semibold text-slate-700',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right'
                  )}
                  style={{ width: col.width }}
                >
                  {col.title ?? col.header ?? String(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-500">
                    <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    <span>加载中...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((record, index) => (
                <tr
                  key={getRowKey(record, index)}
                  className={clsx(
                    'hover:bg-slate-50 transition-colors',
                    onRowClick && 'cursor-pointer'
                  )}
                  onClick={() => onRowClick?.(record)}
                >
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className={clsx(
                        'px-4 py-3 text-sm text-slate-600',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right'
                      )}
                    >
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
        </table>
      </div>

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

