import { useState, useEffect } from 'react'
import { Key, RefreshCw, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { iamApi } from '@cn-kis/api-client'

interface TokenInfo {
  account_id: number
  username: string
  has_token: boolean
  access_token_expires_at: string | null
  refresh_token_expires_at: string | null
  is_healthy: boolean
  days_until_refresh_expires: number | null
}

function HealthBadge({ healthy, days }: { healthy: boolean; days: number | null }) {
  if (!healthy) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
        <XCircle className="w-3 h-3" /> 需重新授权
      </span>
    )
  }
  if (days !== null && days < 7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" /> {days}天后过期
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">
      <CheckCircle className="w-3 h-3" /> 健康
    </span>
  )
}

export function SessionsPage() {
  const [tokens, setTokens] = useState<TokenInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTokens = () => {
    setLoading(true)
    setError(null)
    iamApi.tokenHealth()
      .then((res: any) => {
        setTokens(res?.data?.items ?? [])
      })
      .catch(() => setError('Token 健康数据加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchTokens() }, [])

  const healthy = tokens.filter(t => t.is_healthy).length
  const unhealthy = tokens.filter(t => !t.is_healthy).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">会话与 Token 健康</h2>
          <p className="text-sm text-slate-500 mt-1">飞书授权 token 状态监控</p>
        </div>
        <button onClick={fetchTokens} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-sm text-slate-500">总授权账号</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{tokens.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <p className="text-sm text-emerald-600">Token 健康</p>
          <p className="text-2xl font-bold text-emerald-700 mt-1">{healthy}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-4">
          <p className="text-sm text-red-600">需重新授权</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{unhealthy}</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm animate-pulse">加载中…</div>
        ) : tokens.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            <Key className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            暂无 token 数据（或无权查看）
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-600">账号</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Access Token 过期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Refresh Token 过期</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tokens.map((t) => (
                <tr key={t.account_id} className={`hover:bg-slate-50 ${!t.is_healthy ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3 font-medium text-slate-800">{t.username}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {t.access_token_expires_at ? new Date(t.access_token_expires_at).toLocaleString('zh-CN') : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {t.refresh_token_expires_at ? new Date(t.refresh_token_expires_at).toLocaleString('zh-CN') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <HealthBadge healthy={t.is_healthy} days={t.days_until_refresh_expires} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
