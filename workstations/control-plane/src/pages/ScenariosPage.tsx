import { useQuery } from '@tanstack/react-query'
import { Layers, Link2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { ScenarioNav } from '@/components/ScenarioNav'
import { StatusBadge } from '@/components/StatusBadge'

export function ScenariosPage() {
  const scenariosQuery = useQuery({
    queryKey: ['control-plane', 'scenarios'],
    queryFn: () => controlPlaneApi.getScenarios(),
  })

  if (scenariosQuery.isLoading) return <QueryLoading loadingText="加载场景..." />
  if (scenariosQuery.error) return <QueryError error={scenariosQuery.error} />

  const scenarios = scenariosQuery.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Layers className="h-7 w-7 text-slate-600" />
          <h1 className="text-2xl font-semibold text-slate-900">场景中心</h1>
        </div>
        <Link
          to="/today-ops"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          今日运行
        </Link>
      </div>

      <ScenarioNav scenarios={scenarios} />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">业务场景</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((s) => (
            <Link
              key={s.id}
              to={`/scenarios/${s.id}`}
              className="flex flex-col rounded-xl border border-slate-200 p-4 transition hover:border-primary-200 hover:bg-primary-50/20"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium text-slate-900">{s.name}</span>
                <StatusBadge tone={s.status === 'ready' ? 'active' : s.status === 'degraded' ? 'warning' : 'critical'}>
                  {s.status === 'ready' ? '就绪' : s.status === 'degraded' ? '降级' : '阻塞'}
                </StatusBadge>
              </div>
              <p className="mt-2 flex-1 text-sm text-slate-600">{s.description}</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <span>{s.readyCount}/{s.totalCount} 类资源就绪</span>
                <Link2 className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
