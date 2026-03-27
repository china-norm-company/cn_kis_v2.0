import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { RNBadge } from '../components/RNBadge'
import { RNEmpty } from '../components/RNEmpty'
import { theme } from '../theme'
import { PAGE_COPY, useDiaryList, useDiarySubmit } from '@cn-kis/subject-core'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'

const COPY = PAGE_COPY.diary

export function DiaryScreen() {
  useAuth()
  const diaryList = useDiaryList(rnApiClient)
  const diarySubmit = useDiarySubmit(rnApiClient)
  const [showForm, setShowForm] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    void diaryList.reload()
  }, [])

  const handleAddDiary = useCallback(async () => {
    const ok = await diarySubmit.submit({ notes: notes.trim() || undefined })
    if (ok) {
      setNotes('')
      setShowForm(false)
      void diaryList.reload()
    }
  }, [notes, diarySubmit, diaryList])

  const preview = (text?: string) => {
    if (!text) return '--'
    return text.length > 40 ? `${text.slice(0, 40)}…` : text
  }

  if (diaryList.loading && diaryList.items.length === 0) {
    return (
      <RNPage title="日记">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.color.primary} />
          <Text style={styles.loadingText}>正在加载日记</Text>
        </View>
      </RNPage>
    )
  }

  if (diaryList.error && diaryList.items.length === 0) {
    return (
      <RNPage title="日记">
        <RNEmpty
          icon="⚠️"
          title="加载失败"
          description={diaryList.error}
          actionText="重试"
          onAction={() => void diaryList.reload()}
        />
      </RNPage>
    )
  }

  return (
    <RNPage title="日记">
      <RNButton label="新增日记" onPress={() => setShowForm(true)} />
      {diaryList.items.length === 0 ? (
        <RNEmpty
          icon={COPY.empty.icon}
          title={COPY.empty.title}
          description={COPY.empty.description}
          actionText={COPY.empty.actionText}
          onAction={() => setShowForm(true)}
        />
      ) : (
        diaryList.items.map((item) => (
          <RNCard key={item.id}>
            <View style={styles.row}>
              <View style={styles.content}>
                <Text style={styles.date}>{item.entry_date}</Text>
                <Text style={styles.preview}>{preview(item.notes || item.symptoms || item.mood)}</Text>
              </View>
              <RNBadge status="completed" label="已记录" />
            </View>
          </RNCard>
        ))
      )}

      <Modal visible={showForm} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowForm(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>填写今日日记</Text>
            <TextInput
              style={styles.input}
              placeholder="记录症状、感受、用药情况…"
              placeholderTextColor={theme.color.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {diarySubmit.error ? (
              <Text style={styles.errorText}>{diarySubmit.error}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <RNButton
                label="取消"
                type="secondary"
                onPress={() => setShowForm(false)}
                disabled={diarySubmit.submitting}
              />
              <RNButton
                label="提交"
                onPress={handleAddDiary}
                disabled={diarySubmit.submitting}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </RNPage>
  )
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  loadingText: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  content: { flex: 1 },
  date: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
  },
  preview: {
    fontSize: theme.fontSize.sm,
    color: theme.color.textSecondary,
    marginTop: theme.spacing.xs / 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.color.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    width: '100%',
    maxWidth: 360,
  },
  modalTitle: {
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
    minHeight: 100,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.danger,
    marginTop: theme.spacing.xs,
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
})
