import { View, Text, Textarea, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect } from 'react'
import { useDiaryList, useDiarySubmit } from '@cn-kis/subject-core'
import { taroApiClient } from '../../adapters/subject-core'
import { MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'
import './index.scss'

const MOOD_OPTIONS = ['很好', '良好', '一般', '不适', '很差']

export default function DiaryPage() {
  const { items: entries, reload: fetchEntries } = useDiaryList(taroApiClient)
  const { submit, submitting: loading } = useDiarySubmit(taroApiClient)
  const [showForm, setShowForm] = useState(false)
  const [mood, setMood] = useState('良好')
  const [symptoms, setSymptoms] = useState('')
  const [medTaken, setMedTaken] = useState(true)
  const [notes, setNotes] = useState('')

  useEffect(() => { fetchEntries() }, [])

  const handleSubmit = async () => {
    if (loading) return
    try {
      const ok = await submit({ mood, symptoms, medication_taken: medTaken, notes })
      if (ok) {
        Taro.showToast({ title: '记录成功', icon: 'success' })
        setShowForm(false)
        setSymptoms('')
        setNotes('')
        fetchEntries()
      }
    } catch {
      Taro.showToast({ title: '记录失败', icon: 'none' })
    }
  }

  const todayRecorded = entries.some(
    e => e.entry_date === new Date().toISOString().slice(0, 10)
  )

  return (
    <View className="diary-page">
      <View className="header">
        <Text className="title">受试者日记</Text>
        <Text className="subtitle">请每日记录您的健康状况</Text>
      </View>

      {!todayRecorded && !showForm && (
        <View className="today-prompt" onClick={() => setShowForm(true)}>
          <Text className="prompt-text">今日尚未记录，点击填写</Text>
        </View>
      )}

      {showForm && (
        <View className="form-card">
          <View className="form-group">
            <Text className="label">今日感受</Text>
            <Picker
              mode="selector"
              range={MOOD_OPTIONS}
              value={MOOD_OPTIONS.indexOf(mood)}
              onChange={(e) => setMood(MOOD_OPTIONS[Number(e.detail.value)])}
            >
              <View className="picker-value">{mood}</View>
            </Picker>
          </View>

          <View className="form-group">
            <Text className="label">症状描述（如有）</Text>
            <Textarea
              className="input-area"
              placeholder="请描述今日出现的任何不适..."
              value={symptoms}
              onInput={(e) => setSymptoms(e.detail.value)}
              maxlength={500}
            />
          </View>

          <View className="form-group">
            <Text className="label">是否按时使用产品/药物</Text>
            <View className="toggle-group">
              <View
                className={`toggle-btn ${medTaken ? 'active' : ''}`}
                onClick={() => setMedTaken(true)}
              >
                <Text>是</Text>
              </View>
              <View
                className={`toggle-btn ${!medTaken ? 'active' : ''}`}
                onClick={() => setMedTaken(false)}
              >
                <Text>否</Text>
              </View>
            </View>
          </View>

          <View className="form-group">
            <Text className="label">其他备注</Text>
            <Textarea
              className="input-area"
              placeholder="选填"
              value={notes}
              onInput={(e) => setNotes(e.detail.value)}
              maxlength={500}
            />
          </View>

          <View className="form-actions">
            <View className="btn-cancel" onClick={() => setShowForm(false)}>
              <Text>取消</Text>
            </View>
            <View className="btn-submit" onClick={handleSubmit}>
              <Text>{loading ? '提交中...' : '提交记录'}</Text>
            </View>
          </View>
        </View>
      )}

      <View className="entries-section">
        <Text className="section-title">历史记录</Text>
        {entries.length === 0 ? (
          <View className="empty">
            <MiniEmpty
              title={PAGE_COPY.diary.empty.title}
              description={PAGE_COPY.diary.empty.description}
              icon={PAGE_COPY.diary.empty.icon}
              actionText={PAGE_COPY.diary.empty.actionText}
              onAction={() => setShowForm(true)}
            />
          </View>
        ) : (
          entries.map(entry => (
            <View className="entry-card" key={entry.id}>
              <View className="entry-header">
                <Text className="entry-date">{entry.entry_date}</Text>
                <Text className={`entry-mood mood-${entry.mood}`}>{entry.mood}</Text>
              </View>
              {entry.symptoms && (
                <View className="entry-row">
                  <Text className="row-label">症状：</Text>
                  <Text className="row-value">{entry.symptoms}</Text>
                </View>
              )}
              <View className="entry-row">
                <Text className="row-label">用药：</Text>
                <Text className="row-value">{entry.medication_taken ? '已按时使用' : '未使用'}</Text>
              </View>
              {entry.notes && (
                <View className="entry-row">
                  <Text className="row-label">备注：</Text>
                  <Text className="row-value">{entry.notes}</Text>
                </View>
              )}
            </View>
          ))
        )}
      </View>
    </View>
  )
}
