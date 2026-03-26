import { useEffect, useMemo, useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { MiniCard, MiniEmpty, MiniPage } from '../../components/ui'
import { buildSubjectEndpoints, type MyProductItem, type MyProductReminderItem } from '@cn-kis/subject-core'
import { taroApiClient } from '../../adapters/subject-core'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

type ProductStatus = 'all' | 'active' | 'closed'

const TABS: Array<{ id: ProductStatus; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '进行中' },
  { id: 'closed', label: '已结束' },
]

export default function ProductsPage() {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<ProductStatus>('all')
  const [items, setItems] = useState<MyProductItem[]>([])
  const [reminders, setReminders] = useState<MyProductReminderItem[]>([])
  const [loadError, setLoadError] = useState<string>('')

  const formatDateTime = (value?: string | null) => {
    if (!value) return '--'
    return value.replace('T', ' ').slice(0, 16)
  }

  const getErrorMessage = (error: unknown): string => {
    if (!error || typeof error !== 'object') return ''
    const errMsg = 'errMsg' in error && typeof error.errMsg === 'string' ? error.errMsg : ''
    const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
    return errMsg || message
  }

  const loadData = async (nextStatus: ProductStatus) => {
    setLoading(true)
    setLoadError('')
    try {
      const [productsRes, remindersRes] = await Promise.all([
        subjectApi.getMyProducts(nextStatus),
        subjectApi.getMyProductReminders(),
      ])
      if (productsRes.code === 200) {
        setItems((productsRes.data as { items?: MyProductItem[] } | null)?.items || [])
      } else {
        setItems([])
        setLoadError(productsRes.msg || '产品列表加载失败')
      }
      if (remindersRes.code === 200) {
        setReminders((remindersRes.data as { items?: MyProductReminderItem[] } | null)?.items || [])
      } else {
        setReminders([])
      }
    } catch (error) {
      const msg = getErrorMessage(error) || '网络异常，请稍后重试'
      setItems([])
      setReminders([])
      setLoadError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData(status)
  }, [status])

  const stats = useMemo(() => {
    const total = items.length
    const active = items.filter((i) => i.active_state).length
    const recall = items.filter((i) => (i.active_recalls || []).length > 0).length
    return { total, active, recall }
  }, [items])

  return (
    <MiniPage title='我的产品' subtitle='领用、使用、归还与召回全生命周期'>
      <MiniCard>
        <View className='products-stat'>
          <View className='products-stat__item'>
            <Text className='products-stat__num'>{stats.total}</Text>
            <Text className='products-stat__label'>总记录</Text>
          </View>
          <View className='products-stat__item'>
            <Text className='products-stat__num'>{stats.active}</Text>
            <Text className='products-stat__label'>进行中</Text>
          </View>
          <View className='products-stat__item'>
            <Text className='products-stat__num'>{stats.recall}</Text>
            <Text className='products-stat__label'>召回提醒</Text>
          </View>
        </View>
        <View className='products-tabs'>
          {TABS.map((tab) => (
            <View
              key={tab.id}
              className={`products-tabs__item ${status === tab.id ? 'products-tabs__item--active' : ''}`}
              onClick={() => setStatus(tab.id)}
            >
              <Text className='products-tabs__text'>{tab.label}</Text>
            </View>
          ))}
        </View>
      </MiniCard>

      {reminders.slice(0, 2).map((r, idx) => (
        <MiniCard key={`${r.title}-${idx}`} className='products-reminder'>
          <Text className='products-reminder__title'>{r.title}</Text>
          <Text className='products-reminder__desc'>{r.description}</Text>
        </MiniCard>
      ))}

      {loading ? (
        <Text className='products-loading'>加载中...</Text>
      ) : loadError ? (
        <MiniEmpty
          title='产品数据加载失败'
          description={loadError}
          icon='⚠️'
          actionText='重新加载'
          onAction={() => void loadData(status)}
        />
      ) : items.length === 0 ? (
        <MiniEmpty
          title='暂无产品记录'
          description='当研究产品完成发放后，这里会展示领用和后续使用安排。'
          icon='🧴'
        />
      ) : (
        items.map((item) => (
          <MiniCard key={item.dispensing_id}>
            <View className='products-item' onClick={() => Taro.navigateTo({ url: `/pages/products/detail?id=${item.dispensing_id}` })}>
              <View className='products-item__head'>
                <Text className='products-item__title'>{item.product_name || '研究产品'}</Text>
                <Text className={`products-item__badge ${item.active_state ? 'is-active' : 'is-closed'}`}>
                  {item.active_state ? '进行中' : '已结束'}
                </Text>
              </View>
              <Text className='products-item__meta'>
                领用数量 {item.quantity_dispensed} · 发放状态 {item.status}
              </Text>
              <Text className='products-item__meta'>
                发放时间 {formatDateTime(item.dispensed_at)}
              </Text>
              {item.next_visit_date ? (
                <Text className='products-item__meta'>下次访视 {item.next_visit_date}</Text>
              ) : null}
              {item.latest_usage?.compliance_status ? (
                <Text className='products-item__meta'>
                  最近依从性 {item.latest_usage.compliance_status}
                  {item.latest_usage.compliance_rate != null ? ` (${item.latest_usage.compliance_rate}%)` : ''}
                </Text>
              ) : (
                <Text className='products-item__meta products-item__meta--warn'>尚未记录使用情况</Text>
              )}
              {(item.active_recalls || []).length > 0 ? (
                <Text className='products-item__meta products-item__meta--danger'>
                  召回提醒：{item.active_recalls?.[0]?.recall_title}
                </Text>
              ) : null}
              <View className='products-item__footer'>
                <Text className='products-item__link'>查看详情</Text>
              </View>
            </View>
          </MiniCard>
        ))
      )}
    </MiniPage>
  )
}
