import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { protocolApi } from '@cn-kis/api-client'
import { Button } from '@cn-kis/ui-kit'
import { BookOpen, CheckCircle2 } from 'lucide-react'
import {
  appendSupplementalCollectCheckboxPreviewRows,
  collectInteractiveCheckboxAnswers,
  focusFirstUnansweredInteractiveCheckbox,
  icfInteractiveCheckboxGroupsAllAnswered,
  injectInteractiveCheckboxMarkers,
  stripDocumentOtherInfoPlaceholderForCustomSupplemental,
} from '@/utils/icfCheckboxDetect'
import {
  applyIcfPlaceholders,
  buildIcfPlaceholderValues,
  buildIcfSignatureRawHtmlPlaceholders,
} from '@cn-kis/consent-placeholders'
import { ICF_PREVIEW_ASSIST_STYLE_BLOCK } from '@/utils/icfDocxPreviewShell'

type QueueItem = {
  icf_version_id: number
  node_title: string
  version: string
  required_reading_duration_seconds: number
  content: string
  enable_subject_signature?: boolean
  /** 与小程序生效规则一致：0=不要求受试者签名；1/2 次画布 */
  subject_signature_times?: 0 | 1 | 2
  enable_checkbox_recognition?: boolean
  supplemental_collect_labels?: string[]
  collect_other_information?: boolean
}

function subjectPadCount(item: QueueItem | null): number {
  if (!item) return 1
  const t = item.subject_signature_times
  if (t === 0) return 0
  if (t === 2) return 2
  return 1
}

/**
 * 联调页：WITNESS_FACE_DEV_BYPASS 下按协议 ICF 节点顺序模拟小程序知情阅读（倒计时、勾选、画布签名）。
 * 全部节点完成后调用 dev-consent-submit，写入「测试」类型签署记录（SubjectConsent）。
 */
export default function WitnessConsentDevPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [protocolCode, setProtocolCode] = useState('')
  const [items, setItems] = useState<QueueItem[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [readingStartedAt, setReadingStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  /** 每个受试者签名画布是否已有笔迹 */
  const [sigFilled, setSigFilled] = useState<boolean[]>([])
  const [finishedAll, setFinishedAll] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const drawing = useRef(false)
  const activePadIdx = useRef<number | null>(null)
  const lastPt = useRef<{ x: number; y: number } | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  /** 联调：每节点正文内勾选结果，提交时写入 icf_version_answers */
  const answersByIcfRef = useRef<Record<number, Array<{ value: string }>>>({})

  const current = items[queueIndex] ?? null
  const total = items.length
  const stepLabel = total > 1 ? `（${queueIndex + 1}/${total}）` : ''
  const requiredSec = Math.max(0, Number(current?.required_reading_duration_seconds ?? 0))
  const readOk = requiredSec <= 0 || elapsedSec >= requiredSec
  const padCount = useMemo(() => subjectPadCount(current), [current])

  const hasAllSignatures = useMemo(() => {
    if (padCount === 0) return true
    if (sigFilled.length !== padCount) return false
    return sigFilled.every(Boolean)
  }, [padCount, sigFilled])

  const previewAnchoredAt = useMemo(() => new Date(), [queueIndex])

  const [sigPreviewDataUrls, setSigPreviewDataUrls] = useState<string[]>([])

  useEffect(() => {
    if (!current) {
      setSigPreviewDataUrls([])
      return
    }
    const n = padCount
    const urls: string[] = []
    for (let i = 0; i < n; i += 1) {
      const c = canvasRefs.current[i]
      if (c && sigFilled[i]) {
        try {
          urls.push(c.toDataURL('image/png'))
        } catch {
          urls.push('')
        }
      } else {
        urls.push('')
      }
    }
    setSigPreviewDataUrls(urls)
  }, [sigFilled, current?.icf_version_id, padCount, queueIndex])

  const articleHtml = useMemo(() => {
    const raw0 = (current?.content || '').trim()
    if (!raw0) return '<p>（暂无正文）</p>'
    const pv = buildIcfPlaceholderValues({
      protocolCode,
      protocolTitle: title,
      nodeTitle: current?.node_title,
      versionLabel: current?.version,
      previewNow: previewAnchoredAt,
    })
    const rawSig = buildIcfSignatureRawHtmlPlaceholders({
      subjectSignatureTimes: padCount,
      sig1Src: sigPreviewDataUrls[0] || null,
      sig2Src: sigPreviewDataUrls[1] || null,
    })
    const raw = applyIcfPlaceholders(raw0, pv, { escapeValues: true, rawHtmlByToken: rawSig })
    if (!current?.enable_checkbox_recognition) return raw
    const stripped = stripDocumentOtherInfoPlaceholderForCustomSupplemental(
      raw,
      current.supplemental_collect_labels,
    )
    let html = injectInteractiveCheckboxMarkers(stripped)
    html = appendSupplementalCollectCheckboxPreviewRows(
      html,
      stripped,
      current.supplemental_collect_labels,
      !!current.collect_other_information,
      'interactive',
    )
    return html
  }, [
    current?.content,
    current?.enable_checkbox_recognition,
    current?.supplemental_collect_labels,
    current?.collect_other_information,
    current?.icf_version_id,
    current?.node_title,
    current?.version,
    protocolCode,
    title,
    previewAnchoredAt,
    padCount,
    sigPreviewDataUrls,
  ])

  useEffect(() => {
    if (!token.trim()) {
      setErr('缺少 token，请从邮件人脸页进入')
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await protocolApi.getWitnessDevConsentQueue(token)
        if (cancelled) return
        if (res.code !== 200 || !res.data) {
          setErr(res.msg || '无法加载知情联调队列')
          return
        }
        const d = res.data
        setTitle((d.protocol_title || '').trim() || '知情联调')
        setProtocolCode((d.protocol_code || '').trim())
        setItems(Array.isArray(d.items) ? d.items : [])
        if (!d.items?.length) {
          setErr('该项目暂无生效的 ICF 签署节点，请在执行台知情配置中维护后再试')
        }
      } catch (e: unknown) {
        const ax = e as { response?: { data?: { msg?: string } }; message?: string }
        setErr(ax.response?.data?.msg || ax.message || '加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token])

  useEffect(() => {
    setErr(null)
    setAgreed(false)
    setReadingStartedAt(null)
    setElapsedSec(0)
    setSigFilled(Array(padCount).fill(false))
    activePadIdx.current = null
    drawing.current = false
  }, [queueIndex, current?.icf_version_id, padCount])

  useEffect(() => {
    answersByIcfRef.current = {}
  }, [token, items.length])

  useEffect(() => {
    if (!current) return
    setReadingStartedAt(Date.now())
  }, [current])

  useEffect(() => {
    if (!readingStartedAt || requiredSec <= 0) {
      setElapsedSec(0)
      return
    }
    const t = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - readingStartedAt) / 1000)))
    }, 400)
    return () => clearInterval(t)
  }, [readingStartedAt, requiredSec])

  const getCanvasCoords = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    }
  }

  const startDraw =
    (idx: number) => (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      const canvas = canvasRefs.current[idx]
      if (!canvas) return
      const p = 'touches' in e ? e.touches[0] : e
      if (!p) return
      drawing.current = true
      activePadIdx.current = idx
      lastPt.current = getCanvasCoords(canvas, p.clientX, p.clientY)
    }

  const moveDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawing.current || activePadIdx.current === null) return
    const idx = activePadIdx.current
    const canvas = canvasRefs.current[idx]
    const p = 'touches' in e ? e.touches[0] : e
    if (!p || !canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const pt = getCanvasCoords(canvas, p.clientX, p.clientY)
    if (!lastPt.current) return
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPt.current.x, lastPt.current.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    lastPt.current = pt
    setSigFilled((prev) => {
      if (prev[idx]) return prev
      const next = [...prev]
      next[idx] = true
      return next
    })
  }

  const endDraw = useCallback(() => {
    drawing.current = false
    activePadIdx.current = null
    lastPt.current = null
  }, [])

  /** 移动端：画布上手写时阻止页面跟手滚动 */
  useLayoutEffect(() => {
    const canvases = canvasRefs.current.filter((c): c is HTMLCanvasElement => c != null)
    if (canvases.length === 0) return
    const onTouchMove = (e: TouchEvent) => {
      if (drawing.current) e.preventDefault()
    }
    canvases.forEach((c) => c.addEventListener('touchmove', onTouchMove, { passive: false }))
    return () => {
      canvases.forEach((c) => c.removeEventListener('touchmove', onTouchMove))
    }
  }, [queueIndex, padCount])

  const clearPad = (idx: number) => {
    const c = canvasRefs.current[idx]
    const ctx = c?.getContext('2d')
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height)
    setSigFilled((prev) => {
      const next = [...prev]
      if (next[idx] !== false) next[idx] = false
      return next
    })
  }

  const setCanvasRef = (idx: number) => (el: HTMLCanvasElement | null) => {
    canvasRefs.current[idx] = el
  }

  const onConfirmStep = () => {
    if (!token || !current || submitting) return
    if (!readOk) return
    if (!agreed) return
    if (current.enable_checkbox_recognition && !icfInteractiveCheckboxGroupsAllAnswered(contentRef.current)) {
      setErr('请先在正文中完成每一处「请勾选」：为「是」或「否」选择一项（已为你定位到第一处未完成项）')
      focusFirstUnansweredInteractiveCheckbox(contentRef.current)
      return
    }
    if (!hasAllSignatures) return
    const currentAnswers = current.enable_checkbox_recognition
      ? collectInteractiveCheckboxAnswers(contentRef.current)
      : []
    answersByIcfRef.current[current.icf_version_id] = currentAnswers
    const rest = items.slice(queueIndex + 1)
    if (rest.length > 0) {
      setQueueIndex((i) => i + 1)
      return
    }
    void (async () => {
      setSubmitting(true)
      setErr(null)
      try {
        const icf_version_answers = items.map((it) => ({
          icf_version_id: it.icf_version_id,
          answers: answersByIcfRef.current[it.icf_version_id] ?? [],
        }))
        const res = await protocolApi.submitWitnessDevConsent({
          token,
          icf_version_ids: items.map((it) => it.icf_version_id),
          icf_version_answers,
        })
        if (res.code !== 200 || !res.data) {
          setErr(res.msg || '写入签署记录失败')
          return
        }
        setFinishedAll(true)
      } catch (e: unknown) {
        const ax = e as { response?: { data?: { msg?: string } }; message?: string }
        setErr(ax.response?.data?.msg || ax.message || '写入签署记录失败')
      } finally {
        setSubmitting(false)
      }
    })()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">加载中…</div>
    )
  }

  if (err && !items.length) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start pt-8 px-4">
        <div className="w-full max-w-lg rounded-xl bg-white border border-slate-200 p-6 text-sm text-rose-700">{err}</div>
        <Link to="/witness-verify" className="mt-4 text-indigo-600 text-sm hover:underline">
          返回人脸核验页
        </Link>
      </div>
    )
  }

  if (finishedAll) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start pt-10 px-4 pb-12">
        <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-sm p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-800">联调流程已完成</h1>
          <p className="text-sm text-slate-600 mt-2 text-left leading-relaxed">
            已写入<strong>测试类型</strong>签署记录（受试者编号以 W 开头、姓名为「知情联调受试者」），可在执行台本项目
            <strong> 知情管理 → 签署记录 </strong>
            中查看；「知情签署人员」列展示为当前双签档案姓名。生产环境请关闭 WITNESS_FACE_DEV_BYPASS，并完成真实火山人脸与小程序正式签署。
          </p>
          <Link
            to="/consent"
            className="inline-block mt-4 text-indigo-600 text-sm font-medium hover:underline"
          >
            打开知情管理（签署记录）
          </Link>
          <Link
            to={{ pathname: '/witness-verify', search: token ? `?token=${encodeURIComponent(token)}` : '' }}
            className="block mt-3 text-indigo-600 text-sm font-medium hover:underline"
          >
            返回人脸核验页
          </Link>
        </div>
      </div>
    )
  }

  const primaryLabel =
    queueIndex + 1 < total ? '确认本页并进入下一份' : '完成并写入测试签署记录'

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start pt-6 px-4 pb-16">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 text-slate-800 mb-1">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          <h1 className="text-lg font-semibold">知情联调 {stepLabel}</h1>
        </div>
        <p className="text-sm text-slate-500 mb-4">{title}</p>
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-[12px] leading-relaxed text-amber-950">
          <strong className="font-medium">流程说明：</strong>
          本页为开发者浏览器联调（需 WITNESS_FACE_DEV_BYPASS）。正式验收「知情签署」请使用执行台知情管理中的
          <strong> 知情测试二维码 </strong>
          在微信内完成；邮件中的人脸核验与「签名授权」与此页无关。
        </div>
        {err ? <div className="mb-4 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-sm p-3">{err}</div> : null}

        {current ? (
          <>
            {current.enable_checkbox_recognition ? (
              <style dangerouslySetInnerHTML={{ __html: ICF_PREVIEW_ASSIST_STYLE_BLOCK }} />
            ) : null}
            <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
                <h2 className="text-sm font-semibold text-slate-800">{current.node_title}</h2>
                <p className="text-xs text-slate-500 mt-0.5">版本 {current.version}</p>
                {current.enable_checkbox_recognition ? (
                  <p className="text-[11px] text-amber-800 mt-1.5 leading-snug">
                    正文已按执行台「勾选框识别」规则替换为可操作的「是/否」；请逐项勾选后再确认本页。
                  </p>
                ) : null}
              </div>
              <div
                ref={contentRef}
                className="max-h-[min(50vh,420px)] overflow-y-auto px-4 py-3 text-sm text-slate-800 prose prose-sm max-w-none prose-headings:text-slate-900"
                dangerouslySetInnerHTML={{ __html: articleHtml }}
              />
            </div>

            <label className="mt-4 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span className="text-sm text-slate-700">本人已阅读并知晓上述协议内容</span>
            </label>

            {padCount > 0 ? (
              <div className="mt-4 space-y-4">
                <p className="text-xs text-slate-500">手写签名（联调）</p>
                {Array.from({ length: padCount }, (_, idx) => (
                  <div
                    key={`sig-${current.icf_version_id}-${idx}`}
                    className="rounded-lg border border-slate-200 bg-white overflow-hidden touch-none overscroll-contain"
                  >
                    {padCount > 1 ? (
                      <p className="text-xs text-slate-600 px-3 pt-2 pb-1 border-b border-slate-100 bg-slate-50/50">
                        受试者签名 {idx + 1} / {padCount}
                      </p>
                    ) : null}
                    <canvas
                      ref={setCanvasRef(idx)}
                      width={700}
                      height={160}
                      className="w-full h-40 touch-none cursor-crosshair block select-none"
                      onMouseDown={startDraw(idx)}
                      onMouseMove={moveDraw}
                      onMouseUp={endDraw}
                      onMouseLeave={endDraw}
                      onTouchStart={startDraw(idx)}
                      onTouchMove={moveDraw}
                      onTouchEnd={endDraw}
                    />
                    <div className="px-3 pb-2">
                      <button
                        type="button"
                        className="text-xs text-indigo-600 hover:underline"
                        onClick={() => clearPad(idx)}
                      >
                        清除本框签名
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500">
                当前节点未开启「受试者手写签名」，无需签名即可进入下一步（与小程序配置一致）。
              </p>
            )}

            <Button
              variant="primary"
              className="w-full mt-6 min-h-[3rem] flex flex-col items-center justify-center gap-0.5 py-2.5 px-3 h-auto"
              disabled={submitting || !readOk || !agreed || !hasAllSignatures}
              onClick={() => void onConfirmStep()}
            >
              {submitting ? (
                <span className="text-sm font-medium">正在写入签署记录…</span>
              ) : (
                <>
                  <span className="text-sm font-medium">{primaryLabel}</span>
                  {requiredSec > 0 ? (
                    <span className="text-xs font-normal opacity-90 leading-tight">
                      阅读计时 {Math.min(elapsedSec, requiredSec)} / {requiredSec} 秒
                      {!readOk ? '，请继续阅读' : '，可确认'}
                    </span>
                  ) : null}
                </>
              )}
            </Button>
          </>
        ) : null}

        <p className="text-[11px] text-slate-400 leading-relaxed mt-6">
          说明：本流程依赖环境变量 WITNESS_FACE_DEV_BYPASS=true；关闭后需使用真实火山人脸核验与微信小程序正式签署。
        </p>
      </div>
    </div>
  )
}
