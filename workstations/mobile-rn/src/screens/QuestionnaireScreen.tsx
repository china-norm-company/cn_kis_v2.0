import React, { useEffect, useState, useCallback } from 'react'
import { Text, View, StyleSheet, TextInput, Alert } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNEmpty } from '../components/RNEmpty'
import { RNBadge } from '../components/RNBadge'
import { RNCRFField } from '../components/RNCRFField'
import { useEcrfForm, useEcrfTemplates, buildSubjectEndpoints, type EcrfTemplate } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'


export function QuestionnaireScreen() {
  const endpoints = buildSubjectEndpoints(rnApiClient)
  const templates = useEcrfTemplates(rnApiClient)
  const [selectedTemplate, setSelectedTemplate] = useState<EcrfTemplate | null>(null)
  const [questions, setQuestions] = useState<Array<{ id: string; type: string; title: string; required?: boolean }>>([])
  const [submitResult, setSubmitResult] = useState<string | null>(null)

  const form = useEcrfForm(rnApiClient, questions)

  useEffect(() => {
    void templates.loadTemplates()
  }, [])

  const loadTemplateQuestions = useCallback(async (templateId: number) => {
    try {
      const res = await rnApiClient.get<{ fields?: Array<{ id: string; type: string; label: string; required?: boolean }> }>(
        `/edc/templates/${templateId}`,
      )
      if (res.code === 200 && res.data?.fields) {
        setQuestions(res.data.fields.map((f) => ({ id: f.id, type: f.type || 'text', title: f.label, required: f.required })))
      }
    } catch {
      setQuestions([])
    }
  }, [])

  const handleSelect = (t: EcrfTemplate) => {
    setSelectedTemplate(t)
    setSubmitResult(null)
    void loadTemplateQuestions(t.id)
  }

  const handleSubmit = async () => {
    if (!selectedTemplate) return
    Alert.alert('确认提交', '提交后不可修改，确认提交问卷？', [
      { text: '取消', style: 'cancel' },
      {
        text: '提交',
        onPress: async () => {
          try {
            await form.submit(selectedTemplate.id, 1, false)
            setSubmitResult('提交成功')
          } catch {
            setSubmitResult('提交失败，请重试')
          }
        },
      },
    ])
  }

  if (selectedTemplate) {
    return (
      <RNPage title={selectedTemplate.name}>
        {questions.length === 0 ? (
          <RNCard><Text style={styles.loadingText}>加载问卷内容...</Text></RNCard>
        ) : (
          <RNCard>
            {questions.map((q) => (
              <RNCRFField
                key={q.id}
                question={q}
                value={form.formData[q.id]}
                onChange={(v) => form.setField(q.id, v)}
                error={form.errors[q.id]}
              />
            ))}
          </RNCard>
        )}

        {submitResult && (
          <RNCard>
            <Text style={[styles.result, submitResult.includes('成功') ? styles.resultOk : styles.resultFail]}>{submitResult}</Text>
          </RNCard>
        )}

        <View style={styles.actions}>
          <RNButton label="返回模板列表" type="secondary" onPress={() => { setSelectedTemplate(null); setQuestions([]) }} />
          <RNButton
            label={form.submitting ? '提交中...' : '提交问卷'}
            onPress={handleSubmit}
            disabled={form.submitting || questions.length === 0}
          />
        </View>
      </RNPage>
    )
  }

  return (
    <RNPage title="问卷填写">
      {templates.loading ? (
        <RNCard><Text style={styles.loadingText}>加载问卷模板...</Text></RNCard>
      ) : templates.templates.length === 0 ? (
        <RNEmpty icon="📋" title="暂无可用问卷" description="入组并完成相关访视后，问卷将自动开放" />
      ) : (
        templates.templates.map((t) => (
          <RNCard key={t.id}>
            <View style={styles.templateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.templateTitle}>{t.name}</Text>
              </View>
              <RNButton label="填写" type="secondary" onPress={() => handleSelect(t)} />
            </View>
          </RNCard>
        ))
      )}
    </RNPage>
  )
}

const styles = StyleSheet.create({
  loadingText: { color: theme.color.textSecondary, textAlign: 'center' },
  templateRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  templateTitle: { fontSize: theme.fontSize.md, fontWeight: '500', color: theme.color.textPrimary },
  templateDesc: { fontSize: theme.fontSize.xs, color: theme.color.textSecondary, marginTop: 2 },
  actions: { gap: theme.spacing.sm },
  result: { fontSize: theme.fontSize.sm, textAlign: 'center', fontWeight: '500' },
  resultOk: { color: theme.color.success },
  resultFail: { color: theme.color.danger },
})
