import { useState } from 'react'
import { View, Text } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { buildSubjectEndpoints, type MyPaymentItem, type MyPaymentSummary } from '@cn-kis/subject-core'
import { taroApiClient } from '../../adapters/subject-core'
import { MiniEmpty } from '../../components/ui'
import { PAGE_COPY } from '../../constants/copy'

const subjectApi = buildSubjectEndpoints(taroApiClient)

function isIdentityRequiredError(res: { code?: number; data?: unknown }): boolean {
  if (res?.code !== 403) return false
  const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const nestedCode = isRec(res?.data) ? (res.data as Record<string, unknown>).error_code : undefined
  return nestedCode === '403_IDENTITY_REQUIRED'
}
import './index.scss'

const statusLabels: Record<string, string> = {
  pending: '待处理',
  initiated: '已发起',
  paid: '已到账',
  cancelled: '已取消',
}

const typeLabels: Record<string, string> = {
  visit: '到访礼金',
  completion: '完成礼金',
  transportation: '交通补贴',
  meal: '餐饮补贴',
  referral: '推荐奖励',
  pre_screening: '初筛补偿',
  other: '其他',
}

export default function PaymentPage() {
  const [payments, setPayments] = useState<MyPaymentItem[]>([])
  const [summary, setSummary] = useState<MyPaymentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [needL2, setNeedL2] = useState(false)

  useDidShow(() => {
    loadData()
  })

  async function loadData() {
    setLoading(true)
    setNeedL2(false)
    const res = await subjectApi.getMyPayments()
    if (isIdentityRequiredError(res) || res.code === 403 || res.code === 404) {
      setNeedL2(true)
      setLoading(false)
      return
    }
    const payData = res.data as { items?: MyPaymentItem[] } | null
    if (res.code === 200 && payData?.items) {
      setPayments(payData.items)
    }
    const sRes = await subjectApi.getMyPaymentSummary()
    if (isIdentityRequiredError(sRes) || sRes.code === 403 || sRes.code === 404) {
      setNeedL2(true)
    } else if (sRes.code === 200 && sRes.data) {
      setSummary(sRes.data as MyPaymentSummary)
    }
    setLoading(false)
  }

  const totalPaid = summary ? parseFloat(summary.paid_amount) : payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0)

  const totalPending = summary ? parseFloat(summary.pending_amount) : payments
    .filter(p => p.status !== 'paid' && p.status !== 'cancelled')
    .reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0)

  if (needL2) {
    return (
      <View className='payment-page'>
        <Text className='page-title'>我的礼金</Text>
        <MiniEmpty
          title='请先完成实名认证'
          description='查看与领取礼金需先完成实名认证（身份证+人脸核验），请前往「我的」页面完成认证。'
          icon='🔐'
          actionText='去认证'
          onAction={() => Taro.navigateTo({ url: '/pages/identity-verify/index' })}
        />
      </View>
    )
  }

  return (
    <View className='payment-page'>
      <Text className='page-title'>我的礼金</Text>

      {/* 统计卡片 */}
      <View className='stats-card'>
        <View className='stat-item'>
          <Text className='stat-value paid'>&yen;{totalPaid.toFixed(2)}</Text>
          <Text className='stat-label'>已到账</Text>
        </View>
        <View className='stat-divider' />
        <View className='stat-item'>
          <Text className='stat-value pending'>&yen;{totalPending.toFixed(2)}</Text>
          <Text className='stat-label'>处理中</Text>
        </View>
      </View>

      {/* 按类型分组汇总 */}
      {summary?.by_type && summary.by_type.length > 0 && (
        <View className='type-breakdown'>
          {summary.by_type.map((t, i) => (
            <View key={i} className='type-item'>
              <Text className='type-name'>{typeLabels[t.type] || t.type}</Text>
              <Text className='type-detail'>{t.count}笔 ¥{t.amount}</Text>
            </View>
          ))}
        </View>
      )}

      {/* 记录列表 */}
      {loading ? (
        <MiniEmpty
          title={PAGE_COPY.payment.loading.title}
          description={PAGE_COPY.payment.loading.description}
          icon={PAGE_COPY.payment.loading.icon}
        />
      ) : payments.length === 0 ? (
        <MiniEmpty
          title={PAGE_COPY.payment.empty.title}
          description={PAGE_COPY.payment.empty.description}
          icon={PAGE_COPY.payment.empty.icon}
        />
      ) : (
        <View className='list'>
          {payments.map((item) => (
            <View key={item.id} className='list-item'>
              <View className='item-left'>
                <Text className='item-type'>{typeLabels[item.payment_type] || item.payment_type}</Text>
                <Text className='item-no'>{item.payment_no}</Text>
                {item.paid_at && <Text className='item-time'>到账: {item.paid_at.slice(0, 10)}</Text>}
              </View>
              <View className='item-right'>
                <Text className={`item-amount ${item.status === 'paid' ? 'amount-paid' : ''}`}>
                  &yen;{item.amount}
                </Text>
                <Text className={`item-status status-${item.status}`}>
                  {statusLabels[item.status] || item.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}
