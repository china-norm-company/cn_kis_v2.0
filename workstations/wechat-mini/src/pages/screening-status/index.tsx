import { useState, useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { buildSubjectEndpoints, type MyScreeningStatusEntry } from '@cn-kis/subject-core'
import { taroApiClient } from '../../adapters/subject-core'
import { MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

const STATUS_LABELS: Record<string, string> = {
  registered: '已报名', confirmed: '已确认', screening: '筛选中',
  enrolled: '已入组', withdrawn: '已退出', rejected: '未通过',
  pass: '通过', fail: '未通过', pending: '待评估',
}

const STEP_CLASS: Record<string, string> = {
  pass: 'step-color-pass',
  enrolled: 'step-color-pass',
  confirmed: 'step-color-confirmed',
  fail: 'step-color-fail',
  rejected: 'step-color-fail',
  withdrawn: 'step-color-withdrawn',
  pending: 'step-color-pending',
  registered: 'step-color-confirmed',
  screening: 'step-color-pending',
}

export default function ScreeningStatusPage() {
  const [entries, setEntries] = useState<MyScreeningStatusEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const loadStatus = () => {
    setLoading(true)
    setLoadError('')
    subjectApi.getMyScreeningStatus()
      .then(res => {
        const ssData = res.data as { items?: MyScreeningStatusEntry[] } | null
        if (res.code === 200) setEntries(ssData?.items || [])
        else setLoadError(res.msg || '筛选进度加载失败，请稍后重试')
        setLoading(false)
      })
      .catch(() => {
        setLoadError('网络异常，筛选进度暂时不可用，请稍后重试')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadStatus()
  }, [])

  if (loading) {
    return (
      <View className="ss-page">
        <View className="ss-page__header"><Text className="ss-page__title">我的筛选进度</Text></View>
        <Text className="ss-loading">正在同步筛选进度，请稍候...</Text>
      </View>
    )
  }

  if (entries.length === 0) {
    return (
      <View className="ss-page">
        <View className="ss-page__header"><Text className="ss-page__title">我的筛选进度</Text></View>
        <MiniEmpty
          title={PAGE_COPY.screeningStatus.empty.title}
          description={PAGE_COPY.screeningStatus.empty.description}
          icon={PAGE_COPY.screeningStatus.empty.icon}
          actionText={PAGE_COPY.screeningStatus.empty.actionText}
          onAction={() => Taro.navigateTo({ url: '/pages/projects/index' })}
        />
      </View>
    )
  }

  return (
    <View className="ss-page">
      <View className="ss-page__header"><Text className="ss-page__title">我的筛选进度</Text></View>
      {loadError ? (
        <View className="entry-card">
          <Text className="step-notes">{loadError}</Text>
          <Text className="step-status step-color-pending" onClick={loadStatus}>点击重试</Text>
        </View>
      ) : null}
      {entries.map(entry => (
        <View key={entry.registration_id} className="entry-card">
          <Text className="entry-no">报名号: {entry.registration_no}</Text>

          {/* 进度步骤 */}
          <View className="steps">
            <StepItem
              label="报名"
              status={entry.reg_status}
              date={entry.reg_date?.slice(0, 10)}
              active
            />
            <StepItem
              label="粗筛"
              status={entry.pre_screening?.result || (entry.pre_screening ? 'pending' : '')}
              date={entry.pre_screening?.date || undefined}
              active={!!entry.pre_screening}
              notes={entry.pre_screening?.notes}
            />
            <StepItem
              label="正式筛选"
              status={entry.screening?.result || (entry.screening ? 'pending' : '')}
              date={entry.screening?.date || undefined}
              active={!!entry.screening}
              notes={entry.screening?.notes}
            />
            <StepItem
              label="入组"
              status={entry.enrollment?.status || ''}
              date={entry.enrollment?.date || undefined}
              active={!!entry.enrollment}
              isLast
            />
          </View>
        </View>
      ))}
    </View>
  )
}

function StepItem({ label, status, date, active, notes, isLast }: {
  label: string; status: string; date?: string;
  active?: boolean; notes?: string; isLast?: boolean
}) {
  const colorClass = STEP_CLASS[status] || 'step-color-default'
  const statusText = STATUS_LABELS[status] || (active ? '处理中' : '等待中')

  return (
    <View className="step-item">
      <View className="step-indicator">
        <View className={`step-dot ${active ? colorClass : 'step-dot-inactive'}`} />
        {!isLast && <View className="step-line" />}
      </View>
      <View className="step-content">
        <View className="step-header">
          <Text className="step-label">{label}</Text>
          <Text className={`step-status ${colorClass}`}>{statusText}</Text>
        </View>
        {date && <Text className="step-date">{date}</Text>}
        {notes && <Text className="step-notes">{notes}</Text>}
      </View>
    </View>
  )
}
