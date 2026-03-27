import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { View, Text, ScrollView, Button, Canvas, Textarea, Input, RichText } from '@tarojs/components'
import Taro, { useDidShow, useRouter } from '@tarojs/taro'
import { buildSubjectEndpoints } from '@cn-kis/subject-core'
import { taroApiClient, taroAuthProvider } from '@/adapters/subject-core'
import { get, getCurrentApiBaseUrl, shouldUseIdentityVerifyDevBypass } from '@/utils/api'
import {
  applyIcfPlaceholders,
  buildIcfPlaceholderValues,
  buildIcfSignatureRawHtmlPlaceholders,
} from '@cn-kis/consent-placeholders'
import { MiniButton } from '@/components/ui'
import './index.scss'

const subjectApi = buildSubjectEndpoints(taroApiClient)

const MOCK_LOGIN_BTN =
  typeof process !== 'undefined' &&
  !!process.env &&
  String(process.env.TARO_APP_MOCK_LOGIN_BTN || '').toLowerCase() === 'true'

function isNetworkError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || '')
  return /request:fail|ERR_CONNECTION|net::|timeout|网络|连接/.test(msg)
}

/**
 * 微信小程序 `rich-text` 不支持 iframe/embed 等节点；执行台对 PDF 节点会下发 iframe 嵌入，
 * 直接渲染会触发「Component is not found in path wx://not-found」并导致整页白屏。
 */
function sanitizeHtmlForWechatRichText(html: string): string {
  if (!html) return ''
  const iframeNotice =
    '<p style="color:#64748b;font-size:14px;line-height:1.6;padding:8px 0;">'
    + '[PDF 附件类正文无法在小程序内嵌预览，已省略嵌入区域；请继续阅读下方 HTML 正文，或向现场工作人员索取完整版。]'
    + '</p>'
  return html
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, iframeNotice)
    .replace(/<embed\b[^>]*>[\s\S]*?<\/embed>/gi, '')
    .replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
}

/** 开发预览：无后端时使用的模拟知情项 */
const MOCK_CONSENT_ITEM: ConsentItem = {
  id: 0,
  icf_version_id: 999,
  icf_version: 'dev',
  node_title: '个人信息收集同意',
  display_order: 0,
  required_reading_duration_seconds: 10,
  protocol_id: 1,
  protocol_code: 'LOCAL_PREVIEW',
  protocol_title: '本地预览项目',
  is_signed: false,
}

const MOCK_ICF_CONTENT = `本知情同意书为开发预览用途。

受试者：{{ICF_SUBJECT_NAME}}  项目：{{ICF_PROTOCOL_TITLE}}

请阅读不少于 10 秒后再签署。

（真机调试时若后端不可达，将显示此预览；连上后端后以执行台协议编号为准）`

interface ConsentItem {
  id: number
  icf_version_id: number
  icf_version?: string
  node_title?: string
  display_order?: number
  required_reading_duration_seconds?: number
  /** 执行台知情测试扫码入口会带 protocol_id，用于筛选待签队列 */
  protocol_id?: number | null
  protocol_code?: string
  protocol_title?: string
  is_signed: boolean
  /** 与 GET /my/consents 一致：退回重签时为 returned */
  staff_audit_status?: string
  staff_return_reason?: string | null
  consent_status_label?: string
}

/** 将后端返回的相对媒体路径转为小程序可下载的绝对 URL */
function resolveMediaFullUrl(pathOrUrl: string | null | undefined): string {
  const p = (pathOrUrl || '').trim()
  if (!p) return ''
  if (/^https?:\/\//i.test(p)) return p
  const base = (getCurrentApiBaseUrl() || '').replace(/\/api\/v1\/?$/i, '')
  if (!base) return p
  return `${base}${p.startsWith('/') ? '' : '/'}${p}`
}

interface SignedReceiptItem {
  node_title: string
  icf_version_id: number
  receipt_no: string | null
  receipt_pdf_url: string | null
}

interface ConsentBootstrap {
  identity_gate_required?: boolean
  total_pending_consent_count?: number
  allow_l1_pilot?: boolean
  pilot_protocol_codes?: string[] | null
  /** 是否存在「退回重签中」的待签项（与列表 staff_audit_status 一致） */
  has_returned_for_resign?: boolean
  projects?: Array<{
    protocol_code: string
    protocol_title: string
    pending_consent_count: number
    auth_ok_for_signing: boolean
  }> | null
}

/** GET /my/home-dashboard 项目块（用于与接待台一致的 SC / 拼音首字母预填） */
interface HomeDashboardProjectBlock {
  project_code?: string
  protocol_id?: number | null
  sc_number?: string
  sc_display?: string
  name_pinyin_initials?: string
}

function isIdentityRequiredError(res: { code?: number; data?: unknown; error_code?: unknown }): boolean {
  if (res?.code !== 403) return false
  const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const nestedCode = isRec(res?.data) ? res.data.error_code : undefined
  const code = typeof res?.error_code === 'string' ? res.error_code : nestedCode
  return code === '403_IDENTITY_REQUIRED'
}

/** 触摸点坐标 */
interface Point {
  x: number
  y: number
}

function ConsentPage() {
  const router = useRouter()
  /** 知情测试：落地页跳转携带 protocol_id + ct（与执行台列表二维码一致） */
  const consentScanTestRef = useRef<{ protocolId?: number; token?: string }>({})
  const [bootstrap, setBootstrap] = useState<ConsentBootstrap | null>(null)
  const [bootstrapLoading, setBootstrapLoading] = useState(true)

  const [agreed, setAgreed] = useState(false)
  const [signedAll, setSignedAll] = useState(false)
  /** 与执行台扫码核验一致：需补充姓名/手机等时，先单独一步「基础信息」再进入正文阅读签署 */
  const [basicInfoStepDone, setBasicInfoStepDone] = useState(false)
  /** 每份签署成功后的回执，用于完成页预览/下载 */
  const [signedReceipts, setSignedReceipts] = useState<SignedReceiptItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [identityGateRequired, setIdentityGateRequired] = useState(false)
  const [needLogin, setNeedLogin] = useState(false)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [devPreview, setDevPreview] = useState(false)

  const [pendingQueue, setPendingQueue] = useState<ConsentItem[]>([])
  const [queueLoading, setQueueLoading] = useState(false)
  const initialPendingTotalRef = useRef(0)

  const [icfContent, setIcfContent] = useState<string | null>(null)
  const [icfTitle, setIcfTitle] = useState('')
  const [requiredReadingSeconds, setRequiredReadingSeconds] = useState(0)
  const [icfLoading, setIcfLoading] = useState(false)
  const [noPendingConsent, setNoPendingConsent] = useState(false)
  const [receiptNo, setReceiptNo] = useState<string | null>(null)
  const [, setSignedAt] = useState<string | null>(null)
  const [lastSignStatus, setLastSignStatus] = useState<string | null>(null)
  const [signError, setSignError] = useState<string | null>(null)
  const [readingStartedAt, setReadingStartedAt] = useState<number | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  /** 与执行台「其他补充说明」配置一致，由 GET /my/consents/icf/:id 返回 */
  const [collectOtherInformation, setCollectOtherInformation] = useState(false)
  /** 启用自动签署日期：签署提交 signed_at 为当日 YYYY-MM-DD */
  const [enableAutoSignDate, setEnableAutoSignDate] = useState(false)
  /** 与执行台 mini_sign_rules / consent_settings 一致 */
  const [enableSubjectSignature, setEnableSubjectSignature] = useState(true)
  const [subjectSignatureTimes, setSubjectSignatureTimes] = useState(1)
  const [hasSignature2, setHasSignature2] = useState(false)
  const [otherInformationText, setOtherInformationText] = useState('')
  /** 与执行台 mini_sign_rules collect_* 一致，由 GET /my/consents/icf/:id 返回 */
  const [collectSubjectName, setCollectSubjectName] = useState(false)
  const [collectIdCard, setCollectIdCard] = useState(false)
  const [collectScreeningNumber, setCollectScreeningNumber] = useState(false)
  const [collectInitials, setCollectInitials] = useState(false)
  const [declaredSubjectName, setDeclaredSubjectName] = useState('')
  const [declaredIdCard, setDeclaredIdCard] = useState('')
  const [declaredPhone, setDeclaredPhone] = useState('')
  const [declaredScreeningNumber, setDeclaredScreeningNumber] = useState('')
  const [declaredInitials, setDeclaredInitials] = useState('')

  const isDrawing = useRef(false)
  const lastPoint = useRef<Point | null>(null)
  const isDrawing2 = useRef(false)
  const lastPoint2 = useRef<Point | null>(null)
  const ctxRef = useRef<Taro.CanvasContext | null>(null)
  const ctx2Ref = useRef<Taro.CanvasContext | null>(null)
  const canvasRectRef = useRef<{ left: number; top: number } | null>(null)
  const canvasRect2Ref = useRef<{ left: number; top: number } | null>(null)
  /** 本地联调：自动 dev-skip 实名仅尝试一次，避免重复请求 */
  const identityDevAutoSkipRef = useRef(false)

  const loadBootstrap = useCallback(() => {
    setBootstrapLoading(true)
    setNeedLogin(false)
    setBootstrapError(null)
    subjectApi.getConsentBootstrap()
      .then((res) => {
        const data = res.data as ConsentBootstrap | undefined
        if (res.code === 200 && data) {
          setBootstrap(data)
          const bypass = shouldUseIdentityVerifyDevBypass()
          const gate = !!data.identity_gate_required
          // 本地/局域网联调：与执行台扫码测试一致，不拦截「去实名」页，直接进入待签队列与基础信息/正文（后台仍 dev-skip 写入 L2）
          if (gate && bypass) {
            setIdentityGateRequired(false)
            if (!identityDevAutoSkipRef.current) {
              identityDevAutoSkipRef.current = true
              void subjectApi.devSkipIdentityVerify()
                .then((sk) => {
                  if (sk.code !== 200) {
                    identityDevAutoSkipRef.current = false
                    return
                  }
                  return subjectApi.getConsentBootstrap().then((r2) => {
                    const d2 = r2.data as ConsentBootstrap | undefined
                    if (r2.code === 200 && d2) {
                      setBootstrap(d2)
                      setIdentityGateRequired(!!d2.identity_gate_required)
                    }
                  })
                })
                .catch(() => {
                  identityDevAutoSkipRef.current = false
                })
            }
          } else {
            setIdentityGateRequired(gate)
          }
        } else if (res.code === 401) {
          setNeedLogin(true)
        } else if (res.code === 404) {
          setBootstrapError('未找到受试者信息，请先登录或确认账号已入组')
          setIdentityGateRequired(true)
        } else {
          setIdentityGateRequired(true)
        }
      })
      .catch((err) => {
        if (MOCK_LOGIN_BTN && isNetworkError(err)) {
          const userInfo = taroAuthProvider.getLocalUserInfo()
          const token = Taro.getStorageSync('token') || ''
          const isMockToken = /dev-mock|mock-dev/.test(String(token))
          if (userInfo && isMockToken) {
            setDevPreview(true)
            setBootstrap({ identity_gate_required: false, pilot_protocol_codes: [] })
            setIdentityGateRequired(false)
            setNeedLogin(false)
            setBootstrapError(null)
            return
          }
        }
        setBootstrapError(err?.message || '加载失败，请检查网络后重试')
        setIdentityGateRequired(true)
      })
      .finally(() => setBootstrapLoading(false))
  }, [])

  useDidShow(() => {
    identityDevAutoSkipRef.current = false
    loadBootstrap()
  })

  useEffect(() => {
    const p = router.params?.protocol_id ?? (router.params as Record<string, string | undefined>)?.protocolId
    const ct = router.params?.ct
    if (p != null && ct) {
      const n = Number(p)
      if (Number.isFinite(n) && n > 0) {
        consentScanTestRef.current = { protocolId: n, token: String(ct) }
      }
    }
  }, [router.params])

  const loadPendingQueue = useCallback(() => {
    setQueueLoading(true)
    setNoPendingConsent(false)
    subjectApi.getMyConsents()
      .then((res) => {
        if (res.code === 401) {
          setNeedLogin(true)
          setPendingQueue([])
          return
        }
        const raw = res.data as { items?: ConsentItem[] } | null | undefined
        const items = Array.isArray(raw?.items) ? raw.items : []
        let pending = items
          .filter((c) => !c.is_signed && c.icf_version_id)
          .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        const pid = consentScanTestRef.current.protocolId
        if (pid != null) {
          const matched = pending.filter((c) => (c as ConsentItem).protocol_id === pid)
          if (matched.length) {
            pending = matched
          } else if (pending.length) {
            Taro.showToast({ title: '暂无该项目的待签署知情', icon: 'none', duration: 3500 })
          }
        }
        setPendingQueue(pending)
        setNoPendingConsent(pending.length === 0)
        if (pending.length > 0) initialPendingTotalRef.current = pending.length
      })
      .catch(() => {
        setNoPendingConsent(true)
        setPendingQueue([])
      })
      .finally(() => setQueueLoading(false))
  }, [])

  useEffect(() => {
    if (bootstrapLoading) return
    if (identityGateRequired || needLogin) return
    if (devPreview) {
      setPendingQueue([MOCK_CONSENT_ITEM])
      setNoPendingConsent(false)
      initialPendingTotalRef.current = 1
      setQueueLoading(false)
      return
    }
    loadPendingQueue()
  }, [bootstrapLoading, identityGateRequired, needLogin, devPreview, loadPendingQueue])

  const currentItem = pendingQueue[0] ?? null
  /** 与列表项同步，避免 icf 状态晚一帧导致主区域与底部签名区空白（ScrollView 占满 flex 时底部易被顶出视口） */
  const effectiveIcfVersionId = currentItem?.icf_version_id ?? null
  const totalSteps = pendingQueue.length
  const stepLabel =
    totalSteps > 1 && initialPendingTotalRef.current
      ? `（${initialPendingTotalRef.current - totalSteps + 1}/${initialPendingTotalRef.current}）`
      : ''

  /** 与执行台知情测试 H5 卡片头「版本 v1.0」一致 */
  const icfVersionDisplay = useMemo(() => {
    const v = (currentItem?.icf_version || '').trim()
    if (!v) return 'v1.0'
    if (/^v\d/i.test(v)) return v
    return `v${v}`
  }, [currentItem?.icf_version])

  /** 切换节点时刷新，用于 {{ICF_SIGNED_DATE}} 等预览锚点 */
  const previewAnchorAt = useMemo(() => new Date(), [effectiveIcfVersionId])

  useEffect(() => {
    if (!currentItem?.icf_version_id) {
      setIcfContent(null)
      setIcfTitle('')
      return
    }
    const id = currentItem.icf_version_id
    setIcfLoading(true)
    setIcfContent(null)
    /** 切换待签项时先清空采集规则，避免沿用上一条的 needSupplement 导致错误页面顺序 */
    setCollectSubjectName(false)
    setCollectIdCard(false)
    setCollectScreeningNumber(false)
    setCollectInitials(false)
    setAgreed(false)
    setHasSignature(false)
    setReadingStartedAt(null)
    setElapsedSec(0)
    setOtherInformationText('')
    setCollectOtherInformation(false)
    setEnableAutoSignDate(false)
    setRequiredReadingSeconds(Math.max(0, Number(currentItem.required_reading_duration_seconds ?? 0)))
    setIcfTitle(currentItem.node_title || '知情文档')
    if (devPreview && id === MOCK_CONSENT_ITEM.icf_version_id) {
      setIcfContent(MOCK_ICF_CONTENT)
      setIcfLoading(false)
      setCollectOtherInformation(true)
      setBasicInfoStepDone(true)
      setReadingStartedAt(Date.now())
      return
    }
    subjectApi.getIcfContent(id)
      .then((r) => {
        const icfData = r.data as {
          content?: string
          node_title?: string
          required_reading_duration_seconds?: number
          collect_other_information?: boolean
          enable_auto_sign_date?: boolean
          enable_subject_signature?: boolean
          subject_signature_times?: number
          collect_subject_name?: boolean
          collect_id_card?: boolean
          collect_screening_number?: boolean
          collect_initials?: boolean
        } | null
        if (r.code === 200 && icfData) {
          setIcfContent(icfData.content ?? '')
          if (icfData.node_title) setIcfTitle(icfData.node_title)
          if (typeof icfData.required_reading_duration_seconds === 'number') {
            setRequiredReadingSeconds(Math.max(0, icfData.required_reading_duration_seconds))
          }
          setCollectOtherInformation(!!icfData.collect_other_information)
          setEnableAutoSignDate(!!icfData.enable_auto_sign_date)
          setEnableSubjectSignature(icfData.enable_subject_signature !== false)
          {
            const st = Number(icfData.subject_signature_times)
            setSubjectSignatureTimes(st === 2 ? 2 : st === 0 ? 0 : 1)
          }
          setCollectSubjectName(!!icfData.collect_subject_name)
          setCollectIdCard(!!icfData.collect_id_card)
          setCollectScreeningNumber(!!icfData.collect_screening_number)
          setCollectInitials(!!icfData.collect_initials)
          setDeclaredIdCard('')
          setDeclaredScreeningNumber('')
          setDeclaredInitials('')
        } else {
          setIcfContent('')
          setCollectOtherInformation(false)
          setEnableAutoSignDate(false)
          setEnableSubjectSignature(true)
          setSubjectSignatureTimes(1)
          setCollectSubjectName(false)
          setCollectIdCard(false)
          setCollectScreeningNumber(false)
          setCollectInitials(false)
        }
        const ns =
          !!(
            icfData
            && (icfData.collect_subject_name
              || icfData.collect_id_card
              || icfData.collect_screening_number
              || icfData.collect_initials)
          )
        setBasicInfoStepDone(!ns)
        if (!ns) {
          setReadingStartedAt(Date.now())
        } else {
          setReadingStartedAt(null)
          setElapsedSec(0)
        }
      })
      .catch(() => {
        setIcfContent('')
        setCollectOtherInformation(false)
        setEnableAutoSignDate(false)
        setEnableSubjectSignature(true)
        setSubjectSignatureTimes(1)
        setCollectSubjectName(false)
        setCollectIdCard(false)
        setCollectScreeningNumber(false)
        setCollectInitials(false)
        setBasicInfoStepDone(true)
        setReadingStartedAt(Date.now())
      })
      .finally(() => setIcfLoading(false))
  }, [currentItem, devPreview])

  useEffect(() => {
    if (effectiveIcfVersionId == null || devPreview) return
    void get<{ phone?: string; name?: string }>('/my/profile', { silent: true }).then((profileRes) => {
      if (profileRes.code !== 200 || !profileRes.data) return
      const p = profileRes.data
      const ph = (p.phone || '').replace(/\D/g, '').slice(0, 11)
      if (ph) setDeclaredPhone((prev) => (prev.trim() ? prev : ph))
      const nm = (p.name || '').trim()
      if (nm) setDeclaredSubjectName((prev) => (prev.trim() ? prev : nm))
    })
  }, [effectiveIcfVersionId, devPreview])

  /** 与首页/接待台同源：按当前协议匹配项目块，预填 SC 号、拼音首字母（身份证仍由用户手填） */
  useEffect(() => {
    if (effectiveIcfVersionId == null || devPreview) return
    const code = (currentItem?.protocol_code || '').trim()
    const pid = currentItem?.protocol_id
    if (!code && (pid == null || !Number.isFinite(Number(pid)))) return
    void get<{ projects_ordered?: HomeDashboardProjectBlock[] }>('/my/home-dashboard', { silent: true }).then(
      (res) => {
        if (res.code !== 200 || !res.data?.projects_ordered?.length) return
        const rows = res.data.projects_ordered
        const match =
          (pid != null
            ? rows.find((b) => b.protocol_id != null && Number(b.protocol_id) === Number(pid))
            : undefined)
          || (code ? rows.find((b) => (b.project_code || '').trim() === code) : undefined)
          || (code ? rows.find((b) => (b.project_code || '').includes(code)) : undefined)
        if (!match) return
        const scRaw = ((match.sc_display || match.sc_number || '') as string).trim()
        if (scRaw && collectScreeningNumber) {
          setDeclaredScreeningNumber((prev) => (prev.trim() ? prev : scRaw))
        }
        const ini = (match.name_pinyin_initials || '').trim()
        if (ini && collectInitials) {
          const normalized = ini.replace(/[^A-Za-z]/g, '').toUpperCase()
          if (normalized) setDeclaredInitials((prev) => (prev.trim() ? prev : normalized))
        }
      },
    )
  }, [
    effectiveIcfVersionId,
    devPreview,
    currentItem?.protocol_code,
    currentItem?.protocol_id,
    collectScreeningNumber,
    collectInitials,
  ])

  useEffect(() => {
    if (!readingStartedAt || requiredReadingSeconds <= 0) {
      setElapsedSec(0)
      return
    }
    const t = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - readingStartedAt) / 1000)))
    }, 500)
    return () => clearInterval(t)
  }, [readingStartedAt, requiredReadingSeconds])

  const readOk = requiredReadingSeconds <= 0 || elapsedSec >= requiredReadingSeconds
  const needSupplement =
    collectSubjectName || collectIdCard || collectScreeningNumber || collectInitials
  const phoneDigits = declaredPhone.replace(/\D/g, '')
  const idNorm = declaredIdCard.replace(/\s/g, '').replace(/[^0-9Xx]/g, '')
  const supplementOk =
    !needSupplement ||
    (phoneDigits.length >= 11 &&
      (!collectSubjectName || !!declaredSubjectName.trim()) &&
      (!collectIdCard || idNorm.length >= 15) &&
      (!collectScreeningNumber || !!declaredScreeningNumber.trim()) &&
      (!collectInitials || !!declaredInitials.trim()))
  const needSubjectSig = enableSubjectSignature && subjectSignatureTimes > 0
  const subjectSigReady =
    !needSubjectSig ||
    (subjectSignatureTimes === 1 && hasSignature) ||
    (subjectSignatureTimes === 2 && hasSignature && hasSignature2)
  /** 正文区：等 ICF 接口返回并写入 icfContent（空字符串也算已返回） */
  const showIcfDocLoading = icfLoading || (effectiveIcfVersionId != null && icfContent === null)
  /**
   * 认证基础信息：仅依赖 ICF 规则是否已返回（icfLoading），不依赖正文 HTML。
   * 若仍用 showIcfDocLoading 拦截，会先闪「主签署页 + 内容加载中」，体验上像进错页。
   */
  const showBasicInfoStepOnly =
    effectiveIcfVersionId != null && needSupplement && !basicInfoStepDone && !icfLoading

  /** 正文内 {{ICF_SUBJECT_SIG_*}}：导出画布为临时路径供 RichText 内嵌展示 */
  const [sigInlineTempPaths, setSigInlineTempPaths] = useState<string[]>([])

  useEffect(() => {
    if (effectiveIcfVersionId == null || !needSubjectSig) {
      setSigInlineTempPaths([])
      return
    }
    let cancelled = false
    const run = async () => {
      const paths: string[] = []
      for (let i = 0; i < Math.min(2, subjectSignatureTimes); i += 1) {
        const canvasId = i === 0 ? 'signatureCanvas' : 'signatureCanvas2'
        if ((i === 0 && !hasSignature) || (i === 1 && !hasSignature2)) {
          paths.push('')
          continue
        }
        try {
          const r = await Taro.canvasToTempFilePath({ canvasId })
          paths.push(r.tempFilePath)
        } catch {
          paths.push('')
        }
      }
      if (!cancelled) setSigInlineTempPaths(paths)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [hasSignature, hasSignature2, effectiveIcfVersionId, subjectSignatureTimes, needSubjectSig])

  const icfDisplayContent = useMemo(() => {
    const base = icfContent ?? ''
    if (!base.trim()) return ''
    const idNorm = declaredIdCard.replace(/\s/g, '').replace(/[^0-9Xx]/g, '')
    const phDigits = declaredPhone.replace(/\D/g, '')
    const vals = buildIcfPlaceholderValues({
      protocolCode: currentItem?.protocol_code,
      protocolTitle: currentItem?.protocol_title,
      nodeTitle: currentItem?.node_title,
      versionLabel: currentItem?.icf_version,
      identity: {
        declared_name: declaredSubjectName,
        declared_id_card: declaredIdCard,
        declared_phone: declaredPhone,
        declared_screening_number: declaredScreeningNumber,
        declared_pinyin_initials: declaredInitials,
      },
      miniSignConfirm: {
        subject_name: declaredSubjectName,
        screening_number: declaredScreeningNumber,
        initials: declaredInitials,
        id_card_last4: idNorm.length >= 4 ? idNorm.slice(-4) : '',
        phone_last4: phDigits.length >= 4 ? phDigits.slice(-4) : '',
      },
      receiptNo: receiptNo ?? '',
      previewNow: previewAnchorAt,
      enableAutoSignDate,
    })
    const subTimes = needSubjectSig ? (subjectSignatureTimes === 2 ? 2 : 1) : 0
    const rawSig = buildIcfSignatureRawHtmlPlaceholders({
      subjectSignatureTimes: subTimes,
      sig1Src: sigInlineTempPaths[0] || null,
      sig2Src: sigInlineTempPaths[1] || null,
    })
    return sanitizeHtmlForWechatRichText(
      applyIcfPlaceholders(base, vals, { escapeValues: true, rawHtmlByToken: rawSig }),
    )
  }, [
    icfContent,
    currentItem?.protocol_code,
    currentItem?.protocol_title,
    currentItem?.node_title,
    currentItem?.icf_version,
    declaredSubjectName,
    declaredIdCard,
    declaredPhone,
    declaredScreeningNumber,
    declaredInitials,
    receiptNo,
    previewAnchorAt,
    enableAutoSignDate,
    needSubjectSig,
    subjectSignatureTimes,
    sigInlineTempPaths,
  ])

  useEffect(() => {
    if (effectiveIcfVersionId == null) return
    try {
      const ctx = Taro.createCanvasContext('signatureCanvas')
      ctx.setStrokeStyle('#1a202c')
      ctx.setLineWidth(3)
      ctx.setLineCap('round')
      ctx.setLineJoin('round')
      ctxRef.current = ctx
      ctx.clearRect(0, 0, 9999, 9999)
      ctx.draw()
      setHasSignature(false)
    } catch {
      ctxRef.current = null
    }
  }, [effectiveIcfVersionId])

  useEffect(() => {
    if (effectiveIcfVersionId == null || subjectSignatureTimes < 2) {
      ctx2Ref.current = null
      setHasSignature2(false)
      return
    }
    try {
      const ctx = Taro.createCanvasContext('signatureCanvas2')
      ctx.setStrokeStyle('#1a202c')
      ctx.setLineWidth(3)
      ctx.setLineCap('round')
      ctx.setLineJoin('round')
      ctx2Ref.current = ctx
      ctx.clearRect(0, 0, 9999, 9999)
      ctx.draw()
      setHasSignature2(false)
    } catch {
      ctx2Ref.current = null
    }
  }, [effectiveIcfVersionId, subjectSignatureTimes])

  const updateCanvasRect = useCallback(() => {
    try {
      const query = Taro.createSelectorQuery()
      query.select('.signature-canvas-wrap-first').boundingClientRect()
      query.select('.signature-canvas-wrap-2').boundingClientRect()
      query.exec((res) => {
        const r0 = res?.[0]
        const r1 = res?.[1]
        if (r0 && typeof r0.left === 'number' && typeof r0.top === 'number') {
          canvasRectRef.current = { left: r0.left, top: r0.top }
        }
        if (r1 && typeof r1.left === 'number' && typeof r1.top === 'number') {
          canvasRect2Ref.current = { left: r1.left, top: r1.top }
        }
      })
    } catch {
      canvasRectRef.current = null
      canvasRect2Ref.current = null
    }
  }, [])

  useEffect(() => {
    if (effectiveIcfVersionId == null) return
    const t = setTimeout(updateCanvasRect, 100)
    return () => clearTimeout(t)
  }, [effectiveIcfVersionId, subjectSignatureTimes, updateCanvasRect])

  const toCanvasCoords = useCallback((x: number, y: number): Point => {
    const rect = canvasRectRef.current
    if (rect) {
      return { x: x - rect.left, y: y - rect.top }
    }
    return { x, y }
  }, [])

  const toCanvasCoords2 = useCallback((x: number, y: number): Point => {
    const rect = canvasRect2Ref.current
    if (rect) {
      return { x: x - rect.left, y: y - rect.top }
    }
    return { x, y }
  }, [])

  const handleTouchStart = useCallback((e) => {
    const touch = e.touches?.[0]
    if (!touch) return
    const pt = toCanvasCoords(touch.x, touch.y)
    isDrawing.current = true
    lastPoint.current = pt
  }, [toCanvasCoords])

  const handleTouchMove = useCallback((e) => {
    e.stopPropagation?.()
    if (!isDrawing.current || !lastPoint.current || !ctxRef.current) return
    const touch = e.touches?.[0]
    if (!touch) return
    const pt = toCanvasCoords(touch.x, touch.y)
    const ctx = ctxRef.current
    ctx.beginPath()
    ctx.moveTo(lastPoint.current!.x, lastPoint.current!.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    ctx.draw(true)
    lastPoint.current = pt
    setHasSignature(true)
  }, [toCanvasCoords])

  const handleTouchEnd = useCallback(() => {
    isDrawing.current = false
    lastPoint.current = null
  }, [])

  const handleTouchStart2 = useCallback((e) => {
    const touch = e.touches?.[0]
    if (!touch) return
    const pt = toCanvasCoords2(touch.x, touch.y)
    isDrawing2.current = true
    lastPoint2.current = pt
  }, [toCanvasCoords2])

  const handleTouchMove2 = useCallback((e) => {
    e.stopPropagation?.()
    if (!isDrawing2.current || !lastPoint2.current || !ctx2Ref.current) return
    const touch = e.touches?.[0]
    if (!touch) return
    const pt = toCanvasCoords2(touch.x, touch.y)
    const ctx = ctx2Ref.current
    ctx.beginPath()
    ctx.moveTo(lastPoint2.current!.x, lastPoint2.current!.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.stroke()
    ctx.draw(true)
    lastPoint2.current = pt
    setHasSignature2(true)
  }, [toCanvasCoords2])

  const handleTouchEnd2 = useCallback(() => {
    isDrawing2.current = false
    lastPoint2.current = null
  }, [])

  const handleClearSignature = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx) return
    ctx.clearRect(0, 0, 9999, 9999)
    ctx.draw()
    setHasSignature(false)
  }, [])

  const handleClearSignature2 = useCallback(() => {
    const ctx = ctx2Ref.current
    if (!ctx) return
    ctx.clearRect(0, 0, 9999, 9999)
    ctx.draw()
    setHasSignature2(false)
  }, [])

  const handleBasicInfoNext = useCallback(() => {
    if (!supplementOk) {
      Taro.showToast({ title: '请完整填写确认信息', icon: 'none' })
      return
    }
    setBasicInfoStepDone(true)
    setReadingStartedAt(Date.now())
    setElapsedSec(0)
  }, [supplementOk])

  const openReceiptPdf = useCallback((pathOrUrl: string | null | undefined) => {
    const full = resolveMediaFullUrl(pathOrUrl)
    if (!full) {
      Taro.showToast({ title: '暂无 PDF 链接', icon: 'none' })
      return
    }
    Taro.showLoading({ title: '打开中…' })
    Taro.downloadFile({
      url: full,
      success: (df) => {
        Taro.openDocument({
          filePath: df.tempFilePath,
          showMenu: true,
          fail: () => Taro.showToast({ title: '无法打开文件', icon: 'none' }),
        })
      },
      fail: () => Taro.showToast({ title: '下载失败，请检查网络与域名白名单', icon: 'none', duration: 3500 }),
    }).finally(() => Taro.hideLoading())
  }, [])

  const exportSignatureImage = (canvasId: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      Taro.canvasToTempFilePath({
        canvasId,
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
      Taro.showToast({ title: '请先阅读并勾选同意', icon: 'none' })
      return
    }
    if (!readOk) {
      Taro.showToast({ title: `请至少阅读 ${requiredReadingSeconds} 秒`, icon: 'none' })
      return
    }

    const userInfo = taroAuthProvider.getLocalUserInfo()
    if (!userInfo) {
      Taro.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    if (devPreview) {
      if (needSubjectSig) {
        if (subjectSignatureTimes === 1 && !hasSignature) {
          Taro.showToast({ title: '请先完成手写签名', icon: 'none' })
          return
        }
        if (subjectSignatureTimes === 2 && (!hasSignature || !hasSignature2)) {
          Taro.showToast({ title: '请完成两处手写签名', icon: 'none' })
          return
        }
      }
      Taro.showToast({ title: '开发预览：签署流程已模拟', icon: 'success' })
      setSignedReceipts([
        {
          node_title: currentItem?.node_title || MOCK_CONSENT_ITEM.node_title || '知情文档',
          icf_version_id: effectiveIcfVersionId ?? MOCK_CONSENT_ITEM.icf_version_id,
          receipt_no: 'DEV-PREVIEW',
          receipt_pdf_url: null,
        },
      ])
      setSignedAll(true)
      setReceiptNo('DEV-PREVIEW')
      return
    }

    setSubmitting(true)
    setSignError(null)
    try {
      if (effectiveIcfVersionId != null) {
        if (needSubjectSig) {
          if (subjectSignatureTimes === 1 && !hasSignature) {
            Taro.showToast({ title: '请先完成手写签名', icon: 'none' })
            setSubmitting(false)
            return
          }
          if (subjectSignatureTimes === 2 && (!hasSignature || !hasSignature2)) {
            Taro.showToast({ title: '请完成两处手写签名', icon: 'none' })
            setSubmitting(false)
            return
          }
        }
        let signatureStorageKey = ''
        let signatureStorageKey2 = ''
        if (needSubjectSig) {
          try {
            const signatureImagePath = await exportSignatureImage('signatureCanvas')
            const imageBase64 = readFileBase64(signatureImagePath)
            if (imageBase64) {
              const uploadRes = await taroApiClient.post('/signature/upload-base64', {
                image_base64: imageBase64,
              }) as { code: number; data: { storage_key: string } | null }
              if (uploadRes.code === 200 && uploadRes.data?.storage_key) {
                signatureStorageKey = uploadRes.data.storage_key
              }
            }
            if (subjectSignatureTimes >= 2) {
              const path2 = await exportSignatureImage('signatureCanvas2')
              const b64_2 = readFileBase64(path2)
              if (b64_2) {
                const up2 = await taroApiClient.post('/signature/upload-base64', {
                  image_base64: b64_2,
                }) as { code: number; data: { storage_key: string } | null }
                if (up2.code === 200 && up2.data?.storage_key) {
                  signatureStorageKey2 = up2.data.storage_key
                }
              }
            }
          } catch { /* ignore */ }
        }

        const readingDurationSeconds = readingStartedAt
          ? Math.max(0, Math.floor((Date.now() - readingStartedAt) / 1000))
          : elapsedSec
        const faceFromStorage = String(Taro.getStorageSync('identity_face_verify_token') || '').trim()
        const faceToken = faceFromStorage || 'pilot-no-real-face'
        const signedAt = (() => {
          if (enableAutoSignDate) {
            const d = new Date()
            const y = d.getFullYear()
            const m = String(d.getMonth() + 1).padStart(2, '0')
            const day = String(d.getDate()).padStart(2, '0')
            return `${y}-${m}-${day}`
          }
          return new Date().toISOString()
        })()

        const scanTok = (consentScanTestRef.current.token || '').trim()
        if (needSupplement) {
          if (phoneDigits.length < 11) {
            Taro.showToast({ title: '请填写确认手机号（与登录手机号一致）', icon: 'none' })
            setSubmitting(false)
            return
          }
          if (collectSubjectName && !declaredSubjectName.trim()) {
            Taro.showToast({ title: '请填写姓名', icon: 'none' })
            setSubmitting(false)
            return
          }
          if (collectIdCard && idNorm.length < 15) {
            Taro.showToast({ title: '请填写正确的身份证号', icon: 'none' })
            setSubmitting(false)
            return
          }
          if (collectScreeningNumber && !declaredScreeningNumber.trim()) {
            Taro.showToast({ title: '请填写 SC 编号', icon: 'none' })
            setSubmitting(false)
            return
          }
          if (collectInitials && !declaredInitials.trim()) {
            Taro.showToast({ title: '请填写拼音首字母', icon: 'none' })
            setSubmitting(false)
            return
          }
        }
        const supplementBody: Record<string, string> = {}
        if (needSupplement) {
          supplementBody.declared_phone = phoneDigits
          if (collectSubjectName) supplementBody.declared_subject_name = declaredSubjectName.trim()
          if (collectIdCard) supplementBody.declared_id_card = declaredIdCard.trim()
          if (collectScreeningNumber) supplementBody.declared_screening_number = declaredScreeningNumber.trim()
          if (collectInitials) supplementBody.declared_initials = declaredInitials.trim()
        }
        const signPayload: Record<string, unknown> = {
          face_verify_token: faceToken,
          reading_duration_seconds: readingDurationSeconds,
          comprehension_quiz_passed: true,
          signed_at: signedAt,
          ...(collectOtherInformation && otherInformationText.trim()
            ? { other_information_text: otherInformationText.trim().slice(0, 4000) }
            : {}),
          ...(scanTok ? { consent_test_scan_token: scanTok } : {}),
          ...supplementBody,
        }
        if (needSubjectSig) {
          if (subjectSignatureTimes >= 2 && signatureStorageKey && signatureStorageKey2) {
            signPayload.signature_images = [signatureStorageKey, signatureStorageKey2]
          } else if (signatureStorageKey) {
            signPayload.signature_image = signatureStorageKey
          }
        }
        const res = await subjectApi.faceSignConsent(effectiveIcfVersionId, signPayload)
        if (res.code === 403) {
          const ec = (res as { error_code?: string }).error_code
          const msg = (res as { msg?: string }).msg || '无法签署'
          if (ec === 'CONSENT_TEST_SCAN_BLOCKED' || ec === 'CONSENT_TEST_TOKEN_INVALID') {
            setSignError(msg)
            Taro.showToast({ title: msg, icon: 'none', duration: 4000 })
            return
          }
        }
        if (isIdentityRequiredError(res)) {
          setSignError('需完成实名或为试点项目已入组受试者')
          Taro.showModal({
            title: '无法签署',
            content: '请完成实名认证，或确认手机号已入组试点项目。',
            confirmText: '去认证',
            cancelText: '返回',
          }).then((r) => {
            if (r.confirm) Taro.navigateTo({ url: '/subpackages/pkg/pages/identity-verify/index' })
          })
          return
        }
        if (res.code === 404) {
          setSignError('该知情同意书不存在或已失效')
          Taro.showToast({ title: res?.msg || '知情同意书不存在', icon: 'none' })
          return
        }
        if (res.code === 409) {
          setSignError('您已签署过该版本')
          Taro.showToast({ title: res?.msg || '您已签署过该版本', icon: 'none' })
          return
        }
        if (res.code === 400) {
          const msg = res?.msg || '签署请求无效'
          setSignError(msg)
          Taro.showToast({ title: msg, icon: 'none' })
          return
        }
        const data = res.data as {
          status?: string
          receipt_no?: string
          signed_at?: string
          receipt_pdf_url?: string | null
        } | null
        const st = data?.status || ''
        const ok = res.code === 200 && (st === 'signed' || st === 'signed_pending_investigator') && data?.receipt_no
        if (ok) {
          setReceiptNo(data.receipt_no || null)
          setSignedAt(data.signed_at || null)
          setLastSignStatus(st)
          setSignedReceipts((prev) => [
            ...(Array.isArray(prev) ? prev : []),
            {
              node_title: currentItem?.node_title || icfTitle || '知情文档',
              icf_version_id: effectiveIcfVersionId,
              receipt_no: data.receipt_no ?? null,
              receipt_pdf_url: data?.receipt_pdf_url ?? null,
            },
          ])
          Taro.showToast({
            title: st === 'signed_pending_investigator' ? '受试者签署已提交，待工作人员双签' : '签署成功',
            icon: 'success',
          })
          const rest = pendingQueue.slice(1)
          if (rest.length > 0) {
            setPendingQueue(rest)
            setAgreed(false)
          } else {
            setSignedAll(true)
          }
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
          signatureImagePath = await exportSignatureImage('signatureCanvas')
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
          setSignedAll(true)
          setSignError(null)
          Taro.showToast({ title: '签署成功', icon: 'success' })
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

  if (bootstrapLoading) {
    return (
      <View className='consent-page'>
        <View className='consent-content'>
          <View className='doc-section'>
            <Text className='section-text loading-text'>加载中…</Text>
          </View>
        </View>
      </View>
    )
  }

  if (needLogin) {
    return (
      <View className='consent-page'>
        <View className='consent-content'>
          <View className='document'>
            <Text className='doc-title'>知情同意</Text>
            <Text className='section-text'>请先登录后再签署知情同意书。</Text>
            <View style={{ marginTop: 24 }}>
              <MiniButton onClick={() => Taro.switchTab({ url: '/pages/profile/index' })}>去登录</MiniButton>
            </View>
          </View>
        </View>
      </View>
    )
  }

  if (identityGateRequired) {
    const rawHint =
      bootstrap?.projects?.length
        ? bootstrap.projects.map((p) => p.protocol_code).filter(Boolean)
        : bootstrap?.pilot_protocol_codes
    const protocolHint = Array.isArray(rawHint) ? rawHint : rawHint ? [String(rawHint)] : []
    const protocolHintStr = protocolHint.length ? protocolHint.join('、') : ''

    return (
      <View className='consent-page'>
        <View className='consent-content'>
          <View className='document'>
            <Text className='doc-title'>知情同意</Text>
            <Text className='section-text'>
              {bootstrapError
                || `当前账号暂无法签署知情同意：需完成实名认证，或已为项目（${protocolHintStr || '与接待台预约/入组一致的项目编号'}）登记受试者且手机号一致。`}
            </Text>
            <View style={{ marginTop: 24 }}>
              <MiniButton onClick={() => Taro.navigateTo({ url: '/subpackages/pkg/pages/identity-verify/index' })}>去实名认证</MiniButton>
            </View>
            <View style={{ marginTop: 12 }}>
              <MiniButton variant='secondary' onClick={() => Taro.switchTab({ url: '/pages/profile/index' })}>查看「我的」</MiniButton>
            </View>
          </View>
        </View>
      </View>
    )
  }

  if (queueLoading || (devPreview && pendingQueue.length === 0)) {
    return (
      <View className='consent-page'>
        <View className='consent-content'>
          <View className='doc-section'>
            <Text className='section-text loading-text'>
              {devPreview ? '加载开发预览…' : '加载待签文档…'}
            </Text>
          </View>
        </View>
      </View>
    )
  }

  if (noPendingConsent && !signedAll) {
    return (
      <View className='consent-page'>
        <View className='consent-content consent-empty'>
          <View className='document'>
            <Text className='doc-title'>知情同意</Text>
            <Text className='section-text empty-desc'>
              暂无待签署的知情文档。请确认：研究方已在执行台「知情管理」中对本项目执行「发布」；您当日已在小程序完成现场签到；接待台登记的受试者信息与当前登录手机号一致。
            </Text>
            <Text className='consent-back' onClick={() => Taro.navigateBack()}>返回</Text>
          </View>
        </View>
      </View>
    )
  }

  if (signedAll) {
    return (
      <View className='consent-page'>
        <View className='signed-notice'>
          <Text className='signed-icon'>✓</Text>
          <Text className='signed-text'>待签文档已全部处理</Text>
          {receiptNo ? <Text className='signed-receipt'>最近回执号：{receiptNo}</Text> : null}
          {signedReceipts.length > 0 ? (
            <View style={{ marginTop: 16, width: '100%', paddingLeft: 0, paddingRight: 0 }}>
              <Text className='section-text' style={{ fontWeight: 600, marginBottom: 12 }}>
                本次签署协议
              </Text>
              {signedReceipts.map((row, idx) => (
                <View
                  key={`${row.icf_version_id}-${idx}`}
                  style={{
                    marginBottom: 16,
                    padding: 16,
                    background: '#f7fafc',
                    borderRadius: 8,
                    borderLeft: '4px solid #3182ce',
                  }}
                >
                  <Text className='section-text' style={{ fontWeight: 600, marginBottom: 8 }}>
                    {row.node_title}
                  </Text>
                  {row.receipt_no ? (
                    <Text className='section-text' style={{ fontSize: 24, color: '#4a5568', marginBottom: 8 }}>
                      回执号：{row.receipt_no}
                    </Text>
                  ) : null}
                  {row.receipt_pdf_url ? (
                    <Text
                      className='section-text'
                      style={{ color: '#3182ce', textDecoration: 'underline' }}
                      onClick={() => openReceiptPdf(row.receipt_pdf_url)}
                    >
                      查看 / 下载 PDF
                    </Text>
                  ) : (
                    <Text className='section-text' style={{ fontSize: 24, color: '#a0aec0' }}>
                      PDF 生成中或暂不可用
                    </Text>
                  )}
                </View>
              ))}
            </View>
          ) : null}
          {lastSignStatus === 'signed_pending_investigator' ? (
            <Text className='section-text' style={{ marginTop: 8 }}>
              工作人员见证签署可在执行台「知情管理」中完成。
            </Text>
          ) : null}
          <Text className='consent-back' onClick={() => Taro.navigateBack()}>返回</Text>
        </View>
      </View>
    )
  }

  if (showBasicInfoStepOnly) {
    const basicSubtitle = (() => {
      if (!currentItem) return '请先完成以下信息，再进入阅读与签署'
      const t = (currentItem.protocol_title || '').trim()
      const c = (currentItem.protocol_code || '').trim()
      if (t && c) return `${t} ${c}`
      if (t) return t
      if (c) return c
      return '请先完成以下信息，再进入阅读与签署'
    })()

    return (
      <View className='consent-page consent-page--basic'>
        <ScrollView className='consent-basic-scroll' scrollY enhanced={false}>
          <View className='consent-basic-inner'>
            <View className='consent-basic-card'>
              <View className='consent-basic-header'>
                <Text className='consent-basic-icon'>📖</Text>
                <View className='consent-basic-header-text'>
                  <Text className='consent-basic-h1'>认证基础信息</Text>
                </View>
              </View>
              <Text className='consent-basic-subtitle'>{basicSubtitle}</Text>
              <Text className='consent-basic-note'>
                为便于重复核验，本页填写会保存在本机（按协议区分）；请勿在公共设备上留存真实受试者信息。
              </Text>
              <View className='consent-basic-fields'>
                {collectSubjectName ? (
                  <View className='consent-field'>
                    <Text className='consent-field-label'>姓名</Text>
                    <Input
                      className='consent-field-input'
                      value={declaredSubjectName}
                      onInput={(e) => setDeclaredSubjectName(String(e.detail.value || '').slice(0, 100))}
                      placeholder='请输入姓名'
                      disabled={submitting}
                    />
                  </View>
                ) : null}
                {collectIdCard ? (
                  <View className='consent-field'>
                    <Text className='consent-field-label'>身份证号</Text>
                    <Input
                      className='consent-field-input'
                      value={declaredIdCard}
                      onInput={(e) => setDeclaredIdCard(String(e.detail.value || '').slice(0, 22))}
                      placeholder='请输入身份证号'
                      disabled={submitting}
                    />
                  </View>
                ) : null}
                <View className='consent-field'>
                  <Text className='consent-field-label'>手机号</Text>
                  <Input
                    type='number'
                    maxlength={11}
                    className='consent-field-input'
                    value={declaredPhone}
                    onInput={(e) => setDeclaredPhone(String(e.detail.value || '').replace(/\D/g, '').slice(0, 11))}
                    placeholder='请输入手机号'
                    disabled={submitting}
                  />
                </View>
                {collectScreeningNumber ? (
                  <View className='consent-field'>
                    <Text className='consent-field-label'>SC号</Text>
                    <Input
                      className='consent-field-input'
                      value={declaredScreeningNumber}
                      onInput={(e) => setDeclaredScreeningNumber(String(e.detail.value || '').slice(0, 64))}
                      placeholder='请输入数字'
                      disabled={submitting}
                    />
                  </View>
                ) : null}
                {collectInitials ? (
                  <View className='consent-field'>
                    <Text className='consent-field-label'>拼音首字母</Text>
                    <Input
                      className='consent-field-input consent-field-input--mono'
                      value={declaredInitials}
                      onInput={(e) =>
                        setDeclaredInitials(
                          String(e.detail.value || '')
                            .replace(/[^A-Za-z]/g, '')
                            .toUpperCase()
                            .slice(0, 32),
                        )
                      }
                      placeholder='如 WMD'
                      disabled={submitting}
                    />
                  </View>
                ) : null}
              </View>
              <Button
                className={`btn-primary consent-basic-submit ${!supplementOk ? 'disabled' : ''}`}
                onClick={handleBasicInfoNext}
                disabled={!supplementOk || submitting}
              >
                {devPreview ? '进入知情测试' : `进入阅读与签署${stepLabel}`}
              </Button>
            </View>
          </View>
        </ScrollView>
      </View>
    )
  }

  return (
    <View className='consent-page consent-page--h5'>
      <ScrollView className='consent-scroll-main' scrollY style={{ height: '100%' }}>
        <View className='consent-scroll-inner'>
          <View className='consent-h5-top'>
            <Text className='consent-h5-top-icon'>📖</Text>
            <View className='consent-h5-top-text'>
              <Text className='consent-h5-top-title'>
                {devPreview ? `知情测试${stepLabel}` : `知情同意${stepLabel}`}
              </Text>
              <Text className='consent-h5-top-sub'>
                {currentItem?.protocol_code
                  ? `项目编号 ${currentItem.protocol_code}${currentItem.protocol_title ? ` · ${currentItem.protocol_title}` : ''}`
                  : icfTitle || '临床研究知情文档'}
              </Text>
            </View>
          </View>

          {currentItem?.staff_audit_status === 'returned' ? (
            <View className='consent-banner consent-banner--warn'>
              <Text className='consent-banner__title'>需重新签署</Text>
              {currentItem.staff_return_reason ? (
                <Text className='consent-banner__body'>原因：{currentItem.staff_return_reason}</Text>
              ) : (
                <Text className='consent-banner__body'>工作人员已退回本次签署，请重新阅读并签署。</Text>
              )}
            </View>
          ) : null}

          {devPreview ? (
            <View className='consent-banner consent-banner--dev'>
              <Text className='consent-banner__body'>
                开发预览模式（后端不可达时展示，可测试签名交互）
              </Text>
            </View>
          ) : null}

          <View className='consent-icf-card'>
            <View className='consent-icf-card__head'>
              <Text className='consent-icf-card__title'>{icfTitle}</Text>
              <Text className='consent-icf-card__ver'>版本 {icfVersionDisplay}</Text>
            </View>
            <ScrollView scrollY className='consent-icf-card__body' style={{ maxHeight: '420px' }}>
              {showIcfDocLoading ? (
                <Text className='consent-icf-card__loading'>内容加载中…</Text>
              ) : icfContent !== null && icfContent !== '' ? (
                icfDisplayContent.includes('<') ? (
                  <RichText className='icf-rich-html' nodes={`<div class="icf-doc-body">${icfDisplayContent}</div>`} />
                ) : (
                  <Text className='section-text icf-plain-text'>{icfDisplayContent}</Text>
                )
              ) : effectiveIcfVersionId != null ? (
                <Text className='consent-icf-card__loading'>暂无正文，请联系研究方。</Text>
              ) : (
                <Text className='consent-icf-card__loading'>暂无正文</Text>
              )}
            </ScrollView>
          </View>

          <View className='consent-actions-h5'>
            {effectiveIcfVersionId != null && collectOtherInformation ? (
              <View className='consent-other-info consent-other-info--h5'>
                <Text className='consent-other-info-title'>其他补充说明（选填）</Text>
                <Text className='section-text consent-other-info-hint'>
                  若文档中有「如有其他信息，可在此添加」等说明，可在此填写。
                </Text>
                <Textarea
                  className='consent-other-info-textarea'
                  value={otherInformationText}
                  onInput={(e) => setOtherInformationText(String(e.detail.value || '').slice(0, 4000))}
                  placeholder='可填写与研究相关的其他说明…'
                  maxlength={4000}
                  showConfirmBar={false}
                  autoHeight
                  disabled={submitting}
                />
              </View>
            ) : null}

            {effectiveIcfVersionId != null && needSubjectSig ? (
              <View className='signature-date-row signature-date-row--h5'>
                <Text className='signature-date-label'>签署日期</Text>
                <Text className='signature-date-value'>
                  {enableAutoSignDate
                    ? (() => {
                        const d = new Date()
                        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
                      })()
                    : new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                  {enableAutoSignDate ? '（自动签署日）' : ''}
                </Text>
              </View>
            ) : null}

            <View className='agree-row agree-row--h5' onClick={() => setAgreed(!agreed)}>
              <View className={`checkbox ${agreed ? 'checkbox-checked' : ''}`}>
                {agreed && <Text className='check-mark'>✓</Text>}
              </View>
              <Text className='agree-text'>本人已阅读并知晓上述协议内容</Text>
            </View>

            {effectiveIcfVersionId != null && needSubjectSig ? (
              <>
                <Text className='consent-sig-section-label'>
                  {devPreview ? '手写签名（知情测试）' : '手写签名'}
                </Text>
                <View className='consent-sig-pad'>
                  {subjectSignatureTimes > 1 ? (
                    <View className='consent-sig-pad__bar'>
                      <Text className='consent-sig-pad__bar-text'>
                        受试者签名 1 / {subjectSignatureTimes}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    className='signature-canvas-wrap signature-canvas-wrap-first signature-canvas consent-sig-pad__canvas'
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                  >
                    <Canvas canvasId='signatureCanvas' className='signature-canvas-inner' disableScroll />
                  </View>
                  <View className='consent-sig-pad__footer'>
                    <Text className='consent-sig-pad__clear' onClick={handleClearSignature}>
                      清除本框签名
                    </Text>
                  </View>
                </View>
                {subjectSignatureTimes >= 2 ? (
                  <View className='consent-sig-pad consent-sig-pad--mt'>
                    <View className='consent-sig-pad__bar'>
                      <Text className='consent-sig-pad__bar-text'>
                        受试者签名 2 / {subjectSignatureTimes}
                      </Text>
                    </View>
                    <View
                      className='signature-canvas-wrap signature-canvas-wrap-2 signature-canvas consent-sig-pad__canvas'
                      onTouchStart={handleTouchStart2}
                      onTouchMove={handleTouchMove2}
                      onTouchEnd={handleTouchEnd2}
                    >
                      <Canvas canvasId='signatureCanvas2' className='signature-canvas-inner' disableScroll />
                    </View>
                    <View className='consent-sig-pad__footer'>
                      <Text className='consent-sig-pad__clear' onClick={handleClearSignature2}>
                        清除本框签名
                      </Text>
                    </View>
                  </View>
                ) : null}
              </>
            ) : null}

            <Button
              className={`btn-primary btn-primary--stack sign-btn ${showIcfDocLoading || !agreed || !readOk || !supplementOk || (effectiveIcfVersionId != null && !subjectSigReady) ? 'disabled' : ''}`}
              onClick={handleSign}
              disabled={
                showIcfDocLoading
                || !agreed
                || !readOk
                || !supplementOk
                || (effectiveIcfVersionId != null && !subjectSigReady)
                || submitting
              }
            >
              {submitting ? (
                <Text className='btn-primary-line1'>提交中...</Text>
              ) : (
                <View className='btn-primary-inner'>
                  <Text className='btn-primary-line1'>
                    {totalSteps > 1 ? `确认签署本页${stepLabel}` : '确认签署'}
                  </Text>
                  {requiredReadingSeconds > 0 ? (
                    <Text className='btn-primary-line2'>
                      阅读计时 {Math.min(elapsedSec, requiredReadingSeconds)} / {requiredReadingSeconds} 秒
                      {!readOk ? '，请继续阅读' : '，可确认'}
                    </Text>
                  ) : null}
                </View>
              )}
            </Button>

            {signError ? (
              <View className='sign-error-notice'>
                <Text className='sign-error-text'>{signError}</Text>
                <Text className='sign-error-action' onClick={() => setSignError(null)}>关闭</Text>
                <Text className='consent-back' onClick={() => Taro.navigateBack()}>返回</Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

export default ConsentPage
