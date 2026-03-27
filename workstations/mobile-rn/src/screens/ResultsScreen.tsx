import React, { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNEmpty } from '../components/RNEmpty'
import { PAGE_COPY } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

interface ResultItem {
  id?: string | number
  test_name?: string
  name?: string
  date?: string
  value?: string
  status?: string
}

export function ResultsScreen() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ResultItem[]>([])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await rnApiClient.get<{ items?: ResultItem[] }>('/my/results')
      if (res.code === 200) {
        setItems(Array.isArray(res.data?.items) ? res.data.items : [])
      } else {
        setError(res.msg || '加载失败')
      }
    } catch {
      setError('网络异常')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const copy = PAGE_COPY.results.empty

  return (
    <RNPage title="检测结果" subtitle={user ? undefined : '请先登录'}>
      {loading ? (
        <RNCard>
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.color.primary} />
            <Text style={styles.loadingText}>正在加载检测结果...</Text>
          </View>
        </RNCard>
      ) : error ? (
        <RNEmpty
          icon="⚠️"
          title="加载失败"
          description={error}
          actionText="重试"
          onAction={load}
        />
      ) : items.length === 0 ? (
        <RNEmpty
          icon={copy.icon}
          title={copy.title}
          description={copy.description}
          actionText="刷新"
          onAction={load}
        />
      ) : (
        items.map((item, i) => (
          <RNCard key={item.id ?? i}>
            <Text style={styles.testName}>{item.test_name || item.name || `检测 ${i + 1}`}</Text>
            <View style={styles.row}>
              <Text style={styles.date}>{item.date || '-'}</Text>
              <Text style={styles.value}>{item.value ?? item.status ?? '-'}</Text>
            </View>
          </RNCard>
        ))
      )}
    </RNPage>
  )
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  testName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  date: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
  },
  value: {
    fontSize: theme.fontSize.sm,
    color: theme.color.primary,
    fontWeight: '500',
  },
})
