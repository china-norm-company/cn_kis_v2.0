import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { theme } from '../theme'
import { PAGE_COPY } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'

interface PaymentItem {
  id?: number
  amount?: number | string
  status?: string
  date?: string
  description?: string
  [key: string]: unknown
}

interface PaymentSummary {
  total_amount?: number | string
  [key: string]: unknown
}

const COPY = PAGE_COPY.payment

export function PaymentScreen() {
  useAuth()
  const [items, setItems] = useState<PaymentItem[]>([])
  const [summary, setSummary] = useState<PaymentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [payRes, sumRes] = await Promise.all([
        rnApiClient.get('/my/payments'),
        rnApiClient.get('/my/payment-summary'),
      ])
      if (payRes.code === 200) {
        const data = payRes.data as { items?: PaymentItem[] } | PaymentItem[] | undefined
        setItems(Array.isArray(data) ? data : data?.items ?? [])
      }
      if (sumRes.code === 200 && sumRes.data) {
        setSummary(sumRes.data as PaymentSummary)
      }
    } catch {
      setError('加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const getBadgeStatus = (status?: string): 'pending' | 'confirmed' | 'completed' | 'expired' => {
    if (!status) return 'pending'
    const s = status.toLowerCase()
    if (s === 'confirmed' || s === 'paid' || s === 'completed') return 'completed'
    if (s === 'expired' || s === 'cancelled') return 'expired'
    return 'pending'
  }

  const formatAmount = (v?: number | string) => {
    if (v == null) return '--'
    const n = typeof v === 'string' ? parseFloat(v) : v
    return `¥${isNaN(n) ? '--' : n.toFixed(2)}`
  }

  if (loading && items.length === 0) {
    return (
      <RNPage title="礼金">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>{COPY.loading.title}</Text>
          <Text style={styles.loadingDesc}>{COPY.loading.description}</Text>
        </View>
      </RNPage>
    )
  }

  if (error && items.length === 0) {
    return (
      <RNPage title="礼金">
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

  return (
    <RNPage title="礼金">
      {summary && (
        <RNCard>
          <Text style={styles.summaryLabel}>累计礼金</Text>
          <Text style={styles.summaryAmount}>{formatAmount(summary.total_amount)}</Text>
        </RNCard>
      )}
      {items.length === 0 ? (
        <RNEmpty
          icon={COPY.empty.icon}
          title="暂无礼金记录"
          description={COPY.empty.description}
          actionText="刷新"
          onAction={() => void reload()}
        />
      ) : (
        items.map((item, i) => (
          <RNCard key={item.id ?? i}>
            <View style={styles.row}>
              <View style={styles.content}>
                <Text style={styles.amount}>{formatAmount(item.amount)}</Text>
                <Text style={styles.date}>{String(item.date ?? item.created_at ?? '--')}</Text>
                {typeof item.description === 'string' && item.description ? (
                  <Text style={styles.desc} numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              <RNBadge status={getBadgeStatus(item.status)} label={item.status} />
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
  summaryLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  summaryAmount: {
    fontSize: theme.fontSize.xl + 4,
    fontWeight: '700',
    color: theme.color.primary,
    marginTop: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  content: { flex: 1 },
  amount: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  date: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
    marginTop: theme.spacing.xs / 2,
  },
  desc: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textMuted,
    marginTop: 2,
  },
})
