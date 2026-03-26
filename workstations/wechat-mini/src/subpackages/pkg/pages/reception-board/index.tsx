import { useState, useCallback } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { taroApiClient, taroAuthProvider } from '@/adapters/subject-core'
import { getLocalRoles } from '@/utils/auth'
import { isReceptionist, isFieldExecutor } from '@cn-kis/subject-core'
import './index.scss'

interface QueueItem {
  id: number
  subject_name: string
  subject_no: string
  queue_number: number
  status: string
  arrive_time: string | null
  scheduled_time: string | null
  project_name: string
}

interface TodayQueueData {
  total: number
  waiting: number
  serving: number
  completed: number
  items: QueueItem[]
}

const STATUS_LABEL: Record<string, string> = {
  waiting: '等待中',
  calling: '叫号中',
  serving: '服务中',
  completed: '已完成',
  no_show: '未到场',
}

const STATUS_CLASS: Record<string, string> = {
  waiting: 'queue-item--waiting',
  calling: 'queue-item--calling',
  serving: 'queue-item--serving',
  completed: 'queue-item--completed',
  no_show: 'queue-item--no-show',
}

export default function ReceptionBoardPage() {
  const [queueData, setQueueData] = useState<TodayQueueData | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkinLoading, setCheckinLoading] = useState<number | null>(null)

  const loadTodayQueue = useCallback(async () => {
    if (!taroAuthProvider.isLoggedIn()) {
      Taro.redirectTo({ url: '/pages/index/index' })
      return
    }
    // 角色守卫：只有 receptionist 或 FIELD_EXECUTOR 才能访问接待看板
    const roles = getLocalRoles()
    if (!isReceptionist(roles) && !isFieldExecutor(roles)) {
      Taro.showToast({ title: '暂无权限', icon: 'none', duration: 2000 })
      Taro.redirectTo({ url: '/pages/index/index' })
      return
    }
    setLoading(true)
    try {
      const res = await taroApiClient.get('/reception/today-queue')
      const data = res.data as TodayQueueData | null
      if (res.code === 200 && data) {
        setQueueData(data)
      }
    } catch (e) {
      console.error('加载排队数据失败', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useDidShow(() => {
    loadTodayQueue()
  })

  const handleCheckin = async (subjectId: number) => {
    setCheckinLoading(subjectId)
    try {
      const scanResult = await Taro.scanCode({ onlyFromCamera: false })
      if (!scanResult.result) {
        Taro.showToast({ title: '扫码取消', icon: 'none' })
        return
      }
      const match = scanResult.result.match(/\/qr\/([a-f0-9]+)/)
      if (!match) {
        Taro.showToast({ title: '无效二维码', icon: 'none' })
        return
      }
      const res = await taroApiClient.post('/reception/quick-checkin', {
        subject_id: subjectId,
        qr_hash: match[1],
      })
      if (res.code === 200) {
        Taro.showToast({ title: '签到成功', icon: 'success' })
        await loadTodayQueue()
      } else {
        Taro.showToast({ title: (res as { msg?: string }).msg || '签到失败', icon: 'none' })
      }
    } catch (e) {
      Taro.showToast({ title: '操作失败，请重试', icon: 'none' })
    } finally {
      setCheckinLoading(null)
    }
  }

  const renderSummary = () => (
    <View className='reception-summary'>
      <View className='reception-summary__item'>
        <Text className='reception-summary__num'>{queueData?.total ?? 0}</Text>
        <Text className='reception-summary__label'>今日预约</Text>
      </View>
      <View className='reception-summary__item reception-summary__item--warning'>
        <Text className='reception-summary__num'>{queueData?.waiting ?? 0}</Text>
        <Text className='reception-summary__label'>等待中</Text>
      </View>
      <View className='reception-summary__item reception-summary__item--active'>
        <Text className='reception-summary__num'>{queueData?.serving ?? 0}</Text>
        <Text className='reception-summary__label'>服务中</Text>
      </View>
      <View className='reception-summary__item reception-summary__item--done'>
        <Text className='reception-summary__num'>{queueData?.completed ?? 0}</Text>
        <Text className='reception-summary__label'>已完成</Text>
      </View>
    </View>
  )

  const renderQueueItem = (item: QueueItem) => (
    <View
      key={item.id}
      className={`queue-item ${STATUS_CLASS[item.status] || ''}`}
    >
      <View className='queue-item__header'>
        <View className='queue-item__num-badge'>
          <Text className='queue-item__num'>#{item.queue_number}</Text>
        </View>
        <View className='queue-item__info'>
          <Text className='queue-item__name'>{item.subject_name}</Text>
          <Text className='queue-item__no'>{item.subject_no}</Text>
        </View>
        <Text className={`queue-item__status queue-item__status--${item.status}`}>
          {STATUS_LABEL[item.status] || item.status}
        </Text>
      </View>
      <View className='queue-item__detail'>
        <Text className='queue-item__project'>{item.project_name}</Text>
        {item.scheduled_time ? (
          <Text className='queue-item__time'>预约: {item.scheduled_time}</Text>
        ) : null}
        {item.arrive_time ? (
          <Text className='queue-item__time'>到达: {item.arrive_time}</Text>
        ) : null}
      </View>
      {item.status === 'waiting' || item.status === 'calling' ? (
        <View
          className='queue-item__checkin-btn'
          onClick={() => handleCheckin(item.id)}
        >
          <Text className='queue-item__checkin-text'>
            {checkinLoading === item.id ? '签到中...' : '扫码签到'}
          </Text>
        </View>
      ) : null}
    </View>
  )

  return (
    <View className='reception-board'>
      <View className='reception-board__header'>
        <Text className='reception-board__title'>接待看板</Text>
        <View
          className='reception-board__refresh'
          onClick={() => loadTodayQueue()}
        >
          <Text className='reception-board__refresh-text'>刷新</Text>
        </View>
      </View>

      {renderSummary()}

      {loading ? (
        <View className='reception-board__loading'>
          <Text className='reception-board__loading-text'>加载中...</Text>
        </View>
      ) : (
        <ScrollView className='reception-board__list' scrollY>
          {queueData?.items.length === 0 ? (
            <View className='reception-board__empty'>
              <Text className='reception-board__empty-text'>今日暂无预约受试者</Text>
            </View>
          ) : (
            queueData?.items.map(renderQueueItem)
          )}
        </ScrollView>
      )}
    </View>
  )
}
