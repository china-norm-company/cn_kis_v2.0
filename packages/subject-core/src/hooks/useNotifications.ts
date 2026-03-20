import { useCallback, useMemo, useState } from 'react'
import type { ApiClient } from '../api/types'
import { buildSubjectEndpoints } from '../api/endpoints'

export interface NotificationItem {
  id: number
  title: string
  content: string
  status: string
  sent_at?: string | null
  create_time?: string
}

export function useNotifications(api: ApiClient) {
  const endpoints = useMemo(() => buildSubjectEndpoints(api), [api])
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await endpoints.getMyNotifications()
      const data = (res.data as { items?: NotificationItem[]; unread?: number }) || {}
      setItems(data.items || [])
      setUnread(data.unread || 0)
    } catch {
      setError('通知加载失败')
    } finally {
      setLoading(false)
    }
  }, [endpoints])

  const markRead = useCallback(async (id: number) => {
    await endpoints.markMyNotificationRead(id)
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: 'read' } : it)))
    setUnread((prev) => Math.max(prev - 1, 0))
  }, [endpoints])

  return { items, unread, loading, error, reload, markRead }
}
