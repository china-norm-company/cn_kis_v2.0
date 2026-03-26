import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { RNPage } from '../components/RNPage'
import { RNCard } from '../components/RNCard'
import { RNButton } from '../components/RNButton'
import { rnApiClient } from '../adapters/rnApiClient'
import { useAuth } from '../contexts/AuthContext'
import { theme } from '../theme'

export function NpsScreen() {
  useAuth()
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = useCallback(async () => {
    if (score == null) return
    setLoading(true)
    setError(null)
    try {
      const res = await rnApiClient.post('/my/nps', {
        score,
        comment: comment.trim() || undefined,
      })
      if (res.code === 200) {
        setSuccess(true)
      } else {
        setError(res.msg || '提交失败')
      }
    } catch {
      setError('网络异常')
    } finally {
      setLoading(false)
    }
  }, [score, comment])

  if (success) {
    return (
      <RNPage title="NPS 评分">
        <RNCard>
          <Text style={styles.successText}>感谢您的反馈！</Text>
        </RNCard>
      </RNPage>
    )
  }

  return (
    <RNPage title="NPS 评分">
      <RNCard>
        <Text style={styles.sectionTitle}>您有多大可能向朋友推荐本研究？（0-10）</Text>
        <View style={styles.scoreRow}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <Pressable
              key={n}
              style={[styles.scoreBtn, score === n && styles.scoreBtnActive]}
              onPress={() => setScore(n)}
            >
              <Text style={[styles.scoreText, score === n && styles.scoreTextActive]}>{n}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>补充说明（选填）</Text>
        <TextInput
          style={styles.input}
          placeholder="如有其他建议，欢迎留言"
          placeholderTextColor={theme.color.textMuted}
          value={comment}
          onChangeText={setComment}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          editable={!loading}
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <RNButton
          label="提交"
          onPress={handleSubmit}
          disabled={loading || score == null}
        />
      </RNCard>
    </RNPage>
  )
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.md,
  },
  scoreRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.lg,
  },
  scoreBtn: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreBtnActive: {
    backgroundColor: theme.color.primary,
    borderColor: theme.color.primary,
  },
  scoreText: {
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
  },
  scoreTextActive: {
    color: '#fff',
  },
  label: {
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    color: theme.color.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.md,
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
    minHeight: 80,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    fontSize: theme.fontSize.sm,
    color: theme.color.danger,
    marginBottom: theme.spacing.sm,
  },
  successText: {
    fontSize: theme.fontSize.md,
    color: theme.color.textPrimary,
    lineHeight: 24,
  },
})
