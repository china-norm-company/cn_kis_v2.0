import React, { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

type CheckinState = 'idle' | 'loading' | 'success' | 'error'

export function CheckinScreen() {
  const { user } = useAuth()
  const [qrContent, setQrContent] = useState('')
  const [state, setState] = useState<CheckinState>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    const trimmed = qrContent.trim()
    if (!trimmed) return
    setState('loading')
    setMessage('')
    try {
      const res = await rnApiClient.post<{ msg?: string }>('/my/scan-checkin', { qr_content: trimmed })
      if (res.code === 200) {
        setState('success')
        setMessage(res.msg || '签到成功')
        setQrContent('')
      } else {
        setState('error')
        setMessage(res.msg || '签到失败')
      }
    } catch {
      setState('error')
      setMessage('网络异常，请重试')
    }
  }

  return (
    <RNPage title="扫码签到" subtitle={user ? `已登录：${user.name}` : undefined}>
      <RNCard>
        <Text style={styles.label}>请输入扫码内容（或手动输入二维码）</Text>
        <TextInput
          style={styles.input}
          placeholder="粘贴或输入二维码内容"
          placeholderTextColor={theme.color.textMuted}
          value={qrContent}
          onChangeText={setQrContent}
          editable={state !== 'loading'}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <RNButton
          label="提交签到"
          onPress={handleSubmit}
          disabled={state === 'loading' || !qrContent.trim()}
        />
      </RNCard>

      {state === 'loading' && (
        <RNCard>
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.color.primary} />
            <Text style={styles.loadingText}>正在验证签到...</Text>
          </View>
        </RNCard>
      )}

      {state === 'success' && (
        <RNCard>
          <View style={[styles.resultBox, styles.successBox]}>
            <Text style={styles.resultIcon}>✓</Text>
            <Text style={styles.successText}>{message}</Text>
          </View>
        </RNCard>
      )}

      {state === 'error' && (
        <RNCard>
          <View style={[styles.resultBox, styles.errorBox]}>
            <Text style={styles.resultIcon}>✕</Text>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        </RNCard>
      )}
    </RNPage>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
    backgroundColor: theme.color.card,
    minHeight: theme.touchMinHeight,
    marginBottom: theme.spacing.md,
  },
  center: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  loadingText: {
    marginTop: theme.spacing.sm,
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
    gap: theme.spacing.sm,
  },
  successBox: {
    backgroundColor: theme.color.primaryLight,
  },
  errorBox: {
    backgroundColor: '#fed7d7',
  },
  resultIcon: {
    fontSize: 24,
    fontWeight: '700',
  },
  successText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.color.primary,
    fontWeight: '500',
  },
  errorText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.color.danger,
    fontWeight: '500',
  },
})
