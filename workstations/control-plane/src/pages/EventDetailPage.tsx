import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ClipboardPlus, Server } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'
import { ImpactSummaryPanel } from '@/components/ImpactSummaryPanel'
import { UnifiedActionPanel } from '@/components/UnifiedActionPanel'

export function EventDetailPage() {
  const { eventId = '' } = useParams()
  const eventQuery = useQuery({
    queryKey: ['control-plane', 'event', eventId],
    queryFn: () => controlPlaneApi.getEvent(eventId),
    enabled: !!eventId,
  })
  const ticketsQuery = useQuery({
    queryKey: ['control-plane', 'event-tickets', eventId],
    queryFn: () => controlPlaneApi.getEventTickets(eventId),
    enabled: !!eventId,
  })
  const impactQuery = useQuery({
    queryKey: ['control-plane', 'event-impact', eventId],
    queryFn: () => controlPlaneApi.getEventImpact(eventId),
    enabled: !!eventId,
  })
  const objectsQuery = useQuery({
    queryKey: ['control-plane', 'objects'],
    queryFn: controlPlaneApi.getObjects,
  })

  if (eventQuery.isLoading || ticketsQuery.isLoading || objectsQuery.isLoading) {
    return <QueryLoading loadingText="正在加载事件详情..." />
  }

  if (eventQuery.error || ticketsQuery.error || objectsQuery.error) {
    return <QueryError error={eventQuery.error || ticketsQuery.error || objectsQuery.error} />
  }

  const eventItem = eventQuery.data

  if (!eventItem) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        未找到事件，请先从事件中心进入。
      </div>
    )
  }

  const sourceObject = (objectsQuery.data ?? []).find((item) => item.id === eventItem.sourceObjectId)
  const relatedTickets = ticketsQuery.data ?? []

  return (
    <div className="space-y-6">
      <Link to="/events" className="inline-flex items-center gap-2 text-sm font-medium text-primary-600">
        <ArrowLeft className="h-4 w-4" />
        返回事件中心
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{eventItem.title}</h1>
              <StatusBadge tone={eventItem.severity}>
                {eventItem.severity === 'critical' ? '严重' : eventItem.severity === 'high' ? '高' : eventItem.severity === 'medium' ? '中' : '信息'}
              </StatusBadge>
              <StatusBadge tone={eventItem.status}>
                {eventItem.status === 'new' ? '新建' : eventItem.status === 'investigating' ? '排查中' : '已解决'}
              </StatusBadge>
            </div>
            <div className="text-sm text-slate-500">
              {eventItem.id} · {eventItem.category} · {eventItem.detectedAt}
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">{eventItem.summary}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div>责任团队：{eventItem.owner}</div>
            <div className="mt-2">发生位置：{eventItem.location}</div>
          </div>
        </div>
      </section>

      {/* 业务影响与处置操作 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ImpactSummaryPanel impact={impactQuery.data ?? null} loading={impactQuery.isLoading} />
        <UnifiedActionPanel
          title="处置操作"
          actions={
            <Link
              to={`/tickets?fromEvent=${eventItem.id}`}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
            >
              生成工单
            </Link>
          }
        >
          <p className="text-xs text-slate-500">认领、分派、创建工单后可在工单中心跟进闭环。</p>
        </UnifiedActionPanel>
      </div>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">关联对象</h2>
          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Server className="h-4 w-4" />
              事件来源对象
            </div>
            {sourceObject ? (
              <div className="mt-3 space-y-1">
                <Link to={`/objects/${sourceObject.id}`} className="text-base font-medium text-primary-600">
                  {sourceObject.name}
                </Link>
                <div className="text-sm text-slate-500">
                  {sourceObject.assetCode} · {sourceObject.location} · {sourceObject.zone}
                </div>
                <div className="text-sm text-slate-600">{sourceObject.summary}</div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-slate-500">来源对象尚未纳入样板对象列表。</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">关联工单</h2>
            <div className="text-sm text-slate-500">{relatedTickets.length} 条</div>
          </div>
          <div className="mt-4 space-y-3">
            {relatedTickets.map((item) => (
              <Link
                key={item.id}
                to={`/tickets/${item.id}`}
                className="block rounded-xl border border-slate-200 p-4 transition hover:border-primary-200 hover:bg-primary-50/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{item.title}</div>
                  <StatusBadge tone={item.status}>
                    {item.status === 'todo' ? '待处理' : item.status === 'processing' ? '处理中' : '已完成'}
                  </StatusBadge>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {item.id} · 负责人 {item.assignee} · 更新时间 {item.updatedAt}
                </div>
              </Link>
            ))}
            {relatedTickets.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
                当前没有关联工单，后续可直接由事件详情触发“生成工单”。
              </div>
            )}
          </div>
          <div className="mt-4 rounded-xl bg-primary-50 p-4 text-sm text-primary-800">
            <div className="flex items-center gap-2 font-medium">
              <ClipboardPlus className="h-4 w-4" />
              生成工单
            </div>
            <div className="mt-2">
              点击上方「生成工单」跳转工单中心，与事件关联的工单将在此列出，实现事件→工单闭环。
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
