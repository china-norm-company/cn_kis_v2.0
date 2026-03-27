import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native'
import { useRoute, RouteProp } from '@react-navigation/native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'
import type { RootStackParamList } from '../navigation/AppNavigator'
import { captureInstrumentPhoto, extractInstrumentData, autofillEdcFromOcr } from '../services/ocrService'

interface TimelineItem {
  status?: string
  time?: string
  note?: string
}

interface WorkorderDetail {
  id?: number
  title?: string
  status?: string
  timeline?: TimelineItem[]
}

type WorkorderDetailRoute = RouteProp<RootStackParamList, 'WorkorderDetail'>

function mapStatusToBadge(status?: string): 'pending' | 'confirmed' | 'completed' | 'expired' {
  const s = (status || '').toLowerCase()
  if (s.includes('完成') || s.includes('closed')) return 'completed'
  if (s.includes('处理') || s.includes('进行')) return 'confirmed'
  if (s.includes('过期')) return 'expired'
  return 'pending'
}

export function WorkorderDetailScreen() {
  useAuth()
  const route = useRoute<WorkorderDetailRoute>()
  const id = route.params?.workorder_id ?? route.params?.id
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState<WorkorderDetail | null>(null)
  const [ocrRunning, setOcrRunning] = useState(false)

  const handleOcrCapture = useCallback(async () => {
    setOcrRunning(true)
    try {
      const imageBase64 = await captureInstrumentPhoto()
      if (!imageBase64) {
        setOcrRunning(false)
        return
      }
      const result = await extractInstrumentData(rnApiClient, imageBase64)
      if (!result.success || result.extracted_fields.length === 0) {
        Alert.alert('OCR 提取', result.error || '未识别到数据，请重试')
        setOcrRunning(false)
        return
      }
      // 如有关联 CRF 记录则自动填入
      const crfRecordId = (data as unknown as { crf_record_id?: number })?.crf_record_id
      if (crfRecordId) {
        const fill = await autofillEdcFromOcr(rnApiClient, crfRecordId, result.extracted_fields)
        Alert.alert(
          'OCR 自动填写',
          `已填写 ${fill.filled_count} 项${fill.errors.length > 0 ? `\n跳过：${fill.errors.join('；')}` : ''}`,
        )
      } else {
        const preview = result.extracted_fields
          .map((f) => `${f.label}: ${f.value}${f.unit ? ' ' + f.unit : ''}`)
          .join('\n')
        Alert.alert('OCR 提取结果', preview)
      }
    } catch (e) {
      Alert.alert('OCR 错误', String(e))
    } finally {
      setOcrRunning(false)
    }
  }, [data])

  const load = useCallback(async () => {
    if (id == null) {
      setError('缺少工单 ID')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await rnApiClient.get<WorkorderDetail>(`/my/workorder-progress/${id}`)
      if (res.code === 200) {
        setData(res.data || null)
      } else {
        setError(res.msg || '加载失败')
      }
    } catch {
      setError('网络异常')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (id == null) {
    return (
      <RNPage title="工单详情">
        <RNEmpty icon="⚠️" title="参数错误" description="缺少工单 ID" />
      </RNPage>
    )
  }

  if (loading && !data) {
    return (
      <RNPage title="工单详情">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>正在加载</Text>
        </View>
      </RNPage>
    )
  }

  if (error && !data) {
    return (
      <RNPage title="工单详情">
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

  const timeline = data?.timeline ?? []
  const status = data?.status ?? ''

  return (
    <RNPage title={data?.title || '工单详情'}>
      <RNCard>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{data?.title || '工单'}</Text>
          <RNBadge status={mapStatusToBadge(status)} label={status} />
        </View>
      </RNCard>

      {timeline.length > 0 && (
        <RNCard>
          <Text style={styles.sectionTitle}>状态时间线</Text>
          {timeline.map((item, i) => (
            <View key={i} style={styles.timelineRow}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineStatus}>{item.status || '-'}</Text>
                {item.time ? (
                  <Text style={styles.timelineTime}>{item.time}</Text>
                ) : null}
                {item.note ? (
                  <Text style={styles.timelineNote}>{item.note}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </RNCard>
      )}

      <View style={styles.actions}>
        {status && !status.toLowerCase().includes('完成') && (
          <RNButton label="执行操作" onPress={() => {
            Alert.alert('确认操作', `确认对工单「${data?.title || ''}」执行下一步操作？`, [
              { text: '取消', style: 'cancel' },
              {
                text: '确认', onPress: async () => {
                  try {
                    const res = await rnApiClient.post(`/my/workorder-progress/${id}/action`, { action: 'proceed' })
                    if (res.code === 200) {
                      Alert.alert('成功', '操作已提交')
                      void load()
                    } else {
                      Alert.alert('失败', res.msg || '操作失败')
                    }
                  } catch {
                    Alert.alert('错误', '网络异常，请重试')
                  }
                },
              },
            ])
          }} />
        )}
        <RNButton
          label={ocrRunning ? '识别中...' : '仪器 OCR 拍照'}
          type="secondary"
          onPress={() => void handleOcrCapture()}
          disabled={ocrRunning}
        />
      </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
    flex: 1,
  },
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.md,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.borderLight,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.color.primary,
    marginTop: 6,
    marginRight: theme.spacing.sm,
  },
  timelineContent: { flex: 1 },
  timelineStatus: {
    fontSize: theme.fontSize.md,
    fontWeight: '500',
    color: theme.color.textPrimary,
  },
  timelineTime: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
    marginTop: 2,
  },
  timelineNote: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    marginTop: 2,
  },
  actions: {
    gap: theme.spacing.sm,
  },
})
