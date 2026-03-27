import React from 'react'
import { StyleSheet, View } from 'react-native'
import { theme } from '../theme'

interface RNCardProps {
  children: React.ReactNode
}

export function RNCard({ children }: RNCardProps) {
  return <View style={styles.card}>{children}</View>
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md - 2,
    borderWidth: 1,
    borderColor: theme.color.border,
    ...theme.shadow.card,
  },
})
