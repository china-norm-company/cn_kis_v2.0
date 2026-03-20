import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

export function EventsPage() {
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const eventsQuery = useQuery({
    queryKey: ['control-plane', 'events'],
    queryFn: controlPlaneApi.getEvents,
  })
  const objectsQuery = useQuery({
    queryKey: ['control-plane', 'objects'],
    queryFn: controlPlaneApi.getObjects,
  })

  const events = eventsQuery.data ?? []
  const objects = objectsQuery.data ?? []

  const filteredEvents = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    const filtered = events.filter((item) => {
      const sourceObject = objects.find((objectItem) => objectItem.id === item.sourceObjectId)
      const matchesKeyword = !normalizedKeyword || [
        item.title,
        item.category,
        item.summary,
        sourceObject?.name ?? '',
      ].join(' ').toLowerCase().includes(normalizedKeyword)
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter
      return matchesKeyword && matchesCategory
    })
    const severityOrder = (s: string) => ({ critical: 0, high: 1, medium: 2, low: 3 }[s] ?? 4)
    const statusOrder = (s: string) => ({ new: 0, investigating: 1, resolved: 2 }[s] ?? 3)
    return [...filtered].sort((a, b) => {
      const sev = severityOrder(a.severity) - severityOrder(b.severity)
      if (sev !== 0) return sev
      return statusOrder(a.status) - statusOrder(b.status)
    })
  }, [categoryFilter, events, keyword, objects])

  const categoryOptions = useMemo(() => Array.from(new Set(events.map((item) => item.category))), [events])

  if (eventsQuery.isLoading || objectsQuery.isLoading) {
    return <QueryLoading loadingText="正在加载事件列表..." />
  }

  if (eventsQuery.error || objectsQuery.error) {
    return <QueryError error={eventsQuery.error || objectsQuery.error} />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">事件中心</h1>
        <p className="mt-1 text-sm text-slate-500">统一承接设备告警、资源接入缺口、配置巡检异常和治理运行时问题。</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索事件、来源对象、摘要"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-primary-300 focus:ring-4 focus:ring-primary-50"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-primary-300 focus:ring-4 focus:ring-primary-50"
        >
          <option value="all">全部事件分类</option>
          {categoryOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-medium">事件</th>
                <th className="px-4 py-3 font-medium">来源对象</th>
                <th className="px-4 py-3 font-medium">分类</th>
                <th className="px-4 py-3 font-medium">严重级别</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">责任人</th>
                <th className="px-4 py-3 font-medium">检测时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvents.length > 0 ? (
                filteredEvents.map((item) => {
                  const sourceObject = objects.find((objectItem) => objectItem.id === item.sourceObjectId)
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link to={`/events/${item.id}`} className="block">
                          <div className="font-medium text-slate-900 hover:text-primary-600">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.id}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        <div>{sourceObject?.name ?? item.sourceObjectId}</div>
                        <div className="mt-1 text-xs text-slate-400">{String(sourceObject?.extra?.management_category ?? '未分类')}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.category}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={item.severity}>
                          {item.severity === 'critical' ? '严重' : item.severity === 'high' ? '高' : item.severity === 'medium' ? '中' : '信息'}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={item.status}>
                          {item.status === 'new' ? '新建' : item.status === 'investigating' ? '排查中' : '已解决'}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{item.owner}</td>
                      <td className="px-4 py-3 text-slate-600">{item.detectedAt}</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    当前没有匹配事件。你看到空白通常不是缓存，而是对象尚未接入实时采集、巡检规则或静态注册表。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
