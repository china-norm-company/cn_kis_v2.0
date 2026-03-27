import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

type BadgeStatus = 'pending' | 'confirmed' | 'completed' | 'expired'

interface RNBadgeProps {
  status: BadgeStatus
  label?: string
}

const statusLabels: Record<BadgeStatus, string> = {
  pending: '待处理',
  confirmed: '已确认',
  completed: '已完成',
  expired: '已过期',
}

export function RNBadge({ status, label }: RNBadgeProps) {
  const colors = theme.badge[status]
  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label || statusLabels[status]}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  text: { fontSize: theme.fontSize.xs, fontWeight: '500' },
})
