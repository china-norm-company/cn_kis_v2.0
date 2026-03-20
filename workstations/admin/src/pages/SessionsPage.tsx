import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Key, Clock, Smartphone, Monitor, Globe } from 'lucide-react'

export function SessionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'sessions'],
    queryFn: () => api.get<any>('/auth/sessions/active'),
    retry: false,
  })

  const sessions = (data as any)?.data?.items ?? (data as any)?.data ?? []
  const isApiAvailable = !isLoading && data !== undefined

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">会话管理</h2>
        <p className="text-sm text-slate-400 mt-1">活跃登录会话</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">加载中...</div>
      ) : !isApiAvailable || sessions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Key className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            {!isApiAvailable ? '会话查询 API 尚未启用' : '暂无活跃会话'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            会话基于 SessionToken 模型，每次登录自动创建
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-5 py-3 font-medium">用户</th>
                <th className="text-left px-5 py-3 font-medium">设备</th>
                <th className="text-left px-5 py-3 font-medium">IP 地址</th>
                <th className="text-left px-5 py-3 font-medium">登录时间</th>
                <th className="text-left px-5 py-3 font-medium">过期时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sessions.map((s: any, i: number) => (
                <tr key={s.id || i} className="hover:bg-slate-50">
                  <td className="px-5 py-3 text-slate-700">{s.account_name || s.account_id}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1 text-slate-500">
                      {s.device_type === 'mobile' ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                      <span className="text-xs">{s.device_type || 'unknown'}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    <div className="flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      {s.ip_address || '--'}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {s.create_time?.slice(0, 16)?.replace('T', ' ') || '--'}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400">
                    {s.expire_time?.slice(0, 16)?.replace('T', ' ') || '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
