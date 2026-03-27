import React, { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { PAGE_COPY } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

interface TicketItem {
  id?: string | number
  title?: string
  status?: string
  created_at?: string
}

function mapStatusToBadge(status?: string): 'pending' | 'confirmed' | 'completed' | 'expired' {
  const s = (status || '').toLowerCase()
  if (s.includes('完成') || s.includes('closed')) return 'completed'
  if (s.includes('处理') || s.includes('processing')) return 'confirmed'
  if (s.includes('过期')) return 'expired'
  return 'pending'
}

export function SupportScreen() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const copy = PAGE_COPY.support

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await rnApiClient.get<{ items?: TicketItem[] }>('/my/support-tickets')
      if (res.code === 200) {
        setTickets(Array.isArray(res.data?.items) ? res.data.items : [])
      } else {
        setError(res.msg || '加载失败')
      }
    } catch {
      setError('网络异常')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleSubmit = async () => {
    const t = title.trim()
    const d = description.trim()
    if (!t) return
    setSubmitLoading(true)
    setSubmitError(null)
    try {
      const res = await rnApiClient.post<{ id?: string }>('/my/support-tickets', {
        title: t,
        description: d,
      })
      if (res.code === 200) {
        setShowForm(false)
        setTitle('')
        setDescription('')
        void load()
      } else {
        setSubmitError(res.msg || '提交失败')
      }
    } catch {
      setSubmitError('网络异常')
    } finally {
      setSubmitLoading(false)
    }
  }

  return (
    <RNPage title="客服支持" subtitle={user ? undefined : '请先登录'}>
      {loading ? (
        <RNCard>
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.color.primary} />
            <Text style={styles.loadingText}>{copy.loading.description}</Text>
          </View>
        </RNCard>
      ) : error ? (
        <RNEmpty
          icon="⚠️"
          title="加载失败"
          description={error}
          actionText="重试"
          onAction={load}
        />
      ) : tickets.length === 0 && !showForm ? (
        <RNEmpty
          icon={copy.empty.icon}
          title={copy.empty.title}
          description={copy.empty.description}
          actionText={copy.empty.actionText}
          onAction={() => setShowForm(true)}
        />
      ) : (
        <>
          {tickets.map((item, i) => (
            <RNCard key={item.id ?? i}>
              <View style={styles.ticketRow}>
                <View style={styles.ticketContent}>
                  <Text style={styles.ticketTitle}>{item.title || `工单 ${i + 1}`}</Text>
                  <Text style={styles.ticketDate}>{item.created_at || '-'}</Text>
                </View>
                <RNBadge status={mapStatusToBadge(item.status)} label={item.status} />
              </View>
            </RNCard>
          ))}

          {showForm && (
            <RNCard>
              <Text style={styles.formLabel}>新建工单</Text>
              <TextInput
                style={styles.input}
                placeholder="请输入标题"
                placeholderTextColor={theme.color.textMuted}
                value={title}
                onChangeText={setTitle}
                editable={!submitLoading}
              />
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="请输入问题描述"
                placeholderTextColor={theme.color.textMuted}
                value={description}
                onChangeText={setDescription}
                editable={!submitLoading}
                multiline
                numberOfLines={4}
              />
              {submitError ? (
                <Text style={styles.errorText}>{submitError}</Text>
              ) : null}
              <View style={styles.formActions}>
                <View style={styles.formBtn}>
                  <RNButton
                    label="取消"
                    type="secondary"
                    onPress={() => {
                      setShowForm(false)
                      setTitle('')
                      setDescription('')
                      setSubmitError(null)
                    }}
                    disabled={submitLoading}
                  />
                </View>
                <View style={styles.formBtn}>
                  <RNButton
                    label="提交"
                    onPress={handleSubmit}
                    disabled={submitLoading || !title.trim()}
                  />
                </View>
              </View>
            </RNCard>
          )}

          {!showForm && (
            <RNButton label="新建工单" onPress={() => setShowForm(true)} />
          )}
        </>
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
  ticketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  ticketContent: {
    flex: 1,
  },
  ticketTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  ticketDate: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
    marginTop: 2,
  },
  formLabel: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.sm,
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
    marginBottom: theme.spacing.sm,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.danger,
    marginBottom: theme.spacing.xs,
  },
  formActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  formBtn: {
    flex: 1,
  },
})
