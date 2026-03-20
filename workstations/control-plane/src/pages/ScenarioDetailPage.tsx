import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, GitBranch, Layers } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

export function ScenarioDetailPage() {
  const { sceneId = '' } = useParams()
  const detailQuery = useQuery({
    queryKey: ['control-plane', 'scenario', sceneId],
    queryFn: () => controlPlaneApi.getScenarioDetail(sceneId),
    enabled: !!sceneId,
  })
  const topologyQuery = useQuery({
    queryKey: ['control-plane', 'scenario-topology', sceneId],
    queryFn: () => controlPlaneApi.getScenarioTopology(sceneId),
    enabled: !!sceneId,
  })

  if (detailQuery.isLoading) return <QueryLoading loadingText="加载场景详情..." />
  if (detailQuery.error) return <QueryError error={detailQuery.error} />

  const detail = detailQuery.data
  if (!detail) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        未找到该场景，请从场景中心进入。
      </div>
    )
  }

  const topology = topologyQuery.data

  return (
    <div className="space-y-6">
      <Link to="/scenarios" className="inline-flex items-center gap-2 text-sm font-medium text-primary-600">
        <ArrowLeft className="h-4 w-4" />
        返回场景中心
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Layers className="h-6 w-6 text-slate-600" />
          <h1 className="text-2xl font-semibold text-slate-900">{detail.name}</h1>
          <StatusBadge tone={detail.status === 'ready' ? 'active' : detail.status === 'degraded' ? 'warning' : 'critical'}>
            {detail.status === 'ready' ? '就绪' : detail.status === 'degraded' ? '降级' : '阻塞'}
          </StatusBadge>
        </div>
        <p className="mt-2 text-sm text-slate-600">{detail.description}</p>
        <p className="mt-2 text-xs text-slate-500">
          就绪 {detail.readyCount}/{detail.totalCount} 类资源
        </p>
      </section>

      {/* 资源组 / 类别就绪 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">依赖资源类别</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {detail.categories.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border p-4 ${
                c.health === 'healthy' ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">{c.name}</span>
                <StatusBadge tone={c.health === 'healthy' ? 'active' : 'warning'}>{c.health === 'healthy' ? '健康' : '异常'}</StatusBadge>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                在线 {c.online}/{c.total}，告警 {c.warning}，离线 {c.offline}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 拓扑 / 依赖图 */}
      {topology && topology.nodes.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <GitBranch className="h-5 w-5" />
            依赖关系
          </h2>
          <div className="flex flex-wrap gap-3">
            {topology.nodes.map((n) => (
              <span
                key={n.id}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                  n.health === 'healthy' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                {n.label}
              </span>
            ))}
            {topology.edges.length > 0 && (
              <span className="text-xs text-slate-400">
                边: {topology.edges.map((e) => `${e.from}→${e.to}`).join(', ')}
              </span>
            )}
          </div>
        </section>
      )}

      <div className="flex gap-3">
        <Link to="/events" className="text-sm font-medium text-primary-600 hover:underline">
          关联事件
        </Link>
        <Link to="/tickets" className="text-sm font-medium text-primary-600 hover:underline">
          关联工单
        </Link>
      </div>
    </div>
  )
}
