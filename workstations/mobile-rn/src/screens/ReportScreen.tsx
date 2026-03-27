import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

type TabKey = 'reports' | 'history'

interface ReportItem {
  id?: string | number
  title?: string
  date?: string
  status?: string
}

interface AeItem {
  id?: string | number
  title?: string
  date?: string
  status?: string
}

function mapStatusToBadge(status?: string): 'pending' | 'confirmed' | 'completed' | 'expired' {
  const s = (status || '').toLowerCase()
  if (s.includes('完成') || s.includes('completed')) return 'completed'
  if (s.includes('确认') || s.includes('confirmed')) return 'confirmed'
  if (s.includes('过期') || s.includes('expired')) return 'expired'
  return 'pending'
}

export function ReportScreen() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabKey>('reports')
  const [reportsLoading, setReportsLoading] = useState(true)
  const [reportsError, setReportsError] = useState<string | null>(null)
  const [reports, setReports] = useState<ReportItem[]>([])
  const [aeLoading, setAeLoading] = useState(false)
  const [aeError, setAeError] = useState<string | null>(null)
  const [aeList, setAeList] = useState<AeItem[]>([])

  const loadReports = async () => {
    setReportsLoading(true)
    setReportsError(null)
    try {
      const res = await rnApiClient.get<{ items?: ReportItem[] }>('/my/results')
      if (res.code === 200) {
        setReports(Array.isArray(res.data?.items) ? res.data.items : [])
      } else {
        setReportsError(res.msg || '加载失败')
      }
    } catch {
      setReportsError('网络异常')
    } finally {
      setReportsLoading(false)
    }
  }

  const loadAe = async () => {
    setAeLoading(true)
    setAeError(null)
    try {
      const res = await rnApiClient.get<{ items?: AeItem[] }>('/my/adverse-events')
      if (res.code === 200) {
        setAeList(Array.isArray(res.data?.items) ? res.data.items : [])
      } else {
        setAeError(res.msg || '加载失败')
      }
    } catch {
      setAeError('网络异常')
    } finally {
      setAeLoading(false)
    }
  }

  useEffect(() => {
    void loadReports()
  }, [])

  useEffect(() => {
    if (activeTab === 'history') void loadAe()
  }, [activeTab])

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'reports', label: '报告列表' },
    { key: 'history', label: '历史记录' },
  ]

  return (
    <RNPage title="报告" subtitle={user ? undefined : '请先登录'}>
      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setActiveTab(t.key)}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'reports' && (
        <>
          {reportsLoading ? (
            <RNCard>
              <View style={styles.center}>
                <ActivityIndicator size="large" color={theme.color.primary} />
                <Text style={styles.loadingText}>正在加载报告...</Text>
              </View>
            </RNCard>
          ) : reportsError ? (
            <RNEmpty
              icon="⚠️"
              title="加载失败"
              description={reportsError}
              actionText="重试"
              onAction={loadReports}
            />
          ) : reports.length === 0 ? (
            <RNEmpty icon="📋" title="暂无报告" description="报告生成后将在此展示" />
          ) : (
            reports.map((item, i) => (
              <RNCard key={item.id ?? i}>
                <View style={styles.itemRow}>
                  <View style={styles.itemContent}>
                    <Text style={styles.itemTitle}>{item.title || `报告 ${i + 1}`}</Text>
                    <Text style={styles.itemDate}>{item.date || '-'}</Text>
                  </View>
                  <RNBadge status={mapStatusToBadge(item.status)} label={item.status} />
                </View>
              </RNCard>
            ))
          )}
        </>
      )}

      {activeTab === 'history' && (
        <>
          {aeLoading ? (
            <RNCard>
              <View style={styles.center}>
                <ActivityIndicator size="large" color={theme.color.primary} />
                <Text style={styles.loadingText}>正在加载历史记录...</Text>
              </View>
            </RNCard>
          ) : aeError ? (
            <RNEmpty
              icon="⚠️"
              title="加载失败"
              description={aeError}
              actionText="重试"
              onAction={loadAe}
            />
          ) : aeList.length === 0 ? (
            <RNEmpty icon="📜" title="暂无历史记录" description="不良事件记录将在此展示" />
          ) : (
            aeList.map((item, i) => (
              <RNCard key={item.id ?? i}>
                <View style={styles.itemRow}>
                  <View style={styles.itemContent}>
                    <Text style={styles.itemTitle}>{item.title || `记录 ${i + 1}`}</Text>
                    <Text style={styles.itemDate}>{item.date || '-'}</Text>
                  </View>
                  <RNBadge status={mapStatusToBadge(item.status)} label={item.status} />
                </View>
              </RNCard>
            ))
          )}
        </>
      )}
    </RNPage>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.sm,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: theme.radius.sm - 2,
    minHeight: theme.touchMinHeight,
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: theme.color.primary,
  },
  tabText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#fff',
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
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  itemDate: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
    marginTop: 2,
  },
})
