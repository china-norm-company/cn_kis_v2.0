import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Input, Picker, ScrollView, Canvas, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { buildSubjectEndpoints, type MyProductDetail, formatProductDisplayName } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'
import { MiniPage, MiniCard, MiniButton } from '@/components/ui'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

function isNoBackendError(msg: string): boolean {
  return /云托管|TARO_APP_API_BASE|cloud run preferred/.test(msg || '')
}

const EXPRESS_OPTIONS = ['顺丰速运', '中通快递', '圆通速递', '韵达快递', '申通快递', '邮政EMS', '其他']

function getTodayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Point {
  x: number
  y: number
}

/** 无后端时用于预览的模拟产品详情 */
const MOCK_DETAILS: Record<number, MyProductDetail> = {
  101: {
    product_name: '研究样品 A（示例）',
    project_no: 'W26001111',
    project_name: '面霜项目',
    sample_name: '面霜',
    sample_no: '123',
    status: '已发放',
    quantity_dispensed: 2,
    dispensed_at: '2026-03-01T10:00:00',
    usage_instructions: '',
    active_recalls: null,
    confirmed_at: null,
    latest_return: null,
    timeline: [],
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
    usage_instructions: '',
    active_recalls: null,
    confirmed_at: '2026-03-06T10:00:00',
    latest_return: null,
    timeline: [],
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
    usage_instructions: '',
    active_recalls: null,
    confirmed_at: null,
    latest_return: null,
    timeline: [],
  },
}

export default function SampleReturnPage() {
  const router = Taro.useRouter()
  const dispensingIds = useMemo(() => {
    const idsParam = router.params?.dispensing_ids || ''
    if (idsParam) {
      const ids = idsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0)
      if (ids.length > 0) return ids
    }
    const single = router.params?.id || router.params?.dispensing_id || ''
    const n = Number(single) || 0
    return n > 0 ? [n] : []
  }, [router.params])

  const isBatch = dispensingIds.length > 1

  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<Map<number, MyProductDetail>>(new Map())
  const [quantityBySample, setQuantityBySample] = useState<Record<number, string>>({})
  const [imagesBySample, setImagesBySample] = useState<Record<number, string[]>>({})
  const [hasSignature, setHasSignature] = useState(false)
  const [expressCompany, setExpressCompany] = useState('顺丰速运')
  const [expressIndex, setExpressIndex] = useState(0)
  const [trackingNo, setTrackingNo] = useState('')
  const [shipDate, setShipDate] = useState(getTodayDateStr())
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isDrawing = useRef(false)
  const lastPoint = useRef<Point | null>(null)
  const ctxRef = useRef<Taro.CanvasContext | null>(null)

  const loadDetails = useCallback(async () => {
    if (dispensingIds.length === 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    const map = new Map<number, MyProductDetail>()
    const qtyInit: Record<number, string> = {}
    try {
      for (const id of dispensingIds) {
        try {
          const res = await subjectApi.getMyProductDetail(id)
          if (res.code === 200 && res.data) {
            const d = res.data as MyProductDetail
            map.set(id, d)
            qtyInit[id] = String(d.quantity_dispensed || '')
          } else if (isNoBackendError(res.msg || '') && MOCK_DETAILS[id]) {
            const mock = MOCK_DETAILS[id]
            map.set(id, mock)
            qtyInit[id] = String(mock.quantity_dispensed || '')
          }
        } catch {
          if (MOCK_DETAILS[id]) {
            map.set(id, MOCK_DETAILS[id])
            qtyInit[id] = String(MOCK_DETAILS[id].quantity_dispensed || '')
          }
        }
      }
      setDetails(map)
      setQuantityBySample(qtyInit)
      setImagesBySample((prev) => {
        const next = { ...prev }
        for (const id of dispensingIds) {
          if (!(id in next)) next[id] = []
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [dispensingIds.join(',')])

  useEffect(() => {
    void loadDetails()
  }, [loadDetails])

  useEffect(() => {
    const ctx = Taro.createCanvasContext('sampleReturnSignature')
    ctx.setStrokeStyle('#1a202c')
    ctx.setLineWidth(3)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    ctxRef.current = ctx
  }, [])

  const handleTouchStart = useCallback((e: { touches: { x: number; y: number }[] }) => {
    const touch = e.touches[0]
    isDrawing.current = true
    lastPoint.current = { x: touch.x, y: touch.y }
  }, [])

  const handleTouchMove = useCallback(
    (e: { touches: { x: number; y: number }[] }) => {
      if (!isDrawing.current || !lastPoint.current || !ctxRef.current) return
      const touch = e.touches[0]
      const ctx = ctxRef.current
      ctx.beginPath()
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
      ctx.lineTo(touch.x, touch.y)
      ctx.stroke()
      ctx.draw(true)
      lastPoint.current = { x: touch.x, y: touch.y }
      if (!hasSignature) setHasSignature(true)
    },
    [hasSignature]
  )

  const handleTouchEnd = useCallback(() => {
    isDrawing.current = false
    lastPoint.current = null
  }, [])

  const handleClearSignature = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.clearRect(0, 0, 9999, 9999)
    ctx.draw()
    setHasSignature(false)
  }, [])

  const exportSignatureImage = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      Taro.canvasToTempFilePath({
        canvasId: 'sampleReturnSignature',
        fileType: 'png',
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => reject(err),
      })
    })
  }

  const handleChooseImage = (dispensingId: number) => {
    const list = imagesBySample[dispensingId] || []
    const remain = 3 - list.length
    if (remain <= 0) {
      Taro.showToast({ title: '该样品最多 3 张图片', icon: 'none' })
      return
    }
    Taro.chooseImage({
      count: remain,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        setImagesBySample((prev) => ({
          ...prev,
          [dispensingId]: [...(prev[dispensingId] || []), ...res.tempFilePaths],
        }))
      },
    })
  }

  const handleRemoveImage = (dispensingId: number, index: number) => {
    setImagesBySample((prev) => {
      const list = prev[dispensingId] || []
      return { ...prev, [dispensingId]: list.filter((_, i) => i !== index) }
    })
  }

  const setQuantity = (dispensingId: number, value: string) => {
    setQuantityBySample((prev) => ({ ...prev, [dispensingId]: value }))
  }

  const handleExpressChange = (e: { detail: { value: string } }) => {
    const idx = Number(e.detail.value)
    setExpressIndex(idx)
    setExpressCompany(EXPRESS_OPTIONS[idx] || EXPRESS_OPTIONS[0])
  }

  const allQuantitiesValid = useMemo(() => {
    for (const id of dispensingIds) {
      const qty = Number(quantityBySample[id] || 0)
      if (!Number.isInteger(qty) || qty <= 0) return false
    }
    return true
  }, [dispensingIds, quantityBySample])

  const allImagesValid = useMemo(() => {
    for (const id of dispensingIds) {
      const list = imagesBySample[id] || []
      if (list.length < 2) return false
    }
    return true
  }, [dispensingIds, imagesBySample])

  const handleSubmit = async () => {
    if (!allQuantitiesValid) {
      Taro.showToast({ title: '请为每个样品填写有效的退回数量', icon: 'none' })
      return
    }
    if (!allImagesValid) {
      Taro.showToast({ title: '每个样品需上传 2～3 张产品图片', icon: 'none' })
      return
    }
    if (!hasSignature) {
      Taro.showToast({ title: '请完成手写签名', icon: 'none' })
      return
    }
    if (!trackingNo.trim()) {
      Taro.showToast({ title: '请输入快递单号', icon: 'none' })
      return
    }
    if (!shipDate) {
      Taro.showToast({ title: '请选择寄出时间', icon: 'none' })
      return
    }

    setSubmitting(true)
    try {
      let signatureBase64 = ''
      try {
        const tempPath = await exportSignatureImage()
        if (typeof wx !== 'undefined' && wx.getFileSystemManager) {
          const content = wx.getFileSystemManager().readFileSync(tempPath, 'base64')
          signatureBase64 = typeof content === 'string' ? content : ''
        }
      } catch {
        /* ignore */
      }

      const commonPayload = {
        tracking_no: trackingNo.trim(),
        express_company: expressCompany,
        ship_date: shipDate,
        signature: signatureBase64 || 'mock',
        notes: notes.trim(),
      }

      let successCount = 0
      for (const id of dispensingIds) {
        const qty = Number(quantityBySample[id] || 0)
        const images = imagesBySample[id] || []
        const res = await subjectApi.createMyProductReturn(id, {
          ...commonPayload,
          returned_quantity: qty,
          images,
        })
        if (res.code === 200 || isNoBackendError(res.msg || '')) {
          successCount++
        } else {
          Taro.showToast({ title: res.msg || '提交失败', icon: 'none' })
          break
        }
      }

      if (successCount === dispensingIds.length) {
        Taro.showToast({ title: '回寄申请已提交', icon: 'success' })
        setTimeout(() => Taro.navigateBack(), 1500)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (dispensingIds.length === 0) {
    return (
      <MiniPage title='样品回寄'>
        <MiniCard>
          <Text className='sample-return__desc'>请从产品列表或详情页进入。</Text>
        </MiniCard>
      </MiniPage>
    )
  }

  if (loading) {
    return (
      <MiniPage title='样品回寄'>
        <Text className='sample-return__loading'>加载中...</Text>
      </MiniPage>
    )
  }

  if (details.size === 0) {
    return (
      <MiniPage title='样品回寄'>
        <MiniCard>
          <Text className='sample-return__desc'>未找到产品记录，请返回重试。</Text>
        </MiniCard>
      </MiniPage>
    )
  }

  const detailList = dispensingIds.map((id) => details.get(id)).filter(Boolean) as MyProductDetail[]
  if (detailList.length === 0) return null

  return (
    <MiniPage title={isBatch ? '批量样品回寄' : '样品回寄'}>
      <ScrollView scrollY className='sample-return__scroll'>
        <MiniCard>
          {isBatch && (
            <View className='sample-return__batch-list'>
              <Text className='sample-return__batch-title'>本次回寄样品</Text>
              {dispensingIds.map((id) => {
                const d = details.get(id)
                return d ? (
                  <Text key={id} className='sample-return__batch-item'>
                    {formatProductDisplayName(d)}
                  </Text>
                ) : null
              })}
            </View>
          )}
          {!isBatch && (
            <Text className='sample-return__product'>
              {formatProductDisplayName(detailList[0])}
            </Text>
          )}

          <View className='sample-return__express-section'>
            <Text className='sample-return__section-title'>快递信息（共用）</Text>
            <Text className='sample-return__label'>快递公司 *</Text>
            <Picker mode='selector' range={EXPRESS_OPTIONS} value={expressIndex} onChange={handleExpressChange}>
              <View className='sample-return__picker'>
                {expressCompany}
              </View>
            </Picker>
            <Text className='sample-return__label'>快递单号 *</Text>
            <Input
              value={trackingNo}
              onInput={(e) => setTrackingNo(e.detail.value)}
              placeholder='请输入快递单号'
              className='sample-return__input'
            />
            <Text className='sample-return__label'>寄出时间 *</Text>
            <Picker mode='date' value={shipDate || undefined} onChange={(e) => setShipDate(e.detail.value)}>
              <View className='sample-return__picker'>
                {shipDate ? shipDate : '请选择寄出时间'}
              </View>
            </Picker>
          </View>

          {dispensingIds.map((id) => {
            const d = details.get(id)
            const label = d ? formatProductDisplayName(d) : `样品 ${id}`
            const qty = quantityBySample[id] ?? ''
            const maxQty = d?.quantity_dispensed ?? 1
            return (
              <View key={id} className='sample-return__sample-block'>
                <Text className='sample-return__label'>{label} 退回数量 *</Text>
                <Input
                  type='number'
                  value={qty}
                  onInput={(e) => setQuantity(id, e.detail.value)}
                  placeholder={`领用数量 ${maxQty}`}
                  className='sample-return__input'
                />
              </View>
            )
          })}

          {dispensingIds.map((id) => {
            const d = details.get(id)
            const images = imagesBySample[id] || []
            const label = d ? formatProductDisplayName(d) : `样品 ${id}`
            return (
              <View key={id} className='sample-return__sample-images'>
                <Text className='sample-return__label'>{label} 产品图片 *（2～3 张）</Text>
                <View className='sample-return__images'>
                  {images.map((src, i) => (
                    <View key={i} className='sample-return__img-wrap'>
                      <Image src={src} mode='aspectFill' className='sample-return__img' />
                      <Text className='sample-return__img-remove' onClick={() => handleRemoveImage(id, i)}>
                        删除
                      </Text>
                    </View>
                  ))}
                  {images.length < 3 && (
                    <View className='sample-return__img-add' onClick={() => handleChooseImage(id)}>
                      <Text className='sample-return__img-add-text'>+ 上传</Text>
                    </View>
                  )}
                </View>
              </View>
            )
          })}

          <Text className='sample-return__label'>手写签名 *</Text>
          <View className='sample-return__signature'>
            {hasSignature && (
              <Text className='sample-return__signature-clear' onClick={handleClearSignature}>
                重签
              </Text>
            )}
            <Canvas
              canvasId='sampleReturnSignature'
              className='sample-return__canvas'
              disableScroll
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
            <Text className='sample-return__hint'>
              {hasSignature ? '签名已完成' : '请在上方区域用手指书写签名'}
            </Text>
          </View>

          <Text className='sample-return__label'>备注（选填）</Text>
          <Input
            value={notes}
            onInput={(e) => setNotes(e.detail.value)}
            placeholder='如有问题可在此说明'
            className='sample-return__input'
          />

          <View className='sample-return__action'>
            <MiniButton onClick={handleSubmit} disabled={submitting}>
              {submitting ? '提交中...' : '提交'}
            </MiniButton>
          </View>
        </MiniCard>
      </ScrollView>
    </MiniPage>
  )
}
