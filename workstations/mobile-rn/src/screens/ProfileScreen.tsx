import React, { useEffect } from 'react'
import { Text, View, StyleSheet, Pressable } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNMenuItem } from '../components/RNMenuItem'
import { useIdentityStatus } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { useNavigation } from '@react-navigation/native'
import { theme } from '../theme'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/AppNavigator'
import { useGamification } from '../hooks/useGamification'
import { useRoleSwitcher, getRolePerspectives } from '../hooks/useRoleSwitcher'

type Nav = NativeStackNavigationProp<RootStackParamList>

export function ProfileScreen() {
  const { user, logout, roles } = useAuth()
  const identity = useIdentityStatus(rnApiClient)
  const navigation = useNavigation<Nav>()
  const gamification = useGamification(rnApiClient, user?.subjectId)
  const { activePerspective, setActivePerspective } = useRoleSwitcher(roles)

  useEffect(() => {
    void identity.reload()
    void gamification.reload()
  }, [])

  const perspectives = getRolePerspectives(roles)

  const handleLogout = async () => {
    await logout()
  }

  return (
    <RNPage title="我的">
      <RNCard>
        <View style={styles.userHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || '?')[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user?.name || '受试者'}</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, identity.isL2 ? styles.badgeSuccess : styles.badgeWarning]}>
                <Text style={identity.isL2 ? styles.badgeTextSuccess : styles.badgeTextWarning}>
                  {identity.isL2 ? '已实名' : '未实名'}
                </Text>
              </View>
              <Text style={styles.levelText}>
                {identity.status?.auth_level === 'identity_verified' ? 'L2' : identity.status?.auth_level === 'phone_verified' ? 'L1' : 'L0'}
              </Text>
            </View>
          </View>
        </View>
      </RNCard>

      {/* 积分与徽章 */}
      {gamification.score !== null && (
        <RNCard>
          <View style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>积分</Text>
            <Text style={styles.scoreValue}>{gamification.score?.total_score ?? 0}</Text>
            {gamification.streak_days > 0 && (
              <View style={styles.streakBadge}>
                <Text style={styles.streakText}>🔥 {gamification.streak_days} 天连续</Text>
              </View>
            )}
          </View>
          {gamification.badges.filter((b) => b.earned).length > 0 && (
            <View style={styles.badgesRow}>
              {gamification.badges.filter((b) => b.earned).map((b) => (
                <View key={b.id} style={styles.badgeChip}>
                  <Text style={styles.badgeChipText}>{b.icon} {b.name}</Text>
                </View>
              ))}
            </View>
          )}
        </RNCard>
      )}

      {/* 角色切换器（内部员工多角色时显示） */}
      {perspectives.length > 1 && (
        <RNCard>
          <Text style={styles.sectionTitle}>当前工作视角</Text>
          <View style={styles.perspectivesRow}>
            {perspectives.map((p) => (
              <Pressable
                key={p.role}
                style={[
                  styles.perspectiveChip,
                  activePerspective === p.role && styles.perspectiveChipActive,
                ]}
                onPress={() => void setActivePerspective(p.role)}
              >
                <Text style={styles.perspectiveIcon}>{p.icon}</Text>
                <Text
                  style={[
                    styles.perspectiveLabel,
                    activePerspective === p.role && styles.perspectiveLabelActive,
                  ]}
                >
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </RNCard>
      )}

      <RNCard>
        <RNMenuItem label="通知消息" onPress={() => navigation.navigate('Notifications')} />
        <RNMenuItem label="AI 助手" onPress={() => navigation.navigate('AiChat')} />
        <RNMenuItem label="问卷填写" onPress={() => navigation.navigate('Questionnaire')} />
        <RNMenuItem label="知情同意" onPress={() => navigation.navigate('Consent')} />
      </RNCard>

      <View style={{ marginTop: theme.spacing.lg }}>
        <RNButton label="退出登录" type="danger" onPress={handleLogout} />
      </View>
    </RNPage>
  )
}

const styles = StyleSheet.create({
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.color.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: theme.color.card,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
  },
  userName: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  badgeSuccess: {
    backgroundColor: theme.badge.completed.bg,
  },
  badgeWarning: {
    backgroundColor: theme.badge.pending.bg,
  },
  badgeTextSuccess: {
    color: theme.badge.completed.text,
    fontSize: theme.fontSize.xs,
  },
  badgeTextWarning: {
    color: theme.badge.pending.text,
    fontSize: theme.fontSize.xs,
  },
  levelText: {
    fontSize: theme.fontSize.xs,
    color: theme.color.textSecondary,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  scoreLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  scoreValue: {
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    color: theme.color.primary,
  },
  streakBadge: {
    backgroundColor: '#fff3e0',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  streakText: {
    fontSize: theme.fontSize.xs,
    color: '#e65100',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  badgeChip: {
    backgroundColor: theme.color.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  badgeChipText: {
    fontSize: theme.fontSize.xs,
    color: theme.color.primary,
  },
  sectionTitle: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  perspectivesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  perspectiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.borderLight,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  perspectiveChipActive: {
    backgroundColor: theme.color.primaryLight,
    borderColor: theme.color.primary,
  },
  perspectiveIcon: {
    fontSize: theme.fontSize.md,
  },
  perspectiveLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
  },
  perspectiveLabelActive: {
    color: theme.color.primary,
    fontWeight: '600',
  },
})
