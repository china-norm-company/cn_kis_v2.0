import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Input, ScrollView, Canvas, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { buildSubjectEndpoints, type MyProductDetail, formatProductDisplayName } from '@cn-kis/subject-core'
import { taroApiClient } from '@/adapters/subject-core'
import { MiniPage, MiniCard, MiniButton } from '@/components/ui'

const subjectApi = buildSubjectEndpoints(taroApiClient)
import './index.scss'

function isNoBackendError(msg: string): boolean {
  return /云托管|TARO_APP_API_BASE|cloud run preferred/.test(msg || '')
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
    confirmed_at: null,
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

export default function SampleConfirmPage() {
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
    const single = router.params?.dispensing_id || router.params?.id || ''
    const n = Number(single) || 0
    return n > 0 ? [n] : []
  }, [router.params])

  const isBatch = dispensingIds.length > 1

  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<Map<number, MyProductDetail>>(new Map())
  const [packageOk, setPackageOk] = useState(true)
  const [quantityOk, setQuantityOk] = useState(true)
  const [readInstructions, setReadInstructions] = useState(true)
  const [notes, setNotes] = useState('')
  /** 单样品：images 数组；多样品：按 dispensing_id 分组的图片 */
  const [imagesBySample, setImagesBySample] = useState<Record<number, string[]>>({})
  const [hasSignature, setHasSignature] = useState(false)
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
    try {
      for (const id of dispensingIds) {
        try {
          const res = await subjectApi.getMyProductDetail(id)
          if (res.code === 200 && res.data) {
            map.set(id, res.data as MyProductDetail)
          } else if (isNoBackendError(res.msg || '') && MOCK_DETAILS[id]) {
            map.set(id, MOCK_DETAILS[id])
          }
        } catch {
          if (MOCK_DETAILS[id]) map.set(id, MOCK_DETAILS[id])
        }
      }
      setDetails(map)
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
    const ctx = Taro.createCanvasContext('sampleConfirmSignature')
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

  const exportSignatureImage = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      Taro.canvasToTempFilePath({
        canvasId: 'sampleConfirmSignature',
        fileType: 'png',
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => reject(err),
      })
    })
  }

  const allImagesValid = useMemo(() => {
    for (const id of dispensingIds) {
      const list = imagesBySample[id] || []
      if (list.length < 2) return false
    }
    return true
  }, [dispensingIds, imagesBySample])

  const handleSubmit = async () => {
    if (!packageOk || !quantityOk || !readInstructions) {
      Taro.showToast({ title: '请逐项确认后再提交', icon: 'none' })
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

      const payload = {
        package_ok: packageOk,
        quantity_ok: quantityOk,
        read_instructions: readInstructions,
        notes: notes.trim(),
        signature: signatureBase64 || 'mock',
      }

      let successCount = 0
      for (const id of dispensingIds) {
        const images = imagesBySample[id] || []
        const res = await subjectApi.getSampleConfirmUrl(id, {
          ...payload,
          images,
        })
        if (res.code === 200 || isNoBackendError(res.msg || '')) {
          successCount++
        } else {
          Taro.showToast({ title: res.msg || '签收失败', icon: 'none' })
          break
        }
      }

      if (successCount === dispensingIds.length) {
        Taro.showToast({ title: '签收确认成功', icon: 'success' })
        setTimeout(() => Taro.navigateBack(), 1500)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (dispensingIds.length === 0) {
    return (
      <MiniPage title='确认收到样品'>
        <MiniCard>
          <Text className='sample-confirm__desc'>请从产品列表或详情页进入。</Text>
        </MiniCard>
      </MiniPage>
    )
  }

  if (loading) {
    return (
      <MiniPage title='确认收到样品'>
        <Text className='sample-confirm__loading'>加载中...</Text>
      </MiniPage>
    )
  }

  if (details.size === 0) {
    return (
      <MiniPage title='确认收到样品'>
        <MiniCard>
          <Text className='sample-confirm__desc'>未找到产品记录，请返回重试。</Text>
        </MiniCard>
      </MiniPage>
    )
  }

  const detailList = dispensingIds.map((id) => details.get(id)).filter(Boolean) as MyProductDetail[]
  if (detailList.length === 0) return null

  return (
    <MiniPage title={isBatch ? '批量确认收到样品' : '确认收到样品'}>
      <ScrollView scrollY className='sample-confirm__scroll'>
        <MiniCard>
          {isBatch && (
            <View className='sample-confirm__batch-list'>
              <Text className='sample-confirm__batch-title'>本次签收样品</Text>
              {dispensingIds.map((id) => {
                const d = details.get(id)
                return d ? (
                  <Text key={id} className='sample-confirm__batch-item'>
                    {formatProductDisplayName(d)}
                  </Text>
                ) : null
              })}
            </View>
          )}
          {!isBatch && (
            <Text className='sample-confirm__product'>
              {formatProductDisplayName(detailList[0])}
            </Text>
          )}

          <View className='sample-confirm__form'>
            <View className='sample-confirm__checks' onClick={() => { setPackageOk(true); setQuantityOk(true); setReadInstructions(true) }}>
              <Text className='sample-confirm__check-all'>✓ 全部确认</Text>
            </View>
            <View className='sample-confirm__check-rows'>
              <View className='sample-confirm__row' onClick={() => setPackageOk(!packageOk)}>
                <View className={`sample-confirm__checkbox ${packageOk ? 'sample-confirm__checkbox--checked' : ''}`}>
                  {packageOk && <Text className='sample-confirm__check'>✓</Text>}
                </View>
                <Text className='sample-confirm__label'>包装完好</Text>
              </View>
              <View className='sample-confirm__row' onClick={() => setQuantityOk(!quantityOk)}>
                <View className={`sample-confirm__checkbox ${quantityOk ? 'sample-confirm__checkbox--checked' : ''}`}>
                  {quantityOk && <Text className='sample-confirm__check'>✓</Text>}
                </View>
                <Text className='sample-confirm__label'>数量正确</Text>
              </View>
              <View className='sample-confirm__row' onClick={() => setReadInstructions(!readInstructions)}>
                <View className={`sample-confirm__checkbox ${readInstructions ? 'sample-confirm__checkbox--checked' : ''}`}>
                  {readInstructions && <Text className='sample-confirm__check'>✓</Text>}
                </View>
                <Text className='sample-confirm__label'>已阅说明</Text>
              </View>
            </View>

            {dispensingIds.map((id) => {
              const d = details.get(id)
              const images = imagesBySample[id] || []
              const label = d ? formatProductDisplayName(d) : `样品 ${id}`
              return (
                <View key={id} className='sample-confirm__sample-images'>
                  <Text className='sample-confirm__label'>{label} 产品图片 *（2～3 张）</Text>
                  <View className='sample-confirm__images'>
                    {images.map((src, i) => (
                      <View key={i} className='sample-confirm__img-wrap'>
                        <Image src={src} mode='aspectFill' className='sample-confirm__img' />
                        <Text className='sample-confirm__img-remove' onClick={() => handleRemoveImage(id, i)}>
                          删除
                        </Text>
                      </View>
                    ))}
                    {images.length < 3 && (
                      <View className='sample-confirm__img-add' onClick={() => handleChooseImage(id)}>
                        <Text className='sample-confirm__img-add-text'>+ 上传</Text>
                      </View>
                    )}
                  </View>
                </View>
              )
            })}

            <Text className='sample-confirm__label'>备注（选填）</Text>
            <Input
              value={notes}
              onInput={(e) => setNotes(e.detail.value)}
              placeholder='如有问题可在此说明'
              className='sample-confirm__input'
            />
          </View>

          <Text className='sample-confirm__label'>手写签名 *</Text>
          <View className='sample-confirm__signature'>
            {hasSignature && (
              <Text className='sample-confirm__signature-clear' onClick={handleClearSignature}>
                重签
              </Text>
            )}
            <Canvas
              canvasId='sampleConfirmSignature'
              className='sample-confirm__canvas'
              disableScroll
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            />
            <Text className='sample-confirm__signature-hint'>
              {hasSignature ? '签名已完成' : '请在上方区域用手指书写签名'}
            </Text>
          </View>

          <View className='sample-confirm__action'>
            <MiniButton onClick={handleSubmit} disabled={submitting}>
              {submitting ? '提交中...' : '提交'}
            </MiniButton>
          </View>
        </MiniCard>
      </ScrollView>
    </MiniPage>
  )
}
