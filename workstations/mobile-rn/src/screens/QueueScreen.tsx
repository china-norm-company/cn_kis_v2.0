import React, { useEffect, useRef } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNEmpty } from '../components/RNEmpty'
import { theme } from '../theme'
import { PAGE_COPY, useQueuePosition } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'

const COPY = PAGE_COPY.queue
const REFRESH_INTERVAL_MS = 30_000

export function QueueScreen() {
  useAuth()
  const { position, loading, error, reload } = useQueuePosition(rnApiClient)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    void reload()
    intervalRef.current = setInterval(() => void reload(), REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [reload])

  const hasPosition = position && (position.queue_no != null || position.waiting_count != null)

  if (loading && !hasPosition) {
    return (
      <RNPage title="排队">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>正在获取排队信息</Text>
        </View>
      </RNPage>
    )
  }

  if (error && !hasPosition) {
    return (
      <RNPage title="排队">
        <RNEmpty
          icon="⚠️"
          title="加载失败"
          description={error}
          actionText="重试"
          onAction={() => void reload()}
        />
      </RNPage>
    )
  }

  if (!hasPosition) {
    return (
      <RNPage title="排队">
        <RNEmpty
          icon="📋"
          title={COPY.emptyQueue}
          description="今日暂无排队，请关注预约或到访安排"
          actionText="刷新"
          onAction={() => void reload()}
        />
      </RNPage>
    )
  }

  return (
    <RNPage title="排队">
      <RNCard>
        <View style={styles.row}>
          <Text style={styles.label}>排队号</Text>
          <Text style={styles.value}>{position.queue_no ?? '--'}</Text>
        </View>
        {position.waiting_count != null && (
          <View style={[styles.row, styles.rowBorder]}>
            <Text style={styles.label}>前方等待</Text>
            <Text style={styles.value}>{position.waiting_count} 人</Text>
          </View>
        )}
        {position.estimated_minutes != null && (
          <View style={[styles.row, styles.rowBorder]}>
            <Text style={styles.label}>预计等待</Text>
            <Text style={styles.value}>约 {position.estimated_minutes} 分钟</Text>
          </View>
        )}
      </RNCard>
      {loading && (
        <View style={styles.refreshing}>
          <ActivityIndicator size="small" color={theme.color.primary} />
          <Text style={styles.refreshText}>正在刷新…</Text>
        </View>
      )}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    minHeight: theme.touchMinHeight,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.color.borderLight,
  },
  label: {
    fontSize: theme.fontSize.md,
    color: theme.color.textSecondary,
  },
  value: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  refreshing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  refreshText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
})
