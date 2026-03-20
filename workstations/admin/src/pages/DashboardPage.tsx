import { useQuery } from '@tanstack/react-query'
import { identityApi, auditApi } from '@cn-kis/api-client'
import { Users, Shield, Activity, FileText, Server, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function DashboardPage() {
  const navigate = useNavigate()

  const { data: accountsData } = useQuery({
    queryKey: ['admin', 'accounts-summary'],
    queryFn: () => identityApi.listAccounts({ page: 1, page_size: 1 }),
  })

  const { data: rolesData } = useQuery({
    queryKey: ['admin', 'roles-summary'],
    queryFn: () => identityApi.listRoles(),
  })

  const { data: auditData } = useQuery({
    queryKey: ['admin', 'audit-recent'],
    queryFn: () => auditApi.list({ page: 1, page_size: 5 }),
  })

  const totalAccounts = (accountsData as any)?.data?.total ?? 0
  const totalRoles = (rolesData as any)?.data?.length ?? 0
  const recentAudits = (auditData as any)?.data?.items ?? []

  const statsCards = [
    { icon: Users, label: '系统账号', value: totalAccounts, color: 'bg-blue-50 text-blue-600', path: '/accounts' },
    { icon: Shield, label: '角色数量', value: totalRoles, color: 'bg-amber-50 text-amber-600', path: '/roles' },
    { icon: FileText, label: '审计日志', value: '查看', color: 'bg-emerald-50 text-emerald-600', path: '/audit' },
    { icon: Server, label: '工作台', value: 15, color: 'bg-purple-50 text-purple-600', path: '/workstations' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">系统管理概览</h2>
        <p className="text-sm text-slate-400 mt-1">CN KIS V1.0 管理后台</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((card) => (
          <div
            key={card.label}
            onClick={() => navigate(card.path)}
            className="rounded-xl border border-slate-200 bg-white p-5 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-slate-800">{card.value}</div>
              <div className="text-sm text-slate-400">{card.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-700">最近操作日志</h3>
          <button
            onClick={() => navigate('/audit')}
            className="text-xs text-primary-600 hover:underline"
          >
            查看全部
          </button>
        </div>
        <div className="divide-y divide-slate-50">
          {recentAudits.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">暂无审计日志</div>
          ) : (
            recentAudits.map((log: any) => (
              <div key={log.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                  <Activity className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-700 truncate">
                    <span className="font-medium">{log.account_name || '系统'}</span>
                    {' '}{log.action}{' '}
                    <span className="text-slate-400">{log.resource_type}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                  <Clock className="w-3 h-3" />
                  {log.create_time?.slice(0, 16)?.replace('T', ' ')}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
