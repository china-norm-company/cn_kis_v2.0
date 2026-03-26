import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'
import { PAGE_COPY } from '@cn-kis/subject-core'

interface ReferralItem {
  id?: number
  name?: string
  phone?: string
  status?: string
  created_at?: string
}

const COPY = PAGE_COPY.referral

function mapStatusToBadge(status?: string): 'pending' | 'confirmed' | 'completed' | 'expired' {
  const s = (status || '').toLowerCase()
  if (s.includes('完成') || s.includes('入组')) return 'completed'
  if (s.includes('处理') || s.includes('已推荐')) return 'confirmed'
  if (s.includes('过期')) return 'expired'
  return 'pending'
}

export function ReferralScreen() {
  useAuth()
  const [items, setItems] = useState<ReferralItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await rnApiClient.get<{ items?: ReferralItem[] }>('/my/referrals')
      if (res.code === 200) {
        const data = res.data as { items?: ReferralItem[] } | ReferralItem[]
        setItems(Array.isArray(data) ? data : data?.items ?? [])
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

  const handleSubmit = useCallback(async () => {
    const p = phone.trim()
    const n = name.trim()
    if (!p) return
    setSubmitLoading(true)
    setSubmitError(null)
    try {
      const res = await rnApiClient.post('/my/referral', { phone: p, name: n || undefined })
      if (res.code === 200) {
        setShowForm(false)
        setPhone('')
        setName('')
        void load()
      } else {
        setSubmitError(res.msg || '提交失败')
      }
    } catch {
      setSubmitError('网络异常')
    } finally {
      setSubmitLoading(false)
    }
  }, [phone, name, load])

  if (loading && items.length === 0) {
    return (
      <RNPage title="转介绍">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>正在加载</Text>
        </View>
      </RNPage>
    )
  }

  if (error && items.length === 0) {
    return (
      <RNPage title="转介绍">
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

  return (
    <RNPage title="转介绍">
      {items.length === 0 && !showForm ? (
        <RNEmpty
          icon={COPY.empty.icon}
          title={COPY.empty.title}
          description={COPY.empty.description}
          actionText="新建推荐"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <>
          {items.map((item, i) => (
            <RNCard key={item.id ?? i}>
              <View style={styles.row}>
                <View style={styles.content}>
                  <Text style={styles.name}>{item.name || item.phone || `推荐 ${i + 1}`}</Text>
                  <Text style={styles.phone}>{item.phone || '-'}</Text>
                </View>
                <RNBadge status={mapStatusToBadge(item.status)} label={item.status} />
              </View>
            </RNCard>
          ))}
          <RNButton label="新建推荐" onPress={() => setShowForm(true)} />
        </>
      )}

      <Modal visible={showForm} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowForm(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>新建推荐</Text>
            <TextInput
              style={styles.input}
              placeholder="手机号"
              placeholderTextColor={theme.color.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              editable={!submitLoading}
            />
            <TextInput
              style={styles.input}
              placeholder="姓名（选填）"
              placeholderTextColor={theme.color.textMuted}
              value={name}
              onChangeText={setName}
              editable={!submitLoading}
            />
            {submitError ? (
              <Text style={styles.errorText}>{submitError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <RNButton
                label="取消"
                type="secondary"
                onPress={() => setShowForm(false)}
                disabled={submitLoading}
              />
              <RNButton
                label="提交"
                onPress={handleSubmit}
                disabled={submitLoading || !phone.trim()}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    minHeight: theme.touchMinHeight,
  },
  content: { flex: 1 },
  name: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  phone: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
    minHeight: theme.touchMinHeight,
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.danger,
    marginBottom: theme.spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
})
