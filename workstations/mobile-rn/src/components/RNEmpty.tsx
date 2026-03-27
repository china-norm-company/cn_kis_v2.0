import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { RNButton } from './RNButton'
import { theme } from '../theme'

interface RNEmptyProps {
  icon?: string
  title: string
  description?: string
  actionText?: string
  onAction?: () => void
}

export function RNEmpty({ icon, title, description, actionText, onAction }: RNEmptyProps) {
  return (
    <View style={styles.container}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}
      {actionText && onAction ? (
        <View style={styles.actionWrap}>
          <RNButton label={actionText} type="secondary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingVertical: theme.spacing.xl, paddingHorizontal: theme.spacing.lg },
  icon: { fontSize: 48, marginBottom: theme.spacing.sm },
  title: { fontSize: theme.fontSize.lg, fontWeight: '600', color: theme.color.textPrimary, textAlign: 'center' },
  desc: { fontSize: theme.fontSize.sm, color: theme.color.textSecondary, textAlign: 'center', marginTop: theme.spacing.xs, lineHeight: 20 },
  actionWrap: { marginTop: theme.spacing.md, width: '100%' },
})
