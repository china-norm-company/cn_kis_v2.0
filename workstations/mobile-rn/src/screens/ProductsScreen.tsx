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
import type { RootStackParamList } from '../navigation/AppNavigator'

interface ProductItem {
  id?: number
  dispensing_id?: number
  name?: string
  status?: string
}

type Nav = NativeStackNavigationProp<RootStackParamList>

function mapStatusToBadge(status?: string): 'pending' | 'confirmed' | 'completed' | 'expired' {
  const s = (status || '').toLowerCase()
  if (s.includes('归还') || s.includes('完成')) return 'completed'
  if (s.includes('使用中') || s.includes('发放')) return 'confirmed'
  if (s.includes('过期')) return 'expired'
  return 'pending'
}

export function ProductsScreen() {
  useAuth()
  const navigation = useNavigation<Nav>()
  const [items, setItems] = useState<ProductItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await rnApiClient.get<{ items?: ProductItem[] }>('/my/products')
      if (res.code === 200) {
        const data = res.data as { items?: ProductItem[] } | ProductItem[]
        setItems(Array.isArray(data) ? data : data?.items ?? [])
      } else {
        setError(res.msg || '加载失败')
      }
    } catch {
      setError('网络异常')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleProductPress = (item: ProductItem) => {
    const id = item.dispensing_id ?? item.id
    if (id != null) {
      navigation.navigate('ProductDetail', { dispensing_id: id })
    }
  }

  if (loading && items.length === 0) {
    return (
      <RNPage title="我的产品">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>正在加载</Text>
        </View>
      </RNPage>
    )
  }

  if (error && items.length === 0) {
    return (
      <RNPage title="我的产品">
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
      <RNPage title="我的产品">
        <RNEmpty
          icon="📦"
          title="暂无产品"
          description="您当前没有已发放的产品记录。"
        />
      </RNPage>
    )
  }

  return (
    <RNPage title="我的产品">
      {items.map((item, i) => (
        <RNCard key={item.id ?? item.dispensing_id ?? i}>
          <Pressable
            style={styles.row}
            onPress={() => handleProductPress(item)}
          >
            <View style={styles.content}>
              <Text style={styles.name}>{item.name || `产品 ${i + 1}`}</Text>
            </View>
            <RNBadge status={mapStatusToBadge(item.status)} label={item.status} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    minHeight: theme.touchMinHeight,
  },
  content: { flex: 1 },
  name: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
})
