import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'
import { PAGE_COPY } from '@cn-kis/subject-core'
import type { RootStackParamList } from '../navigation/AppNavigator'
import {
  syncWorkordersFromRemote,
  getLocalWorkorders,
  completeWorkorderLocally,
} from '../services/offlineWorkorderService'

interface WorkorderItem {
  id?: number
  title?: string
  status?: string
  created_at?: string
}

type Nav = NativeStackNavigationProp<RootStackParamList>

const COPY = PAGE_COPY.technician

function mapStatusToBadge(status?: string): 'pending' | 'confirmed' | 'completed' | 'expired' {
  const s = (status || '').toLowerCase()
  if (s.includes('完成') || s.includes('closed') || s.includes('completed_local') || s.includes('synced')) return 'completed'
  if (s.includes('处理') || s.includes('进行')) return 'confirmed'
  if (s.includes('过期')) return 'expired'
  return 'pending'
}

export function TechnicianScreen() {
  useAuth()
  const navigation = useNavigation<Nav>()
  const [items, setItems] = useState<WorkorderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isOffline, setIsOffline] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // 先尝试从远程同步到本地 SQLite
      await syncWorkordersFromRemote(rnApiClient)
      setIsOffline(false)
    } catch {
      // 网络不可用时，标记离线模式
      setIsOffline(true)
    }
    // 无论在线还是离线，都从本地 SQLite 读取（保证一致性）
    try {
      const localItems = await getLocalWorkorders()
      if (localItems.length > 0) {
        setItems(localItems.map((w) => ({
          id: w.remote_id,
          title: w.title,
          status: w.status,
          created_at: w.scheduled_date ?? w.created_at,
        })))
        setLoading(false)
        return
      }
    } catch {
      // SQLite 不可用时回退到纯远程
    }
    // 降级：直接远程请求
    try {
      const res = await rnApiClient.get<{ items?: WorkorderItem[] }>('/my/workorder-progress')
      if (res.code === 200) {
        const data = res.data as { items?: WorkorderItem[] } | WorkorderItem[]
        setItems(Array.isArray(data) ? data : data?.items ?? [])
      } else {
        setError(res.msg || '加载失败')
      }
    } catch {
      setError('网络异常，无离线缓存')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleQuickComplete = useCallback(async (itemId: number) => {
    await completeWorkorderLocally(itemId, {})
    await load()
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  const handleWorkorderPress = (item: WorkorderItem) => {
    const id = item.id
    if (id != null) {
      navigation.navigate('WorkorderDetail', { workorder_id: id })
    }
  }

  if (loading && items.length === 0) {
    return (
      <RNPage title="工单进度">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>正在加载</Text>
        </View>
      </RNPage>
    )
  }

  if (error && items.length === 0) {
    return (
      <RNPage title="工单进度">
        <RNEmpty
          icon="⚠️"
          title="加载失败"
          description={error}
          actionText="重试"
          onAction={() => void load()}
        />
      </RNPage>
    )
  }

  if (items.length === 0) {
    return (
      <RNPage title="工单进度">
        <RNEmpty
          icon={COPY.empty.icon}
          title={COPY.empty.title}
          description={COPY.empty.description}
          actionText={COPY.empty.actionText}
          onAction={() => {}}
        />
      </RNPage>
    )
  }

  return (
    <RNPage title="工单进度">
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>离线模式 — 显示本地缓存数据</Text>
        </View>
      )}
      {items.map((item, i) => (
        <RNCard key={item.id ?? i}>
          <Pressable
            style={styles.row}
            onPress={() => handleWorkorderPress(item)}
          >
            <View style={styles.content}>
              <Text style={styles.title}>{item.title || `工单 ${i + 1}`}</Text>
              <Text style={styles.date}>{item.created_at || '-'}</Text>
            </View>
            <View style={styles.rightCol}>
              <RNBadge status={mapStatusToBadge(item.status)} label={item.status} />
              {item.status === 'pending' && item.id != null && (
                <Pressable
                  style={styles.quickCompleteBtn}
                  onPress={() => void handleQuickComplete(item.id!)}
                >
                  <Text style={styles.quickCompleteText}>快速完成</Text>
                </Pressable>
              )}
            </View>
          </Pressable>
        </RNCard>
      ))}
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
  offlineBanner: {
    backgroundColor: theme.color.warning ?? '#fff3cd',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.sm,
  },
  offlineText: {
    fontSize: theme.fontSize.sm,
    color: '#856404',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    minHeight: theme.touchMinHeight,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  quickCompleteBtn: {
    backgroundColor: theme.color.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  quickCompleteText: {
    fontSize: theme.fontSize.xs,
    color: theme.color.primary,
    fontWeight: '600',
  },
  content: { flex: 1 },
  title: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  date: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
    marginTop: 2,
  },
})
