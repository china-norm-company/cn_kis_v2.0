import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auditApi } from '@cn-kis/api-client'
import { FileText, Search, Download, Clock, User, ChevronLeft, ChevronRight } from 'lucide-react'

export function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', page, search, action],
    queryFn: () => auditApi.list({
      page,
      page_size: pageSize,
      account_name: search || undefined,
      action: action || undefined,
    }),
  })

  const items = (data as any)?.data?.items ?? []
  const total = (data as any)?.data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  const handleExport = async () => {
    try {
      const result = await auditApi.export({
        account_name: search || undefined,
        action: action || undefined,
      })
      const exportItems = (result as any)?.items ?? []
      const csv = [
        ['时间', '操作人', '动作', '资源类型', '资源ID', 'IP'].join(','),
        ...exportItems.map((log: any) => [
          log.create_time,
          log.account_name || '',
          log.action || '',
          log.resource_type || '',
          log.resource_id || '',
          log.ip_address || '',
        ].join(',')),
      ].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('导出失败')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">审计日志</h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600 hover:bg-slate-200"
        >
          <Download className="w-4 h-4" />
          导出 CSV
        </button>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="按操作人搜索..."
            className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:border-primary-300 focus:ring-1 focus:ring-primary-200 outline-none"
          />
        </div>
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1) }}
          aria-label="操作类型筛选"
          className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600"
        >
          <option value="">全部操作</option>
          <option value="create">创建</option>
          <option value="update">更新</option>
          <option value="delete">删除</option>
          <option value="login">登录</option>
          <option value="export">导出</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr>
              <th className="text-left px-5 py-3 font-medium">时间</th>
              <th className="text-left px-5 py-3 font-medium">操作人</th>
              <th className="text-left px-5 py-3 font-medium">动作</th>
              <th className="text-left px-5 py-3 font-medium">资源</th>
              <th className="text-left px-5 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
              <tr><td colSpan={5} className="py-12 text-center text-slate-400">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-slate-400">暂无审计日志</td></tr>
            ) : (
              items.map((log: any) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {log.create_time?.slice(0, 16)?.replace('T', ' ')}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-700">{log.account_name || '系统'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-500 max-w-xs truncate">
                    {log.resource_type}
                    {log.resource_id && <span className="text-slate-400"> #{log.resource_id}</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-400 text-xs">{log.ip_address || '--'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">共 {total} 条记录</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="上一页"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-slate-600">{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="下一页"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
