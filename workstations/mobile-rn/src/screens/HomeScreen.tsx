import React, { useEffect, useState, useCallback } from 'react'
import { Text, View, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNBadge } from '../components/RNBadge'
import { useQueuePosition, useVisitData, useIdentityStatus } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'
import type { RootStackParamList } from '../navigation/AppNavigator'
import { HeroBrandAnimation } from '../components/HeroBrandAnimation'
import { scheduleVisitReminder } from '../services/notificationService'

type Nav = NativeStackNavigationProp<RootStackParamList>

interface EnrollmentItem {
  id: number
  protocol_title: string
  enrolled_at: string
  status: string
  subject_no: string
}

interface EnrollmentsData {
  items: EnrollmentItem[]
  total: number
}

export function HomeScreen() {
  const { user } = useAuth()
  const navigation = useNavigation<Nav>()
  // 将 activeEnrollmentId 作为 planId 传入 useVisitData，实现多项目数据隔离
  const [activeEnrollmentId, setActiveEnrollmentId] = useState<number | null>(null)
  const visitData = useVisitData(rnApiClient, activeEnrollmentId ?? undefined)
  const queueData = useQueuePosition(rnApiClient)
  const identity = useIdentityStatus(rnApiClient)
  const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([])
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(false)

  const loadEnrollments = useCallback(async () => {
    setEnrollmentsLoading(true)
    try {
      const res = await rnApiClient.get<EnrollmentsData>('/my/enrollments')
      if (res.code === 200 && res.data && Array.isArray(res.data.items)) {
        setEnrollments(res.data.items)
        if (res.data.items.length > 0 && !activeEnrollmentId) {
          setActiveEnrollmentId(res.data.items[0].id)
        }
      }
    } catch {
      // 静默处理
    } finally {
      setEnrollmentsLoading(false)
    }
  }, [activeEnrollmentId])

  // 切换项目时刷新访视数据，并为即将到来的访视安排提醒（P1.3 + P1.4）
  useEffect(() => {
    if (!activeEnrollmentId) return
    void visitData.reload()
  }, [activeEnrollmentId])

  // 访视数据加载完成后自动安排访视提醒（P1.3）
  useEffect(() => {
    if (!visitData.upcoming || visitData.upcoming.length === 0) return
    const upcomingVisit = visitData.upcoming[0]
    if (upcomingVisit?.date) {
      void scheduleVisitReminder(
        new Date(upcomingVisit.date),
        upcomingVisit.purpose || '下次访视',
        upcomingVisit.id,
      )
    }
  }, [visitData.upcoming])

  useEffect(() => {
    void queueData.reload()
    void identity.reload()
    void loadEnrollments()
  }, [])

  const authLevel = identity.status?.auth_level || 'guest'
  const isL2 = identity.isL2

  const renderEnrollmentSelector = () => {
    if (enrollmentsLoading) {
      return <ActivityIndicator size="small" color={theme.color.primary} />
    }
    if (enrollments.length === 0) return null
    if (enrollments.length === 1) {
      // 单项目不显示切换器
      return (
        <View style={styles.singleProject}>
          <Text style={styles.singleProjectLabel}>当前项目</Text>
          <Text style={styles.singleProjectName}>{enrollments[0].protocol_title}</Text>
        </View>
      )
    }
    // 多项目显示切换器
    return (
      <View style={styles.projectSelector}>
        <Text style={styles.projectSelectorTitle}>我的项目（{enrollments.length}个）</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectTabs}>
          {enrollments.map((enrollment) => (
            <Pressable
              key={enrollment.id}
              style={[
                styles.projectTab,
                activeEnrollmentId === enrollment.id && styles.projectTabActive,
              ]}
              onPress={() => setActiveEnrollmentId(enrollment.id)}
            >
              <Text
                style={[
                  styles.projectTabText,
                  activeEnrollmentId === enrollment.id && styles.projectTabTextActive,
                ]}
                numberOfLines={1}
              >
                {enrollment.protocol_title}
              </Text>
              <Text style={styles.projectTabStatus}>
                {enrollment.status === 'enrolled' ? '进行中' : enrollment.status}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    )
  }

  return (
    <RNPage title={`你好，${user?.name || '受试者'}`} subtitle="受试者服务中心">
      {!isL2 && (
        <RNCard>
          <View style={styles.authGuide}>
            <Text style={styles.authTitle}>
              {authLevel === 'guest' ? '请先完成手机认证' : '请完成实名认证以解锁全部功能'}
            </Text>
            <RNBadge status="pending" label={authLevel === 'phone_verified' ? 'L1 手机已认证' : 'L0 未认证'} />
            <Pressable style={styles.authBtn} onPress={() => navigation.navigate('IdentityVerify')}>
              <Text style={styles.authBtnText}>去认证 ›</Text>
            </Pressable>
          </View>
        </RNCard>
      )}

      <RNCard>
        <View style={styles.heroMiniRow}>
          <HeroBrandAnimation compact />
          <View style={styles.heroMiniText}>
            <Text style={styles.heroMiniTitle}>您好，{user?.name || '受试者'}</Text>
            <Text style={styles.heroMiniSub}>编号: {user?.subjectNo || '--'}</Text>
            <Text style={styles.heroMiniQuote}>some day U bloom, some day U grow roots</Text>
          </View>
        </View>
      </RNCard>

      {/* 多项目切换器 */}
      {enrollments.length > 0 && (
        <RNCard>
          {renderEnrollmentSelector()}
        </RNCard>
      )}

      <RNCard>
        <Text style={styles.sectionTitle}>排队状态</Text>
        <View style={styles.row}>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{queueData.position?.queue_no || '-'}</Text>
            <Text style={styles.statLabel}>我的号码</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statNum}>{queueData.position?.waiting_count ?? 0}</Text>
            <Text style={styles.statLabel}>前方等待</Text>
          </View>
        </View>
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>本周任务</Text>
        <View style={styles.row}>
          <QuickItem label="访视" count={visitData.upcoming.length} onPress={() => navigation.navigate('Tabs')} />
          <QuickItem label="排程" count={visitData.schedule.length} onPress={() => navigation.navigate('Tabs')} />
        </View>
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>快捷操作</Text>
        <View style={styles.quickGrid}>
          <QuickAction icon="📋" label="问卷" onPress={() => navigation.navigate('Questionnaire')} />
          <QuickAction icon="🔔" label="通知" onPress={() => navigation.navigate('Notifications')} />
          <QuickAction icon="🤖" label="AI 助手" onPress={() => navigation.navigate('AiChat')} />
          <QuickAction icon="📝" label="知情同意" onPress={() => navigation.navigate('Consent')} />
          <QuickAction icon="📅" label="预约" onPress={() => navigation.navigate('Appointment')} />
          <QuickAction icon="📊" label="报告" onPress={() => navigation.navigate('Report')} />
        </View>
      </RNCard>
    </RNPage>
  )
}

function QuickItem({ label, count, onPress }: { label: string; count: number; onPress: () => void }) {
  return (
    <Pressable style={styles.stat} onPress={onPress}>
      <Text style={styles.statNum}>{count}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  )
}

function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickItem} onPress={onPress}>
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  heroMiniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  heroMiniText: {
    flex: 1,
    minWidth: 0,
  },
  heroMiniTitle: {
    fontSize: theme.fontSize.lg + 2,
    fontWeight: '700',
    color: theme.color.textPrimary,
  },
  heroMiniSub: {
    marginTop: 4,
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  heroMiniQuote: {
    marginTop: 6,
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
    fontStyle: 'italic',
  },
  sectionTitle: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.color.textPrimary, marginBottom: theme.spacing.sm },
  row: { flexDirection: 'row', gap: theme.spacing.md },
  stat: { flex: 1, alignItems: 'center', paddingVertical: theme.spacing.xs },
  statNum: { fontSize: 24, fontWeight: '700', color: theme.color.primary },
  statLabel: { fontSize: theme.fontSize.xs, color: theme.color.textSecondary, marginTop: 4 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  quickItem: { width: '30%', alignItems: 'center', paddingVertical: theme.spacing.sm },
  quickLabel: { fontSize: theme.fontSize.xs, color: theme.color.textPrimary, marginTop: 4 },
  authGuide: { gap: theme.spacing.xs },
  authTitle: { fontSize: theme.fontSize.sm, color: theme.color.textPrimary, fontWeight: '500' },
  authBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: theme.color.primaryLight, borderRadius: theme.radius.sm, alignSelf: 'flex-start', marginTop: 4 },
  authBtnText: { color: theme.color.primary, fontSize: theme.fontSize.sm, fontWeight: '500' },
  // 多项目选择器
  singleProject: { gap: 4 },
  singleProjectLabel: { fontSize: theme.fontSize.xs, color: theme.color.textSecondary },
  singleProjectName: { fontSize: theme.fontSize.md, fontWeight: '600', color: theme.color.textPrimary },
  projectSelector: { gap: theme.spacing.sm },
  projectSelectorTitle: { fontSize: theme.fontSize.sm, fontWeight: '600', color: theme.color.textPrimary },
  projectTabs: { flexDirection: 'row' as const },
  projectTab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
    minWidth: 100,
    maxWidth: 160,
  },
  projectTabActive: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  projectTabText: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textPrimary,
    fontWeight: '500',
  },
  projectTabTextActive: {
    color: '#fff',
  },
  projectTabStatus: {
    fontSize: 10,
    color: theme.color.textSecondary,
    marginTop: 2,
  },
})
