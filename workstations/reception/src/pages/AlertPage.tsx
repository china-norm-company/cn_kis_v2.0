import { useQuery } from '@tanstack/react-query'
import { receptionApi } from '@cn-kis/api-client'
import { Bell, AlertTriangle, Info } from 'lucide-react'

const LEVEL_CONFIG = {
  warning: { icon: AlertTriangle, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  info: { icon: Info, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800' },
}

const TYPE_LABELS: Record<string, string> = {
  no_show: '未到访',
  overtime: '超时',
}

export default function AlertPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['reception-alerts'],
    queryFn: () => receptionApi.pendingAlerts(),
    refetchInterval: 60000,
  })

  const alerts = (data?.data as any)?.items ?? []

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell className="w-6 h-6 text-amber-600" />
          <h1 className="text-xl font-bold text-slate-800 md:text-2xl">待处理提醒</h1>
          {alerts.length > 0 && (
            <span className="inline-flex items-center justify-center w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full">
              {alerts.length > 99 ? '99+' : alerts.length}
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          刷新
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">加载中...</div>
      ) : alerts.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex flex-col items-center gap-3">
          <Bell className="w-12 h-12 text-slate-200" />
          <p className="text-slate-400 text-sm">暂无待处理提醒</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert: any, idx: number) => {
            const cfg = LEVEL_CONFIG[alert.level as keyof typeof LEVEL_CONFIG] ?? LEVEL_CONFIG.info
            const Icon = cfg.icon
            return (
              <div
                key={idx}
                className={`flex items-start gap-4 p-4 rounded-xl border ${cfg.bg} ${cfg.border}`}
              >
                <Icon className={`w-5 h-5 ${cfg.text} shrink-0 mt-0.5`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.badge}`}>
                      {TYPE_LABELS[alert.type] ?? alert.type}
                    </span>
                    <span className={`text-sm font-medium ${cfg.text}`}>{alert.subject_name} · {alert.subject_no}</span>
                  </div>
                  <p className={`text-sm mt-1 ${cfg.text}`}>{alert.message}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
