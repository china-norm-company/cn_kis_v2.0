import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useRoute, RouteProp } from '@react-navigation/native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNEmpty } from '../components/RNEmpty'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'
import type { RootStackParamList } from '../navigation/AppNavigator'

interface ProductDetail {
  id?: number
  dispensing_id?: number
  name?: string
  status?: string
  reminders?: string[]
}

type ProductDetailRoute = RouteProp<RootStackParamList, 'ProductDetail'>

export function ProductDetailScreen() {
  useAuth()
  const route = useRoute<ProductDetailRoute>()
  const id = route.params?.dispensing_id ?? route.params?.id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<ProductDetail | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [returnLoading, setReturnLoading] = useState(false)

  const load = useCallback(async () => {
    if (id == null) {
      setError('缺少产品 ID')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await rnApiClient.get<ProductDetail>(`/my/products/${id}`)
      if (res.code === 200) {
        setData(res.data || null)
      } else {
        setError(res.msg || '加载失败')
      }
    } catch {
      setError('网络异常')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const handleUsage = useCallback(async () => {
    if (id == null) return
    setUsageLoading(true)
    try {
      const res = await rnApiClient.post(`/my/products/${id}/usage`, {})
      if (res.code === 200) void load()
    } finally {
      setUsageLoading(false)
    }
  }, [id, load])

  const handleReturn = useCallback(async () => {
    if (id == null) return
    setReturnLoading(true)
    try {
      const res = await rnApiClient.post(`/my/products/${id}/return`, {})
      if (res.code === 200) void load()
    } finally {
      setReturnLoading(false)
    }
  }, [id, load])

  if (id == null) {
    return (
      <RNPage title="产品详情">
        <RNEmpty icon="⚠️" title="参数错误" description="缺少产品 ID" />
      </RNPage>
    )
  }

  if (loading && !data) {
    return (
      <RNPage title="产品详情">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>正在加载</Text>
        </View>
      </RNPage>
    )
  }

  if (error && !data) {
    return (
      <RNPage title="产品详情">
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

  const reminders = data?.reminders ?? []

  return (
    <RNPage title={data?.name || '产品详情'}>
      <RNCard>
        <Text style={styles.sectionTitle}>产品信息</Text>
        <View style={styles.row}>
          <Text style={styles.label}>名称</Text>
          <Text style={styles.value}>{data?.name || '-'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>状态</Text>
          <Text style={styles.value}>{data?.status || '-'}</Text>
        </View>
      </RNCard>

      {reminders.length > 0 && (
        <RNCard>
          <Text style={styles.sectionTitle}>提醒</Text>
          {reminders.map((r, i) => (
            <Text key={i} style={styles.reminder}>{r}</Text>
          ))}
        </RNCard>
      )}

      <View style={styles.actions}>
        <RNButton
          label="记录使用"
          onPress={handleUsage}
          disabled={usageLoading || returnLoading}
        />
        <RNButton
          label="申请归还"
          type="secondary"
          onPress={handleReturn}
          disabled={usageLoading || returnLoading}
        />
      </View>
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
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  value: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textPrimary,
    fontWeight: '500',
  },
  reminder: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  actions: {
    gap: theme.spacing.sm,
  },
})
