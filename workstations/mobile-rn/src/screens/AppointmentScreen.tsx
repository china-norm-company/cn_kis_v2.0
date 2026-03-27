import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { theme } from '../theme'
import { PAGE_COPY, useListFetch } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'

interface AppointmentItem {
  id?: number
  visit_name?: string
  scheduled_date?: string
  status?: string
  [key: string]: unknown
}

const COPY = PAGE_COPY.appointment

export function AppointmentScreen() {
  useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [preferredDate, setPreferredDate] = useState('')
  const [remark, setRemark] = useState('')

  const loader = useCallback(async () => {
    const res = await rnApiClient.get('/my/appointments')
    if (res.code !== 200) return []
    const data = res.data as { items?: AppointmentItem[] } | AppointmentItem[] | undefined
    if (Array.isArray(data)) return data
    return data?.items ?? []
  }, [])

  const { items, loading, error, reload } = useListFetch<AppointmentItem>(loader)

  useEffect(() => {
    void reload()
  }, [reload])

  const getBadgeStatus = (status?: string): 'pending' | 'confirmed' | 'completed' | 'expired' => {
    if (!status) return 'pending'
    const s = status.toLowerCase()
    if (s === 'confirmed') return 'confirmed'
    if (s === 'completed' || s === 'done') return 'completed'
    if (s === 'expired' || s === 'cancelled') return 'expired'
    return 'pending'
  }

  const handleCreateAppointment = async () => {
    if (!preferredDate.trim()) {
      Alert.alert('提示', '请输入期望日期')
      return
    }
    setCreating(true)
    try {
      const res = await rnApiClient.post('/my/appointments', {
        preferred_date: preferredDate.trim(),
        remark: remark.trim() || undefined,
      })
      if (res.code === 200) {
        Alert.alert('成功', '预约申请已提交')
        setShowCreate(false)
        setPreferredDate('')
        setRemark('')
        void reload()
      } else {
        Alert.alert('失败', res.msg || '创建预约失败')
      }
    } catch {
      Alert.alert('错误', '网络异常，请重试')
    } finally {
      setCreating(false)
    }
  }

  if (loading && items.length === 0) {
    return (
      <RNPage title="预约">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>{COPY.loading.title}</Text>
          <Text style={styles.loadingDesc}>{COPY.loading.description}</Text>
        </View>
      </RNPage>
    )
  }

  if (error && items.length === 0) {
    return (
      <RNPage title="预约">
        <RNEmpty
          icon="⚠️"
          title="加载失败"
          description={error}
          actionText="重试"
          onAction={() => void reload()}
        />
      </RNPage>
    )
  }

  return (
    <RNPage title="预约">
      <RNButton label={showCreate ? '取消' : '创建预约'} type={showCreate ? 'secondary' : 'primary'} onPress={() => setShowCreate(!showCreate)} />

      {showCreate && (
        <RNCard>
          <View style={styles.createForm}>
            <Text style={styles.createLabel}>期望日期</Text>
            <TextInput
              value={preferredDate}
              onChangeText={setPreferredDate}
              placeholder="如 2026-03-15"
              placeholderTextColor={theme.color.textMuted}
              style={styles.createInput}
            />
            <Text style={styles.createLabel}>备注（可选）</Text>
            <TextInput
              value={remark}
              onChangeText={setRemark}
              placeholder="补充说明"
              placeholderTextColor={theme.color.textMuted}
              style={styles.createInput}
              multiline
            />
            <RNButton label={creating ? '提交中...' : '提交预约'} onPress={handleCreateAppointment} disabled={creating} />
          </View>
        </RNCard>
      )}

      {items.length === 0 && !showCreate ? (
        <RNEmpty
          icon={COPY.empty.icon}
          title={COPY.empty.title}
          description={COPY.empty.description}
          actionText={COPY.empty.actionText}
          onAction={() => setShowCreate(true)}
        />
      ) : (
        items.map((item, i) => (
          <RNCard key={item.id ?? i}>
            <View style={styles.row}>
              <View style={styles.content}>
                <Text style={styles.visitName}>{item.visit_name || '访视预约'}</Text>
                <Text style={styles.date}>{item.scheduled_date || '待确认'}</Text>
              </View>
              <RNBadge status={getBadgeStatus(item.status)} label={item.status} />
            </View>
          </RNCard>
        ))
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
  loadingDesc: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  content: { flex: 1 },
  visitName: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  date: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
    marginTop: theme.spacing.xs / 2,
  },
  createForm: {
    gap: theme.spacing.md,
  },
  createLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
    color: theme.color.textPrimary,
  },
  createInput: {
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.borderLight,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
  },
})
