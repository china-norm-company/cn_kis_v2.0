import { useState, useRef, useCallback, useEffect } from 'react'
import { View, Text, ScrollView, Button, Canvas } from '@tarojs/components'
import Taro, { useDidShow } from '@tarojs/taro'
import { buildSubjectEndpoints, isL2 } from '@cn-kis/subject-core'
import { taroApiClient, taroAuthProvider } from '../../adapters/subject-core'

const subjectApi = buildSubjectEndpoints(taroApiClient)

function isIdentityStatusOk(res: { code?: number; data?: { auth_level?: string } }): boolean {
  return res?.code === 200 && !!res?.data && typeof res.data.auth_level === 'string'
}

function isIdentityRequiredError(res: { code?: number; data?: unknown; error_code?: unknown }): boolean {
  if (res?.code !== 403) return false
  const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const nestedCode = isRec(res?.data) ? res.data.error_code : undefined
  const code = typeof res?.error_code === 'string' ? res.error_code : nestedCode
  return code === '403_IDENTITY_REQUIRED'
}
import './index.scss'

/** 触摸点坐标 */
interface Point {
  x: number
  y: number
}

export default function ConsentPage() {
  const [agreed, setAgreed] = useState(false)
  const [signed, setSigned] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [l2GateChecked, setL2GateChecked] = useState(false)
  const [l2Required, setL2Required] = useState(false)
  const [icfVersionId, setIcfVersionId] = useState<number | null>(null)
  const [icfContent, setIcfContent] = useState<string | null>(null)
  const [icfLoading, setIcfLoading] = useState(false)
  const [noPendingConsent, setNoPendingConsent] = useState(false)
  const [receiptNo, setReceiptNo] = useState<string | null>(null)
  const [signedAt, setSignedAt] = useState<string | null>(null)
  const [signError, setSignError] = useState<string | null>(null)

  // L2 门禁：签署知情同意书须先实名认证
  useDidShow(() => {
    let cancelled = false
    subjectApi.getMyIdentityStatus().then((res) => {
      if (cancelled) return
      const statusData = res.data as { auth_level?: string } | undefined
      const statusRes = { ...res, data: statusData }
      if (!isIdentityStatusOk(statusRes) || !statusData) {
        if (res.code === 403 || res.code === 404) {
          setL2Required(true)
        }
        setL2GateChecked(true)
        return
      }
      if (!isL2(statusData.auth_level || '')) {
        setL2Required(true)
        setL2GateChecked(true)
        Taro.showModal({
          title: '需要实名认证',
          content: '签署知情同意书需先完成实名认证，请先在「我的」中完成认证。',
          showCancel: true,
          confirmText: '去认证',
          cancelText: '我知道了',
        }).then((r) => {
          if (r.confirm) Taro.navigateTo({ url: '/pages/identity-verify/index' })
        })
        return
      }
      setL2GateChecked(true)
    }).catch(() => setL2GateChecked(true))
    return () => { cancelled = true }
  })

  // 动态加载 ICF：取待签署的第一条（P3-001：加载态、无待签态、仅后端内容）
  useEffect(() => {
    if (!l2GateChecked || l2Required) return
    setIcfLoading(true)
    setNoPendingConsent(false)
    setIcfVersionId(null)
    setIcfContent(null)
    subjectApi.getMyConsents()
      .then((res) => {
        const consentsData = res.data as { items?: Array<{ is_signed: boolean; icf_version_id?: number }> } | null
        if (res.code !== 200 || !consentsData?.items) {
          setNoPendingConsent(true)
          return
        }
        const pending = consentsData.items.find((c) => !c.is_signed && c.icf_version_id)
        if (!pending?.icf_version_id) {
          setNoPendingConsent(true)
          setIcfLoading(false)
          return
        }
        setIcfVersionId(pending.icf_version_id)
        return subjectApi.getIcfContent(pending.icf_version_id).then((r) => {
          const icfData = r.data as { content?: string } | null
          if (r.code === 200 && icfData) {
            setIcfContent(icfData.content ?? '')
          } else {
            setIcfContent('')
          }
        })
      })
      .catch(() => {
        setNoPendingConsent(true)
      })
      .finally(() => setIcfLoading(false))
  }, [l2GateChecked, l2Required])

  // 签名绘制状态
  const isDrawing = useRef(false)
  const lastPoint = useRef<Point | null>(null)
  const ctxRef = useRef<Taro.CanvasContext | null>(null)

  // 初始化 Canvas 上下文
  useEffect(() => {
    const ctx = Taro.createCanvasContext('signatureCanvas')
    ctx.setStrokeStyle('#1a202c')
    ctx.setLineWidth(3)
    ctx.setLineCap('round')
    ctx.setLineJoin('round')
    ctxRef.current = ctx
  }, [])

  /** 触摸开始 */
  const handleTouchStart = useCallback((e) => {
    const touch = e.touches[0]
    isDrawing.current = true
    lastPoint.current = { x: touch.x, y: touch.y }
  }, [])

  /** 触摸移动（绘制线段） */
  const handleTouchMove = useCallback((e) => {
    if (!isDrawing.current || !lastPoint.current || !ctxRef.current) return
    const touch = e.touches[0]
    const ctx = ctxRef.current

    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    ctx.lineTo(touch.x, touch.y)
    ctx.stroke()
    ctx.draw(true) // true = 保留已有绘制内容

    lastPoint.current = { x: touch.x, y: touch.y }
    if (!hasSignature) setHasSignature(true)
  }, [hasSignature])

  /** 触摸结束 */
  const handleTouchEnd = useCallback(() => {
    isDrawing.current = false
    lastPoint.current = null
  }, [])

  /** 清除签名画布 */
  const handleClearSignature = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.clearRect(0, 0, 9999, 9999)
    ctx.draw()
    setHasSignature(false)
  }, [])

  const handleAgreeToggle = () => {
    setAgreed(!agreed)
  }

  /** 将 Canvas 导出为临时图片路径 */
  const exportSignatureImage = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      Taro.canvasToTempFilePath({
        canvasId: 'signatureCanvas',
        fileType: 'png',
        success: (res) => resolve(res.tempFilePath),
        fail: (err) => reject(err),
      })
    })
  }

  const readFileBase64 = (tempFilePath: string): string => {
    if (typeof wx === 'undefined' || !wx.getFileSystemManager) return ''
    try {
      const fs = wx.getFileSystemManager()
      const content = fs.readFileSync(tempFilePath, 'base64')
      return typeof content === 'string' ? content : ''
    } catch {
      return ''
    }
  }

  const handleSign = async () => {
    if (!agreed) {
      Taro.showToast({ title: '请先阅读并同意知情同意书', icon: 'none' })
      return
    }

    const userInfo = taroAuthProvider.getLocalUserInfo()
    if (!userInfo) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    setSubmitting(true)
    setSignError(null)
    try {
      if (icfVersionId != null) {
        const faceVerifyToken = String(Taro.getStorageSync('identity_face_verify_token') || '').trim()
        if (!faceVerifyToken) {
          setSignError('缺少实名认证核验凭证，请先完成实名认证后再签署')
          Taro.showModal({
            title: '缺少核验凭证',
            content: '请先完成实名认证，获取有效核验凭证后再签署知情同意书。',
            confirmText: '去认证',
            cancelText: '返回',
          }).then((r) => {
            if (r.confirm) Taro.navigateTo({ url: '/pages/identity-verify/index' })
          })
          return
        }
        const res = await subjectApi.faceSignConsent(icfVersionId, {
          face_verify_token: faceVerifyToken,
          reading_duration_seconds: 0,
          comprehension_quiz_passed: true,
        })
        if (isIdentityRequiredError(res)) {
          setSignError('签署需先完成实名认证')
          Taro.showModal({
            title: '需要实名认证',
            content: '签署知情同意书需先完成实名认证。',
            confirmText: '去认证',
            cancelText: '返回',
          }).then((r) => {
            if (r.confirm) Taro.navigateTo({ url: '/pages/identity-verify/index' })
          })
          return
        }
        if (res.code === 404) {
          setSignError('该知情同意书不存在或已失效，请返回重试')
          Taro.showToast({ title: res?.msg || '知情同意书不存在', icon: 'none' })
          return
        }
        if (res.code === 409) {
          setSignError('您已签署过该版本')
          Taro.showToast({ title: res?.msg || '您已签署过该版本', icon: 'none' })
          return
        }
        if (res.code === 400) {
          setSignError(res?.msg || '签署请求无效，请重试')
          Taro.showToast({ title: res?.msg || '签署请求无效', icon: 'none' })
          return
        }
        const ok = res.code === 200 && (res.data as { status?: string; receipt_no?: string } | null)?.status === 'signed' && (res.data as { receipt_no?: string } | null)?.receipt_no
        if (ok) {
          const faceData = res.data as { receipt_no: string; signed_at?: string }
          setReceiptNo(faceData.receipt_no)
          setSignedAt(faceData.signed_at || null)
          setSigned(true)
          setSignError(null)
          Taro.showToast({ title: `签署成功，回执号：${faceData.receipt_no}`, icon: 'success' })
          try {
            const subscribeOptions: Parameters<typeof Taro.requestSubscribeMessage>[0] = {
              tmplIds: [
                process.env.WX_TPL_VISIT_REMINDER || '',
                process.env.WX_TPL_QUESTIONNAIRE_DUE || '',
                process.env.WX_TPL_PAYMENT_ARRIVAL || '',
                process.env.WX_TPL_AE_FOLLOWUP || '',
              ].filter(Boolean),
              entityIds: [],
            }
            await Taro.requestSubscribeMessage(subscribeOptions)
          } catch { /* ignore */ }
        } else {
          setSignError(res?.msg || '签署失败，请重试')
          Taro.showToast({ title: res?.msg || '签署失败', icon: 'none' })
        }
      } else {
        if (!hasSignature) {
          Taro.showToast({ title: '请在签名区域手写签名', icon: 'none' })
          setSubmitting(false)
          return
        }
        let signatureImagePath = ''
        let signatureStorageKey = ''
        try {
          signatureImagePath = await exportSignatureImage()
          const imageBase64 = readFileBase64(signatureImagePath)
          if (imageBase64) {
            const uploadRes = await taroApiClient.post('/signature/upload-base64', {
              image_base64: imageBase64,
            }) as { code: number; data: { storage_key: string } | null }
            if (uploadRes.code === 200 && uploadRes.data?.storage_key) {
              signatureStorageKey = uploadRes.data.storage_key
            }
          }
        } catch { /* ignore */ }
        const res = await taroApiClient.post('/signature/create', {
          account_id: userInfo.subjectId || 0,
          account_name: userInfo.name || '受试者',
          account_type: 'subject',
          resource_type: 'ICF',
          resource_id: `icf-${userInfo.enrollmentId || 'default'}`,
          resource_name: '知情同意书',
          signature_data: {
            type: 'consent',
            agreed: true,
            has_handwritten: true,
            signature_image: signatureStorageKey || signatureImagePath,
            signed_at: new Date().toISOString(),
          },
          reason: '受试者签署知情同意书',
        })
        if (res.code === 200) {
          setSigned(true)
          setSignError(null)
          Taro.showToast({ title: '签署成功', icon: 'success' })
          try {
            const subscribeOptions: Parameters<typeof Taro.requestSubscribeMessage>[0] = {
              tmplIds: [
                process.env.WX_TPL_VISIT_REMINDER || '',
                process.env.WX_TPL_QUESTIONNAIRE_DUE || '',
                process.env.WX_TPL_PAYMENT_ARRIVAL || '',
                process.env.WX_TPL_AE_FOLLOWUP || '',
              ].filter(Boolean),
              entityIds: [],
            }
            await Taro.requestSubscribeMessage(subscribeOptions)
          } catch { /* ignore */ }
        } else {
          setSignError(res?.msg || '签署失败，请重试')
          Taro.showToast({ title: res?.msg || '签署失败', icon: 'none' })
        }
      }
    } catch (err) {
      setSignError('网络异常或请求超时，请检查网络后重试')
      Taro.showToast({ title: '签署失败，请重试', icon: 'none' })
    } finally {
      setSubmitting(false)
    }
  }

  if (l2Required) {
    return (
      <View className='consent-page'>
        <View className='doc-section'>
          <Text className='section-text'>您需要先完成实名认证才能签署知情同意书。请前往「我的」页面完成认证。</Text>
          <Button className='btn-primary' onClick={() => Taro.navigateTo({ url: '/pages/identity-verify/index' })}>去认证</Button>
        </View>
      </View>
    )
  }

  // 无待签署：已通过 L2 门禁但接口返回无待签项
  if (noPendingConsent && !icfLoading && icfVersionId == null) {
    return (
      <View className='consent-page'>
        <View className='consent-content consent-empty'>
          <View className='document'>
            <Text className='doc-title'>知情同意书</Text>
            <Text className='section-text empty-desc'>暂无待签署的知情同意书。完成入组流程后，如需签署的版本会在此展示。</Text>
            <Text className='consent-back' onClick={() => Taro.navigateBack()}>返回</Text>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className='consent-page'>
      {/* ICF 文档内容（仅后端动态内容，无硬编码正文） */}
      <ScrollView
        className='consent-content'
        scrollY
        enhanced
        showScrollbar
      >
        <View className='document'>
          <Text className='doc-title'>知情同意书</Text>
          <Text className='doc-subtitle'>临床研究受试者知情同意书 (ICF)</Text>
          {icfLoading ? (
            <View className='doc-section'>
              <Text className='section-text loading-text'>{icfVersionId != null ? '内容加载中…' : '加载中…'}</Text>
            </View>
          ) : icfContent !== null && icfContent !== '' ? (
            <View className='doc-section'>
              <Text className='section-text'>{icfContent.split('\n').map((line, i) => (<Text key={i}>{line}{'\n'}</Text>))}</Text>
            </View>
          ) : icfVersionId != null ? (
            <View className='doc-section'>
              <Text className='section-text loading-text'>暂无正文，请联系研究方获取知情同意书内容。</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* 底部操作区 */}
      <View className='consent-footer'>
        {!signed ? (
          <>
            {/* 手写签名区域（无 ICF 版本时保留） */}
            {icfVersionId == null && (
              <View className='signature-area'>
                <View className='signature-header'>
                  <Text className='signature-label'>手写签名</Text>
                  {hasSignature && (
                    <Text className='signature-clear' onClick={handleClearSignature}>
                      重新签名
                    </Text>
                  )}
                </View>
                <Canvas
                  canvasId='signatureCanvas'
                  className='signature-canvas'
                  disableScroll
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                />
                <Text className='signature-hint'>
                  {hasSignature ? '签名已完成，可点击"重新签名"清除' : '请在上方区域用手指书写签名'}
                </Text>
              </View>
            )}
            {icfVersionId != null && (
              <Text className='signature-hint'>您已实名认证，点击确认将用人脸核身方式完成签署</Text>
            )}

            {/* 同意复选框 */}
            <View className='agree-row' onClick={handleAgreeToggle}>
              <View className={`checkbox ${agreed ? 'checkbox-checked' : ''}`}>
                {agreed && <Text className='check-mark'>✓</Text>}
              </View>
              <Text className='agree-text'>我已阅读并理解以上内容</Text>
            </View>

            {/* 签署按钮：有 ICF 版本时仅需同意；否则需手写签名 */}
            <Button
              className={`btn-primary sign-btn ${!agreed || (icfVersionId == null && !hasSignature) ? 'disabled' : ''}`}
              onClick={handleSign}
              disabled={!agreed || (icfVersionId == null && !hasSignature) || submitting}
            >
              {submitting ? '提交中...' : '确认签署'}
            </Button>
            {signError ? (
              <View className='sign-error-notice'>
                <Text className='sign-error-text'>{signError}</Text>
                <Text className='sign-error-action' onClick={() => setSignError(null)}>关闭</Text>
                <Text className='consent-back' onClick={() => Taro.navigateBack()}>返回</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View className='signed-notice'>
              <Text className='signed-icon'>✓</Text>
              <Text className='signed-text'>您已成功签署知情同意书</Text>
              {receiptNo && <Text className='signed-receipt'>回执号：{receiptNo}</Text>}
              <Text className='signed-date'>
                签署时间：{signedAt ? new Date(signedAt).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN')}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  )
}
