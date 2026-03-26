import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { launchGovernanceApi, type WorkstationRegistryItem } from '@cn-kis/api-client'
import { workstationCardStyle } from '../lib/workstationCardStyle'

export function WorkstationOverviewPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'workstations-registry'],
    queryFn: () => launchGovernanceApi.getRegistry(),
  })

  const items = data?.items ?? []
  const total = data?.total ?? items.length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800">工作台总览</h2>
        <p className="text-sm text-slate-400 mt-1">
          系统共 {isLoading ? '…' : total} 个工作台（来源：backend/configs/workstations.yaml）
        </p>
      </div>

      {isLoading && (
        <p className="text-sm text-slate-500">正在加载注册表…</p>
      )}
      {isError && (
        <p className="text-sm text-red-600">无法加载工作台注册表，请确认已登录且具有相应权限后重试。</p>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <p className="text-sm text-amber-700">注册表为空，请检查后端配置 workstations.yaml。</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((ws: WorkstationRegistryItem) => {
          const path = ws.path || `/${ws.key}`
          const { color, logo } = workstationCardStyle(ws.key)
          return (
            <div
              key={ws.key}
              className={`rounded-xl border bg-white p-5 hover:shadow-md transition-shadow ${color.split(' ')[2] || 'border-slate-200'}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg font-bold ${color.split(' ').slice(0, 2).join(' ')}`}
                >
                  {logo}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-800">{ws.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{path}</div>
                </div>
                <a
                  href={path}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`打开 ${ws.name}`}
                  className="p-1 text-slate-300 hover:text-slate-600"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-slate-500">已部署</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
