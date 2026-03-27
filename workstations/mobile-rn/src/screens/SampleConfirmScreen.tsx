import React, { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

export function SampleConfirmScreen() {
  useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<'success' | 'fail' | null>(null)

  const handleConfirm = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await rnApiClient.post<{ success?: boolean }>('/my/sample-confirm', {
        confirmed: true,
      })
      if (res.code === 200 && res.data?.success !== false) {
        setResult('success')
      } else {
        setResult('fail')
        setError(res.msg || '确认失败')
      }
    } catch {
      setResult('fail')
      setError('网络异常')
    } finally {
      setLoading(false)
    }
  }, [])

  if (result === 'success') {
    return (
      <RNPage title="样品签收确认">
        <RNCard>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successText}>样品签收已确认</Text>
        </RNCard>
      </RNPage>
    )
  }

  if (result === 'fail') {
    return (
      <RNPage title="样品签收确认">
        <RNCard>
          <Text style={styles.failIcon}>✗</Text>
          <Text style={styles.failText}>确认失败</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <RNButton label="重试" onPress={handleConfirm} disabled={loading} />
        </RNCard>
      </RNPage>
    )
  }

  return (
    <RNPage title="样品签收确认">
      <RNCard>
        <Text style={styles.sectionTitle}>请确认您已收到本次访视的样品</Text>
        <Text style={styles.desc}>
          确认后系统将记录您的签收时间，用于依从性评估。
        </Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={theme.color.primary} />
            <Text style={styles.loadingText}>提交中…</Text>
          </View>
        ) : (
          <RNButton label="确认签收" onPress={handleConfirm} disabled={loading} />
        )}
      </RNCard>
    </RNPage>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  desc: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    lineHeight: 22,
    marginBottom: theme.spacing.lg,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  successIcon: {
    fontSize: 48,
    color: theme.color.success,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  successText: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
    textAlign: 'center',
  },
  failIcon: {
    fontSize: 48,
    color: theme.color.danger,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  failText: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.danger,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
})
