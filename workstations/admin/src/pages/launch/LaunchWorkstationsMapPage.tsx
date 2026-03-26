import { useQuery } from '@tanstack/react-query'
import { launchGovernanceApi } from '@cn-kis/api-client'
import { ExternalLink, Layers } from 'lucide-react'

export function LaunchWorkstationsMapPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'launch-workstations-map'],
    queryFn: () => launchGovernanceApi.getWorkstationsMap(),
  })

  if (isLoading) {
    return <div className="text-sm text-slate-500 py-12 text-center">加载 19 台上线地图…</div>
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {(error as Error).message || '加载失败'}
      </div>
    )
  }

  const items = data?.items || []

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">工作台上线地图</h2>
        <p className="text-sm text-slate-500 mt-1">
          共 {data?.total ?? items.length} 个工作台（真相源：backend/configs/workstations.yaml）
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((ws) => (
          <div
            key={ws.key}
            className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">{ws.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{ws.path}</div>
                <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {ws.category === 'business' ? '业务台' : '平台台'} · {ws.stage_label}
                </div>
              </div>
              <a
                href={ws.path}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-slate-300 hover:text-slate-600"
                aria-label={`打开 ${ws.name}`}
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
            <div className="mt-3 flex gap-4 text-xs">
              <div>
                <span className="text-slate-400">配置账号</span>
                <div className="font-semibold text-slate-700">{ws.accounts_assigned}</div>
              </div>
              <div>
                <span className="text-slate-400">7 日活跃</span>
                <div className="font-semibold text-slate-700">{ws.active_7d}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
