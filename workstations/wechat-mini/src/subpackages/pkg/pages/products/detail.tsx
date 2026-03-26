import { useEffect, useMemo, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { MiniButton, MiniCard, MiniEmpty, MiniPage } from '@/components/ui'
import { buildSubjectEndpoints, type MyProductDetail, formatProductDisplayName } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './detail.scss'

function isNoBackendError(msg: string): boolean {
  return /云托管|TARO_APP_API_BASE|cloud run preferred/.test(msg || '')
}

/** 签收状态 */
type ReceiptStatus = '待签收' | '已签收' | '签收异常'
/** 回寄状态 */
type ReturnStatus = '未开启' | '待回寄' | '已申请回寄' | '回寄中' | '已完成' | '回寄异常'

/** 扩展的详情数据（含模拟字段） */
interface ExtendedDetail extends MyProductDetail {
  express_company?: string
  tracking_no?: string
  receipt_status?: ReceiptStatus
  need_return?: boolean
  return_status?: ReturnStatus
  return_deadline?: string
  return_requirements?: string
  return_method?: string
}

/** 无后端时用于预览的模拟产品详情 */
const MOCK_DETAILS: Record<number, ExtendedDetail> = {
  101: {
    product_name: '研究样品 A（示例）',
    project_no: 'W26001111',
    project_name: '面霜项目',
    sample_name: '面霜',
    sample_no: '123',
    status: '已发放',
    quantity_dispensed: 2,
    dispensed_at: '2026-03-01T10:00:00',
    usage_instructions: '每日早晚各一次，每次 1 泵。请按说明使用。',
    active_recalls: null,
    confirmed_at: null,
    latest_return: null,
    timeline: [{ type: 'dispensed', title: '已发货', description: '领用数量 2', time: '2026-03-01T10:00:00' }],
    express_company: '顺丰速运',
    tracking_no: 'SF1234567890',
    receipt_status: '待签收',
    need_return: true,
    return_status: '待回寄',
    return_deadline: '2026-04-01',
    return_requirements: '请使用原包装或防震包装寄回',
    return_method: '顺丰到付',
  },
  102: {
    product_name: '研究样品 B（示例）',
    project_no: 'W26001111',
    project_name: '面霜项目',
    sample_name: '精华',
    sample_no: '456',
    status: '已发放',
    quantity_dispensed: 1,
    dispensed_at: '2026-03-05T14:30:00',
    usage_instructions: '按需使用，记录使用情况。',
    active_recalls: [{ recall_title: '批次召回提醒（示例）', recall_level: '中' }],
    confirmed_at: '2026-03-06T10:00:00',
    latest_return: { status: 'pending' },
    timeline: [
      { type: 'dispensed', title: '已发货', description: '领用数量 1', time: '2026-03-05T14:30:00' },
      { type: 'confirmed', title: '已签收', description: '已确认收到', time: '2026-03-06T10:00:00' },
    ],
    express_company: '中通快递',
    tracking_no: 'ZT9876543210',
    receipt_status: '已签收',
    need_return: true,
    return_status: '已申请回寄',
    return_deadline: '2026-04-10',
    return_requirements: '请使用原包装寄回',
    return_method: '顺丰到付',
  },
  103: {
    product_name: '研究样品 C（示例）',
    project_no: 'W26002222',
    project_name: '洗发水项目',
    sample_name: '洗发水',
    sample_no: '789',
    status: '已发放',
    quantity_dispensed: 1,
    dispensed_at: '2026-03-06T09:00:00',
    usage_instructions: '按说明使用。',
    active_recalls: null,
    confirmed_at: null,
    latest_return: null,
    timeline: [{ type: 'dispensed', title: '已发货', description: '领用数量 1', time: '2026-03-06T09:00:00' }],
    express_company: '顺丰速运',
    tracking_no: 'SF103000',
    receipt_status: '待签收',
    need_return: true,
    return_status: '待回寄',
    return_deadline: '2026-04-15',
    return_requirements: '请使用原包装寄回',
    return_method: '顺丰到付',
  },
}

export default function ProductDetailPage() {
  const router = Taro.useRouter()
  const dispensingId = useMemo(() => Number(router.params?.id || 0), [router.params])

  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<ExtendedDetail | null>(null)
  const [loadError, setLoadError] = useState('')

  const formatDate = (value?: string | null) => {
    if (!value) return '--'
    return value.slice(0, 10)
  }

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
      if (res.code === 200 && res.data) {
        const d = res.data as MyProductDetail
        const extended: ExtendedDetail = {
          ...d,
          receipt_status: d.confirmed_at ? '已签收' : '待签收',
          need_return: true,
          return_status: (d.latest_return?.status as ReturnStatus) || '待回寄',
          express_company: '顺丰速运',
          tracking_no: 'SF' + dispensingId + '000',
          return_deadline: '2026-04-15',
          return_requirements: '请使用原包装寄回',
          return_method: '顺丰到付',
        }
        setDetail(extended)
        setLoadError('')
      } else if (isNoBackendError(res.msg || '') && MOCK_DETAILS[dispensingId]) {
        setDetail(MOCK_DETAILS[dispensingId])
        setLoadError('')
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

  const handleReceiptProblem = () => {
    Taro.showToast({ title: '请联系研究方反馈签收问题', icon: 'none' })
  }

  const handleReturnProblem = () => {
    Taro.showToast({ title: '请联系研究方反馈回寄问题', icon: 'none' })
  }

  return (
    <MiniPage title='产品详情' subtitle='签收与回寄'>
      {loading ? (
        <Text className='product-detail__loading'>加载中...</Text>
      ) : !detail ? (
        <MiniEmpty
          title='未找到产品记录'
          description={loadError || '请返回列表重新选择。'}
          icon='🧴'
          actionText='重新加载'
          onAction={() => void loadDetail()}
        />
      ) : (
        <>
          {/* 样品签收 */}
          <MiniCard>
            <Text className='product-detail__module-title'>样品签收</Text>
            <View className='product-detail__info-grid'>
              <Text className='product-detail__info-label'>样品名称</Text>
              <Text className='product-detail__info-value'>{formatProductDisplayName(detail)}</Text>
              <Text className='product-detail__info-label'>快递公司</Text>
              <Text className='product-detail__info-value'>{detail.express_company || '--'}</Text>
              <Text className='product-detail__info-label'>快递单号</Text>
              <Text className='product-detail__info-value'>{detail.tracking_no || '--'}</Text>
              <Text className='product-detail__info-label'>发货时间</Text>
              <Text className='product-detail__info-value'>{formatDateTime(detail.dispensed_at)}</Text>
              <Text className='product-detail__info-label'>样品数量</Text>
              <Text className='product-detail__info-value'>{detail.quantity_dispensed}</Text>
              <Text className='product-detail__info-label'>当前状态</Text>
              <Text className={`product-detail__info-value product-detail__status--${detail.receipt_status === '已签收' ? 'done' : 'pending'}`}>
                {detail.receipt_status || '待签收'}
              </Text>
              {detail.receipt_status === '已签收' && detail.confirmed_at && (
                <>
                  <Text className='product-detail__info-label'>签收时间</Text>
                  <Text className='product-detail__info-value'>{formatDateTime(detail.confirmed_at)}</Text>
                </>
              )}
            </View>
            <View className='product-detail__actions'>
              {detail.receipt_status === '待签收' && (
                <MiniButton onClick={() => Taro.navigateTo({ url: `/subpackages/pkg/pages/sample-confirm/index?dispensing_id=${dispensingId}` })}>
                  确认收到样品
                </MiniButton>
              )}
              <MiniButton variant='secondary' onClick={handleReceiptProblem}>
                签收有问题
              </MiniButton>
            </View>
          </MiniCard>

          {/* 样品回寄 */}
          <MiniCard>
            <Text className='product-detail__module-title'>样品回寄</Text>
            {detail.need_return === false ? (
              <Text className='product-detail__meta'>该项目无需回寄样品</Text>
            ) : (
              <>
                <View className='product-detail__info-grid'>
                  <Text className='product-detail__info-label'>回寄状态</Text>
                  <Text className='product-detail__info-value'>{detail.return_status || '待回寄'}</Text>
                  <Text className='product-detail__info-label'>回寄截止时间</Text>
                  <Text className='product-detail__info-value'>{formatDate(detail.return_deadline)}</Text>
                  {detail.return_requirements && (
                    <>
                      <Text className='product-detail__info-label'>回寄要求</Text>
                      <Text className='product-detail__info-value'>{detail.return_requirements}</Text>
                    </>
                  )}
                  {detail.return_method && (
                    <>
                      <Text className='product-detail__info-label'>回寄方式</Text>
                      <Text className='product-detail__info-value'>{detail.return_method}</Text>
                    </>
                  )}
                </View>
                <View className='product-detail__actions'>
                  {detail.return_status === '待回寄' && (
                    <MiniButton onClick={() => Taro.navigateTo({ url: `/subpackages/pkg/pages/sample-return/index?id=${dispensingId}` })}>
                      申请回寄
                    </MiniButton>
                  )}
                  {detail.return_status === '已申请回寄' && (
                    <MiniButton onClick={() => Taro.navigateTo({ url: `/subpackages/pkg/pages/sample-return/index?id=${dispensingId}` })}>
                      填写寄回单号
                    </MiniButton>
                  )}
                  {detail.return_status === '已完成' && (
                    <Text className='product-detail__status-done'>回寄已完成</Text>
                  )}
                  {detail.need_return && (
                    <MiniButton variant='secondary' onClick={handleReturnProblem}>
                      回寄有问题
                    </MiniButton>
                  )}
                </View>
              </>
            )}
          </MiniCard>

          {/* 处理记录 */}
          <MiniCard>
            <Text className='product-detail__module-title'>处理记录</Text>
            <View className='product-detail__timeline'>
              <View className='product-detail__timeline-node product-detail__timeline-node--done'>
                <Text className='product-detail__timeline-dot' />
                <Text className='product-detail__timeline-text'>已发货</Text>
                <Text className='product-detail__timeline-time'>{formatDateTime(detail.dispensed_at)}</Text>
              </View>
              <View className={`product-detail__timeline-node ${detail.receipt_status === '已签收' ? 'product-detail__timeline-node--done' : ''}`}>
                <Text className='product-detail__timeline-dot' />
                <Text className='product-detail__timeline-text'>已签收</Text>
                {detail.confirmed_at && <Text className='product-detail__timeline-time'>{formatDateTime(detail.confirmed_at)}</Text>}
              </View>
              <View className={`product-detail__timeline-node ${['已申请回寄', '回寄中', '已完成'].includes(detail.return_status || '') ? 'product-detail__timeline-node--done' : ''}`}>
                <Text className='product-detail__timeline-dot' />
                <Text className='product-detail__timeline-text'>已申请回寄</Text>
              </View>
              <View className={`product-detail__timeline-node ${['回寄中', '已完成'].includes(detail.return_status || '') ? 'product-detail__timeline-node--done' : ''}`}>
                <Text className='product-detail__timeline-dot' />
                <Text className='product-detail__timeline-text'>已寄出</Text>
              </View>
              <View className={`product-detail__timeline-node ${detail.return_status === '已完成' ? 'product-detail__timeline-node--done' : ''}`}>
                <Text className='product-detail__timeline-dot' />
                <Text className='product-detail__timeline-text'>已完成</Text>
              </View>
            </View>
          </MiniCard>
        </>
      )}
    </MiniPage>
  )
}
