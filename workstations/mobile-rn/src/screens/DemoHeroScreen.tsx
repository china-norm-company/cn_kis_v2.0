import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { RNMenuItem } from '../components/RNMenuItem'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

export function DemoHeroScreen() {
  useAuth()

  return (
    <RNPage title="UI 演示" subtitle="组件展示">
      <RNCard>
        <Text style={styles.sectionTitle}>按钮</Text>
        <View style={styles.buttonCol}>
          <RNButton label="主要" onPress={() => {}} />
          <RNButton label="次要" type="secondary" onPress={() => {}} />
          <RNButton label="危险" type="danger" onPress={() => {}} />
        </View>
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>徽章</Text>
        <View style={styles.badgeRow}>
          <RNBadge status="pending" />
          <RNBadge status="confirmed" />
          <RNBadge status="completed" />
          <RNBadge status="expired" />
        </View>
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>菜单项</Text>
        <RNMenuItem label="示例菜单" sublabel="副标题" icon="📋" onPress={() => {}} />
        <RNMenuItem label="另一项" onPress={() => {}} showBorder={false} />
      </RNCard>

      <RNCard>
        <Text style={styles.sectionTitle}>空状态</Text>
        <RNEmpty
          icon="📭"
          title="暂无数据"
          description="这是一个空状态示例"
          actionText="操作"
          onAction={() => {}}
        />
      </RNCard>
    </RNPage>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.md,
  },
  buttonCol: {
    gap: theme.spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
})
