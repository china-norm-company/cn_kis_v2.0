import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

export function TicketsPage() {
  const ticketsQuery = useQuery({
    queryKey: ['control-plane', 'tickets'],
    queryFn: controlPlaneApi.getTickets,
  })
  const eventsQuery = useQuery({
    queryKey: ['control-plane', 'events'],
    queryFn: controlPlaneApi.getEvents,
  })

  if (ticketsQuery.isLoading || eventsQuery.isLoading) {
    return <QueryLoading loadingText="正在加载工单列表..." />
  }

  if (ticketsQuery.error || eventsQuery.error) {
    return <QueryError error={ticketsQuery.error || eventsQuery.error} />
  }

  const tickets = ticketsQuery.data ?? []
  const events = eventsQuery.data ?? []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">工单中心</h1>
        <p className="mt-1 text-sm text-slate-500">第一版只保留轻量工单闭环，用来承接事件处置，不做复杂流程引擎。</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">全部工单</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">{tickets.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">处理中</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {tickets.filter((item) => item.status === 'processing').length}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">待处理</div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {tickets.filter((item) => item.status === 'todo').length}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {tickets.length > 0 ? (
          tickets.map((ticket) => {
            const eventItem = events.find((item) => item.id === ticket.relatedEventId)
            return (
              <div key={ticket.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Link to={`/tickets/${ticket.id}`} className="text-lg font-semibold text-slate-900 hover:text-primary-600">
                        {ticket.title}
                      </Link>
                      <StatusBadge tone={ticket.status}>
                        {ticket.status === 'todo' ? '待处理' : ticket.status === 'processing' ? '处理中' : '已完成'}
                      </StatusBadge>
                    </div>
                    <div className="text-sm text-slate-500">
                      {ticket.id} · 负责人 {ticket.assignee} · 更新时间 {ticket.updatedAt}
                    </div>
                    <div className="text-sm text-slate-600">
                      关联事件：
                      {eventItem ? (
                        <Link to={`/events/${eventItem.id}`} className="text-primary-600 hover:underline">
                          {eventItem.title}
                        </Link>
                      ) : (
                        ticket.relatedEventId
                      )}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    第一版建议直接支持：认领、处理中、已完成
                  </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
            当前没有工单。若对象已登记但尚未有工单，说明对应的规则、责任人策略或纳管任务模板还未生成。
          </div>
        )}
      </div>
    </div>
  )
}
