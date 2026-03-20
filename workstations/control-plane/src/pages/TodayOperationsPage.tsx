import { useQuery } from '@tanstack/react-query'
import {
  CalendarCheck,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Layers,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { WorkQueueCard } from '@/components/WorkQueueCard'
import { StatusBadge } from '@/components/StatusBadge'

export function TodayOperationsPage() {
  const summaryQuery = useQuery({
    queryKey: ['control-plane', 'dashboard-summary'],
    queryFn: controlPlaneApi.getDashboardSummary,
  })
  const scenariosQuery = useQuery({
    queryKey: ['control-plane', 'scenarios'],
    queryFn: () => controlPlaneApi.getScenarios(),
  })
  const depQuery = useQuery({
    queryKey: ['dependency-check'],
    queryFn: () => controlPlaneApi.getDependencyCheck(),
  })
  const healthQuery = useQuery({
    queryKey: ['resource-health'],
    queryFn: () => controlPlaneApi.getResourceHealth(),
  })

  const loading = summaryQuery.isLoading || scenariosQuery.isLoading || depQuery.isLoading
  const error = summaryQuery.error || scenariosQuery.error || depQuery.error

  if (loading) return <QueryLoading loadingText="正在加载今日运行..." />
  if (error) return <QueryError error={error} />

  const summary = summaryQuery.data
  const scenarios = scenariosQuery.data ?? []
  const dep = depQuery.data
  const health = healthQuery.data
  const canOpen = dep?.allOk ?? false
  const readyScenarios = scenarios.filter((s) => s.status === 'ready')
  const blockedScenarios = scenarios.filter((s) => s.status === 'blocked' || s.status === 'degraded')

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-7 w-7 text-slate-600" />
        <h1 className="text-2xl font-semibold text-slate-900">今日运行</h1>
      </div>

      {/* 开工能力 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          {canOpen ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-amber-500" />}
          今日开工能力
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          {canOpen
            ? '核心依赖自检通过，平台可正常开工。'
            : '部分核心依赖未就绪，请先处理依赖自检中的异常项。'}
        </p>
        {dep && (
          <div className="flex flex-wrap gap-2">
            {dep.checks.map((c) => (
              <span
                key={c.id}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                  c.status === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                {c.status === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
                {c.name}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Link to="/resource-health" className="text-sm font-medium text-primary-600 hover:underline">
            查看资源健康与依赖自检详情 →
          </Link>
        </div>
      </section>

      {/* 场景就绪矩阵 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Layers className="h-5 w-5 text-slate-600" />
          场景就绪
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scenarios.map((s) => (
            <Link
              key={s.id}
              to={`/scenarios/${s.id}`}
              className={`rounded-xl border p-4 transition ${
                s.status === 'ready'
                  ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
                  : 'border-amber-200 bg-amber-50/30 hover:bg-amber-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-900">{s.name}</span>
                <StatusBadge tone={s.status === 'ready' ? 'active' : s.status === 'degraded' ? 'warning' : 'critical'}>
                  {s.status === 'ready' ? '就绪' : s.status === 'degraded' ? '降级' : '阻塞'}
                </StatusBadge>
              </div>
              <p className="mt-1 text-xs text-slate-500">{s.description}</p>
              <p className="mt-2 text-xs text-slate-600">
                {s.readyCount}/{s.totalCount} 类资源就绪
              </p>
            </Link>
          ))}
        </div>
        <div className="mt-3">
          <Link to="/scenarios" className="text-sm font-medium text-primary-600 hover:underline">
            场景中心 →
          </Link>
        </div>
      </section>

      {/* 阻塞项与待处理 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            阻塞与风险
          </h2>
          {blockedScenarios.length > 0 ? (
            <ul className="space-y-2 text-sm text-slate-700">
              {blockedScenarios.map((s) => (
                <li key={s.id}>
                  <Link to={`/scenarios/${s.id}`} className="text-primary-600 hover:underline">
                    {s.name}
                  </Link>
                  <span className="ml-2 text-slate-500">未就绪，影响业务场景</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">当前无阻塞场景。</p>
          )}
          {health && health.problemCount > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              <Link to="/resource-health" className="text-primary-600 hover:underline">
                资源健康异常 {health.problemCount} 项
              </Link>
            </p>
          )}
        </section>

        <WorkQueueCard
          eventCount={summary?.openEventCount ?? 0}
          ticketCount={summary?.processingTicketCount ?? 0}
          loading={summaryQuery.isLoading}
        />
      </div>

      {/* 责任域待处理：最新事件摘要 */}
      {summary && summary.openEvents && summary.openEvents.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ClipboardList className="h-5 w-5 text-slate-600" />
            待跟进事件
          </h2>
          <ul className="space-y-2">
            {summary.openEvents.slice(0, 5).map((evt) => (
              <li key={evt.id}>
                <Link
                  to={`/events/${evt.id}`}
                  className="block rounded-lg border border-slate-100 p-3 text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{evt.title}</span>
                  <span className="ml-2 text-slate-500">{evt.owner} · {evt.detectedAt}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link to="/events" className="mt-3 inline-block text-sm font-medium text-primary-600 hover:underline">
            事件中心 →
          </Link>
        </section>
      )}
    </div>
  )
}
