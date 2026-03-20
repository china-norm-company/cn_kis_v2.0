import { useQuery } from '@tanstack/react-query'
import {
  Card,
  Button,
  Input,
  Select,
  exportToCSV,
  exportToJSON,
  formatFilename,
} from '@cn-kis/ui-kit'
import { auditApi } from '@cn-kis/api-client'
import { useState, Fragment } from 'react'
import { Filter, ChevronDown, ChevronRight, Download } from 'lucide-react'

interface AuditLog {
  id: number
  action: string
  account_name: string
  resource_type: string
  resource_name: string
  description: string
  create_time: string
  old_value?: Record<string, unknown> | null
  new_value?: Record<string, unknown> | null
  [key: string]: unknown
}

const actionOptions = [
  { value: '', label: '全部' },
  { value: 'CREATE', label: 'CREATE' },
  { value: 'UPDATE', label: 'UPDATE' },
  { value: 'DELETE', label: 'DELETE' },
  { value: 'LOGIN', label: 'LOGIN' },
  { value: 'EXPORT', label: 'EXPORT' },
]

function formatValue(v: unknown): string {
  if (v == null) return '-'
  if (typeof v === 'object') return JSON.stringify(v, null, 2)
  return String(v)
}

function DiffView({ log }: { log: AuditLog }) {
  const hasDiff = log.old_value != null || log.new_value != null
  if (hasDiff) {
    return (
      <div className="grid grid-cols-1 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm sm:grid-cols-2">
        <div>
          <div className="font-medium text-slate-600 mb-2">变更前 (old_value)</div>
          <pre className="whitespace-pre-wrap break-words text-slate-700 bg-white p-3 rounded border border-slate-200 overflow-x-auto max-h-48">
            {formatValue(log.old_value)}
          </pre>
        </div>
        <div>
          <div className="font-medium text-slate-600 mb-2">变更后 (new_value)</div>
          <pre className="whitespace-pre-wrap break-words text-slate-700 bg-white p-3 rounded border border-slate-200 overflow-x-auto max-h-48">
            {formatValue(log.new_value)}
          </pre>
        </div>
      </div>
    )
  }
  return (
    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 text-sm text-slate-700">
      {log.description || '-'}
    </div>
  )
}

export function AuditLogPage() {
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showFilters, setShowFilters] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [filters, setFilters] = useState({
    action: '',
    operator: '',
    resource_type: '',
    date_from: '',
    date_to: '',
  })

  const exportParams = {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.operator ? { account_name: filters.operator } : {}),
    ...(filters.resource_type ? { resource_type: filters.resource_type } : {}),
    ...(filters.date_from ? { start_time: filters.date_from } : {}),
    ...(filters.date_to ? { end_time: filters.date_to } : {}),
  }

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, pageSize, filters],
    queryFn: () =>
      auditApi.list({
        page,
        page_size: pageSize,
        ...exportParams,
      }),
  })

  const items = (data?.data?.items ?? []) as unknown as AuditLog[]
  const total = data?.data?.total ?? 0

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((p) => ({ ...p, [key]: value }))
    setPage(1)
  }

  const handleClearFilters = () => {
    setFilters({
      action: '',
      operator: '',
      resource_type: '',
      date_from: '',
      date_to: '',
    })
    setPage(1)
  }

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleExport = async (format: 'csv' | 'json') => {
    setExporting(true)
    try {
      const res = await auditApi.export(exportParams)
      const items = (res?.data?.items ?? []) as unknown as AuditLog[]
      if (items.length === 0) {
        alert('没有数据可导出')
        return
      }
      const filename = formatFilename(`audit_logs_${new Date().toISOString().slice(0, 10)}`)
      if (format === 'csv') {
        exportToCSV(items, { filename, includeHeaders: true })
      } else {
        exportToJSON(items, { filename })
      }
      setExportOpen(false)
    } catch (e) {
      console.error('Export failed:', e)
      alert('导出失败，请重试')
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize) || 1

  return (
    <div className="space-y-5 md:space-y-6">
      <h1 className="text-xl font-bold text-slate-800 md:text-2xl">审计日志</h1>
      <Card>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={showFilters ? 'primary' : 'ghost'}
              size="sm"
              icon={<Filter className="w-4 h-4" />}
              onClick={() => setShowFilters((v) => !v)}
            >
              筛选
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExportOpen((v) => !v)}
                disabled={exporting}
                className="flex items-center gap-2"
              >
                {exporting ? (
                  <span className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                导出
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${exportOpen ? 'rotate-180' : ''}`}
                />
              </Button>
              {exportOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setExportOpen(false)}
                  />
                  <div className="absolute left-0 mt-2 w-40 bg-white rounded-lg shadow-lg border border-slate-200 z-20">
                    <div className="py-1">
                      <button
                        onClick={() => handleExport('csv')}
                        disabled={exporting}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
                      >
                        导出为 CSV
                      </button>
                      <button
                        onClick={() => handleExport('json')}
                        disabled={exporting}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50"
                      >
                        导出为 JSON
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              清除筛选
            </Button>
          </div>
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{ maxHeight: showFilters ? '240px' : '0' }}
          >
            <div className="flex items-end gap-4 overflow-x-auto py-3 px-4 bg-slate-50 rounded-lg border border-slate-200">
              <Input
                label="日期起"
                type="date"
                value={filters.date_from}
                onChange={(e) => handleFilterChange('date_from', e.target.value)}
                className="min-w-[160px] shrink-0"
              />
              <Input
                label="日期止"
                type="date"
                value={filters.date_to}
                onChange={(e) => handleFilterChange('date_to', e.target.value)}
                className="min-w-[160px] shrink-0"
              />
              <Select
                label="操作类型"
                value={filters.action}
                onChange={(e) => handleFilterChange('action', e.target.value)}
                options={actionOptions}
                className="min-w-[140px] shrink-0"
              />
              <Input
                label="操作人"
                value={filters.operator}
                onChange={(e) => handleFilterChange('operator', e.target.value)}
                placeholder="输入操作人"
                className="min-w-[180px] shrink-0"
              />
              <Input
                label="资源类型"
                value={filters.resource_type}
                onChange={(e) => handleFilterChange('resource_type', e.target.value)}
                placeholder="输入资源类型"
                className="min-w-[180px] shrink-0"
              />
            </div>
          </div>
        </div>
        <div className="p-1">
          <div className="w-full overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[980px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-10 px-2 py-3" />
                  <th className="px-4 py-3 text-sm font-semibold text-slate-700 text-left w-[180px]">
                    时间
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-slate-700 text-left w-[120px]">
                    操作类型
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-slate-700 text-left w-[120px]">
                    操作人
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-slate-700 text-left w-[120px]">
                    资源类型
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-slate-700 text-left w-[200px]">
                    操作对象
                  </th>
                  <th className="px-4 py-3 text-sm font-semibold text-slate-700 text-left">
                    详情
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center"
                    >
                      <div className="flex items-center justify-center gap-2 text-slate-500">
                        <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                        <span>加载中...</span>
                      </div>
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-slate-500"
                    >
                      暂无审计日志
                    </td>
                  </tr>
                ) : (
                  items.map((record) => {
                    const expanded = expandedIds.has(record.id)
                    return (
                      <Fragment key={record.id}>
                        <tr
                          className={`hover:bg-slate-50 transition-colors cursor-pointer ${expanded ? 'bg-slate-50' : ''}`}
                          onClick={() => toggleExpand(record.id)}
                        >
                          <td className="px-2 py-3">
                            {expanded ? (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {record.create_time
                              ? new Date(String(record.create_time)).toLocaleString('zh-CN')
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {record.action ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {record.account_name ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {record.resource_type ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {record.resource_name ?? '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {record.description ?? '-'}
                          </td>
                        </tr>
                        {expanded && (
                          <tr key={`${record.id}-exp`}>
                            <td colSpan={7} className="p-0">
                              <DiffView log={record} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-4 px-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm text-slate-500">共 {total} 条</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                </Button>
                <span className="text-sm text-slate-600">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
