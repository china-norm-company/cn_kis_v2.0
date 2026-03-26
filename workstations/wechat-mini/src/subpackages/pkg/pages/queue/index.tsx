import { useState, useEffect, useRef } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { buildSubjectEndpoints } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'
import { MiniPage, MiniCard, MiniButton } from '@/components/ui'
import { PAGE_COPY } from '@/constants/copy'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

interface QueuePositionResponse {
  position?: number
  ahead_count?: number
  wait_minutes?: number
  status?: string
  checkin_time?: string
}

export default function QueuePage() {
  const [position, setPosition] = useState(0)
  const [aheadCount, setAheadCount] = useState(0)
  const [waitMinutes, setWaitMinutes] = useState(0)
  const [status, setStatus] = useState('none')
  const [checkinTime, setCheckinTime] = useState('')
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchPosition = () => {
    subjectApi.getQueuePosition().then((res) => {
      const qData = res.data as QueuePositionResponse | null
      if (res.code === 200 && qData) {
        setPosition(qData.position || 0)
        setAheadCount(qData.ahead_count || 0)
        setWaitMinutes(qData.wait_minutes || 0)
        setStatus(qData.status || 'none')
        setCheckinTime(qData.checkin_time || '')
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }

  useEffect(() => {
    fetchPosition()
    timerRef.current = setInterval(fetchPosition, 30000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const getStatusInfo = () => {
    switch (status) {
      case 'serving': return { text: '正在为您服务', icon: '✓' }
      case 'waiting': return { text: '排队等候中', icon: '⏳' }
      case 'completed': return { text: '今日已签出', icon: '✓' }
      default: return { text: PAGE_COPY.queue.emptyQueue, icon: '—' }
    }
  }

  const statusInfo = getStatusInfo()

  if (loading) {
    return (
      <MiniPage title='排队状态'>
        <Text className='queue-loading'>加载中...</Text>
      </MiniPage>
    )
  }

  return (
    <MiniPage title='排队状态'>
      <MiniCard className='queue-status text-center'>
        <View className={`queue-status__icon queue-status__icon--${status}`}>
          <Text className='queue-status__icon-text'>{statusInfo.icon}</Text>
        </View>
        <Text className='queue-status__title'>
          {statusInfo.text}
        </Text>
        {checkinTime && (
          <Text className='queue-status__time'>
            签到时间: {checkinTime}
          </Text>
        )}
      </MiniCard>

      {status === 'waiting' && (
        <>
          <MiniCard className='queue-metrics'>
            <View className='queue-metrics__item text-center'>
              <Text className='queue-metrics__value queue-metrics__value--position'>
                {position}
              </Text>
              <Text className='queue-metrics__label'>当前排位</Text>
            </View>
            <View className='queue-metrics__item text-center'>
              <Text className='queue-metrics__value queue-metrics__value--ahead'>
                {aheadCount}
              </Text>
              <Text className='queue-metrics__label'>前面等候</Text>
            </View>
            <View className='queue-metrics__item text-center'>
              <Text className='queue-metrics__value queue-metrics__value--wait'>
                ~{waitMinutes}
              </Text>
              <Text className='queue-metrics__label'>预计(分钟)</Text>
            </View>
          </MiniCard>

          <MiniCard className='queue-tip'>
            <Text className='queue-tip__text'>
              排队信息每30秒自动刷新，叫号时将通过微信消息通知您。请保持手机通知开启。
            </Text>
          </MiniCard>
        </>
      )}

      {status === 'serving' && (
        <MiniCard className='queue-serving'>
          <Text className='queue-serving__text'>
            工作人员已准备好为您服务，请前往指定窗口。
          </Text>
        </MiniCard>
      )}

      <View className='queue-back'>
        <MiniButton variant='secondary' onClick={() => Taro.navigateBack()}>
          返回首页
        </MiniButton>
      </View>
    </MiniPage>
  )
}
