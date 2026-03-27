import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

interface RNMenuItemProps {
  label: string
  sublabel?: string
  icon?: string
  onPress: () => void
  showBorder?: boolean
}

export function RNMenuItem({ label, sublabel, icon, onPress, showBorder = true }: RNMenuItemProps) {
  return (
    <Pressable onPress={onPress} style={[styles.item, showBorder && styles.border]}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <View style={styles.content}>
        <Text style={styles.label}>{label}</Text>
        {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
      </View>
      <Text style={styles.arrow}>›</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    minHeight: theme.touchMinHeight,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.borderLight,
  },
  icon: { fontSize: 20, marginRight: theme.spacing.sm, width: 28, textAlign: 'center' },
  content: { flex: 1 },
  label: { fontSize: theme.fontSize.md, color: theme.color.textPrimary },
  sublabel: { fontSize: theme.fontSize.xs, color: theme.color.textSecondary, marginTop: 2 },
  arrow: { fontSize: 20, color: theme.color.textMuted },
})
