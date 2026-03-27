import React, { useState, useEffect, useCallback } from 'react'
import { Text, TextInput, View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { HeroBrandAnimation } from '../components/HeroBrandAnimation'
import { useAuth } from '../contexts/AuthContext'
import { rnApiClient } from '../adapters/rnApiClient'
import { theme } from '../theme'

const COUNTDOWN_SECONDS = 60

export function LoginScreen() {
  const { login } = useAuth()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const phoneValid = /^1[3-9]\d{9}$/.test(phone)

  const sendCode = useCallback(async () => {
    if (!phoneValid || countdown > 0) return
    setSending(true)
    setMsg('')
    try {
      const res = await rnApiClient.post('/auth/sms/send', { phone, scene: 'cn_kis_login' }, { auth: false })
      if (res.code === 200) {
        setCountdown(COUNTDOWN_SECONDS)
        setMsg('验证码已发送')
      } else {
        setMsg(res.msg || '发送失败')
      }
    } catch {
      setMsg('网络错误，请重试')
    } finally {
      setSending(false)
    }
  }, [phone, phoneValid, countdown])

  const submit = useCallback(async () => {
    if (!phoneValid || !code.trim()) return
    setSubmitting(true)
    setMsg('')
    try {
      const user = await login(phone, code)
      if (!user) setMsg('登录失败，请检查验证码')
    } catch {
      setMsg('网络错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }, [phone, code, phoneValid, login])

  return (
    <RNPage title="手机号登录" subtitle="使用短信验证码登录">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <RNCard>
          <View style={styles.heroBlock}>
            <HeroBrandAnimation />
            <Text style={styles.heroTitle}>UTest</Text>
            <Text style={styles.heroSubtitle}>临床研究受试者服务平台</Text>
            <Text style={styles.heroQuote}>some day U bloom, some day U grow roots</Text>
          </View>
        </RNCard>

        <RNCard>
          <View style={styles.form}>
            <Text style={styles.label}>手机号</Text>
            <TextInput
              testID="login-phone-input"
              value={phone}
              onChangeText={setPhone}
              placeholder="请输入手机号"
              placeholderTextColor={theme.color.textMuted}
              keyboardType="phone-pad"
              maxLength={11}
              style={styles.input}
            />

            <Text style={styles.label}>验证码</Text>
            <View style={styles.codeRow}>
              <TextInput
                testID="login-code-input"
                value={code}
                onChangeText={setCode}
                placeholder="请输入验证码"
                placeholderTextColor={theme.color.textMuted}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, { flex: 1 }]}
              />
              <RNButton
                testID="login-send-code-button"
                label={countdown > 0 ? `${countdown}s` : '获取验证码'}
                type="secondary"
                onPress={sendCode}
                disabled={!phoneValid || countdown > 0 || sending}
              />
            </View>

            <View style={{ height: 16 }} />

            <RNButton
              testID="login-submit-button"
              label={submitting ? '登录中...' : '登录'}
              onPress={submit}
              disabled={!phoneValid || !code.trim() || submitting}
            />

            {msg ? <Text style={styles.msg}>{msg}</Text> : null}
          </View>
        </RNCard>
      </KeyboardAvoidingView>
    </RNPage>
  )
}

const styles = StyleSheet.create({
  heroBlock: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  heroTitle: {
    marginTop: theme.spacing.sm,
    fontSize: 38,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: theme.fontSize.lg,
    color: theme.color.textSecondary,
  },
  heroQuote: {
    marginTop: 8,
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    fontStyle: 'italic',
  },
  form: {
    gap: theme.spacing.md,
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: theme.color.textPrimary,
  },
  input: {
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.borderLight,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
  },
  codeRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  msg: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
  },
})
