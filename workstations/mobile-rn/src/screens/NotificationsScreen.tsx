import React, { useCallback, useEffect } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNEmpty } from '../components/RNEmpty'
import { useNotifications, PAGE_COPY } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

const COPY = PAGE_COPY.notifications

function formatTime(sentAt?: string | null, createTime?: string) {
  const raw = sentAt || createTime
  if (!raw) return '-'
  try {
    const d = new Date(raw)
    if (isNaN(d.getTime())) return raw
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return '刚刚'
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return d.toLocaleDateString()
  } catch {
    return raw
  }
}

export function NotificationsScreen() {
  useAuth()
  const notifications = useNotifications(rnApiClient)

  useEffect(() => {
    void notifications.reload()
  }, [])

  const handleItemPress = useCallback(
    (id: number) => {
      if (notifications.items.find((it) => it.id === id)?.status !== 'read') {
        void notifications.markRead(id)
      }
    },
    [notifications]
  )

  if (notifications.loading && notifications.items.length === 0) {
    return (
      <RNPage title="通知">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>{COPY.loading.title}</Text>
          <Text style={styles.loadingDesc}>{COPY.loading.description}</Text>
        </View>
      </RNPage>
    )
  }

  if (notifications.error && notifications.items.length === 0) {
    return (
      <RNPage title="通知">
        <RNEmpty
          icon="⚠️"
          title="加载失败"
          description={notifications.error}
          actionText="重试"
          onAction={() => void notifications.reload()}
        />
      </RNPage>
    )
  }

  if (notifications.items.length === 0) {
    return (
      <RNPage title="通知">
        <RNEmpty
          icon={COPY.empty.icon}
          title={COPY.empty.title}
          description={COPY.empty.description}
        />
      </RNPage>
    )
  }

  return (
    <RNPage title="通知" subtitle={notifications.unread > 0 ? `未读 ${notifications.unread}` : undefined}>
      {notifications.items.map((item) => {
        const isUnread = item.status !== 'read'
        return (
          <RNCard key={item.id}>
            <Pressable
              style={[styles.item, isUnread && styles.itemUnread]}
              onPress={() => handleItemPress(item.id)}
            >
              <View style={styles.content}>
                <View style={styles.row}>
                  <Text style={styles.title}>{item.title}</Text>
                  {isUnread ? (
                    <View style={styles.unreadDot} />
                  ) : null}
                </View>
                <Text style={styles.body}>{item.content}</Text>
                <Text style={styles.time}>
                  {formatTime(item.sent_at, item.create_time)}
                </Text>
              </View>
            </Pressable>
          </RNCard>
        )
      })}
    </RNPage>
  )
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  loadingDesc: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  item: {
    padding: 0,
  },
  itemUnread: {
    backgroundColor: theme.color.primaryLight,
    margin: -theme.spacing.md + 2,
    padding: theme.spacing.md - 2,
    borderRadius: theme.radius.md,
  },
  content: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  title: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.primary,
  },
  body: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    marginTop: theme.spacing.xs,
    lineHeight: 20,
  },
  time: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textMuted,
    marginTop: theme.spacing.xs,
  },
})
