import React, { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

export function WithdrawScreen() {
  useAuth()
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (!confirmed || !reason.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await rnApiClient.post('/my/withdraw', { reason: reason.trim() })
      if (res.code === 200) {
        setSuccess(true)
      } else {
        setError(res.msg || '提交失败')
      }
    } catch {
      setError('网络异常')
    } finally {
      setLoading(false)
    }
  }, [reason, confirmed])

  if (success) {
    return (
      <RNPage title="退出研究">
        <RNCard>
          <Text style={styles.successText}>已提交退出申请，研究团队将尽快与您联系。</Text>
        </RNCard>
      </RNPage>
    )
  }

  return (
    <RNPage title="退出研究">
      <RNCard>
        <View style={styles.warningWrap}>
          <Text style={styles.warningTitle}>⚠️ 重要提示</Text>
          <Text style={styles.warningText}>
            退出研究将影响您的访视安排、补偿发放及后续随访。提交后研究团队会与您确认，请慎重考虑。
          </Text>
        </View>
      </RNCard>

      <RNCard>
        <Text style={styles.label}>退出原因（必填）</Text>
        <TextInput
          style={styles.input}
          placeholder="请简要说明退出原因"
          placeholderTextColor={theme.color.textMuted}
          value={reason}
          onChangeText={setReason}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          editable={!loading}
        />
        <Pressable style={styles.checkboxRow} onPress={() => setConfirmed(!confirmed)}>
          <Text style={[styles.checkbox, confirmed && styles.checkboxChecked]}>
            {confirmed ? '☑' : '☐'} 我已了解退出后果，确认提交
          </Text>
        </Pressable>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <RNButton
          label="确认退出"
          type="danger"
          onPress={handleSubmit}
          disabled={loading || !confirmed || !reason.trim()}
        />
      </RNCard>
    </RNPage>
  )
}

const styles = StyleSheet.create({
  warningWrap: {
    padding: theme.spacing.md,
    backgroundColor: theme.badge.expired.bg,
    borderRadius: theme.radius.sm,
  },
  warningTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.badge.expired.text,
    marginBottom: theme.spacing.xs,
  },
  warningText: {
    fontSize: theme.fontSize.sm,
    color: theme.badge.expired.text,
    lineHeight: 22,
  },
  label: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
    minHeight: 100,
    marginBottom: theme.spacing.md,
  },
  checkboxRow: {
    marginBottom: theme.spacing.md,
  },
  checkbox: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  checkboxChecked: {
    color: theme.color.textPrimary,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.danger,
    marginBottom: theme.spacing.sm,
  },
  successText: {
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
    lineHeight: 24,
  },
})
