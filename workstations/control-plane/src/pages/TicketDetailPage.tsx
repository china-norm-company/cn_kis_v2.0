import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ClipboardList, Link2, PlayCircle } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

export function TicketDetailPage() {
  const { ticketId = '' } = useParams()
  const queryClient = useQueryClient()
  const ticketQuery = useQuery({
    queryKey: ['control-plane', 'ticket', ticketId],
    queryFn: () => controlPlaneApi.getTicket(ticketId),
    enabled: !!ticketId,
  })
  const eventsQuery = useQuery({
    queryKey: ['control-plane', 'events'],
    queryFn: controlPlaneApi.getEvents,
  })
  const transitionMutation = useMutation({
    mutationFn: (status: 'todo' | 'processing' | 'done') => controlPlaneApi.transitionTicket(ticketId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['control-plane', 'ticket', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['control-plane', 'tickets'] })
    },
  })

  if (ticketQuery.isLoading || eventsQuery.isLoading) {
    return <QueryLoading loadingText="正在加载工单详情..." />
  }

  if (ticketQuery.error || eventsQuery.error) {
    return <QueryError error={ticketQuery.error || eventsQuery.error} />
  }

  const ticketItem = ticketQuery.data
  const events = eventsQuery.data ?? []
  const relatedEvent = ticketItem ? events.find((e) => e.id === ticketItem.relatedEventId) : null

  if (!ticketItem) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        未找到工单，请先从工单中心进入。
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/tickets" className="inline-flex items-center gap-2 text-sm font-medium text-primary-600">
        <ArrowLeft className="h-4 w-4" />
        返回工单中心
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{ticketItem.title}</h1>
              <StatusBadge tone={ticketItem.status}>
                {ticketItem.status === 'todo' ? '待处理' : ticketItem.status === 'processing' ? '处理中' : '已完成'}
              </StatusBadge>
            </div>
            <div className="text-sm text-slate-500">
              {ticketItem.id} · 负责人 {ticketItem.assignee} · 更新时间 {ticketItem.updatedAt}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ticketItem.status !== 'processing' && (
              <button
                type="button"
                onClick={() => transitionMutation.mutate('processing')}
                disabled={transitionMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                <PlayCircle className="h-4 w-4" />
                认领 / 处理中
              </button>
            )}
            {ticketItem.status !== 'done' && (
              <button
                type="button"
                onClick={() => transitionMutation.mutate('done')}
                disabled={transitionMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                已完成
              </button>
            )}
            {ticketItem.status === 'done' && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-600">
                <Check className="h-4 w-4" />
                已闭环
              </span>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div className="flex items-center gap-2 font-medium text-slate-700">
              <ClipboardList className="h-4 w-4" />
              工单信息
            </div>
            <div className="mt-2">责任人：{ticketItem.assignee}；状态流转后将在列表中更新，后续可对接工单系统持久化。</div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">关联事件</h2>
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link2 className="h-4 w-4" />
            工单由事件驱动生成，处置事件即可推进工单闭环
          </div>
          {relatedEvent ? (
            <div className="mt-3">
              <Link
                to={`/events/${relatedEvent.id}`}
                className="inline-flex items-center gap-1 text-base font-medium text-primary-600 hover:underline"
              >
                {relatedEvent.title}
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </Link>
              <div className="mt-1 text-sm text-slate-500">
                {relatedEvent.category} · {relatedEvent.detectedAt} · 责任人 {relatedEvent.owner}
              </div>
              <div className="mt-2 text-sm text-slate-600">{relatedEvent.summary}</div>
            </div>
          ) : (
            <div className="mt-3 text-sm text-slate-500">未找到关联事件记录。</div>
          )}
        </div>
      </section>
    </div>
  )
}
