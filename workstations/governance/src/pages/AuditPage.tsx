import { useState, useEffect } from 'react'
import { ClipboardList, RefreshCw, User, Clock } from 'lucide-react'
import { iamApi } from '@cn-kis/api-client'

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-emerald-50 text-emerald-700',
  LOGOUT: 'bg-slate-100 text-slate-600',
  CREATE: 'bg-blue-50 text-blue-700',
  UPDATE: 'bg-amber-50 text-amber-700',
  DELETE: 'bg-red-50 text-red-700',
  APPROVE: 'bg-purple-50 text-purple-700',
  EXPORT: 'bg-cyan-50 text-cyan-700',
}

const ACTION_LABELS: Record<string, string> = {
  LOGIN: '登录', LOGOUT: '登出', CREATE: '创建', UPDATE: '更新',
  DELETE: '删除', APPROVE: '审批', REJECT: '拒绝', SIGN: '签名',
  EXPORT: '导出', VIEW: '查看',
}

export function AuditPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pageSize = 20

  const fetchLogs = () => {
    setLoading(true)
    setError(null)
    iamApi.listAuditLogs({ page, page_size: pageSize, action: action || undefined })
      .then((res: any) => {
        const d = res?.data
        setLogs(d?.items ?? [])
        setTotal(d?.total ?? 0)
      })
      .catch(() => setError('审计日志加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchLogs() }, [page, action])

  const ACTIONS = ['', 'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'EXPORT']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">操作审计日志</h2>
          <p className="text-sm text-slate-500 mt-1">符合 GCP / 21 CFR Part 11 标准，共 {total} 条记录</p>
        </div>
        <button onClick={fetchLogs} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {ACTIONS.map(a => (
          <button
            key={a || 'all'}
            onClick={() => { setAction(a); setPage(1) }}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              action === a
                ? 'bg-blue-600 text-white border-blue-600'
                : 'text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {a ? (ACTION_LABELS[a] || a) : '全部'}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">加载中…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <ClipboardList className="w-8 h-8 mx-auto mb-2 text-slate-200" />
            暂无审计记录
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作者</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">动作</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">资源</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">描述</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="font-medium text-slate-800">{log.account_name || `#${log.account_id}`}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLORS[log.action] || 'bg-slate-100 text-slate-600'}`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <span className="text-xs text-slate-400">{log.resource_type}</span>
                    {log.resource_name && <span className="ml-1">{log.resource_name}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-xs truncate">{log.description || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.create_time).toLocaleString('zh-CN')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > pageSize && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">上一页</button>
          <span className="px-3 py-1 text-sm text-slate-500">{page} / {Math.ceil(total / pageSize)}</span>
          <button disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50">下一页</button>
        </div>
      )}
    </div>
  )
}
