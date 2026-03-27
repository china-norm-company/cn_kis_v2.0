import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNEmpty } from '../components/RNEmpty'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

let WebViewComponent: React.ComponentType<{
  source: { uri: string }
  onNavigationStateChange?: (nav: { url: string }) => void
  style?: object
}> | null = null
try {
  WebViewComponent = require('react-native-webview').WebView
} catch {
  // WebView not available
}

interface IdentityStatus {
  auth_level?: string
  identity_verified?: boolean
}

interface VerifyStartResponse {
  byted_token?: string
  verify_id?: string
  verify_url?: string
}

const POLL_INTERVAL = 3000
const MAX_POLL_ATTEMPTS = 10

export function IdentityVerifyScreen() {
  const { refresh } = useAuth()
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus | null>(null)
  const [isL2, setIsL2] = useState(false)
  const [startLoading, setStartLoading] = useState(false)
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null)
  const [verifyId, setVerifyId] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const pollAttempts = useRef(0)

  const loadStatus = useCallback(async () => {
    setStatusLoading(true)
    setStatusError(null)
    try {
      const res = await rnApiClient.get<IdentityStatus>('/my/identity/status')
      if (res.code === 200) {
        setIdentityStatus(res.data || null)
        const verified = res.data?.identity_verified ?? res.data?.auth_level === 'identity_verified'
        setIsL2(verified)
      } else {
        setStatusError(res.msg || '获取状态失败')
      }
    } catch {
      setStatusError('网络异常')
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const handleStartVerify = async () => {
    setStartLoading(true)
    try {
      const res = await rnApiClient.post<VerifyStartResponse>('/my/identity/verify/start')
      if (res.code === 200 && res.data) {
        const url = res.data.verify_url || (res.data.byted_token && res.data.verify_id
          ? `https://verify.volcengine.com/verify?token=${res.data.byted_token}&verify_id=${res.data.verify_id}`
          : null)
        if (url) {
          setVerifyUrl(url)
          setVerifyId(res.data.verify_id || null)
        } else {
          setStatusError('无法获取认证链接')
        }
      } else {
        setStatusError(res.msg || '启动认证失败')
      }
    } catch {
      setStatusError('网络异常')
    } finally {
      setStartLoading(false)
    }
  }

  const startPolling = useCallback((vid: string) => {
    setPolling(true)
    pollAttempts.current = 0
    const interval = setInterval(async () => {
      pollAttempts.current += 1
      try {
        const res = await rnApiClient.get<{ status?: string }>('/my/identity/verify/result', {
          verify_id: vid,
        })
        if (res.code === 200 && res.data?.status === 'success') {
          clearInterval(interval)
          await rnApiClient.post('/my/identity/verify/complete')
          await refresh()
          setPolling(false)
          void loadStatus()
          return
        }
      } catch {
        // ignore
      }
      if (pollAttempts.current >= MAX_POLL_ATTEMPTS) {
        clearInterval(interval)
        setPolling(false)
      }
    }, POLL_INTERVAL)
  }, [loadStatus, refresh])

  const handleCloseWebView = () => {
    const vid = verifyId
    setVerifyUrl(null)
    setVerifyId(null)
    if (vid) {
      startPolling(vid)
    }
  }

  if (statusLoading) {
    return (
      <RNPage title="实名认证">
        <RNCard>
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.color.primary} />
            <Text style={styles.loadingText}>正在获取认证状态...</Text>
          </View>
        </RNCard>
      </RNPage>
    )
  }

  if (statusError) {
    return (
      <RNPage title="实名认证">
        <RNEmpty
          icon="⚠️"
          title="加载失败"
          description={statusError}
          actionText="重试"
          onAction={loadStatus}
        />
      </RNPage>
    )
  }

  if (isL2) {
    return (
      <RNPage title="实名认证">
        <RNCard>
          <View style={[styles.resultBox, styles.successBox]}>
            <Text style={styles.resultIcon}>✓</Text>
            <Text style={styles.successText}>您已完成实名认证</Text>
          </View>
        </RNCard>
      </RNPage>
    )
  }

  return (
    <RNPage title="实名认证">
      <RNCard>
        <Text style={styles.desc}>完成实名认证后可解锁全部功能</Text>
        <RNButton
          label="开始实名认证"
          onPress={handleStartVerify}
          disabled={startLoading || !!verifyUrl}
        />
      </RNCard>

      {polling && (
        <RNCard>
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.color.primary} />
            <Text style={styles.loadingText}>正在验证认证结果...</Text>
          </View>
        </RNCard>
      )}

      {verifyUrl && (
        <Modal visible={!!verifyUrl} animationType="slide" onRequestClose={handleCloseWebView}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>实名认证</Text>
              <Pressable
                onPress={handleCloseWebView}
                style={styles.closeBtn}
                hitSlop={8}
              >
                <Text style={styles.closeText}>关闭</Text>
              </Pressable>
            </View>
            {WebViewComponent ? (
              <WebViewComponent
                source={{ uri: verifyUrl }}
                style={styles.webview}
                onNavigationStateChange={(nav) => {
                  if (nav.url?.includes('complete') || nav.url?.includes('success')) {
                    handleCloseWebView()
                  }
                }}
              />
            ) : (
              <View style={styles.webviewFallback}>
                <Text style={styles.fallbackText}>WebView 不可用</Text>
                <Text style={styles.fallbackDesc}>
                  请使用系统浏览器或更新应用以完成实名认证
                </Text>
                <RNButton label="关闭" onPress={handleCloseWebView} />
              </View>
            )}
          </View>
        </Modal>
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
  resultIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.color.success,
  },
  successText: {
    flex: 1,
    fontSize: theme.fontSize.md,
    color: theme.color.primary,
    fontWeight: '600',
  },
  desc: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    marginBottom: theme.spacing.md,
  },
  modal: {
    flex: 1,
    backgroundColor: theme.color.bg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    minHeight: theme.touchMinHeight,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  closeBtn: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    minHeight: theme.touchMinHeight,
    justifyContent: 'center',
  },
  closeText: {
    fontSize: theme.fontSize.md,
    color: theme.color.primary,
    fontWeight: '500',
  },
  webview: {
    flex: 1,
  },
  webviewFallback: {
    flex: 1,
    padding: theme.spacing.lg,
    justifyContent: 'center',
  },
  fallbackText: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  fallbackDesc: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
})
