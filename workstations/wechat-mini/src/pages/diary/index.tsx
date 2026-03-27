import { View, Text, Textarea, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useState, useEffect, useRef } from 'react'
import { useDiaryList, useDiarySubmit } from '@cn-kis/subject-core'
import type { MyDiaryEntryItem } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'
import { PAGE_COPY } from '@/constants/copy'
import './index.scss'

function getTodayDateStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 历史记录示例数据（无真实数据时展示已填写/未填写示例） */
function getSampleDiaryEntries(): MyDiaryEntryItem[] {
  const today = new Date()
  const d1 = new Date(today)
  d1.setDate(d1.getDate() - 1)
  const d2 = new Date(today)
  d2.setDate(d2.getDate() - 2)
  const date1 = d1.toISOString().slice(0, 10)
  const date2 = d2.toISOString().slice(0, 10)
  return [
    {
      id: -1,
      entry_date: date1,
      mood: '良好',
      symptoms: '',
      medication_taken: true,
      notes: '',
    },
    {
      id: -2,
      entry_date: date2,
      mood: '不适',
      symptoms: '轻微头痛',
      medication_taken: true,
      notes: '程度：轻微；开始时间：约1小时；持续时长：约30分钟',
    },
  ]
}

/** 最近 n 天的日期列表，从新到旧（今天在前） */
function getRecentDays(n: number): string[] {
  const list: string[] = []
  const today = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    list.push(d.toISOString().slice(0, 10))
  }
  return list
}

/** 补填允许的天数（GCP：在规定时间内补填） */
const MAKEUP_DAYS_LIMIT = 7

export default function DiaryPage() {
  const { items: entriesFromApi, reload: fetchEntries } = useDiaryList(taroApiClient)
  const entries = entriesFromApi.length > 0 ? entriesFromApi : getSampleDiaryEntries()
  const { submit, submitting: loading } = useDiarySubmit(taroApiClient)
  const [showIntroModal, setShowIntroModal] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [fillDate, setFillDate] = useState(getTodayDateStr())
  const [medTaken, setMedTaken] = useState(true)
  const [hasAdverse, setHasAdverse] = useState(false)
  const [symptoms, setSymptoms] = useState('')
  const [severity, setSeverity] = useState('')
  const [symptomStart, setSymptomStart] = useState('')
  const [symptomDuration, setSymptomDuration] = useState('')
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [viewingEntry, setViewingEntry] = useState<MyDiaryEntryItem | null>(null)
  const [scrollIntoViewId, setScrollIntoViewId] = useState('')
  const hasShownIntroRef = useRef(false)

  useEffect(() => { fetchEntries() }, [])

  // 2.1 填写前说明弹窗：今日未填时进入页面仅弹窗一次（无记录或没有今日记录都算「今日未填」）
  useEffect(() => {
    if (hasShownIntroRef.current) return
    const todayStr = getTodayDateStr()
    const todayRecordedApi = entriesFromApi.some(e => e.entry_date === todayStr)
    if (!todayRecordedApi && !showForm) {
      setShowIntroModal(true)
      hasShownIntroRef.current = true
    }
  }, [entriesFromApi, showForm])

  const doSubmit = async () => {
    if (loading) return
    const err = getSubmitValidationError()
    if (err) {
      setShowSubmitConfirm(false)
      Taro.showToast({ title: err, icon: 'none' })
      return
    }
    setShowSubmitConfirm(false)
    const mood = hasAdverse ? '不适' : '良好'
    const symptomsVal = hasAdverse ? symptoms : ''
    const result = await submit({
      mood,
      symptoms: symptomsVal,
      medication_taken: medTaken,
      symptom_severity: hasAdverse ? severity : '',
      symptom_onset: hasAdverse ? symptomStart : '',
      symptom_duration: hasAdverse ? symptomDuration : '',
      notes: '',
      entry_date: fillDate,
    })
    if (result.ok) {
      Taro.showToast({ title: '记录成功', icon: 'success' })
      setShowForm(false)
      setSymptoms('')
      setSeverity('')
      setSymptomStart('')
      setSymptomDuration('')
      setHasAdverse(false)
      fetchEntries()
    } else {
      Taro.showToast({ title: result.msg, icon: 'none' })
    }
  }

  /** 校验当前显示的题目是否均已填写，未通过返回提示文案 */
  const getSubmitValidationError = (): string | null => {
    if (hasAdverse) {
      if (!symptoms.trim()) return '请填写出现的症状'
      if (!severity) return '请选择症状程度'
      if (!symptomStart.trim()) return '请填写症状开始时间'
      if (!symptomDuration.trim()) return '请填写症状持续时间'
    }
    return null
  }

  const handleSubmit = () => {
    if (loading) return
    const err = getSubmitValidationError()
    if (err) {
      Taro.showToast({ title: err, icon: 'none' })
      return
    }
    const needConfirm = !medTaken || hasAdverse
    if (needConfirm) {
      setShowSubmitConfirm(true)
    } else {
      doSubmit()
    }
  }

  const todayRecorded = entriesFromApi.some(
    e => e.entry_date === getTodayDateStr()
  )

  const scrollToForm = () => {
    setScrollIntoViewId('')
    setTimeout(() => setScrollIntoViewId('diary-form-anchor'), 100)
    setTimeout(() => setScrollIntoViewId(''), 600)
  }

  const closeIntroAndOpenForm = () => {
    setShowIntroModal(false)
    setFillDate(getTodayDateStr())
    setShowForm(true)
    scrollToForm()
  }

  const openFormForDate = (dateStr: string) => {
    setFillDate(dateStr)
    setMedTaken(true)
    setHasAdverse(false)
    setSymptoms('')
    setSeverity('')
    setSymptomStart('')
    setSymptomDuration('')
    setShowForm(true)
    scrollToForm()
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setSymptoms('')
    setSeverity('')
    setSymptomStart('')
    setSymptomDuration('')
    setHasAdverse(false)
  }

  return (
    <View className="diary-page">
      <View className="header">
        <Text className="title">受试者日记</Text>
      </View>

      <ScrollView
        className="diary-page__scroll"
        scrollY
        scrollIntoView={scrollIntoViewId}
        enhanced
        showScrollbar={false}
      >
      {/* 2.1 填写前说明弹窗：今日未填时进入先弹窗 */}
      {showIntroModal && (
        <View className="diary-intro-mask" onClick={() => setShowIntroModal(false)}>
          <View className="diary-intro-modal" onClick={(e) => e.stopPropagation()}>
            <Text className="diary-intro-modal__title">{PAGE_COPY.diary.introTitle}</Text>
            <View className="diary-intro-modal__block">
              <Text className="diary-intro-modal__label">产品使用方法</Text>
              <Text className="diary-intro-modal__text">{PAGE_COPY.diary.productUsage}</Text>
            </View>
            <View className="diary-intro-modal__block">
              <Text className="diary-intro-modal__label">注意事项</Text>
              <Text className="diary-intro-modal__text">{PAGE_COPY.diary.precautions}</Text>
            </View>
            <View className="diary-intro-modal__block">
              <Text className="diary-intro-modal__label">填写时间窗</Text>
              <Text className="diary-intro-modal__text">{PAGE_COPY.diary.timeWindowTip}</Text>
            </View>
            <View className="diary-intro-modal__btn" onClick={closeIntroAndOpenForm}>
              <Text>{PAGE_COPY.diary.startFill}</Text>
            </View>
          </View>
        </View>
      )}

      {!todayRecorded && !showForm && (
        <View className="today-prompt" onClick={() => {
          setFillDate(getTodayDateStr())
          setShowForm(true)
          scrollToForm()
        }}>
          <Text className="prompt-text">今日尚未记录，点击填写</Text>
        </View>
      )}

      {/* 提交前确认弹窗：未使用产品或有不舒适症状时提示提交后不可修改，文案与选项对应 */}
      {showSubmitConfirm && (
        <View className="diary-intro-mask" onClick={() => setShowSubmitConfirm(false)}>
          <View className="diary-intro-modal diary-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <Text className="diary-intro-modal__title">{PAGE_COPY.diary?.submitConfirmTitle ?? '请确认提交内容'}</Text>
            <Text className="diary-intro-modal__text diary-confirm-modal__message">
              {(() => {
                const parts: string[] = []
                if (!medTaken) parts.push('未使用产品')
                if (hasAdverse) parts.push('有不舒适症状')
                const content = parts.length > 0
                  ? `您填写了「${parts.join('」和「')}」，提交后将不可修改。是否确认提交？`
                  : (PAGE_COPY.diary?.submitConfirmMessage ?? '提交后将不可修改。是否确认提交？')
                return content
              })()}
            </Text>
            <View className="diary-confirm-modal__actions">
              <View className="diary-intro-modal__btn diary-confirm-modal__btn--cancel" onClick={() => setShowSubmitConfirm(false)}>
                <Text>{PAGE_COPY.diary?.submitConfirmCancel ?? '取消'}</Text>
              </View>
              <View className="diary-intro-modal__btn" onClick={() => doSubmit()}>
                <Text>{PAGE_COPY.diary?.submitConfirmOk ?? '确认提交'}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* 已填写记录仅可查看（只读详情弹窗） */}
      {viewingEntry && (
        <View className="diary-intro-mask" onClick={() => setViewingEntry(null)}>
          <View className="diary-intro-modal diary-view-modal" onClick={(e) => e.stopPropagation()}>
            <Text className="diary-intro-modal__title">日记详情</Text>
            <View className="diary-view-modal__row">
              <Text className="diary-view-modal__label">规定使用日期</Text>
              <Text className="diary-view-modal__value">{viewingEntry.entry_date}</Text>
            </View>
            <View className="diary-view-modal__row">
              <Text className="diary-view-modal__label">使用</Text>
              <Text className="diary-view-modal__value">{viewingEntry.medication_taken ? '是' : '否'}</Text>
            </View>
            <View className="diary-view-modal__row">
              <Text className="diary-view-modal__label">不良情况</Text>
              <Text className="diary-view-modal__value">{viewingEntry.symptoms ? '有' : '没有'}</Text>
            </View>
            {viewingEntry.symptoms && (
              <View className="diary-view-modal__row">
                <Text className="diary-view-modal__label">症状</Text>
                <Text className="diary-view-modal__value">{viewingEntry.symptoms}</Text>
              </View>
            )}
            {viewingEntry.notes && (
              <View className="diary-view-modal__row">
                <Text className="diary-view-modal__label">备注</Text>
                <Text className="diary-view-modal__value">{viewingEntry.notes}</Text>
              </View>
            )}
            <View className="diary-intro-modal__btn diary-view-modal__close" onClick={() => setViewingEntry(null)}>
              <Text>关闭</Text>
            </View>
          </View>
        </View>
      )}

      {showForm && (
        <View className="form-card" id="diary-form-anchor">
          {fillDate < getTodayDateStr() && (
            <View className="diary-makeup-notice">
              <Text className="diary-makeup-notice__text">
                补填说明：本记录为补填，规定使用日期为
                <Text className="diary-makeup-notice__date">{fillDate}</Text>
                （即本记录对应的补填日志的规定使用日期）。请如实填写该日期的使用与症状情况，提交后不可修改。
              </Text>
            </View>
          )}
          <View className="form-group">
            <Text className="label">{PAGE_COPY.diary?.useDateLabel ?? '规定使用日期'}</Text>
            <Text className="diary-form-readonly">{fillDate}</Text>
          </View>

          <View className="form-group">
            <Text className="label">{PAGE_COPY.diary?.useLabel ?? '使用'}</Text>
            <View className="toggle-group">
              <View className={`toggle-btn ${medTaken ? 'active' : ''}`} onClick={() => setMedTaken(true)}>
                <Text>是</Text>
              </View>
              <View className={`toggle-btn ${!medTaken ? 'active' : ''}`} onClick={() => setMedTaken(false)}>
                <Text>否</Text>
              </View>
            </View>
          </View>

          <View className="form-group">
            <Text className="label">{PAGE_COPY.diary?.noAdverseLabel ?? '未发生任何不良情况'}</Text>
            <View className="toggle-group">
              <View className={`toggle-btn ${!hasAdverse ? 'active' : ''}`} onClick={() => setHasAdverse(false)}>
                <Text>{PAGE_COPY.diary?.noAdverseOption ?? '没有'}</Text>
              </View>
              <View className={`toggle-btn ${hasAdverse ? 'active' : ''}`} onClick={() => setHasAdverse(true)}>
                <Text>{PAGE_COPY.diary?.hasAdverseOption ?? '有'}</Text>
              </View>
            </View>
          </View>

          {hasAdverse && (
            <>
              <View className="form-group">
                <Text className="label">{PAGE_COPY.diary?.symptomLabel ?? '出现的症状'}</Text>
                <Textarea
                  className="input-area"
                  placeholder="请描述出现的症状"
                  value={symptoms}
                  onInput={(e) => setSymptoms(e.detail.value)}
                  maxlength={500}
                />
              </View>
              <View className="form-group">
                <Text className="label">{PAGE_COPY.diary?.severityLabel ?? '症状程度'}</Text>
                <View className="toggle-group toggle-group--four">
                  {(PAGE_COPY.diary?.severityOptions ?? ['非常轻微', '轻微', '中度', '严重']).map((opt) => (
                    <View
                      key={opt}
                      className={`toggle-btn ${severity === opt ? 'active' : ''}`}
                      onClick={() => setSeverity(opt)}
                    >
                      <Text>{opt}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View className="form-group">
                <Text className="label">{PAGE_COPY.diary?.symptomStartLabel ?? '症状开始时间'}</Text>
                <Text className="form-sublabel">{PAGE_COPY.diary?.symptomStartSublabel ?? '使用产品后多长时间开始有反应？'}</Text>
                <Textarea
                  className="input-area input-area--short"
                  placeholder="选填，如：约30分钟"
                  value={symptomStart}
                  onInput={(e) => setSymptomStart(e.detail.value)}
                  maxlength={100}
                />
              </View>
              <View className="form-group">
                <Text className="label">{PAGE_COPY.diary?.symptomDurationLabel ?? '症状持续时间'}</Text>
                <Text className="form-sublabel">{PAGE_COPY.diary?.symptomDurationSublabel ?? '反应的特征持续了多长时间？'}</Text>
                <Textarea
                  className="input-area input-area--short"
                  placeholder="选填，如：约2小时"
                  value={symptomDuration}
                  onInput={(e) => setSymptomDuration(e.detail.value)}
                  maxlength={100}
                />
              </View>
            </>
          )}

          <View className="form-actions">
            <View className="btn-cancel" onClick={handleCancelForm}>
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
        {(() => {
          const allDays = getRecentDays(14)
          const entryByDate = new Map(entries.map(e => [e.entry_date, e]))
          const todayStr = getTodayDateStr()
          // 今日只有填写后才出现在历史记录中；过去日期照常展示
          const days = allDays.filter(
            (dateStr) => dateStr !== todayStr || !!entryByDate.get(dateStr)
          )
          const todayMs = new Date(todayStr).getTime()
          const oneDayMs = 24 * 60 * 60 * 1000
          return days.map((dateStr) => {
              const entry = entryByDate.get(dateStr)
              const isFilled = !!entry
              // 按实际日期差计算「距今天数」，避免与列表顺序不一致导致 3 月 12 不可补、3 月 9 可补的颠倒
              const daysAgo = Math.round((todayMs - new Date(dateStr).getTime()) / oneDayMs)
              const canMakeup = daysAgo >= 0 && daysAgo <= MAKEUP_DAYS_LIMIT
              return (
                <View className="entry-card" key={dateStr}>
                  <View className="entry-header">
                    <Text className="entry-date">{dateStr}</Text>
                    <Text className={`entry-status ${isFilled ? 'entry-status--filled' : 'entry-status--unfilled'}`}>
                      {isFilled ? '已填写' : '未填写'}
                    </Text>
                  </View>
                  {isFilled ? (
                    <>
                      <View className="entry-row">
                        <Text className="row-label">使用：</Text>
                        <Text className="row-value">{entry.medication_taken ? '是' : '否'}</Text>
                      </View>
                      <View className="entry-row">
                        <Text className="row-label">不良情况：</Text>
                        <Text className="row-value">{entry.symptoms ? '有' : '没有'}</Text>
                      </View>
                      {entry.symptoms && (
                        <View className="entry-row">
                          <Text className="row-label">症状：</Text>
                          <Text className="row-value">{entry.symptoms}</Text>
                        </View>
                      )}
                      <View className="entry-row entry-row--action">
                        <Text className="entry-link" onClick={() => setViewingEntry(entry)}>{PAGE_COPY.diary?.viewOnly ?? '查看'}</Text>
                      </View>
                    </>
                  ) : (
                    <View className="entry-row entry-row--action">
                      {canMakeup ? (
                        <Text className="entry-link entry-link--fill" onClick={() => openFormForDate(dateStr)}>补填</Text>
                      ) : (
                        <Text className="entry-link entry-link--expired">{PAGE_COPY.diary?.makeupExpired ?? '已过补填期限'}</Text>
                      )}
                    </View>
                  )}
                </View>
              )
            })
        })()}
      </View>
      </ScrollView>
    </View>
  )
}
