import { useState, useEffect } from 'react'
import { Key, RefreshCw, Search } from 'lucide-react'
import { iamApi } from '@cn-kis/api-client'

export function PermissionsPage() {
  const [permissions, setPermissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const fetchPermissions = () => {
    setLoading(true)
    setError(null)
    iamApi.listPermissions()
      .then((res: any) => {
        setPermissions(res?.data?.items ?? [])
      })
      .catch(() => setError('权限列表加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchPermissions() }, [])

  const filtered = permissions.filter(p =>
    !filter || p.code?.includes(filter) || p.name?.includes(filter) || p.category?.includes(filter)
  )

  const grouped = filtered.reduce((acc: Record<string, any[]>, p: any) => {
    const cat = p.category || '其他'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(p)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">权限矩阵</h2>
          <p className="text-sm text-slate-500 mt-1">系统全量权限码，共 {permissions.length} 个</p>
        </div>
        <button onClick={fetchPermissions} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="搜索权限码或名称…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm animate-pulse">加载中…</div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, perms]) => (
            <div key={category} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                <Key className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">{category}</span>
                <span className="ml-auto text-xs text-slate-400">{(perms as any[]).length} 个</span>
              </div>
              <div className="divide-y divide-slate-50">
                {(perms as any[]).map((p: any) => (
                  <div key={p.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50">
                    <code className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">{p.code}</code>
                    <span className="text-sm text-slate-600">{p.name || p.code}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(grouped).length === 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-sm">
              无匹配权限
            </div>
          )}
        </div>
      )}
    </div>
  )
}
