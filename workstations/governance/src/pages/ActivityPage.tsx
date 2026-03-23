import { useState, useEffect, useCallback } from 'react'
import { Activity, RefreshCw, LogIn, User, Clock, Globe, LogOut, Edit, Trash2, Shield, Filter } from 'lucide-react'
import { iamApi } from '@cn-kis/api-client'

const ACTION_FILTERS = [
  { value: '', label: '全部' },
  { value: 'LOGIN', label: '登录', icon: LogIn, color: 'text-emerald-600 bg-emerald-50' },
  { value: 'LOGOUT', label: '登出', icon: LogOut, color: 'text-slate-600 bg-slate-50' },
  { value: 'UPDATE', label: '修改', icon: Edit, color: 'text-blue-600 bg-blue-50' },
  { value: 'DELETE', label: '删除', icon: Trash2, color: 'text-red-600 bg-red-50' },
  { value: 'ROLE_ASSIGN', label: '角色变更', icon: Shield, color: 'text-purple-600 bg-purple-50' },
  { value: 'PERMISSION_CHANGE', label: '权限变更', icon: Shield, color: 'text-amber-600 bg-amber-50' },
]

function ActionBadge({ action }: { action: string }) {
  const found = ACTION_FILTERS.find(f => f.value && action?.toUpperCase().includes(f.value))
  const Icon = found?.icon ?? Activity
  const color = found?.color ?? 'text-slate-600 bg-slate-50'
  const label = found?.label ?? action
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${color}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  )
}

export function ActivityPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<Record<string, number>>({})
  const pageSize = 25

  const fetchLogs = useCallback(() => {
    setLoading(true)
    setError(null)
    iamApi.listAuditLogs({ page, page_size: pageSize, ...(action ? { action } : {}) })
      .then((res: any) => {
        const d = res?.data
        setLogs(d?.items ?? [])
        setTotal(d?.total ?? 0)
      })
      .catch(() => setError('活动日志加载失败'))
      .finally(() => setLoading(false))
  }, [page, action])

  // 加载活动统计（各类型数量）
  const fetchStats = useCallback(() => {
    const types = ['LOGIN', 'LOGOUT', 'UPDATE', 'DELETE', 'ROLE_ASSIGN']
    Promise.allSettled(
      types.map(t =>
        iamApi.listAuditLogs({ page: 1, page_size: 1, action: t })
          .then((r: any) => ({ type: t, count: r?.data?.total ?? 0 }))
      )
    ).then(results => {
      const s: Record<string, number> = {}
      results.forEach(r => {
        if (r.status === 'fulfilled') s[r.value.type] = r.value.count
      })
      setStats(s)
    })
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { fetchStats() }, [fetchStats])

  const handleActionChange = (val: string) => {
    setAction(val)
    setPage(1)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">用户活动</h2>
          <p className="text-sm text-slate-500 mt-1">账号操作历史 · 共 {total.toLocaleString()} 条记录</p>
        </div>
        <button onClick={fetchLogs} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {/* 活动统计概览 */}
      <div className="grid grid-cols-5 gap-2">
        {ACTION_FILTERS.filter(f => f.value).map(f => {
          const Icon = f.icon!
          return (
            <button
              key={f.value}
              onClick={() => handleActionChange(action === f.value ? '' : f.value)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all ${
                action === f.value
                  ? 'border-blue-300 bg-blue-50 shadow-sm'
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${f.color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{f.label}</p>
                <p className="text-sm font-semibold text-slate-800">{stats[f.value] ?? '—'}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* 过滤栏 */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-slate-400" />
        <div className="flex gap-1 flex-wrap">
          {ACTION_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => handleActionChange(f.value)}
              className={`px-3 py-1 text-xs rounded-full border transition-all ${
                action === f.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">加载中…</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <Activity className="w-8 h-8 mx-auto mb-2 text-slate-200" />
            {action ? `暂无「${ACTION_FILTERS.find(f => f.value === action)?.label}」记录` : '暂无活动记录'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">用户</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">操作类型</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">资源 / 描述</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">来源 IP</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-800 truncate max-w-[120px]" title={log.account_name}>
                        {log.account_name || `#${log.account_id}`}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ActionBadge action={log.action ?? ''} />
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate" title={log.description || log.resource_name}>
                    <div className="flex items-center gap-1">
                      <Globe className="w-3 h-3 shrink-0" />
                      {log.resource_name || log.description || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                    {log.ip_address ?? '—'}
                  </td>
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(1)}
            className="px-2 py-1 text-xs border border-slate-200 rounded disabled:opacity-40 hover:bg-slate-50"
          >首页</button>
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
          >上一页</button>
          <span className="px-3 py-1 text-sm text-slate-500">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
          >下一页</button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(totalPages)}
            className="px-2 py-1 text-xs border border-slate-200 rounded disabled:opacity-40 hover:bg-slate-50"
          >末页</button>
        </div>
      )}
    </div>
  )
}
