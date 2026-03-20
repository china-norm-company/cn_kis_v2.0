import { useQuery } from '@tanstack/react-query'
import { FileSearch, AlertTriangle, History, ListChecks } from 'lucide-react'
import { Link } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

export function AuditAndChangePage() {
  const summaryQuery = useQuery({
    queryKey: ['control-plane', 'dashboard-summary'],
    queryFn: controlPlaneApi.getDashboardSummary,
  })
  const ticketsQuery = useQuery({
    queryKey: ['control-plane', 'tickets'],
    queryFn: controlPlaneApi.getTickets,
  })
  if (summaryQuery.isLoading || ticketsQuery.isLoading) {
    return <QueryLoading loadingText="加载变更与审计..." />
  }
  if (summaryQuery.error || ticketsQuery.error) {
    return <QueryError error={summaryQuery.error || ticketsQuery.error} />
  }

  const summary = summaryQuery.data
  const tickets = ticketsQuery.data ?? []
  const highRiskObjects = summary?.highRiskObjects ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FileSearch className="h-7 w-7 text-slate-600" />
        <h1 className="text-2xl font-semibold text-slate-900">变更与审计</h1>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <History className="h-5 w-5 text-slate-600" />
          今日变更与待闭环
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">未闭环事件</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{summary?.openEventCount ?? 0}</div>
            <Link to="/events" className="mt-2 inline-block text-sm font-medium text-primary-600 hover:underline">
              事件中心 →
            </Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">处理中工单</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{summary?.processingTicketCount ?? 0}</div>
            <Link to="/tickets" className="mt-2 inline-block text-sm font-medium text-primary-600 hover:underline">
              工单中心 →
            </Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">纳管对象</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{summary?.objectCount ?? 0}</div>
            <Link to="/objects" className="mt-2 inline-block text-sm font-medium text-primary-600 hover:underline">
              对象中心 →
            </Link>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm text-slate-500">全部工单</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{tickets.length}</div>
            <Link to="/tickets" className="mt-2 inline-block text-sm font-medium text-primary-600 hover:underline">
              工单中心 →
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          风险与异常
        </h2>
        {highRiskObjects.length > 0 ? (
          <ul className="space-y-2">
            {highRiskObjects.slice(0, 8).map((obj) => (
              <li key={obj.id}>
                <Link
                  to={`/objects/${obj.id}`}
                  className="block rounded-lg border border-slate-100 p-3 text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{obj.name}</span>
                  <span className="ml-2">
                    <StatusBadge tone={obj.riskLevel}>
                      {obj.riskLevel === 'high' ? '高' : '中'}
                    </StatusBadge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">当前无高风险对象。</p>
        )}
        <Link to="/resource-health" className="mt-3 inline-block text-sm font-medium text-primary-600 hover:underline">
          资源健康 →
        </Link>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <ListChecks className="h-5 w-5 text-slate-600" />
          执行记录（工单）
        </h2>
        {tickets.length > 0 ? (
          <ul className="space-y-2">
            {tickets.slice(0, 10).map((t) => (
              <li key={t.id}>
                <Link
                  to={`/tickets/${t.id}`}
                  className="block rounded-lg border border-slate-100 p-3 text-sm hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{t.title}</span>
                  <span className="ml-2">
                    <StatusBadge tone={t.status}>
                      {t.status === 'todo' ? '待处理' : t.status === 'processing' ? '处理中' : '已完成'}
                    </StatusBadge>
                  </span>
                  <span className="ml-2 text-slate-500">{t.assignee} · {t.updatedAt}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">暂无工单记录。</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <FileSearch className="h-5 w-5 text-slate-600" />
          审计检索
        </h2>
        <p className="text-sm text-slate-600">
          通过事件中心与工单中心可追踪事件来源、处置人与闭环结果；后续可对接工作流审批与操作日志，形成完整审计链。
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to="/events"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            按事件检索
          </Link>
          <Link
            to="/tickets"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            按工单检索
          </Link>
          <Link
            to="/objects"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            按对象检索
          </Link>
        </div>
      </section>
    </div>
  )
}
