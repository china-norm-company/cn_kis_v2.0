/**
 * 通知收件箱页面
 *
 * 未读/全部切换，标记已读，点击跳转详情
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { notificationApi } from '@cn-kis/api-client'
import { Badge, Card, Empty } from '@cn-kis/ui-kit'
import {
  Bell, Check, CheckCheck, AlertTriangle,
  FileText, GitPullRequest, CalendarCheck,
} from 'lucide-react'

const SOURCE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  workorder: AlertTriangle,
  workflow_instance: GitPullRequest,
  schedule_slot: CalendarCheck,
  default: FileText,
}

const PRIORITY_VARIANT: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  urgent: 'error',
  high: 'warning',
  normal: 'info',
  low: 'default',
}

function getNotificationLink(sourceType: string, sourceId?: number): string | null {
  switch (sourceType) {
    case 'workorder': return sourceId ? `/workorder/${sourceId}` : null
    case 'workflow_instance': return '/changes'
    case 'schedule_slot': return '/visits'
    default: return null
  }
}

export default function NotificationInboxPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'unread' | 'all'>('unread')
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data: inboxRes, isLoading } = useQuery({
    queryKey: ['notification', 'inbox', tab, page],
    queryFn: () =>
      notificationApi.inbox({
        page,
        page_size: pageSize,
        status: tab === 'unread' ? 'unread' : undefined,
      }),
  })

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification'] })
    },
  })

  const inbox = inboxRes?.data
  const items = (inbox as any)?.items ?? []
  const total = (inbox as any)?.total ?? 0
  const unreadCount = (inbox as any)?.unread_count ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">通知收件箱</h2>
          <p className="mt-1 text-sm text-slate-500">
            {unreadCount > 0 ? `${unreadCount} 条未读通知` : '没有未读通知'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => { setTab('unread'); setPage(1) }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
            tab === 'unread' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          未读 {unreadCount > 0 && <Badge variant="error" size="sm">{unreadCount}</Badge>}
        </button>
        <button
          onClick={() => { setTab('all'); setPage(1) }}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
            tab === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          全部
        </button>
      </div>

      {/* List */}
      <Card className="!p-0">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="py-12">
            <Empty
              icon={<Bell className="w-12 h-12" />}
              title={tab === 'unread' ? '没有未读通知' : '暂无通知'}
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((item: any) => {
              const Icon = SOURCE_ICON[item.source_type] || SOURCE_ICON.default
              const isUnread = item.status !== 'read'
              const link = getNotificationLink(item.source_type, item.source_id)
              const handleClick = () => {
                if (isUnread) {
                  markReadMutation.mutate(item.id)
                }
                if (link) {
                  navigate(link)
                }
              }
              return (
                <div
                  key={item.id}
                  onClick={handleClick}
                  className={`flex items-start gap-4 px-5 py-4 hover:bg-slate-50 transition ${
                    isUnread ? 'bg-blue-50/30' : ''
                  } ${link ? 'cursor-pointer' : ''}`}
                >
                  <div className={`mt-0.5 p-2 rounded-lg ${isUnread ? 'bg-blue-100' : 'bg-slate-100'}`}>
                    <Icon className={`w-4 h-4 ${isUnread ? 'text-blue-600' : 'text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm ${isUnread ? 'font-medium text-slate-800' : 'text-slate-600'}`}>
                      {item.title}
                    </div>
                    {item.content && (
                      <div className="text-xs text-slate-400 mt-1 line-clamp-2">{item.content}</div>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-slate-400">
                        {item.create_time ? new Date(item.create_time).toLocaleString('zh-CN') : ''}
                      </span>
                      <Badge variant={PRIORITY_VARIANT[item.priority] || 'default'} size="sm">
                        {item.priority === 'urgent' ? '紧急' : item.priority === 'high' ? '重要' : '普通'}
                      </Badge>
                    </div>
                  </div>
                  {isUnread && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markReadMutation.mutate(item.id) }}
                      className="p-2 text-slate-300 hover:text-green-500 transition flex-shrink-0"
                      title="标记已读"
                    >
                      <CheckCheck className="w-4 h-4" />
                    </button>
                  )}
                  {!isUnread && (
                    <Check className="w-4 h-4 text-green-400 mt-1 flex-shrink-0" />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">共 {total} 条</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="px-3 py-1 text-xs border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40"
              >
                上一页
              </button>
              <button
                disabled={page * pageSize >= total}
                onClick={() => setPage(page + 1)}
                className="px-3 py-1 text-xs border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
