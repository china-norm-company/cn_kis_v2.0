import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { protocolApi } from '@cn-kis/api-client'
import {
  applyIcfPlaceholders,
  buildIcfPlaceholderValues,
  buildIcfSignatureRawHtmlPlaceholders,
} from '@cn-kis/consent-placeholders'
import { Button } from '@cn-kis/ui-kit'
import { BookOpen, CheckCircle2 } from 'lucide-react'
import {
  appendSupplementalCollectCheckboxPreviewRows,
  collectInteractiveCheckboxAnswers,
  icfInteractiveCheckboxGroupsAllAnswered,
  injectInteractiveCheckboxMarkers,
  stripDocumentOtherInfoPlaceholderForCustomSupplemental,
} from '@/utils/icfCheckboxDetect'
import { ICF_PREVIEW_ASSIST_STYLE_BLOCK } from '@/utils/icfDocxPreviewShell'

/** 开发环境 React.StrictMode 会二次挂载并重置 state，提交成功后用 sessionStorage 恢复完成页 */
const CONSENT_TEST_SCAN_DONE_KEY = 'cn_kis:consent_test_scan_done:v1'
const CONSENT_TEST_SCAN_DONE_MAX_AGE_MS = 2 * 60 * 60 * 1000

function consentTestScanDoneStorageKey(protocolId: number, token: string) {
  return `${CONSENT_TEST_SCAN_DONE_KEY}:${protocolId}:${token}`
}

/** 与 apps/execution/index.html 默认 <title> 一致，离开本页时恢复 */
const DEFAULT_EXECUTION_BROWSER_TITLE = '维周·执行台 - CN KIS'

/**
 * 扫码知情测试：仅通过 document.title 设置顶栏文案。
 * 格式为「项目名称」+ 换行 +「项目编号」；部分 WebView 会拆成两行。微信第二行是否仍显示访问地址由客户端决定，H5 无法保证用编号覆盖 IP。
 */
function consentTestScanDocumentTitle(projectTitle: string, projectCode: string): string {
  const name = (projectTitle || '').trim()
  const code = (projectCode || '').trim()
  if (!name && !code) return '知情核验测试'
  if (!code) return name
  if (!name) return code
  return `${name}\n${code}`
}

type QueueItem = {
  icf_version_id: number
  node_title: string
  version: string
  required_reading_duration_seconds: number
  content: string
  enable_subject_signature?: boolean
  /** 与小程序生效规则一致：0=不要求受试者签名；1/2 次画布 */
  subject_signature_times?: 0 | 1 | 2
  /** 与节点/协议知情配置一致：自动签署日时落库为当日 0 点 */
  enable_auto_sign_date?: boolean
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
 * 执行台「核验测试」移动端 H5：扫码进入，按协议 ICF 节点完成阅读/勾选/签名后写入「测试」类型签署记录。
 * 与列表二维码参数 p、t（consent_test_scan_token）一致；不经过小程序。
 */
type ScanPhase = 'info' | 'face' | 'test'

export default function ConsentTestScanPage() {
  const [searchParams] = useSearchParams()
  const pRaw = searchParams.get('p') || ''
  const t = searchParams.get('t') || ''
  const protocolId = /^\d+$/.test(pRaw) ? Number(pRaw) : NaN
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [protocolCode, setProtocolCode] = useState('')
  const [requireFaceVerify, setRequireFaceVerify] = useState(false)
  /** 协议级：自动签署日期（与队列接口 enable_auto_sign_date 一致） */
  const [protocolAutoSignDate, setProtocolAutoSignDate] = useState(false)
  /** 队列就绪后：先信息录入 →（配置要求时）人脸说明 → 知情文档测试 */
  const [phase, setPhase] = useState<ScanPhase | null>(null)
  const [infoName, setInfoName] = useState('')
  const [infoIdCard, setInfoIdCard] = useState('')
  const [infoPhone, setInfoPhone] = useState('')
  const [infoSc, setInfoSc] = useState('')
  const [infoErr, setInfoErr] = useState<string | null>(null)
  const [items, setItems] = useState<QueueItem[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [readingStartedAt, setReadingStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  /** 每个受试者签名画布是否已有笔迹 */
  const [sigFilled, setSigFilled] = useState<boolean[]>([])
  const [finishedAll, setFinishedAll] = useState(false)
  /** 提交成功后：批次与各节点回执，用于完成页预览/下载 PDF（不经执行台登录） */
  const [receiptBundle, setReceiptBundle] = useState<{
    batchId: string
    subjectNo: string
    items: Array<{
      consent_id: number
      icf_version_id: number
      node_title: string
      version: string
      receipt_no: string
    }>
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const drawing = useRef(false)
  const activePadIdx = useRef<number | null>(null)
  const lastPt = useRef<{ x: number; y: number } | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  /** 联调：每节点正文内勾选结果，提交时写入 icf_version_answers */
  const answersByIcfRef = useRef<Record<number, Array<{ value: string }>>>({})
  /** 每节点手写签名画布导出（data URL），提交时写入 icf_version_signatures */
  const signaturesByIcfRef = useRef<Record<number, string[]>>({})
  /** 完成页：页内 iframe 预览 PDF（避免新窗口被浏览器/微信强制下载） */
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  /** 启用勾选识别时：每一处「请勾选」是否已选是/否 */
  const [checkboxRubricOk, setCheckboxRubricOk] = useState(true)

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

  /** 每进入测试步或切换节点刷新，用于 {{ICF_SIGNED_DATE}} 等预览锚点 */
  const previewAnchoredAt = useMemo(() => new Date(), [queueIndex, phase])

  /** 画布笔迹导出为 data URL，回填正文 {{ICF_SUBJECT_SIG_*}} */
  const [sigPreviewDataUrls, setSigPreviewDataUrls] = useState<string[]>([])

  useEffect(() => {
    if (phase !== 'test' || !current) {
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
  }, [sigFilled, phase, current?.icf_version_id, padCount, queueIndex])

  const articleHtml = useMemo(() => {
    const raw0 = (current?.content || '').trim()
    if (!raw0) return '<p>（暂无正文）</p>'
    const pv = buildIcfPlaceholderValues({
      protocolCode,
      protocolTitle: title,
      nodeTitle: current?.node_title,
      versionLabel: current?.version,
      identity: {
        declared_name: infoName,
        declared_id_card: infoIdCard,
        declared_phone: infoPhone,
        declared_screening_number: infoSc,
      },
      previewNow: previewAnchoredAt,
      enableAutoSignDate: protocolAutoSignDate || !!current?.enable_auto_sign_date,
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
    infoName,
    infoIdCard,
    infoPhone,
    infoSc,
    previewAnchoredAt,
    protocolAutoSignDate,
    current?.enable_auto_sign_date,
    padCount,
    sigPreviewDataUrls,
  ])

  useLayoutEffect(() => {
    if (phase !== 'test' || !current?.enable_checkbox_recognition) {
      setCheckboxRubricOk(true)
      return
    }
    const el = contentRef.current
    const sync = () => {
      setCheckboxRubricOk(icfInteractiveCheckboxGroupsAllAnswered(contentRef.current))
    }
    sync()
    // innerHTML 注入后同一帧内 ref 子树可能尚未稳定，双 rAF 再验一次
    let raf2 = 0
    const id0 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(sync)
    })
    el?.addEventListener('change', sync)
    el?.addEventListener('input', sync)
    el?.addEventListener('click', sync)
    return () => {
      cancelAnimationFrame(id0)
      if (raf2) cancelAnimationFrame(raf2)
      el?.removeEventListener('change', sync)
      el?.removeEventListener('input', sync)
      el?.removeEventListener('click', sync)
    }
  }, [articleHtml, current?.enable_checkbox_recognition, queueIndex, phase])

  /** 勾选状态仅依赖事件时偶发不刷新；短轮询兜底，避免底部按钮长期置灰 */
  useEffect(() => {
    if (phase !== 'test' || !current?.enable_checkbox_recognition) return
    const sync = () => {
      setCheckboxRubricOk(icfInteractiveCheckboxGroupsAllAnswered(contentRef.current))
    }
    const t = window.setInterval(sync, 300)
    return () => window.clearInterval(t)
  }, [articleHtml, current?.enable_checkbox_recognition, queueIndex, phase])

  useEffect(() => {
    if (!t.trim() || !Number.isFinite(protocolId)) {
      setErr('链接无效：缺少参数 p（协议 ID）或 t（核验口令），请重新扫描执行台知情管理中的二维码')
      setLoading(false)
      return
    }
    try {
      const raw = sessionStorage.getItem(consentTestScanDoneStorageKey(protocolId, t))
      if (raw) {
        const parsed = JSON.parse(raw) as {
          savedAt?: number
          batchId?: string
          subjectNo?: string
          protocol_title?: string
          protocol_code?: string
          items?: Array<{
            consent_id: number
            icf_version_id: number
            node_title: string
            version: string
            receipt_no: string
          }>
        }
        const age = typeof parsed.savedAt === 'number' ? Date.now() - parsed.savedAt : Infinity
        if (
          parsed.batchId
          && typeof parsed.savedAt === 'number'
          && age >= 0
          && age <= CONSENT_TEST_SCAN_DONE_MAX_AGE_MS
        ) {
          setTitle((parsed.protocol_title || '').trim())
          setProtocolCode((parsed.protocol_code || '').trim())
          setReceiptBundle({
            batchId: String(parsed.batchId).trim(),
            subjectNo: String(parsed.subjectNo || '').trim(),
            items: Array.isArray(parsed.items) ? parsed.items : [],
          })
          setFinishedAll(true)
          setLoading(false)
          return
        }
        sessionStorage.removeItem(consentTestScanDoneStorageKey(protocolId, t))
      }
    } catch {
      try {
        sessionStorage.removeItem(consentTestScanDoneStorageKey(protocolId, t))
      } catch {
        /* ignore */
      }
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await protocolApi.getConsentTestScanQueue({ p: protocolId, t })
        if (cancelled) return
        if (res.code !== 200 || !res.data) {
          setErr(res.msg || '无法加载核验测试队列')
          return
        }
        const d = res.data
        setTitle((d.protocol_title || '').trim() || '知情核验测试')
        setProtocolCode((d.protocol_code || '').trim())
        setRequireFaceVerify(!!d.require_face_verify)
        setProtocolAutoSignDate(!!d.enable_auto_sign_date)
        setItems(Array.isArray(d.items) ? d.items : [])
        if (!d.items?.length) {
          setErr('该项目暂无生效的 ICF 签署节点，请在执行台知情配置中维护后再试')
        } else {
          setPhase('info')
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
  }, [t, protocolId])

  useEffect(() => {
    if (loading && !finishedAll) {
      document.title = '知情核验测试'
      return
    }
    document.title = consentTestScanDocumentTitle(title, protocolCode)
  }, [loading, finishedAll, title, protocolCode])

  useEffect(() => {
    return () => {
      document.title = DEFAULT_EXECUTION_BROWSER_TITLE
    }
  }, [])

  useEffect(() => {
    if (phase !== 'test') return
    setErr(null)
    setAgreed(false)
    setReadingStartedAt(null)
    setElapsedSec(0)
    setSigFilled(Array(padCount).fill(false))
    canvasRefs.current = []
    activePadIdx.current = null
    drawing.current = false
  }, [queueIndex, current?.icf_version_id, padCount, phase])

  useEffect(() => {
    answersByIcfRef.current = {}
    signaturesByIcfRef.current = {}
  }, [t, protocolId, items.length])

  const captureCanvasSignatures = useCallback((): string[] => {
    const n = subjectPadCount(current)
    const urls: string[] = []
    for (let i = 0; i < n; i += 1) {
      const canvas = canvasRefs.current[i]
      if (canvas) urls.push(canvas.toDataURL('image/png'))
    }
    return urls
  }, [current])

  useEffect(() => {
    if (!current || phase !== 'test') return
    setReadingStartedAt(Date.now())
  }, [current, phase])

  useEffect(() => {
    if (phase !== 'test') {
      setElapsedSec(0)
      return
    }
    if (!readingStartedAt || requiredSec <= 0) {
      setElapsedSec(0)
      return
    }
    const t = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - readingStartedAt) / 1000)))
    }, 400)
    return () => clearInterval(t)
  }, [readingStartedAt, requiredSec, phase])

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

  const onSubmitInfo = () => {
    setInfoErr(null)
    const name = infoName.trim()
    const idc = infoIdCard.trim()
    const phone = infoPhone.trim()
    const sc = infoSc.trim()
    if (!name) {
      setInfoErr('请填写姓名')
      return
    }
    if (!idc || !/^(\d{15}|\d{17}[\dXx])$/.test(idc)) {
      setInfoErr('请填写合法的身份证号（15 位或 18 位）')
      return
    }
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 11) {
      setInfoErr('请填写至少 11 位数字的手机号')
      return
    }
    if (!sc) {
      setInfoErr('请填写 SC号')
      return
    }
    if (requireFaceVerify) setPhase('face')
    else setPhase('test')
  }

  const onConfirmStep = () => {
    if (!t || !Number.isFinite(protocolId) || !current || submitting) return
    if (!readOk) return
    if (!agreed) return
    if (current.enable_checkbox_recognition && !icfInteractiveCheckboxGroupsAllAnswered(contentRef.current)) {
      setErr('请完成正文中每一处「请勾选」（是/否）')
      return
    }
    if (!hasAllSignatures) return
    const currentAnswers = current.enable_checkbox_recognition
      ? collectInteractiveCheckboxAnswers(contentRef.current)
      : []
    answersByIcfRef.current[current.icf_version_id] = currentAnswers
    signaturesByIcfRef.current[current.icf_version_id] = captureCanvasSignatures()
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
        const icf_version_signatures = items.map((it) => ({
          icf_version_id: it.icf_version_id,
          signature_images: signaturesByIcfRef.current[it.icf_version_id] ?? [],
        }))
        const res = await protocolApi.submitConsentTestScan({
          p: protocolId,
          t,
          icf_version_ids: items.map((it) => it.icf_version_id),
          icf_version_answers,
          icf_version_signatures,
          subject_name: infoName.trim(),
          id_card_no: infoIdCard.trim(),
          phone: infoPhone.trim(),
          screening_number: infoSc.trim(),
        })
        if (res.code !== 200 || !res.data) {
          setErr(res.msg || '写入签署记录失败')
          return
        }
        const d = res.data
        const bundle = {
          batchId: (d.consent_test_scan_batch_id || '').trim(),
          subjectNo: (d.subject_no || '').trim(),
          items: Array.isArray(d.receipt_items) ? d.receipt_items : [],
        }
        try {
          sessionStorage.setItem(
            consentTestScanDoneStorageKey(protocolId, t),
            JSON.stringify({
              ...bundle,
              savedAt: Date.now(),
              protocol_title: title,
              protocol_code: protocolCode,
            }),
          )
        } catch {
          /* ignore quota / private mode */
        }
        setReceiptBundle(bundle)
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
        <Link to="/consent" className="mt-4 text-indigo-600 text-sm hover:underline">
          返回执行台知情管理
        </Link>
      </div>
    )
  }

  if (finishedAll) {
    const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
    const buildReceiptPdfHref = (consentId: number, download: boolean) => {
      const batchId = receiptBundle?.batchId || ''
      const q = new URLSearchParams()
      q.set('p', String(protocolId))
      q.set('t', t)
      q.set('consent_id', String(consentId))
      q.set('batch_id', batchId)
      if (download) q.set('download', '1')
      return `${apiBase}/protocol/public/consent-test-receipt?${q.toString()}`
    }
    const items = receiptBundle?.items ?? []
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start pt-10 px-4 pb-12">
        <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-sm p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-slate-800">核验测试已完成</h1>
          <p className="text-sm text-slate-600 mt-3 text-left leading-relaxed">
            已写入<strong>测试类型</strong>签署记录；受试者编号为{' '}
            <strong className="font-mono">{receiptBundle?.subjectNo || '—'}</strong>
            （以 T 开头），姓名与上一步填写一致。
          </p>
          <p className="text-sm text-slate-600 mt-2 text-left leading-relaxed">
            以下为本次生成的各节点<strong>知情签署 PDF</strong>：前几页为知情原文（若节点已上传 PDF/Word 预览），末尾为本次勾选结果与手写签名留痕；可在本页预览或下载。
          </p>
          {items.length > 0 ? (
            <ul className="mt-4 space-y-3 text-left">
              {items.map((r) => (
                <li
                  key={r.consent_id}
                  className="rounded-xl border border-slate-200 bg-slate-50/90 px-3 py-3 text-left"
                >
                  <div className="text-sm font-semibold text-slate-800">
                    {(r.node_title || '').trim() || '签署节点'}
                    {(r.version || '').trim() ? (
                      <span className="text-slate-500 font-normal"> · v{(r.version || '').trim()}</span>
                    ) : null}
                  </div>
                  {(r.receipt_no || '').trim() ? (
                    <div className="text-xs text-slate-500 mt-1">回执号 {(r.receipt_no || '').trim()}</div>
                  ) : null}
                  <div className="flex flex-wrap gap-4 mt-2.5 text-sm">
                    <button
                      type="button"
                      onClick={() => setPreviewUrl(buildReceiptPdfHref(r.consent_id, false))}
                      className="text-indigo-600 font-medium hover:underline"
                    >
                      预览 PDF
                    </button>
                    <a
                      href={buildReceiptPdfHref(r.consent_id, true)}
                      className="text-indigo-600 font-medium hover:underline"
                    >
                      下载 PDF
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-amber-800 mt-4 text-left rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
              未返回回执列表，请确认后端已更新；仍可在执行台「知情管理 → 签署记录」中查看测试类型记录。
            </p>
          )}
          <button
            type="button"
            className="mt-6 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              try {
                sessionStorage.removeItem(consentTestScanDoneStorageKey(protocolId, t))
              } catch {
                /* ignore */
              }
              window.location.reload()
            }}
          >
            重新核验（清除本机缓存并重新加载）
          </button>
        </div>
        {previewUrl ? (
          <div
            className="fixed inset-0 z-[100] flex flex-col bg-black/50 p-3 pt-10"
            role="dialog"
            aria-modal="true"
            aria-label="PDF 预览"
          >
            <div className="mx-auto flex w-full max-w-3xl flex-1 min-h-0 flex-col rounded-t-xl bg-white shadow-xl overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 text-sm">
                <span className="text-slate-700 font-medium">PDF 预览</span>
                <button
                  type="button"
                  className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-100"
                  onClick={() => setPreviewUrl(null)}
                >
                  关闭
                </button>
              </div>
              <iframe
                title="pdf-preview"
                src={previewUrl}
                className="w-full flex-1 min-h-[70vh] border-0 bg-slate-100"
              />
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const primaryLabel =
    queueIndex + 1 < total ? '确认本页并进入下一份' : '完成并写入测试签署记录'

  if (phase === 'info' && items.length > 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start pt-8 px-4 pb-12">
        <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2 text-slate-800 mb-1">
            <BookOpen className="w-6 h-6 text-indigo-600" />
            <h1 className="text-lg font-semibold">核验前信息</h1>
          </div>
          <p className="text-sm text-slate-500 mb-4">{title}</p>
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">姓名</span>
              <input
                type="text"
                name="name"
                autoComplete="name"
                value={infoName}
                onChange={(e) => setInfoName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                placeholder="请输入姓名"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">身份证号</span>
              <input
                type="text"
                name="idCard"
                inputMode="numeric"
                value={infoIdCard}
                onChange={(e) => setInfoIdCard(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                placeholder="请输入身份证号"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">手机号</span>
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                value={infoPhone}
                onChange={(e) => setInfoPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                placeholder="请输入手机号"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">SC号</span>
              <input
                type="text"
                name="sc"
                value={infoSc}
                onChange={(e) => setInfoSc(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
                placeholder="请输入数字"
              />
            </label>
          </div>
          {infoErr ? <p className="mt-3 text-sm text-rose-600">{infoErr}</p> : null}
          <Button variant="primary" className="w-full mt-6 min-h-[3rem]" onClick={onSubmitInfo}>
            {requireFaceVerify ? '下一步：人脸核验说明' : '进入知情核验测试'}
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'face') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start pt-8 px-4 pb-12">
        <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <h1 className="text-lg font-semibold text-slate-800">人脸认证</h1>
          <p className="text-sm text-slate-600 mt-3 leading-relaxed">
            当前协议在知情配置中<strong>启用了人脸认证签署</strong>。正式环境中请先在微信完成实名与人脸核验（与小程序正式流程一致），或联系管理员在知情配置中关闭「人脸认证签署」后使用本 H5 仅做交互与版式核验。
          </p>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            本页为执行台预发布核验测试流程的说明步骤；若你已按项目要求完成人脸核验，可点击下方按钮进入知情文档阅读与签名测试。
          </p>
          <Button variant="primary" className="w-full mt-6 min-h-[3rem]" onClick={() => setPhase('test')}>
            我已知晓，进入知情核验测试
          </Button>
        </div>
      </div>
    )
  }

  if (phase !== 'test') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 text-sm">准备中…</div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-start pt-6 px-4 pb-16">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-2 text-slate-800 mb-1">
          <BookOpen className="w-6 h-6 text-indigo-600" />
          <h1 className="text-lg font-semibold">知情核验测试 {stepLabel}</h1>
        </div>
        <p className="text-sm text-slate-500 mb-4">{title}</p>
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50/90 px-3 py-2 text-[12px] leading-relaxed text-sky-950">
          <strong className="font-medium">说明：</strong>
          本页为执行台「核验测试」移动端 H5，用于工作人员验证阅读计时、勾选与签名交互；提交后写入<strong>测试</strong>类型签署记录，与小程序正式受试者签署无关。
          {protocolAutoSignDate || current?.enable_auto_sign_date ? (
            <span className="block mt-1.5">
              当前协议/节点已启用<strong>自动签署日期</strong>：落库签署日为<strong>当日日历日</strong>（与小程序一致）。
            </span>
          ) : null}
          {padCount === 2 ? (
            <span className="block mt-1.5">
              当前节点配置为<strong>两次</strong>受试者手写签名，请分别在两处画布完成签名后再提交。
            </span>
          ) : null}
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
                <p className="text-xs text-slate-500">手写签名（核验测试）</p>
                {Array.from({ length: padCount }, (_, idx) => (
                  <div key={`sig-${current.icf_version_id}-${idx}`} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                    {padCount > 1 ? (
                      <p className="text-xs text-slate-600 px-3 pt-2 pb-1 border-b border-slate-100 bg-slate-50/50">
                        受试者签名 {idx + 1} / {padCount}
                      </p>
                    ) : null}
                    <canvas
                      ref={setCanvasRef(idx)}
                      width={700}
                      height={160}
                      className="w-full h-40 touch-none cursor-crosshair touch-pan-y block"
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
              disabled={
                submitting ||
                !readOk ||
                !agreed ||
                !hasAllSignatures ||
                (!!current.enable_checkbox_recognition && !checkboxRubricOk)
              }
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
          说明：本页为预发布「核验测试」H5；提交前需先填写姓名、身份证、手机号与 SC号。若未启用人脸认证签署，填写信息后直接进入本文档与签名测试。
        </p>
      </div>
    </div>
  )
}
