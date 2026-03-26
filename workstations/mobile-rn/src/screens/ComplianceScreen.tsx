import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNEmpty } from '../components/RNEmpty'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'
import { PAGE_COPY } from '@cn-kis/subject-core'

interface ComplianceItem {
  id?: number
  name?: string
  score?: number
  status?: string
}

interface ComplianceData {
  score?: number
  items?: ComplianceItem[]
}

const COPY = PAGE_COPY.compliance

export function ComplianceScreen() {
  useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<ComplianceData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await rnApiClient.get<ComplianceData>('/my/compliance')
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
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading && !data) {
    return (
      <RNPage title="依从性评估">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>正在加载</Text>
        </View>
      </RNPage>
    )
  }

  if (error && !data) {
    return (
      <RNPage title="依从性评估">
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

  const items = data?.items ?? []
  const score = data?.score ?? 0

  if (items.length === 0 && score === 0) {
    return (
      <RNPage title="依从性评估">
        <RNEmpty
          icon={COPY.empty.icon}
          title={COPY.empty.title}
          description={COPY.empty.description}
        />
      </RNPage>
    )
  }

  return (
    <RNPage title="依从性评估">
      <RNCard>
        <Text style={styles.sectionTitle}>依从性评分</Text>
        <View style={styles.scoreWrap}>
          <Text style={styles.scoreNum}>{score}</Text>
          <Text style={styles.scoreLabel}>分</Text>
        </View>
      </RNCard>

      {items.length > 0 && (
        <RNCard>
          <Text style={styles.sectionTitle}>评估项目</Text>
          {items.map((item, i) => (
            <View key={item.id ?? i} style={styles.itemRow}>
              <Text style={styles.itemName}>{item.name || `项目 ${i + 1}`}</Text>
              <Text style={styles.itemScore}>{item.score ?? '-'}</Text>
            </View>
          ))}
        </RNCard>
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
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.md,
  },
  scoreWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.xs,
  },
  scoreNum: {
    fontSize: 36,
    fontWeight: '700',
    color: theme.color.primary,
  },
  scoreLabel: {
    fontSize: theme.fontSize.lg,
    color: theme.color.textSecondary,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.borderLight,
  },
  itemName: {
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
  },
  itemScore: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.primary,
  },
})
