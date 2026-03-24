import { useState, useEffect } from 'react'
import { Users, Shield, Key, Activity, AlertTriangle, CheckCircle } from 'lucide-react'
import { iamApi } from '@cn-kis/api-client'

interface DashboardStats {
  total_accounts: number
  active_accounts: number
  total_roles: number
  active_sessions: number
  today_logins: number
  token_alerts: number
}

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [tokenAlerts, setTokenAlerts] = useState<any[]>([])

  useEffect(() => {
    Promise.allSettled([
      iamApi.dashboard(),
      iamApi.tokenHealth(),
    ]).then(([dashRes, tokenRes]) => {
      if (dashRes.status === 'fulfilled') {
        const d = (dashRes.value as any)?.data
        if (d) setStats(d)
      }
      if (tokenRes.status === 'fulfilled') {
        const items = (tokenRes.value as any)?.data?.items ?? []
        setTokenAlerts(items.filter((i: any) => !i.is_healthy).slice(0, 5))
      }
    }).finally(() => setLoading(false))
  }, [])

  const cards = [
    { label: '活跃用户', value: stats?.active_accounts ?? '-', icon: Users, color: 'text-emerald-600 bg-emerald-50' },
    { label: '角色数量', value: stats?.total_roles ?? '-', icon: Shield, color: 'text-blue-600 bg-blue-50' },
    { label: '有效会话', value: stats?.active_sessions ?? '-', icon: Key, color: 'text-purple-600 bg-purple-50' },
    { label: '今日登录', value: stats?.today_logins ?? '-', icon: Activity, color: 'text-amber-600 bg-amber-50' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">管理驾驶舱</h2>
        <p className="text-sm text-slate-500 mt-1">身份与访问管理全局概览</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" />
              <div className="h-8 bg-slate-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {cards.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{s.label}</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{s.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                  <s.icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Token 健康告警
            {tokenAlerts.length > 0 && (
              <span className="ml-auto bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">
                {tokenAlerts.length} 个
              </span>
            )}
          </h3>
          {tokenAlerts.length === 0 ? (
            <p className="text-sm text-slate-400 flex items-center gap-1">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              所有 Token 运行健康
            </p>
          ) : (
            <ul className="space-y-2">
              {tokenAlerts.map((a: any) => (
                <li key={a.account_id} className="text-xs text-slate-600 flex justify-between">
                  <span className="font-medium">{a.username}</span>
                  <span className="text-red-500">需重新授权</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            系统状态
          </h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">总账号数</dt>
              <dd className="font-medium text-slate-800">{stats?.total_accounts ?? '-'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Token 告警</dt>
              <dd className={`font-medium ${(stats?.token_alerts ?? 0) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {stats?.token_alerts ?? '-'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
