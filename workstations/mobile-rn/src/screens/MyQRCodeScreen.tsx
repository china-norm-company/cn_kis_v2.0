import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Share, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNEmpty } from '../components/RNEmpty'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'
import { PAGE_COPY } from '@cn-kis/subject-core'

const COPY = PAGE_COPY.myqrcode

export function MyQRCodeScreen() {
  useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [qrData, setQrData] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await rnApiClient.post<{ qr?: string; data?: string }>('/my/qrcode/generate', {
        type: 'checkin',
      })
      if (res.code === 200 && (res.data?.qr || res.data?.data)) {
        setQrData(res.data.qr || res.data.data || null)
      } else {
        setError(res.msg || COPY.loadFailDescription)
        setQrData(null)
      }
    } catch {
      setError(COPY.loadFailDescription)
      setQrData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleShare = useCallback(async () => {
    if (!qrData) return
    try {
      await Share.share({ message: qrData, title: '签到二维码' })
    } catch {
      // Share cancelled or failed
    }
  }, [qrData])

  if (loading && !qrData) {
    return (
      <RNPage title="我的二维码">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>{COPY.loading.title}</Text>
          <Text style={styles.loadingDesc}>{COPY.loading.description}</Text>
        </View>
      </RNPage>
    )
  }

  if (error && !qrData) {
    return (
      <RNPage title="我的二维码">
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

  if (!qrData) {
    return (
      <RNPage title="我的二维码">
        <RNEmpty
          icon={COPY.empty.icon}
          title={COPY.empty.title}
          description={COPY.noSubjectDescription}
          actionText={COPY.empty.actionText}
          onAction={() => {}}
        />
      </RNPage>
    )
  }

  return (
    <RNPage title="我的二维码">
      <RNCard>
        <Text style={styles.sectionTitle}>签到二维码</Text>
        <View style={styles.qrPlaceholder}>
          <Text style={styles.qrPlaceholderText}>[QR 码占位]</Text>
          <Text style={styles.qrData}>{qrData}</Text>
        </View>
        <View style={styles.actions}>
          <RNButton label="复制/分享" type="secondary" onPress={handleShare} />
        </View>
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
  loadingDesc: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.md,
  },
  qrPlaceholder: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.md,
  },
  qrPlaceholderText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  qrData: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
    fontFamily: 'monospace',
  },
  actions: {
    marginTop: theme.spacing.sm,
  },
})
