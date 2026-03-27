import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { theme } from '../theme'
import { buildSubjectEndpoints } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'

interface PlanItem {
  id?: number
  name?: string
  [key: string]: unknown
}

export function RegisterScreen() {
  useAuth()
  const [plans, setPlans] = useState<PlanItem[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ success: boolean; msg: string } | null>(null)

  const loadPlans = useCallback(async () => {
    setLoading(true)
    try {
      const endpoints = buildSubjectEndpoints(rnApiClient)
      const res = await endpoints.getAvailablePlans()
      if (res.code === 200) {
        const data = res.data as { items?: PlanItem[] } | PlanItem[] | undefined
        const list = Array.isArray(data) ? data : data?.items ?? []
        setPlans(list)
        if (list.length === 1 && list[0].id != null) {
          setSelectedPlanId(list[0].id)
        }
      }
    } catch {
      setPlans([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  const handleSubmit = async () => {
    if (selectedPlanId == null) {
      setResult({ success: false, msg: '请选择要报名的项目' })
      return
    }
    setSubmitting(true)
    setResult(null)
    try {
      const endpoints = buildSubjectEndpoints(rnApiClient)
      const res = await endpoints.registerForPlan({ plan_id: selectedPlanId })
      if (res.code === 200) {
        setResult({ success: true, msg: '报名成功' })
      } else {
        setResult({ success: false, msg: res.msg || '报名失败' })
      }
    } catch {
      setResult({ success: false, msg: '网络错误，请重试' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && plans.length === 0) {
    return (
      <RNPage title="项目报名">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>正在加载可报名项目</Text>
        </View>
      </RNPage>
    )
  }

  if (plans.length === 0) {
    return (
      <RNPage title="项目报名">
        <RNCard>
          <Text style={styles.emptyText}>当前暂无开放招募项目</Text>
          <RNButton label="刷新" type="secondary" onPress={() => void loadPlans()} />
        </RNCard>
      </RNPage>
    )
  }

  return (
    <RNPage title="项目报名">
      <RNCard>
        <Text style={styles.label}>选择项目</Text>
        <View style={styles.planList}>
          {plans.map((p) => (
            <RNButton
              key={p.id}
              label={p.name || `项目 ${p.id}`}
              type={selectedPlanId === p.id ? 'primary' : 'secondary'}
              onPress={() => setSelectedPlanId(p.id ?? null)}
              disabled={submitting}
            />
          ))}
        </View>
      </RNCard>
      {result && (
        <RNCard>
          <Text style={[styles.resultText, result.success ? styles.resultSuccess : styles.resultFail]}>
            {result.msg}
          </Text>
        </RNCard>
      )}
      <RNButton
        label="确认报名"
        onPress={handleSubmit}
        disabled={submitting || selectedPlanId == null}
      />
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
  label: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  planList: {
    gap: theme.spacing.sm,
  },
  emptyText: {
    fontSize: theme.fontSize.md,
    color: theme.color.textSecondary,
    marginBottom: theme.spacing.md,
  },
  resultText: {
    fontSize: theme.fontSize.md,
    fontWeight: '500',
  },
  resultSuccess: { color: theme.color.success },
  resultFail: { color: theme.color.danger },
})
