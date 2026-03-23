import { useState, useEffect } from 'react'
import { Search, RefreshCw, UserCheck, UserX } from 'lucide-react'
import { iamApi } from '@cn-kis/api-client'
import type { AccountSummary } from '@cn-kis/api-client'

export function UsersPage() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pageSize = 20

  const fetchAccounts = () => {
    setLoading(true)
    setError(null)
    iamApi.listAccounts({ page, page_size: pageSize, keyword: keyword || undefined })
      .then((res: any) => {
        const data = res?.data
        if (data) {
          setAccounts(data.items ?? [])
          setTotal(data.total ?? 0)
        }
      })
      .catch(() => setError('加载失败，请检查权限或稍后重试'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAccounts() }, [page, keyword])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">用户管理</h2>
        <span className="text-sm text-slate-500">共 {total} 个账号</span>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
            placeholder="搜索用户名或姓名…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={fetchAccounts} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">加载中…</div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">暂无用户数据</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">用户</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">邮箱</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">角色</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">最后登录</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{a.display_name || a.username}</div>
                    <div className="text-xs text-slate-400">{a.username}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.email || '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(a.roles || []).slice(0, 3).map((r) => (
                        <span key={r} className="inline-block bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{r}</span>
                      ))}
                      {(a.roles || []).length > 3 && (
                        <span className="text-xs text-slate-400">+{a.roles.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.is_active ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                        <UserCheck className="w-3 h-3" /> 活跃
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 text-xs">
                        <UserX className="w-3 h-3" /> 停用
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {a.last_login ? new Date(a.last_login).toLocaleString('zh-CN') : '从未'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {total > pageSize && (
        <div className="flex justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
          >
            上一页
          </button>
          <span className="px-3 py-1 text-sm text-slate-500">
            {page} / {Math.ceil(total / pageSize)}
          </span>
          <button
            disabled={page >= Math.ceil(total / pageSize)}
            onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  )
}
