import { useEffect, useMemo, useState } from 'react'
import { Input, Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { MiniButton, MiniCard, MiniEmpty, MiniPage } from '../../components/ui'
import { buildSubjectEndpoints, type MyProductDetail } from '@cn-kis/subject-core'
import { taroApiClient } from '../../adapters/subject-core'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './detail.scss'

export default function ProductDetailPage() {
  const router = Taro.useRouter()
  const dispensingId = useMemo(() => Number(router.params?.id || 0), [router.params])

  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<MyProductDetail | null>(null)
  const [usageAmount, setUsageAmount] = useState('1')
  const [usageNote, setUsageNote] = useState('')
  const [returnQty, setReturnQty] = useState('')
  const [savingUsage, setSavingUsage] = useState(false)
  const [savingReturn, setSavingReturn] = useState(false)
  const [loadError, setLoadError] = useState('')

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

  const loadDetail = async () => {
    if (!dispensingId) {
      setLoading(false)
      setLoadError('无效的产品记录 ID')
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const res = await subjectApi.getMyProductDetail(dispensingId)
      if (res.code === 200) {
        setDetail((res.data as MyProductDetail | null) || null)
      } else {
        setDetail(null)
        setLoadError(res.msg || '产品详情加载失败')
      }
    } catch (error) {
      const msg = getErrorMessage(error) || '网络异常，请稍后重试'
      setDetail(null)
      setLoadError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadDetail()
  }, [dispensingId])

  const handleUsageSave = async () => {
    if (!dispensingId || !detail) return
    const actual = Number(usageAmount)
    if (!Number.isInteger(actual) || actual <= 0) {
      Taro.showToast({ title: '请输入有效使用量', icon: 'none' })
      return
    }
    if (detail.quantity_dispensed > 0 && actual > detail.quantity_dispensed) {
      Taro.showToast({ title: '使用量不能超过领用数量', icon: 'none' })
      return
    }
    setSavingUsage(true)
    try {
      const res = await subjectApi.createMyProductUsage(dispensingId, {
        actual_usage: actual,
        notes: usageNote,
      })
      if (res.code === 200) {
        Taro.showToast({ title: '使用记录已保存', icon: 'success' })
        setUsageNote('')
        void loadDetail()
      } else {
        Taro.showToast({ title: res.msg || '提交失败', icon: 'none' })
      }
    } finally {
      setSavingUsage(false)
    }
  }

  const handleReturn = async () => {
    if (!dispensingId) return
    const qty = Number(returnQty || detail?.quantity_dispensed || 0)
    if (!Number.isInteger(qty) || qty <= 0) {
      Taro.showToast({ title: '请输入有效归还数量', icon: 'none' })
      return
    }
    setSavingReturn(true)
    try {
      const res = await subjectApi.createMyProductReturn(dispensingId, { returned_quantity: qty })
      if (res.code === 200) {
        Taro.showToast({ title: '归还申请已提交', icon: 'success' })
        setReturnQty('')
        void loadDetail()
      } else {
        Taro.showToast({ title: res.msg || '提交失败', icon: 'none' })
      }
    } finally {
      setSavingReturn(false)
    }
  }

  return (
    <MiniPage title='产品详情' subtitle='查看领用、使用、归还和召回信息'>
      {loading ? (
        <Text className='product-detail__loading'>加载中...</Text>
      ) : !detail ? (
        <MiniEmpty
          title='未找到产品记录'
          description={loadError || '请返回列表重新选择产品记录。'}
          icon='🧴'
          actionText='重新加载'
          onAction={() => void loadDetail()}
        />
      ) : (
        <>
          <MiniCard>
            <Text className='product-detail__title'>{detail.product_name || '研究产品'}</Text>
            <Text className='product-detail__meta'>状态：{detail.status}</Text>
            <Text className='product-detail__meta'>领用数量：{detail.quantity_dispensed}</Text>
            <Text className='product-detail__meta'>发放时间：{formatDateTime(detail.dispensed_at)}</Text>
            {detail.usage_instructions ? (
              <Text className='product-detail__meta'>使用说明：{detail.usage_instructions}</Text>
            ) : null}
            {(detail.active_recalls || []).length > 0 ? (
              <View className='product-detail__recall'>
                <Text className='product-detail__recall-title'>召回提醒</Text>
                <Text className='product-detail__recall-desc'>
                  {detail.active_recalls?.[0]?.recall_title}（{detail.active_recalls?.[0]?.recall_level}）
                </Text>
              </View>
            ) : null}
            {!detail.confirmed_at ? (
              <View className='product-detail__action'>
                <MiniButton onClick={() => Taro.navigateTo({ url: `/pages/sample-confirm/index?dispensing_id=${dispensingId}` })}>
                  去确认签收
                </MiniButton>
              </View>
            ) : (
              <Text className='product-detail__meta'>签收确认：已完成</Text>
            )}
          </MiniCard>

          <MiniCard>
            <Text className='product-detail__section-title'>记录本次使用</Text>
            <Input
              className='product-detail__input'
              type='number'
              value={usageAmount}
              onInput={(e) => setUsageAmount(e.detail.value)}
              placeholder='实际使用量'
            />
            <Input
              className='product-detail__input'
              value={usageNote}
              onInput={(e) => setUsageNote(e.detail.value)}
              maxlength={200}
              placeholder='备注（选填）'
            />
            <Text className='product-detail__hint'>建议填写本次实际用量场景，便于依从性评估。</Text>
            <View className='product-detail__action'>
              <MiniButton onClick={handleUsageSave} disabled={savingUsage}>
                {savingUsage ? '提交中...' : '保存使用记录'}
              </MiniButton>
            </View>
          </MiniCard>

          <MiniCard>
            <Text className='product-detail__section-title'>归还产品</Text>
            <Input
              className='product-detail__input'
              type='number'
              value={returnQty}
              onInput={(e) => setReturnQty(e.detail.value)}
              placeholder={`默认归还数量 ${detail.quantity_dispensed}`}
            />
            <View className='product-detail__action'>
              <MiniButton variant='secondary' onClick={handleReturn} disabled={savingReturn}>
                {savingReturn ? '提交中...' : '提交归还申请'}
              </MiniButton>
            </View>
            {detail.latest_return?.status ? (
              <Text className='product-detail__meta'>当前归还状态：{detail.latest_return.status}</Text>
            ) : null}
          </MiniCard>

          <MiniCard>
            <Text className='product-detail__section-title'>生命周期时间线</Text>
            {(detail.timeline || []).length === 0 ? (
              <Text className='product-detail__meta'>暂无时间线记录</Text>
            ) : (
              (detail.timeline || []).slice(0, 20).map((event, idx) => (
                <View className='product-detail__timeline-item' key={`${event.type}-${idx}`}>
                  <Text className='product-detail__timeline-title'>{event.title}</Text>
                  <Text className='product-detail__timeline-desc'>{event.description}</Text>
                  <Text className='product-detail__timeline-time'>{formatDateTime(event.time)}</Text>
                </View>
              ))
            )}
          </MiniCard>
        </>
      )}
    </MiniPage>
  )
}
