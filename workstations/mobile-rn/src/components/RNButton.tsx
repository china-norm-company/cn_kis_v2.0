import React from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'
import { theme } from '../theme'

interface RNButtonProps {
  label: string
  onPress: () => void
  type?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  testID?: string
}

export function RNButton({ label, onPress, type = 'primary', disabled = false, testID }: RNButtonProps) {
  const btnStyle = type === 'secondary' ? styles.secondary : type === 'danger' ? styles.danger : styles.primary
  const textStyle = type === 'secondary' ? styles.secondaryText : styles.lightText

  return (
    <Pressable
      testID={testID}
      accessibilityLabel={testID || label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.btn, btnStyle, disabled && styles.disabled]}
    >
      <Text style={[styles.text, textStyle]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  btn: { borderRadius: theme.radius.sm + 2, paddingVertical: 12, alignItems: 'center', minHeight: theme.touchMinHeight },
  primary: { backgroundColor: theme.color.primary },
  secondary: { backgroundColor: theme.color.primaryLight },
  danger: { backgroundColor: theme.color.danger },
  disabled: { opacity: 0.5 },
  text: { fontSize: theme.fontSize.md - 1, fontWeight: '600' },
  lightText: { color: '#fff' },
  secondaryText: { color: theme.color.primary },
})
