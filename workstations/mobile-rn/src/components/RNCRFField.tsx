import React from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import type { EcrfQuestion } from '@cn-kis/subject-core'

interface RNCRFFieldProps {
  question: EcrfQuestion
  value: unknown
  onChange: (value: unknown) => void
  error?: string
}

export function RNCRFField({ question, value, onChange, error }: RNCRFFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>
        {question.title}
        {question.required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : undefined]}
        value={value == null ? '' : String(value)}
        keyboardType={question.type === 'number' ? 'numeric' : 'default'}
        onChangeText={(v) => onChange(question.type === 'number' ? Number(v) : v)}
        placeholder={question.placeholder || '请输入'}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 14, color: '#111827', marginBottom: 6 },
  required: { color: '#dc2626' },
  input: { backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  inputError: { borderColor: '#dc2626' },
  error: { color: '#dc2626', marginTop: 4, fontSize: 12 },
})
