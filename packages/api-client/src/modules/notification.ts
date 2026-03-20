/**
 * 通知/预警 API 模块
 *
 * 对应后端：/api/v1/notification/
 */
import { api } from '../client'
import type { AlertDashboard } from '../types'

export interface NotificationItem {
  id: number
  title: string
  content: string
  channel: string
  priority: string
  status: string
  source_type: string
  source_id: number | null
  sent_at: string | null
  create_time: string
}

export interface NotificationInbox {
  items: NotificationItem[]
  total: number
  unread_count: number
}

export const notificationApi = {
  /** 预警仪表盘 */
  alertsDashboard() {
    return api.get<AlertDashboard>('/notification/alerts/dashboard')
  },

  /** 通知列表 */
  list(params?: { page?: number; page_size?: number }) {
    return api.get('/notification/list', { params })
  },

  /** 通知收件箱（带未读计数） */
  inbox(params?: { page?: number; page_size?: number; status?: string }) {
    return api.get<NotificationInbox>('/notification/inbox', { params })
  },

  /** 标记已读 */
  markRead(notificationId: number) {
    return api.post(`/notification/${notificationId}/read`)
  },
}
