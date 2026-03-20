/**
 * Header 通知铃铛
 *
 * 未读计数气泡 + 点击展开快速通知列表
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notificationApi } from '@cn-kis/api-client'
import { Link } from 'react-router-dom'
import { Bell, Check, ExternalLink } from 'lucide-react'

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { data: inboxRes } = useQuery({
    queryKey: ['notification', 'inbox', 'quick'],
    queryFn: () => notificationApi.inbox({ page: 1, page_size: 5, status: 'unread' }),
    refetchInterval: 30_000,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification'] })
    },
  })

  const unreadCount = inboxRes?.data?.unread_count ?? 0
  const items = inboxRes?.data?.items ?? []

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
        title="通知"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-slate-200 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">通知</span>
            {unreadCount > 0 && (
              <span className="text-xs text-slate-400">{unreadCount} 条未读</span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">暂无未读通知</div>
            ) : (
              items.map((item: any) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                >
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700 line-clamp-2">{item.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {item.create_time ? new Date(item.create_time).toLocaleString('zh-CN') : ''}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      markReadMutation.mutate(item.id)
                    }}
                    className="p-1 text-slate-300 hover:text-green-500 transition flex-shrink-0"
                    title="标记已读"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-slate-100">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
            >
              查看全部通知
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
