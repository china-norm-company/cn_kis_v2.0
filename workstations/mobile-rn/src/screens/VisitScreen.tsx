import React, { useEffect, useState } from 'react'
import { Text, View, StyleSheet, Pressable } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { useVisitData, PAGE_COPY } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { theme } from '../theme'

type TabKey = 'timeline' | 'upcoming' | 'schedule'

export function VisitScreen() {
  const [activeTab, setActiveTab] = useState<TabKey>('timeline')
  const visitData = useVisitData(rnApiClient)

  useEffect(() => {
    void visitData.reload()
  }, [])

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'timeline', label: '时间线' },
    { key: 'upcoming', label: '近期预约' },
    { key: 'schedule', label: '排程' },
  ]

  return (
    <RNPage title="访视">
      <View style={styles.tabBar}>
        {tabs.map((t) => (
          <Pressable key={t.key} onPress={() => setActiveTab(t.key)} style={[styles.tab, activeTab === t.key && styles.tabActive]}>
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {activeTab === 'timeline' && (
        visitData.visitNodes.length > 0 ? (
          visitData.visitNodes
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((node, i) => (
              <RNCard key={node.id ?? i}>
                <View style={styles.nodeRow}>
                  <View style={[styles.dot, node.status === 'completed' ? styles.dotDone : styles.dotPending]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.nodeName}>{node.name}</Text>
                    <Text style={styles.nodeDetail}>基线日 {node.baseline_day ?? '-'}，窗口 -{node.window_before ?? 0}/+{node.window_after ?? 0} 天</Text>
                  </View>
                  <RNBadge status={node.status === 'completed' ? 'completed' : node.status === 'confirmed' ? 'confirmed' : 'pending'} />
                </View>
              </RNCard>
            ))
        ) : (
          <RNEmpty icon="📅" title="暂无访视节点" description="入组后将自动生成访视时间线" />
        )
      )}

      {activeTab === 'upcoming' && (
        visitData.upcoming.length > 0 ? (
          visitData.upcoming.map((item, i) => (
            <RNCard key={i}>
              <Text style={styles.nodeName}>{item.purpose || `访视 ${i + 1}`}</Text>
              <Text style={styles.nodeDetail}>{item.date || '待确认'} {item.time || ''}</Text>
            </RNCard>
          ))
        ) : (
          <RNEmpty icon="📅" title="暂无近期预约" description="可在预约页面创建新的预约" />
        )
      )}

      {activeTab === 'schedule' && (
        visitData.schedule.length > 0 ? (
          visitData.schedule.map((item, i) => (
            <RNCard key={i}>
              <Text style={styles.nodeName}>{item.visit_name || item.title || `排程 ${i + 1}`}</Text>
              <Text style={styles.nodeDetail}>{item.scheduled_date || '-'}</Text>
            </RNCard>
          ))
        ) : (
          <RNEmpty icon="🗓️" title="暂无排程" description="入组后系统将生成排程信息" />
        )
      )}
    </RNPage>
  )
}

const styles = StyleSheet.create({
  tabBar: { flexDirection: 'row', backgroundColor: theme.color.card, borderRadius: theme.radius.sm, padding: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: theme.radius.sm - 2 },
  tabActive: { backgroundColor: theme.color.primary },
  tabText: { fontSize: theme.fontSize.sm, color: theme.color.textSecondary, fontWeight: '500' },
  tabTextActive: { color: '#fff' },
  nodeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotDone: { backgroundColor: theme.color.success },
  dotPending: { backgroundColor: theme.color.border },
  nodeName: { fontSize: theme.fontSize.md, fontWeight: '500', color: theme.color.textPrimary },
  nodeDetail: { fontSize: theme.fontSize.xs, color: theme.color.textSecondary, marginTop: 2 },
})
