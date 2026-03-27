import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'
import { PAGE_COPY } from '@cn-kis/subject-core'

interface ScreeningStep {
  id?: number
  name?: string
  status?: string
  completed_at?: string
}

interface ScreeningStatusData {
  steps?: ScreeningStep[]
  current?: string
}

const COPY = PAGE_COPY.screeningStatus

function mapStatusToBadge(status?: string): 'pending' | 'confirmed' | 'completed' | 'expired' {
  const s = (status || '').toLowerCase()
  if (s.includes('完成') || s === 'completed') return 'completed'
  if (s.includes('进行') || s.includes('通过')) return 'confirmed'
  if (s.includes('过期') || s.includes('失败')) return 'expired'
  return 'pending'
}

export function ScreeningStatusScreen() {
  useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<ScreeningStatusData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await rnApiClient.get<ScreeningStatusData>('/my/screening-status')
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
      <RNPage title="筛选进度">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>正在加载</Text>
        </View>
      </RNPage>
    )
  }

  if (error && !data) {
    return (
      <RNPage title="筛选进度">
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

  const steps = data?.steps ?? []

  if (steps.length === 0) {
    return (
      <RNPage title="筛选进度">
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
    <RNPage title="筛选进度">
      <RNCard>
        <Text style={styles.sectionTitle}>筛选进度</Text>
        {steps.map((step, i) => (
          <View key={step.id ?? i} style={styles.stepRow}>
            <View style={styles.stepContent}>
              <Text style={styles.stepName}>{step.name || `步骤 ${i + 1}`}</Text>
              {step.completed_at ? (
                <Text style={styles.stepDate}>{step.completed_at}</Text>
              ) : null}
            </View>
            <RNBadge status={mapStatusToBadge(step.status)} label={step.status} />
          </View>
        ))}
      </RNCard>
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
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.borderLight,
    minHeight: theme.touchMinHeight,
  },
  stepContent: { flex: 1 },
  stepName: {
    fontSize: theme.fontSize.md,
    fontWeight: '500',
    color: theme.color.textPrimary,
  },
  stepDate: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
    marginTop: 2,
  },
})
