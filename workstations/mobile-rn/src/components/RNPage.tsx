import React from 'react'
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { theme } from '../theme'

interface RNPageProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  scrollable?: boolean
}

export function RNPage({ title, subtitle, children, scrollable = true }: RNPageProps) {
  const content = (
    <>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </>
  )

  return (
    <SafeAreaView style={styles.safe}>
      {scrollable ? (
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        <View style={styles.container}>{content}</View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.bg },
  container: { padding: theme.spacing.md, gap: theme.spacing.sm },
  header: { marginBottom: theme.spacing.xs / 2 },
  title: { fontSize: theme.fontSize.xl + 2, fontWeight: '700', color: theme.color.textPrimary },
  subtitle: { fontSize: theme.fontSize.sm, color: theme.color.textSecondary, marginTop: 4 },
})
