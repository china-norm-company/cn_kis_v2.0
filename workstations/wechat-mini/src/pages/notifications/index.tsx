import { useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import { useNotifications, type NotificationItem } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'
import { MiniEmpty } from '@/components/ui'
import { PAGE_COPY } from '@/constants/copy'

export default function NotificationsPage() {
  const { items, unread, loading, reload, markRead } = useNotifications(taroApiClient)

  useEffect(() => { reload() }, [])

  if (loading) {
    return (
      <View className="notif-page">
        <MiniEmpty
          title={PAGE_COPY.notifications.loading.title}
          description={PAGE_COPY.notifications.loading.description}
          icon={PAGE_COPY.notifications.loading.icon}
        />
      </View>
    )
  }

  return (
    <View className="notif-page">
      <View className="header">
        <Text className="title">消息通知</Text>
        {unread > 0 && <Text className="unread-badge">{unread} 条未读</Text>}
      </View>

      {items.length === 0 ? (
        <MiniEmpty
          title={PAGE_COPY.notifications.empty.title}
          description={PAGE_COPY.notifications.empty.description}
          icon={PAGE_COPY.notifications.empty.icon}
        />
      ) : (
        items.map((n: NotificationItem) => (
          <View
            key={n.id}
            className={`notif-card ${n.status !== 'read' ? 'unread' : ''}`}
            onClick={() => n.status !== 'read' && markRead(n.id)}
          >
            <View className="notif-header">
              <Text className="notif-title">{n.title}</Text>
              {n.status !== 'read' && <View className="dot" />}
            </View>
            <Text className="notif-content">{n.content}</Text>
            <Text className="notif-time">
              {n.sent_at ? n.sent_at.slice(0, 16).replace('T', ' ') : (n.create_time || '').slice(0, 16).replace('T', ' ')}
            </Text>
          </View>
        ))
      )}
    </View>
  )
}
