import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
  Fragment,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { TooltipProvider, TruncatedTooltipLabel, RichTooltip } from '@/components/ui/TruncatedTooltipLabel'
import { ConsentTestScanQr } from '@/components/ConsentTestScanQr'
import {
  appendSupplementalCollectCheckboxPreviewRows,
  countCheckboxPreviewMarkers,
  countSupplementalCollectPreviewRows,
  injectCheckboxPreviewMarkers,
  stripDocumentOtherInfoPlaceholderForCustomSupplemental,
} from '@/utils/icfCheckboxDetect'
import {
  injectIcfPreviewAssistStylesIntoHtml,
  injectIcfPreviewTableNormalizeStylesIntoHtml,
  wrapMammothArticleToSrcDoc,
} from '@/utils/icfDocxPreviewShell'
import { mammothConvertDocxToArticleHtml } from '@/utils/icfMammothConvert'
import { loadIcfPreviewInLocalDev } from '@/utils/icfLocalDevPreview'
import { buildStaffConsentAuditPreviewHtml } from '@/utils/icfSignedStaffPreview'
import {
  buildIcfHtmlPrimaryInsertTokens,
  IcfContentHtmlEditorPanel,
} from '@/components/IcfContentHtmlEditorModal'
import {
  normalizePrivateLanHttpIpv4ImplicitPort8001,
  rewriteConsentTestScanUrlForBrowserClient,
} from '@/utils/consentScanUrl'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  applyIcfPlaceholders,
  applyIcfPlaceholdersWithSourceAnchors,
  buildIcfPlaceholderValues,
  buildIcfSignatureRawHtmlPlaceholders,
} from '@cn-kis/consent-placeholders'
import { protocolApi } from '@cn-kis/api-client'
import type {
  ICFVersion,
  ConsentRecord,
  ConsentPreviewData,
  Protocol,
  ProtocolConsentOverview,
  ConsentSettings,
  DualSignStaff,
  MiniSignRules,
  ScreeningBatchConsent,
  ScreeningDay,
  WitnessStaffRecord,
  DualSignStaffVerificationStatus,
  WitnessSignatureAuthStatus,
} from '@cn-kis/api-client'
import {
  Badge,
  Empty,
  Tabs,
  Modal,
  DataTable,
  Input,
  Select,
  type SelectOption,
  type BadgeVariant,
  Button,
} from '@cn-kis/ui-kit'
import {
  FileText,
  Download,
  Plus,
  Upload,
  ChevronRight,
  ChevronDown,
  Maximize2,
  Minimize2,
  ClipboardList,
  Settings,
  AlertCircle,
  ShieldCheck,
  GripVertical,
  Rocket,
  RotateCcw,
  Search,
  HelpCircle,
  SortAsc,
  Trash2,
  MoreHorizontal,
  Users,
  Eye,
  ArrowUpDown,
  ChevronUp,
  Copy,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

/** 从接口错误中解析 msg（优先 response.data.msg，兼容全局拦截器将业务错误写成「操作失败」的情况） */
function getMutationErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const ax = err as Error & { response?: { data?: { msg?: string } } }
    const fromBody = ax.response?.data?.msg
    if (typeof fromBody === 'string' && fromBody.trim()) return fromBody.trim()
    const m = err.message?.trim()
    if (m) return m
  }
  return fallback
}

/** 本地日历日 YYYY-MM-DD（签署记录日期筛选） */
function formatLocalDateYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 统一日期时间展示：YYYY-MM-DD HH:mm:ss（本地时区） */
function formatLocalDateTimeYmdHms(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(d.getTime())) return String(input)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
}

function aggregatePreviewSigningResults(items: ConsentPreviewData[]): string {
  const vals = items.map((p) => (p.signing_result || '').trim())
  if (vals.some((v) => v === '否')) return '否'
  if (vals.length > 0 && vals.every((v) => v === '是')) return '是'
  if (vals.some((v) => v === '是')) return '是'
  return vals[0] || '-'
}

function escapeHtmlForPreviewTitle(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

type ConsentTableDisplayRow =
  | { kind: 'single'; record: ConsentRecord }
  /** 后端 group_by=subject：一名受试者一行，consent_ids 为配置顺序 */
  | { kind: 'subject_group'; record: ConsentRecord }

/** 本页签署记录对应的全部 consent id（合并行时展开 consent_ids） */
function flatConsentRecordIdsOnPage(consents: ConsentRecord[]): number[] {
  return consents.flatMap((c) => (c.consent_ids?.length ? c.consent_ids : [c.id]))
}

/** 每条签署记录一行（一回执号一行）；不再按联调/扫码批次合并多节点，避免回执号堆叠 */
function buildConsentTableDisplayRows(list: ConsentRecord[]): ConsentTableDisplayRow[] {
  return list.map((record) => ({ kind: 'single' as const, record }))
}

/** 列表「筛选开始日期」列：仅「正式筛选」计划升序第一日（不含测试筛选）；无正式行时退回接口 earliest_screening_date */
function firstConfiguredScreeningDate(record: ProtocolConsentOverview): string | null {
  const sched = record.screening_schedule
  if (sched?.length) {
    const formal = sched.filter((s) => !s.is_test_screening)
    if (formal.length) {
      const sorted = [...formal].sort((a, b) => a.date.slice(0, 10).localeCompare(b.date.slice(0, 10)))
      return sorted[0].date.slice(0, 10)
    }
  }
  return record.earliest_screening_date?.slice(0, 10) ?? null
}

/** 列表「筛选结束日期」列：正式筛选计划降序第一日；无正式行时退回接口 latest_screening_date */
function lastConfiguredScreeningDate(record: ProtocolConsentOverview): string | null {
  const sched = record.screening_schedule
  if (sched?.length) {
    const formal = sched.filter((s) => !s.is_test_screening)
    if (formal.length) {
      const sorted = [...formal].sort((a, b) => b.date.slice(0, 10).localeCompare(a.date.slice(0, 10)))
      return sorted[0].date.slice(0, 10)
    }
  }
  return record.latest_screening_date?.slice(0, 10) ?? null
}

/** 列表「知情签署工作人员」：各现场日已选签署人员姓名去重展示 */
function formatScreeningSigningStaffSummary(record: ProtocolConsentOverview): string {
  const sched = record.screening_schedule
  if (!sched?.length) return ''
  const names = [...new Set(sched.map((s) => (s.signing_staff_name || '').trim()).filter(Boolean))]
  return names.join('、')
}

/** 列表「知情签署工作人员」列：优先项目级配置，否则汇总各现场日 */
function formatListSigningStaffCell(record: ProtocolConsentOverview): string {
  const direct = (record.consent_signing_staff_name || '').trim()
  if (direct) return direct
  return formatScreeningSigningStaffSummary(record)
}

/** 项目级「知情签署工作人员」多人：顿号/逗号分隔，与后端 `consent_signing_names` 一致 */
function parseSigningStaffNames(raw: string): string[] {
  const s = (raw || '').trim()
  if (!s) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const part of s.split(/[、,，;；\s]+/)) {
    const t = part.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

function serializeSigningStaffNames(names: string[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const n of names) {
    const t = (n || '').trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out.join('、')
}

/** 授权核验测试弹窗：右侧文案（支持多次发信重测，不与核验状态互斥） */
function listVerifyTestModalActionLabel(opts: { sending: boolean; hasWitness: boolean; statusLoading: boolean }): string {
  if (!opts.hasWitness) return '未在双签档案中匹配姓名'
  if (opts.statusLoading) return '…'
  if (opts.sending) return '发送中…'
  return '点击发送'
}

/** 列表「知情签署工作人员」列：最近一次「授权核验测试」所选姓名以蓝色气泡突出（无额外「核验」文案） */
function renderListSigningStaffCell(record: ProtocolConsentOverview): ReactNode {
  const s = formatListSigningStaffCell(record)
  if (!s) {
    return <span className="text-slate-400 text-sm">—</span>
  }
  const names = parseSigningStaffNames(s)
  const marked = (record.consent_verify_test_staff_name || '').trim()
  const showMark = marked && names.some((n) => n === marked)
  if (!showMark) {
    return (
      <span className="block min-w-0 truncate text-sm text-slate-800" title={s}>
        {s}
      </span>
    )
  }
  return (
    <div
      className="flex min-w-0 max-w-full flex-wrap items-center gap-x-0 gap-y-1 text-sm text-slate-800"
      title={s}
    >
      {names.map((n, i) => (
        <span key={`${n}-${i}`} className="inline-flex max-w-full items-center">
          {i > 0 ? <span className="text-slate-400">、</span> : null}
          {n === marked ? (
            <span className="inline-flex max-w-full items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
              {n}
            </span>
          ) : (
            <span>{n}</span>
          )}
        </span>
      ))}
    </div>
  )
}

function localTodayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function batchProgressPair(record: ProtocolConsentOverview, b: ScreeningBatchConsent): { num: number; den: number; pend: number } {
  // 与「计划」弹窗口径保持一致：按“人数”展示，而非按“文档份数（人数×ICF 节点数）”。
  const icfCount = Math.max(1, Number(b.icf_count) || 1)
  const targetPeople = targetCountForBatchDate(record, b.screening_date)
  const den = targetPeople != null
    ? Math.max(0, targetPeople)
    : Math.max(0, Number(b.cohort_subject_count) || 0)
  const signedDocs = Math.max(0, Number(b.progress_signed ?? b.signed_count) || 0)
  // 以“完整签署人数”估算：已签署文档数 / ICF 节点数，向下取整并封顶到目标人数。
  const num = Math.min(den, Math.floor(signedDocs / icfCount))
  const pend = Math.max(0, den - num)
  return { num, den, pend }
}

/** 统一现场日键（兼容 YYYY-MM-DD 与 YYYY/MM/DD），用于计划行与批次日期对齐 */
function normalizeScreeningDateKey(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\//g, '-')
    .slice(0, 10)
}

/** 双签「通知邮箱」：逗号分隔，与已选人员顺序一一对应；仅一段时表示统一发往该邮箱 */
function parseDualSignNotifyEmailSegments(raw: string): string[] {
  const t = raw.trim()
  if (!t) return []
  return t.split(',').map((s) => s.trim())
}

function effectiveDualSignNotifyForIndex(segments: string[], index: number, staffEmail: string): string {
  const ws = (staffEmail || '').trim()
  if (segments.length === 0) return ws
  if (segments.length === 1) return (segments[0] || ws).trim()
  return (segments[index] || ws).trim()
}

/** 知情配置双签区：每人一行展示用的单一汇总状态（发信使用下方批量按钮） */
function computeDualSignRowRollup(args: {
  hasSignatureOnFile: boolean
  face: DualSignStaffVerificationStatus | 'unknown'
  sig: WitnessSignatureAuthStatus | 'unknown'
  protocolTestSigningCompleted: boolean
  testScanReadyForThisStaff: boolean
}): { statusLabel: string; statusClass: string; statusTitle: string } {
  const { hasSignatureOnFile, face, sig, protocolTestSigningCompleted, testScanReadyForThisStaff } = args

  if (face === 'unknown' || sig === 'unknown') {
    return {
      statusLabel: '同步中…',
      statusClass: 'border-slate-200 bg-white text-slate-400',
      statusTitle: '正在拉取核验状态',
    }
  }

  if (!hasSignatureOnFile) {
    return {
      statusLabel: '待档案签名',
      statusClass: 'border-amber-200 bg-amber-50 text-amber-900',
      statusTitle:
        '需先在「双签工作人员名单」发起档案核验邮件并完成手写签名登记后，再使用下方「发送认证授权邮件」进行项目授权',
    }
  }

  if (sig === 'refused') {
    return {
      statusLabel: '已拒绝授权',
      statusClass: 'border-rose-200 bg-rose-50 text-rose-900',
      statusTitle: '该人员已在邮件链接内拒绝本项目使用签名信息',
    }
  }

  if (protocolTestSigningCompleted) {
    return {
      statusLabel: '已完成',
      statusClass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      statusTitle: '本项目已产生测试类型知情签署记录，链路可视为完成',
    }
  }

  const faceOk = face === 'verified'
  const sigOk = sig === 'agreed'

  if (faceOk && sigOk && testScanReadyForThisStaff) {
    return {
      statusLabel: '待扫码测试',
      statusClass: 'border-indigo-200 bg-indigo-50 text-indigo-900',
      statusTitle: '请在知情管理列表使用「核验测试」扫码；亦可再次使用下方「发送认证授权邮件」',
    }
  }

  if (faceOk && sigOk && !testScanReadyForThisStaff) {
    return {
      statusLabel: '待测试条件',
      statusClass: 'border-slate-200 bg-slate-50 text-slate-600',
      statusTitle: '需列表侧完成「授权核验测试」相关条件（如邮件授权）后方可扫码测试',
    }
  }

  if (sig === 'pending_decision') {
    return {
      statusLabel: '待邮件授权',
      statusClass: 'border-indigo-200 bg-indigo-50 text-indigo-900',
      statusTitle: '人脸已通过，请在邮件链接内同意或拒绝使用签名信息',
    }
  }

  if (face === 'pending_verify' || face === 'verifying' || sig === 'pending_face') {
    return {
      statusLabel: '人脸核验中',
      statusClass: 'border-indigo-200 bg-indigo-50 text-indigo-900',
      statusTitle: '对方已收到邮件，正进行人脸核验',
    }
  }

  return {
    statusLabel: '待发送认证授权邮件',
    statusClass: 'border-slate-200 bg-slate-50 text-slate-700',
    statusTitle: '尚未发送或链接已过期，请使用下方「发送认证授权邮件」',
  }
}

/** 列表「待测试」扫码条件是否对应当前行的工作人员姓名 */
function isDualSignTestScanReadyForStaffName(
  settings: ConsentSettings,
  protocolTestSigningCompleted: boolean,
  staffName: string,
): boolean {
  if (!settings.consent_verify_signature_authorized) return false
  if (protocolTestSigningCompleted) return false
  const pick = (settings.consent_verify_test_staff_name || '').trim()
  const nm = (staffName || '').trim()
  if (pick && pick !== nm) return false
  return true
}

/** 新建签署节点：从文件名解析默认节点标题（与后端约定一致） */
function parseFilenameAsNodeTitle(filename: string): string {
  const stem = filename.replace(/\.[^/.]+$/, '').trim()
  return stem.replace(/[-_]?v\d+(\.\d+)?$/i, '').replace(/[-_\s]+$/, '') || '未命名'
}

function isAllowedIcfUploadFile(file: File): boolean {
  const n = file.name.toLowerCase()
  return n.endsWith('.pdf') || n.endsWith('.doc') || n.endsWith('.docx')
}

function newIcfQueueItemId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `icf-q-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

type IcfCreateQueueItem = { id: string; file: File; nodeTitle: string }

/** 项目级最短阅读时长：未设置或为 0 时按默认 30 秒 */
function normalizeProjectMinReadingSeconds(raw: unknown): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 30
  return Math.min(3600, Math.floor(n))
}

type MinReadingSecondsFieldHandle = {
  /** 若有未失焦的输入草稿，先写入父状态并返回规范化秒数；否则返回当前 value */
  commit: () => number
}

type MinReadingSecondsFieldProps = {
  value: number
  disabled?: boolean
  onCommit: (n: number) => void
  className?: string
}

/** 受控 number 在清空时若立刻写回默认值会导致无法删光重输；编辑中用字符串草稿，失焦再规范化。不使用 placeholder，避免清空时出现灰色默认数字 */
const MinReadingSecondsField = forwardRef<MinReadingSecondsFieldHandle, MinReadingSecondsFieldProps>(
  function MinReadingSecondsField({ value, disabled, onCommit, className }, ref) {
    const [draft, setDraft] = useState<string | null>(null)

    useEffect(() => {
      setDraft(null)
    }, [value])

    useImperativeHandle(
      ref,
      () => ({
        commit: (): number => {
          if (draft === null) return value
          const n = draft === '' ? 30 : Number(draft)
          const resolved = normalizeProjectMinReadingSeconds(n)
          onCommit(resolved)
          setDraft(null)
          return resolved
        },
      }),
      [draft, onCommit, value],
    )

    const display = draft !== null ? draft : String(value)

    return (
      <input
        type="number"
        min={1}
        max={3600}
        value={display}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '' || /^\d*$/.test(raw)) {
            setDraft(raw)
          }
        }}
        onBlur={() => {
          if (draft === null) return
          const n = draft === '' ? 30 : Number(draft)
          onCommit(normalizeProjectMinReadingSeconds(n))
          setDraft(null)
        }}
        className={className}
      />
    )
  },
)

function targetCountForBatchDate(record: ProtocolConsentOverview, dateStr: string): number | undefined {
  const key = normalizeScreeningDateKey(dateStr)
  const x = record.screening_schedule?.find((s) => normalizeScreeningDateKey(s.date) === key)
  return x ? Math.max(1, Number(x.target_count) || 1) : undefined
}

/** 与知情配置「现场筛选计划」该行一致的知情签署人员（筛选弹窗保存后由 consent-overview 带回 screening_schedule） */
function signingStaffNameForScreeningDate(record: ProtocolConsentOverview, dateStr: string): string {
  const key = normalizeScreeningDateKey(dateStr)
  const x = record.screening_schedule?.find((s) => normalizeScreeningDateKey(s.date) === key)
  return (x?.signing_staff_name || '').trim()
}

/** 签署进度：测试筛选样式 — 优先用批次字段，否则用知情配置 screening_schedule 兜底（避免接口未带 is_test_screening 时无标识） */
function isTestScreeningForBatch(record: ProtocolConsentOverview, b: ScreeningBatchConsent): boolean {
  if (b.is_test_screening) return true
  const key = normalizeScreeningDateKey(b.screening_date)
  const row = record.screening_schedule?.find((s) => normalizeScreeningDateKey(s.date) === key)
  return !!row?.is_test_screening
}

/** 右侧说明：早于等于今日=xx人已签到；晚于今日=xx人待签到（目标−已到场） */
function batchAttendanceLabel(record: ProtocolConsentOverview, b: ScreeningBatchConsent): string {
  const d = b.screening_date.slice(0, 10)
  const today = localTodayISO()
  const cohort = b.cohort_subject_count ?? 0
  const target = targetCountForBatchDate(record, d)
  if (d <= today) {
    return `${cohort}人已签到`
  }
  const remain = target != null ? Math.max(0, target - cohort) : 0
  return `${remain}人待签到`
}

const ICF_PREVIEW_ZOOM = { min: 50, max: 200, step: 10, default: 100 }

async function isLikelyPdfBlob(blob: Blob): Promise<boolean> {
  const t = (blob.type || '').toLowerCase()
  if (t.includes('pdf')) return true
  if (blob.size < 4) return false
  const u8 = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
  return u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46
}

/**
 * blob: 同源 HTML iframe：按正文高度设置 iframe 高度，避免沿用 PDF 的 min(85vh) 在短文下方留出大片空白。
 */
function HtmlBlobPreviewIframe({ src }: { src: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  useLayoutEffect(() => {
    const iframe = ref.current
    if (!iframe) return
    let ro: ResizeObserver | null = null
    const fitHeight = () => {
      try {
        const d = iframe.contentDocument
        const b = d?.body
        const root = d?.documentElement
        if (!b) return
        const h = Math.max(
          b.scrollHeight,
          b.offsetHeight,
          root?.scrollHeight ?? 0,
          root?.offsetHeight ?? 0,
          1,
        )
        iframe.style.height = `${Math.ceil(h)}px`
      } catch {
        /* ignore */
      }
    }
    const onLoad = () => {
      ro?.disconnect()
      const doc = iframe.contentDocument
      if (!doc?.body) return
      fitHeight()
      ro = new ResizeObserver(fitHeight)
      ro.observe(doc.body)
      doc.querySelectorAll('img').forEach((img) => {
        img.addEventListener('load', fitHeight)
      })
    }
    iframe.addEventListener('load', onLoad)
    return () => {
      iframe.removeEventListener('load', onLoad)
      ro?.disconnect()
      const doc = iframe.contentDocument
      doc?.querySelectorAll('img').forEach((img) => img.removeEventListener('load', fitHeight))
    }
  }, [src])

  return (
    <iframe
      ref={ref}
      title="签署文件预览"
      src={src}
      sandbox="allow-same-origin"
      className="w-full max-w-full border-0 block bg-white align-top"
      style={{ minHeight: 0, height: 'auto', width: '100%' }}
    />
  )
}

/**
 * 签署文件预览：优先 GET …/preview（与线上一致）；失败时回退 GET /file + mammoth（与 icfLocalDevPreview 同源），避免本地未生成 MEDIA 时配置页无法预览。
 */
function IcfUploadFilePreview({
  protocolId,
  icf,
  protocolCode = '',
  protocolTitle = '',
  previewViewMode = 'original',
  supplementalCollectLabels,
  collectOtherInformation = false,
  /** 与知情配置一致：0/1/2 次受试者签名占位 */
  subjectSignatureTimes = 1,
  /** 与知情配置一致：0/1/2 次工作人员正文内嵌签名占位 */
  staffSignatureTimes = 0,
}: {
  protocolId: number
  icf: ICFVersion
  /** 占位符 {{ICF_PROTOCOL_*}} / 节点信息（配置预览无受试者数据时其余为空） */
  protocolCode?: string
  protocolTitle?: string
  previewViewMode?: 'original' | 'checkbox'
  supplementalCollectLabels?: string[]
  collectOtherInformation?: boolean
  subjectSignatureTimes?: number
  staffSignatureTimes?: number
}) {
  const [normalizedPreviewBlob, setNormalizedPreviewBlob] = useState<Blob | null>(null)
  /** mammoth 回退时 wrapMammothArticleToSrcDoc 的提示文案 */
  const [mammothBannerExtra, setMammothBannerExtra] = useState<string | undefined>(undefined)
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  /** PDF 需撑满滚动区；HTML（mammoth/服务端 HTML）按内容高度，避免短文下方大片空白 */
  const [previewIsPdf, setPreviewIsPdf] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [zoomPercent, setZoomPercent] = useState(ICF_PREVIEW_ZOOM.default)

  const filePreviewPlaceholderValues = useMemo(
    () =>
      buildIcfPlaceholderValues({
        protocolCode: protocolCode || '',
        protocolTitle: protocolTitle || '',
        nodeTitle: icf.node_title,
        versionLabel: icf.version,
      }),
    [protocolCode, protocolTitle, icf.node_title, icf.version],
  )

  const filePreviewSigPlaceholderHtml = useMemo(
    () =>
      buildIcfSignatureRawHtmlPlaceholders({
        subjectSignatureTimes: Math.min(2, Math.max(0, Number(subjectSignatureTimes) || 0)),
        staffSignatureTimes: Math.min(2, Math.max(0, Number(staffSignatureTimes) || 0)),
        sig1Src: null,
        sig2Src: null,
        staffSig1Src: null,
        staffSig2Src: null,
      }),
    [subjectSignatureTimes, staffSignatureTimes],
  )

  useEffect(() => {
    setZoomPercent(ICF_PREVIEW_ZOOM.default)
  }, [icf.id])

  const downloadOriginal = () => {
    protocolApi
      .fetchIcfVersionFileBlob(protocolId, icf.id)
      .then((blob) => {
        const u = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = u
        a.download = (icf.file_path || 'document').split('/').pop() || 'document'
        a.click()
        URL.revokeObjectURL(u)
      })
      .catch((err: unknown) => {
        window.alert(getMutationErrorMessage(err, '下载失败'))
      })
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    setNormalizedPreviewBlob(null)
    setMammothBannerExtra(undefined)

    async function run() {
      try {
        const r = await loadIcfPreviewInLocalDev(protocolId, icf)
        if (cancelled) return
        if (r.ok === false) {
          setLoadError(r.message)
          return
        }
        if (r.mode === 'docx-html') {
          setMammothBannerExtra(r.bannerExtra)
          const blob = new Blob([r.articleHtml], { type: 'text/html;charset=utf-8' })
          setNormalizedPreviewBlob(blob)
          return
        }
        // pdf / server-preview：已在 icfLocalDevPreview 内归一化 MIME，避免再 fetch(blobUrl)+二次 normalize
        if (r.mode === 'pdf' || r.mode === 'server-preview') {
          if (cancelled) return
          setNormalizedPreviewBlob(r.blob)
        }
      } catch (err: unknown) {
        if (!cancelled) setLoadError(getMutationErrorMessage(err, '预览加载失败'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [protocolId, icf.id, icf.file_path])

  useEffect(() => {
    let cancelled = false
    const urlRef: { current: string | null } = { current: null }

    if (!normalizedPreviewBlob) {
      setDisplayUrl(null)
      setPreviewIsPdf(false)
      return () => {}
    }

    ;(async () => {
      try {
        if (await isLikelyPdfBlob(normalizedPreviewBlob)) {
          const u = URL.createObjectURL(normalizedPreviewBlob)
          if (cancelled) {
            URL.revokeObjectURL(u)
            return
          }
          urlRef.current = u
          setPreviewIsPdf(true)
          setDisplayUrl(u)
          return
        }
        let html = await normalizedPreviewBlob.text()
        html = applyIcfPlaceholders(html, filePreviewPlaceholderValues, {
          escapeValues: true,
          rawHtmlByToken: filePreviewSigPlaceholderHtml,
        })
        const isArticleFragment = !/<html[\s>]/i.test(html.trim())

        if (isArticleFragment) {
          const rawArticle = html
          const rawForCb = stripDocumentOtherInfoPlaceholderForCustomSupplemental(rawArticle, supplementalCollectLabels)
          let processed = previewViewMode === 'checkbox' ? rawForCb : rawArticle
          if (previewViewMode === 'checkbox') {
            processed = injectCheckboxPreviewMarkers(processed)
            processed = appendSupplementalCollectCheckboxPreviewRows(
              processed,
              rawForCb,
              supplementalCollectLabels,
              collectOtherInformation,
            )
          }
          let full = wrapMammothArticleToSrcDoc(processed, mammothBannerExtra)
          if (previewViewMode === 'checkbox') {
            full = injectIcfPreviewAssistStylesIntoHtml(full)
          }
          const out = new Blob([full], { type: 'text/html;charset=utf-8' })
          const u = URL.createObjectURL(out)
          if (cancelled) {
            URL.revokeObjectURL(u)
            return
          }
          urlRef.current = u
          setPreviewIsPdf(false)
          setDisplayUrl(u)
          return
        }

        if (previewViewMode === 'checkbox') {
          const base = stripDocumentOtherInfoPlaceholderForCustomSupplemental(html, supplementalCollectLabels)
          html = injectCheckboxPreviewMarkers(base)
          html = appendSupplementalCollectCheckboxPreviewRows(
            html,
            base,
            supplementalCollectLabels,
            collectOtherInformation,
          )
        }
        if (previewViewMode === 'checkbox') {
          html = injectIcfPreviewAssistStylesIntoHtml(html)
        } else {
          html = injectIcfPreviewTableNormalizeStylesIntoHtml(html)
        }
        const out = new Blob([html], { type: 'text/html;charset=utf-8' })
        const u = URL.createObjectURL(out)
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        urlRef.current = u
        setPreviewIsPdf(false)
        setDisplayUrl(u)
      } catch {
        if (!cancelled) {
          setDisplayUrl(null)
          setPreviewIsPdf(false)
        }
      }
    })()

    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [
    normalizedPreviewBlob,
    mammothBannerExtra,
    previewViewMode,
    supplementalCollectLabels,
    collectOtherInformation,
    filePreviewPlaceholderValues,
    filePreviewSigPlaceholderHtml,
  ])

  const zoomScale = zoomPercent / 100
  const supportsCssZoom = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('zoom', '1')
  const zoomStyle: CSSProperties = useMemo(() => {
    if (supportsCssZoom) {
      return { zoom: zoomScale }
    }
    return {
      transform: `scale(${zoomScale})`,
      transformOrigin: 'top left',
      width: `${100 / zoomScale}%`,
    }
  }, [supportsCssZoom, zoomScale])

  const zoomToolbar = (
    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 shrink-0 border-b border-slate-200/80">
      <span className="text-xs text-slate-500">预览缩放</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          aria-label="缩小"
          disabled={zoomPercent <= ICF_PREVIEW_ZOOM.min}
          onClick={() =>
            setZoomPercent((z) => Math.max(ICF_PREVIEW_ZOOM.min, z - ICF_PREVIEW_ZOOM.step))
          }
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs tabular-nums text-slate-600 min-w-[3rem] text-center">{zoomPercent}%</span>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          aria-label="放大"
          disabled={zoomPercent >= ICF_PREVIEW_ZOOM.max}
          onClick={() =>
            setZoomPercent((z) => Math.min(ICF_PREVIEW_ZOOM.max, z + ICF_PREVIEW_ZOOM.step))
          }
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded-md text-indigo-600 hover:bg-indigo-50 font-medium"
          onClick={() => setZoomPercent(ICF_PREVIEW_ZOOM.default)}
        >
          重置
        </button>
      </div>
    </div>
  )

  const previewScrollShell = (inner: ReactNode, scrollMode: 'fill' | 'content' = 'fill') => (
    <div className="flex flex-col flex-1 min-h-0">
      {zoomToolbar}
      <div className="relative flex-1 min-h-[240px] rounded-md border border-slate-200 bg-slate-100/50">
        <div className="absolute inset-0 overflow-auto">
          <div
            className={scrollMode === 'fill' ? 'min-h-full w-full box-border' : 'min-h-0 w-full box-border'}
            style={zoomStyle}
          >
            {inner}
          </div>
        </div>
      </div>
    </div>
  )

  if (loading) {
    return <p className="text-sm text-slate-500 text-center py-8">正在加载文件预览…</p>
  }
  const origExt = (icf.file_path || '').split('.').pop()?.toLowerCase() || ''
  const isWordUpload = origExt === 'doc' || origExt === 'docx'

  if (loadError) {
    return (
      <div className="rounded-lg border border-amber-100 bg-amber-50/90 px-3 py-3 text-sm text-amber-950 space-y-2">
        <p className="text-rose-800">{loadError}</p>
        {import.meta.env.DEV ? (
          <p className="text-xs text-slate-700">
            请确认本机后端已运行（Vite 将 /api 代理到 8001）、已登录且有协议读权限。若服务端尚未生成预览文件，将自动尝试浏览器内转换（与线上一致时请以服务端预览为准）。
          </p>
        ) : isWordUpload ? (
          <p className="text-xs text-amber-900/90">
            .docx 在无 LibreOffice 时会自动生成网页版预览；旧版 .doc 由服务端自动转为 .docx 再生成网页预览（需 LibreOffice）。仍失败时可下载原文件。
          </p>
        ) : null}
        <button
          type="button"
          onClick={downloadOriginal}
          className="inline-flex items-center gap-1 text-indigo-600 font-medium hover:underline"
        >
          <Download className="w-4 h-4" />
          下载原文件
        </button>
      </div>
    )
  }
  const iframeClass = 'w-full border-0 block bg-white'
  const pdfIframeStyle: CSSProperties = supportsCssZoom
    ? { minHeight: '100%', height: '100%' }
    : { minHeight: 'min(85vh, 900px)', width: '100%' }

  if (!displayUrl) {
    return (
      <p className="text-sm text-slate-500">
        无法生成预览。若刚上传签署文件，请稍候再试或重新进入知情配置；仍无效时可下载原文件查看。
      </p>
    )
  }

  return previewScrollShell(
    previewIsPdf ? (
      <iframe title="签署文件预览" src={displayUrl} className={iframeClass} style={pdfIframeStyle} />
    ) : (
      <HtmlBlobPreviewIframe src={displayUrl} />
    ),
    previewIsPdf ? 'fill' : 'content',
  )
}

/**
 * 与 ScreeningConsentProgressColumn 顶部「知情签署总计」行（含 mb-1.5）对齐，使二维码 / 最后更新 / 操作与白框（首个现场日卡片）处于同一水平带。
 * 无现场日数据时仅做垂直居中，避免「暂无签署进度」行被顶出空隙。
 */
function consentOverviewSideCellWrapperClass(
  record: ProtocolConsentOverview,
  variant: 'center' | 'start',
): string {
  const hasBatches = (record.screening_batches?.length ?? 0) > 0
  if (!hasBatches) {
    return variant === 'center'
      ? 'flex min-h-[3rem] w-full items-center justify-center'
      : 'flex min-h-[3rem] w-full items-center justify-start'
  }
  return variant === 'center'
    ? 'flex w-full justify-center pt-[22px]'
    : 'flex w-full justify-start pt-[22px]'
}

const CONSENT_LIST_MORE_MENU_GAP = 4
const CONSENT_LIST_MORE_MENU_PAD = 8

/**
 * 知情列表「更多」菜单：挂到 document.body + fixed 定位，避免表体 overflow 裁切首行/末行；
 * 视口内优先向下展开，下方不足则翻到按钮上方，仍不足则贴顶并依赖 max-h 滚动。
 */
function ConsentListMoreFixedPortal(props: {
  open: boolean
  anchorRef: RefObject<HTMLButtonElement | null>
  children: React.ReactNode
}) {
  const { open, anchorRef, children } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null)

  const reposition = useCallback(() => {
    const btn = anchorRef.current
    const wrap = wrapRef.current
    if (!btn || !wrap) return
    const br = btn.getBoundingClientRect()
    const mw = Math.max(168, wrap.offsetWidth)
    const mh = wrap.offsetHeight
    const gap = CONSENT_LIST_MORE_MENU_GAP
    const pad = CONSENT_LIST_MORE_MENU_PAD
    const vh = window.innerHeight
    const vw = window.innerWidth

    let top = br.bottom + gap
    if (top + mh > vh - pad) {
      const aboveTop = br.top - gap - mh
      if (aboveTop >= pad) {
        top = aboveTop
      } else {
        top = Math.max(pad, Math.min(br.bottom + gap, vh - pad - mh))
      }
    }

    let left = br.right - mw
    left = Math.max(pad, Math.min(left, vw - mw - pad))

    setBox({ top, left, width: mw })
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!open) {
      setBox(null)
      return
    }
    reposition()
    const raf = requestAnimationFrame(() => reposition())
    const wrap = wrapRef.current
    const ro = wrap ? new ResizeObserver(() => reposition()) : null
    if (wrap) ro?.observe(wrap)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={wrapRef}
      style={
        box
          ? {
              position: 'fixed',
              top: box.top,
              left: box.left,
              width: box.width,
              zIndex: 500,
            }
          : { position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: 500 }
      }
      className="min-w-[10.5rem] max-h-[min(70vh,calc(100vh-16px))] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-left text-sm shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

/** 每行独立 ref，供 ConsentListMoreFixedPortal 锚定按钮位置 */
function ConsentRowMoreMenu(props: {
  open: boolean
  onToggle: () => void
  menu: ReactNode
}) {
  const { open, onToggle, menu } = props
  const btnRef = useRef<HTMLButtonElement>(null)
  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        title="发布、下架、授权核验测试、签署记录、删除项目"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        className="inline-flex flex-col items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-slate-700 hover:bg-slate-50 min-w-[2.75rem] disabled:opacity-40"
      >
        <MoreHorizontal className="w-3.5 h-3.5" aria-hidden />
        <span className="text-[11px] font-medium leading-none tracking-tight">更多</span>
      </button>
      <ConsentListMoreFixedPortal open={open} anchorRef={btnRef}>
        {menu}
      </ConsentListMoreFixedPortal>
    </div>
  )
}

/**
 * 按现场日升序；顶部合计在同时存在正式与测试现场日时按「知情签署总计 / 测试」拆分；默认仅展示首日，可展开全部。
 * expanded / onExpandedChange 由列表父组件统一管理，以支持「全部展开/全部收起」。
 */
function ScreeningConsentProgressColumn({
  record,
  expanded,
  onExpandedChange,
}: {
  record: ProtocolConsentOverview
  expanded: boolean
  onExpandedChange: (next: boolean) => void
}) {
  const batches = record.screening_batches ?? []

  const sortedBatches = useMemo(
    () => [...batches].sort((a, b) => a.screening_date.slice(0, 10).localeCompare(b.screening_date.slice(0, 10))),
    [batches],
  )

  /** 正式筛选 vs 测试筛选分子/分母/待签署（与各行 is_test_screening 一致） */
  const progressSplit = useMemo(() => {
    const formal = { num: 0, den: 0, pend: 0 }
    const test = { num: 0, den: 0, pend: 0 }
    for (const b of sortedBatches) {
      const p = batchProgressPair(record, b)
      if (isTestScreeningForBatch(record, b)) {
        test.num += p.num
        test.den += p.den
        test.pend += p.pend
      } else {
        formal.num += p.num
        formal.den += p.den
        formal.pend += p.pend
      }
    }
    const hasTest = sortedBatches.some((b) => isTestScreeningForBatch(record, b))
    const hasFormal = sortedBatches.some((b) => !isTestScreeningForBatch(record, b))
    return {
      formal,
      test,
      showSplit: hasTest && hasFormal,
      hasTestOnly: hasTest && !hasFormal,
    }
  }, [sortedBatches, record])

  if (!batches.length) {
    return (
      <div className="text-sm py-1 min-w-0 max-w-full">
        <p className="font-medium text-slate-700">暂无签署进度</p>
      </div>
    )
  }

  const visibleBatches = expanded || sortedBatches.length <= 1 ? sortedBatches : sortedBatches.slice(0, 1)

  const rowSingle = progressSplit.hasTestOnly ? progressSplit.test : progressSplit.formal

  return (
    <div
      className="text-sm text-left w-full max-w-full min-w-0 py-0.5"
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <div className="w-full text-[11px] text-slate-500 mb-1.5">
        {progressSplit.showSplit ? (
          <div
            className="min-w-0 flex flex-wrap items-baseline gap-x-1 gap-y-0.5"
            title="知情签署总计与测试筛选：各现场日分子之和 / 分母之和"
          >
            <span className="cursor-help whitespace-nowrap">
              <span className="text-slate-600">知情签署总计</span>{' '}
              <span className="font-medium text-slate-800 tabular-nums">
                {progressSplit.formal.num}/{progressSplit.formal.den}
              </span>
            </span>
            <span className="text-slate-300 select-none" aria-hidden>
              ·
            </span>
            <span className="cursor-help whitespace-nowrap text-amber-900/90">
              <span>测试</span>{' '}
              <span className="font-medium text-slate-800 tabular-nums">
                {progressSplit.test.num}/{progressSplit.test.den}
              </span>
            </span>
          </div>
        ) : (
          <span
            title={
              progressSplit.hasTestOnly
                ? '测试筛选各现场日分子之和、分母之和'
                : '以下各现场日合计行的分子之和、分母之和'
            }
            className="cursor-help"
          >
            知情签署总计{progressSplit.hasTestOnly ? '（测试）' : ''}{' '}
            <span className="font-medium text-slate-700 tabular-nums">
              {rowSingle.num}/{rowSingle.den}
            </span>
          </span>
        )}
      </div>

      <ul className="w-full max-w-full space-y-1.5">
        {visibleBatches.map((b, idx) => {
          const { num, den, pend } = batchProgressPair(record, b)
          const isTestBatch = isTestScreeningForBatch(record, b)
          const signingStaff = signingStaffNameForScreeningDate(record, b.screening_date)
          return (
            <li
              key={`${b.screening_date}-${idx}`}
              className={
                isTestBatch
                  ? 'w-full max-w-full rounded-lg border border-amber-300/90 bg-gradient-to-br from-amber-50/80 to-white px-1.5 py-1.5 shadow-sm'
                  : 'w-full max-w-full rounded-lg border border-slate-200 bg-gradient-to-br from-slate-50 to-white px-1.5 py-1.5 shadow-sm'
              }
            >
              {/* 单行：所有元素在日期卡片边框内自适应分配宽度，避免出框；右侧三项统一右对齐 */}
              <div className="min-w-0 w-full pb-0.5">
                <div className="grid w-full min-w-0 grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-x-2 text-[11px] leading-snug [font-variant-numeric:tabular-nums] sm:gap-x-2.5 sm:text-xs">
                  <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                    {b.screening_date.slice(0, 10)}
                    <span
                      className={
                        isTestBatch
                          ? 'inline-flex h-3.5 min-w-[0.875rem] shrink-0 items-center justify-center rounded border border-amber-500/90 bg-amber-100 px-0.5 text-[9px] font-bold leading-none text-amber-950'
                          : 'inline-flex h-3.5 min-w-[0.875rem] shrink-0 items-center justify-center rounded border border-transparent bg-transparent px-0.5 text-[9px] font-bold leading-none text-transparent select-none'
                      }
                      title={isTestBatch ? '测试筛选' : undefined}
                      aria-hidden={!isTestBatch}
                    >
                      测
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-slate-700">
                    当日小计{' '}
                    <span className="font-semibold tabular-nums text-slate-900">
                      {num}/{den}
                    </span>
                  </span>
                  <span className="ml-auto grid min-w-0 w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-baseline justify-items-end gap-x-1.5 text-right">
                    <span className="min-w-0 w-full whitespace-nowrap text-right font-semibold tabular-nums text-red-600">
                      待签署{pend}人
                    </span>
                    <span className="min-w-0 w-full whitespace-nowrap text-right text-slate-500 tabular-nums">
                      {batchAttendanceLabel(record, b)}
                    </span>
                    <span
                      className="min-w-0 w-full truncate text-right font-medium text-slate-800"
                      title={signingStaff || ''}
                    >
                      {signingStaff || '\u00A0'}
                    </span>
                  </span>
                </div>
              </div>
              {!b.is_planned_placeholder && b.total === 0 && b.expected_consent_rows > 0 ? (
                <p className="text-[11px] text-amber-700 mt-1">待生成 {b.expected_consent_rows} 份文档</p>
              ) : null}
            </li>
          )
        })}
      </ul>

      {sortedBatches.length > 1 ? (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-900 hover:underline"
          onClick={(e) => {
            e.stopPropagation()
            onExpandedChange(!expanded)
          }}
        >
          {expanded ? (
            <>
              <Minimize2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              收起
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
              查看更多日期（{sortedBatches.length - 1}）
            </>
          )}
        </button>
      ) : null}
    </div>
  )
}

async function downloadConsentOverviewExport(
  params: { keyword?: string; config_status?: string; date_start?: string; date_end?: string },
) {
  const blob = (await protocolApi.exportConsentOverview(params)) as Blob
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `知情管理项目列表_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

const STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'signed', label: '已签署' },
  { value: 'pending', label: '待签署' },
  { value: 'result_no', label: '签署结果为否' },
] as const

function consentRowStatusLabel(c: ConsentRecord): string {
  const raw = (c.consent_status_label || '').trim()
  if (raw) return raw
  return c.is_signed ? '已签署' : '待签署'
}

function consentStatusBadgeVariant(label: string): 'primary' | 'success' | 'warning' | 'error' {
  if (label === '已签署') return 'primary'
  if (label === '已通过审核') return 'success'
  if (label === '退回重签中') return 'error'
  return 'warning'
}

function ConsentSortTh({
  label,
  field,
  activeField,
  order,
  onSort,
  className = '',
}: {
  label: string
  field: string
  activeField: string
  order: 'asc' | 'desc'
  onSort: (f: string) => void
  className?: string
}) {
  const active = activeField === field
  return (
    <th className={`text-left py-3 px-4 align-middle ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 font-medium text-slate-600 hover:text-slate-900 max-w-full text-left"
      >
        <span className="truncate">{label}</span>
        {active ? (
          order === 'desc' ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 shrink-0 text-indigo-600" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        )}
      </button>
    </th>
  )
}

const DEFAULT_SETTINGS: ConsentSettings = {
  require_face_verify: false,
  require_dual_sign: false,
  require_comprehension_quiz: false,
  enable_min_reading_duration: true,
  min_reading_duration_seconds: 30,
  dual_sign_staffs: [],
  collect_id_card: false,
  collect_screening_number: false,
  collect_initials: false,
  collect_subject_name: false,
  collect_other_information: false,
  supplemental_collect_labels: [],
  enable_checkbox_recognition: false,
  enable_staff_signature: false,
  staff_signature_times: 1,
  enable_subject_signature: false,
  subject_signature_times: 1,
  enable_guardian_signature: false,
  guardian_parent_count: 1,
  guardian_signature_times: 1,
  planned_screening_dates: [],
  screening_schedule: [],
  consent_signing_staff_name: '',
  consent_verify_test_staff_name: '',
  enable_auto_sign_date: false,
}

/** 提交前去掉未选日期的空行，避免后端校验失败 */
function cleanScreeningScheduleForApi(raw: ScreeningDay[] | undefined): ScreeningDay[] {
  if (!raw?.length) return []
  return raw
    .map((r) => {
      const sn = (r.signing_staff_name || '').trim()
      return {
        date: (r.date || '').trim().slice(0, 10),
        target_count: Math.max(1, Number(r.target_count) || 1),
        is_test_screening: !!r.is_test_screening,
        ...(sn ? { signing_staff_name: sn } : {}),
      }
    })
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))
}

function clampOneOrTwo(v: unknown, fallback: 1 | 2): 1 | 2 {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return n >= 2 ? 2 : 1
}

/** 演示双签种子账号（example.com + demo.witness.）：不出现在「知情配置人员」候选 */
function isDemoWitnessExampleConsentAssigneeEmail(email: string | undefined): boolean {
  const e = (email || '').trim().toLowerCase()
  if (!e || !e.endsWith('@example.com')) return false
  return e.includes('demo.witness.')
}

/**
 * 知情配置内联二选一：用 button + 自定义列表，不用原生 select（展开项由系统绘制，样式无法与产品一致）。
 */
const CONSENT_SIGNATURE_TIMES_OPTIONS: SelectOption[] = [
  { value: '1', label: '签名 1 次' },
  { value: '2', label: '签名 2 次' },
]
const CONSENT_GUARDIAN_PARENT_OPTIONS: SelectOption[] = [
  { value: '1', label: '1 位家长' },
  { value: '2', label: '2 位家长' },
]
const CONSENT_GUARDIAN_EACH_TIMES_OPTIONS: SelectOption[] = [
  { value: '1', label: '每人签名 1 次' },
  { value: '2', label: '每人签名 2 次' },
]

function ConsentInlineSelect(props: {
  options: SelectOption[]
  value: 1 | 2
  onChange: (v: 1 | 2) => void
  disabled?: boolean
  widthClass?: string
}) {
  const { options, value, onChange, disabled, widthClass = 'w-[12rem] shrink-0' } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelBox, setPanelBox] = useState({ top: 0, left: 0, width: 192 })

  const syncPanelPosition = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPanelBox({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    syncPanelPosition()
    const onScrollOrResize = () => syncPanelPosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, syncPanelPosition])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find((o) => o.value === String(value))
  const currentLabel = current?.label ?? ''

  const listPanel =
    open && typeof document !== 'undefined' ? (
      <div
        ref={panelRef}
        role="listbox"
        className="fixed z-[500] max-h-60 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        style={{
          top: panelBox.top,
          left: panelBox.left,
          width: Math.max(panelBox.width, 192),
        }}
      >
        {options.map((opt) => {
          const selected = opt.value === String(value)
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={selected}
              className={`flex w-full px-3 py-2.5 text-left text-sm text-slate-800 transition-colors ${
                selected ? 'bg-primary-50 font-medium text-primary-900' : 'hover:bg-slate-50/90'
              }`}
              onClick={() => {
                onChange(Number(opt.value) === 2 ? 2 : 1)
                setOpen(false)
              }}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    ) : null

  return (
    <div ref={rootRef} className={`relative ${widthClass}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="relative flex h-10 w-full min-w-0 items-center rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-left text-sm text-slate-800 transition-colors hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate">{currentLabel}</span>
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {listPanel ? createPortal(listPanel, document.body) : null}
    </div>
  )
}

/** 单选字符串选项（现场日「知情签署人员」、弹窗「知情配置人员」等）：与 ui-kit 闭合态一致，展开为自定义浮层，非原生 select */
function SigningStaffInlineSelect(props: {
  options: SelectOption[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  widthClass?: string
  /** 无匹配项且 value 为空时闭合态文案（如知情配置人员去掉「未指定」后） */
  placeholder?: string
  /** 已选时是否在浮层底部显示「清空」以恢复为空（与 placeholder 搭配，列表中不出现「未指定」项） */
  allowClear?: boolean
  clearLabel?: string
}) {
  const {
    options,
    value,
    onChange,
    disabled,
    widthClass = 'w-[10.5rem] shrink-0',
    placeholder,
    allowClear = false,
    clearLabel = '清空',
  } = props
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [panelBox, setPanelBox] = useState({ top: 0, left: 0, width: 168 })

  const syncPanelPosition = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPanelBox({ top: r.bottom + 4, left: r.left, width: r.width })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    syncPanelPosition()
    const onScrollOrResize = () => syncPanelPosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, syncPanelPosition])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const matched = options.find((o) => o.value === value)
  const unset = value === '' || value === undefined
  const displayLabel =
    matched != null ? matched.label : unset ? placeholder ?? '' : '—'

  const dropdownPanel =
    open && typeof document !== 'undefined' ? (
      <div
        ref={panelRef}
        className="fixed z-[500] flex max-h-60 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        style={{
          top: panelBox.top,
          left: panelBox.left,
          width: Math.max(panelBox.width, 168),
        }}
      >
        <ul role="listbox" className="min-h-0 max-h-52 overflow-y-auto py-1">
          {options.map((opt) => {
            const selected = opt.value === value
            return (
              <li key={opt.value || '__empty'} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex w-full px-3 py-2.5 text-left text-sm text-slate-800 transition-colors ${
                    selected
                      ? 'bg-primary-50 font-medium text-primary-900'
                      : 'hover:bg-slate-50/90'
                  }`}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              </li>
            )
          })}
        </ul>
        {allowClear && (value || '').trim() ? (
          <div className="shrink-0 border-t border-slate-100 px-2 py-1.5">
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-800"
              onClick={() => {
                onChange('')
                setOpen(false)
              }}
            >
              {clearLabel}
            </button>
          </div>
        ) : null}
      </div>
    ) : null

  return (
    <div ref={rootRef} className={`relative ${widthClass}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="relative flex h-10 w-full min-w-0 items-center rounded-lg border border-slate-300 bg-white pl-3 pr-10 text-left text-sm text-slate-800 transition-colors hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50"
      >
        <span
          className={`min-w-0 flex-1 truncate ${matched == null && unset && placeholder ? 'text-slate-400' : ''}`}
        >
          {displayLabel}
        </span>
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {dropdownPanel ? createPortal(dropdownPanel, document.body) : null}
    </div>
  )
}

/** 知情签署工作人员：多选 + 搜索过滤 + 自定义浮层（与 ui-kit Select 闭合态一致） */
function SigningStaffMultiCombobox(props: {
  candidates: string[]
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  className?: string
  /** 未选时闭合态占位 */
  placeholder?: string
}) {
  const {
    candidates,
    value,
    onChange,
    disabled,
    className = 'w-full max-w-md',
    placeholder = '请选择人员',
  } = props
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  /**
   * 下拉选项：以双签全量名单 candidates 为主；仅追加「已保存但已不在名单」的姓名（可取消勾选）。
   * 不可与 value 对称合并：否则 candidates 为空时下列表会只剩已选几人，看起来像「只能选已选」。
   */
  const mergedCandidates = useMemo(() => {
    const set = new Set<string>()
    for (const name of candidates) {
      const t = name.trim()
      if (t) set.add(t)
    }
    for (const name of value) {
      const t = name.trim()
      if (t && !set.has(t)) set.add(t)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [candidates, value])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    if (!qq) return mergedCandidates
    return mergedCandidates.filter((n) => n.toLowerCase().includes(qq))
  }, [mergedCandidates, q])

  useEffect(() => {
    if (!open) {
      setQ('')
      return
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => window.clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (name: string) => {
    if (value.includes(name)) {
      onChange(value.filter((x) => x !== name))
    } else {
      onChange([...value, name])
    }
  }

  const remove = (name: string) => {
    onChange(value.filter((x) => x !== name))
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((v) => !v)}
        className="relative flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-left text-sm text-slate-800 transition-colors hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 text-left leading-snug">
          {value.length === 0 ? (
            <span className="text-slate-400">{placeholder}</span>
          ) : (
            <span className="flex flex-wrap gap-1.5">
              {value.map((n) => (
                <span
                  key={n}
                  className="inline-flex max-w-full items-center gap-0.5 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-900"
                >
                  <span className="truncate">{n}</span>
                  {!disabled ? (
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-primary-700 hover:bg-primary-100/80"
                      aria-label={`移除 ${n}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        remove(n)
                      }}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
            </span>
          )}
        </span>
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && !disabled ? (
        <div className="absolute left-0 right-0 z-[300] mt-1 flex max-h-72 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-md">
          <div className="shrink-0 border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索姓名"
                className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/15"
                onKeyDown={(e) => e.stopPropagation()}
                aria-label="搜索工作人员"
              />
            </div>
          </div>
          <ul role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-center text-xs text-slate-500">无匹配人员</li>
            ) : (
              filtered.map((name) => {
                const checked = value.includes(name)
                return (
                  <li key={name} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={checked}
                      className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors ${
                        checked ? 'bg-primary-50 font-medium text-primary-900' : 'text-slate-800 hover:bg-slate-50/90'
                      }`}
                      onClick={() => toggle(name)}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          checked ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-300 bg-white'
                        }`}
                        aria-hidden
                      >
                        {checked ? '✓' : ''}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                    </button>
                  </li>
                )
              })
            )}
          </ul>
          {value.length > 0 ? (
            <div className="shrink-0 border-t border-slate-100 px-2 py-1.5">
              <button
                type="button"
                className="text-xs text-slate-600 hover:text-slate-900 underline"
                onClick={() => onChange([])}
              >
                清空已选
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** 人脸认证签署：产品未开放，表单固定不勾选；点击提示「功能开发中」 */
function FaceVerifySigningLockedControl(props: {
  onRequestExplain: () => void
  /** 已发布等导致整块表单不可编辑时，不再叠一层点击提示 */
  formInteractionDisabled?: boolean
}) {
  const { onRequestExplain, formInteractionDisabled } = props
  return (
    <div className="relative inline-flex max-w-full items-start gap-2">
      <span className="inline-flex cursor-not-allowed items-center gap-2 text-sm text-slate-400 select-none">
        <input
          type="checkbox"
          checked={false}
          readOnly
          disabled
          tabIndex={-1}
          className="pointer-events-none h-4 w-4 shrink-0 rounded border-slate-200 text-slate-300"
          aria-hidden
        />
        <span>启用人脸认证签署</span>
      </span>
      {!formInteractionDisabled ? (
        <button
          type="button"
          className="absolute inset-0 z-[1] cursor-not-allowed rounded"
          title="功能开发中，敬请期待"
          aria-label="启用人脸认证签署，功能开发中，敬请期待"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onRequestExplain()
          }}
        />
      ) : null}
    </div>
  )
}

/** 当前签署节点的小程序规则草稿：已保存节点用节点数据，否则用协议级知情配置兜底 */
function deriveMiniDraftFromIcf(icf: ICFVersion | null | undefined, proto: ConsentSettings) {
  const pickProto = () => {
    const shared = {
      /** 人脸认证签署未开放，不与协议存储同步 */
      require_face_verify: false,
      require_dual_sign: !!proto.require_dual_sign,
      require_comprehension_quiz: !!proto.require_comprehension_quiz,
      enable_min_reading_duration: proto.enable_min_reading_duration !== false,
      min_reading_duration_seconds: normalizeProjectMinReadingSeconds(proto.min_reading_duration_seconds),
      dual_sign_staffs: (proto.dual_sign_staffs || []).map((s) => ({
        staff_id: s.staff_id || '',
        name: s.name || '',
        id_card_no: s.id_card_no || '',
        email: s.email || '',
        phone: s.phone || '',
        identity_verified: !!s.identity_verified,
      })),
      consent_signing_staff_name: (proto.consent_signing_staff_name || '').trim(),
      enable_checkbox_recognition: !!proto.enable_checkbox_recognition,
      enable_auto_sign_date: !!proto.enable_auto_sign_date,
    }
    // 未保存过节点规则时（含新上传 ICF）：「需采集的受试者信息」默认全部不勾选，避免继承协议里旧值造成误选
    if (!icf?.mini_sign_rules_saved) {
      return {
        ...shared,
        collect_id_card: false,
        collect_screening_number: false,
        collect_initials: false,
        collect_subject_name: false,
        collect_other_information: false,
        supplemental_collect_labels: [] as string[],
        enable_staff_signature: false,
        staff_signature_times: 1 as 1 | 2,
        enable_subject_signature: false,
        subject_signature_times: 1 as 1 | 2,
        enable_guardian_signature: false,
        guardian_parent_count: 1 as 1 | 2,
        guardian_signature_times: 1 as 1 | 2,
        enable_auto_sign_date: false,
      }
    }
    return {
      ...shared,
      collect_id_card: !!proto.collect_id_card,
      collect_screening_number: !!proto.collect_screening_number,
      collect_initials: !!proto.collect_initials,
      collect_subject_name: !!proto.collect_subject_name,
      collect_other_information: !!proto.collect_other_information,
      supplemental_collect_labels: Array.isArray(proto.supplemental_collect_labels)
        ? proto.supplemental_collect_labels.map((x) => String(x).trim()).filter(Boolean)
        : [],
      enable_staff_signature: !!proto.enable_staff_signature,
      staff_signature_times: clampOneOrTwo(proto.staff_signature_times, 1),
      enable_subject_signature: !!proto.enable_subject_signature,
      subject_signature_times: clampOneOrTwo(proto.subject_signature_times, 1),
      enable_guardian_signature: !!proto.enable_guardian_signature,
      guardian_parent_count: clampOneOrTwo(proto.guardian_parent_count, 1),
      guardian_signature_times: clampOneOrTwo(proto.guardian_signature_times, 1),
      enable_auto_sign_date: !!proto.enable_auto_sign_date,
    }
  }
  if (icf?.mini_sign_rules_saved && icf.mini_sign_rules && typeof icf.mini_sign_rules === 'object') {
    const m = icf.mini_sign_rules as Record<string, unknown>
    const base = pickProto()
    const ds = m.dual_sign_staffs
    const supFromM = Array.isArray(m.supplemental_collect_labels)
      ? (m.supplemental_collect_labels as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : []
    const supplementalLabels =
      supFromM.length > 0
        ? supFromM
        : typeof m.collect_other_information === 'boolean' && m.collect_other_information
          ? ['其他补充说明']
          : base.supplemental_collect_labels
    const collectOther =
      supplementalLabels.length > 0
        ? true
        : typeof m.collect_other_information === 'boolean'
          ? m.collect_other_information
          : base.collect_other_information
    return {
      require_face_verify: false,
      require_dual_sign: typeof m.require_dual_sign === 'boolean' ? m.require_dual_sign : base.require_dual_sign,
      require_comprehension_quiz:
        typeof m.require_comprehension_quiz === 'boolean' ? m.require_comprehension_quiz : base.require_comprehension_quiz,
      enable_min_reading_duration:
        typeof m.enable_min_reading_duration === 'boolean'
          ? m.enable_min_reading_duration
          : base.enable_min_reading_duration,
      min_reading_duration_seconds: normalizeProjectMinReadingSeconds(
        m.min_reading_duration_seconds != null ? Number(m.min_reading_duration_seconds) : base.min_reading_duration_seconds,
      ),
      dual_sign_staffs: Array.isArray(ds)
        ? (ds as DualSignStaff[]).map((s) => ({
            staff_id: s.staff_id || '',
            name: s.name || '',
            id_card_no: s.id_card_no || '',
            email: s.email || '',
            phone: s.phone || '',
            identity_verified: !!s.identity_verified,
          }))
        : base.dual_sign_staffs,
      collect_id_card: typeof m.collect_id_card === 'boolean' ? m.collect_id_card : base.collect_id_card,
      collect_screening_number:
        typeof m.collect_screening_number === 'boolean' ? m.collect_screening_number : base.collect_screening_number,
      collect_initials: typeof m.collect_initials === 'boolean' ? m.collect_initials : base.collect_initials,
      collect_subject_name:
        typeof m.collect_subject_name === 'boolean' ? m.collect_subject_name : base.collect_subject_name,
      collect_other_information: collectOther,
      supplemental_collect_labels: supplementalLabels,
      enable_checkbox_recognition:
        typeof m.enable_checkbox_recognition === 'boolean'
          ? m.enable_checkbox_recognition
          : base.enable_checkbox_recognition,
      enable_staff_signature:
        typeof m.enable_staff_signature === 'boolean' ? m.enable_staff_signature : base.enable_staff_signature,
      staff_signature_times:
        m.staff_signature_times != null ? clampOneOrTwo(m.staff_signature_times, 1) : base.staff_signature_times,
      enable_subject_signature:
        typeof m.enable_subject_signature === 'boolean' ? m.enable_subject_signature : base.enable_subject_signature,
      subject_signature_times:
        m.subject_signature_times != null ? clampOneOrTwo(m.subject_signature_times, 1) : base.subject_signature_times,
      enable_guardian_signature:
        typeof m.enable_guardian_signature === 'boolean' ? m.enable_guardian_signature : base.enable_guardian_signature,
      guardian_parent_count:
        m.guardian_parent_count != null ? clampOneOrTwo(m.guardian_parent_count, 1) : base.guardian_parent_count,
      guardian_signature_times:
        m.guardian_signature_times != null
          ? clampOneOrTwo(m.guardian_signature_times, 1)
          : base.guardian_signature_times,
      enable_auto_sign_date:
        typeof m.enable_auto_sign_date === 'boolean' ? m.enable_auto_sign_date : base.enable_auto_sign_date,
    }
  }
  return pickProto()
}

const SCREENING_DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 将管道分段中的「测」统一挪到**最后一段**（规范：正式 …|姓名；测试 …|测 或 …|姓名|测）。
 * 兼容旧写法 `…|测|姓名`，会转为 `…|姓名|测` 再解析。
 */
function normalizeScreeningBulkPipeSegments(parts: string[]): string[] {
  const p = parts.map((s) => s.trim()).filter((s) => s.length > 0)
  if (!p.some((s) => s === '测')) return p
  const rest = p.filter((s) => s !== '测')
  return [...rest, '测']
}

/**
 * 批量粘贴解析：每行一条，如 2026-03-10|10人、2026-03-10|10人|张三（正式+签署人员）、
 * 2026-03-10|5|测（测试）、2026-03-13|8|李四|测（测试+签署人员）。
 * 「测」须写在**最后一段**（若写在中间会先规范化为最后一段再解析）。
 * 兼容旧写法：行首「测」前缀、行尾 |测
 */
function parseScreeningScheduleBulkText(text: string): ScreeningDay[] {
  const lines = text.split(/\r?\n/)
  const out: ScreeningDay[] = []
  const suffixTestRe = /\s*[\|｜]\s*测\s*$/
  for (const raw of lines) {
    let line = raw.trim()
    if (!line) continue
    let isTest = false
    const withoutSuffix = line.replace(suffixTestRe, '')
    if (withoutSuffix !== line) {
      isTest = true
      line = withoutSuffix.trim()
    }
    if (line.startsWith('测')) {
      isTest = true
      line = line.slice(1).trim()
      line = line.replace(/^[\|｜\s]+/, '').trim()
    }
    const partsRaw = line.split(/[|｜]/).map((s) => s.trim()).filter((s) => s.length > 0)
    const partsNorm = normalizeScreeningBulkPipeSegments(partsRaw)
    let partsWork = partsNorm
    if (partsWork.length > 0 && partsWork[partsWork.length - 1] === '测') {
      isTest = true
      partsWork = partsWork.slice(0, -1)
    }
    if (partsWork.length < 2) continue
    const date = partsWork[0].match(/^(\d{4}-\d{2}-\d{2})$/)?.[1]
    if (!date || !SCREENING_DAY_RE.test(date)) continue
    const nm = partsWork[1].match(/^(\d{1,5})\s*人?$/)
    if (!nm) continue
    const target = Math.max(1, Math.min(99999, parseInt(nm[1], 10)))
    let signingStaff = ''
    if (partsWork.length >= 3) {
      signingStaff = (partsWork[2] || '').trim()
    }
    out.push({
      date,
      target_count: target,
      is_test_screening: isTest,
      ...(signingStaff ? { signing_staff_name: signingStaff } : {}),
    })
  }
  return out
}

function screeningScheduleFromConsent(raw: ConsentSettings): ScreeningDay[] {
  const sched = raw.screening_schedule
  if (sched && sched.length) {
    return sched.map((x) => ({
      date: (x.date || '').slice(0, 10),
      target_count: Math.max(1, Number(x.target_count) || 1),
      is_test_screening: !!x.is_test_screening,
      ...((x.signing_staff_name || '').trim()
        ? { signing_staff_name: (x.signing_staff_name || '').trim() }
        : {}),
    }))
  }
  return (raw.planned_screening_dates || []).map((d) => ({
    date: d.slice(0, 10),
    target_count: 1,
    is_test_screening: false,
  }))
}

/** 与后端 consent_service._normalize_screening_schedule_for_stats 上限一致 */
const SCREENING_SCHEDULE_MAX_ROWS = 16

/**
 * 将「签署进度」里已有但尚未写入 screening_schedule 的现场日补进编辑行（预约人数默认取该日到场面人数，至少 1）。
 * 解决列表批次来自初筛/到场/知情兜底等数据，而计划未维护同日的问题。
 */
function mergeScreeningScheduleWithBatchDates(
  schedule: ScreeningDay[],
  batches: ScreeningBatchConsent[] | undefined | null,
): ScreeningDay[] {
  if (!batches?.length) return schedule
  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  const byDate = new Map<string, ScreeningDay>()
  for (const row of schedule) {
    const k = (row.date || '').trim().slice(0, 10)
    if (!dateRe.test(k)) continue
    const sn = (row.signing_staff_name || '').trim()
    byDate.set(k, {
      date: k,
      target_count: Math.max(1, Number(row.target_count) || 1),
      is_test_screening: !!row.is_test_screening,
      ...(sn ? { signing_staff_name: sn } : {}),
    })
  }
  for (const b of batches) {
    const k = (b.screening_date || '').trim().slice(0, 10)
    if (!dateRe.test(k) || byDate.has(k)) continue
    const cohort = Math.max(0, Number(b.cohort_subject_count) || 0)
    const tc = cohort > 0 ? Math.max(1, cohort) : 1
    byDate.set(k, {
      date: k,
      target_count: tc,
      is_test_screening: !!b.is_test_screening,
    })
  }
  const merged = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  return merged.slice(0, SCREENING_SCHEDULE_MAX_ROWS)
}

/** 现场筛选计划：项目列表「计划」弹窗 / 新建单个项目弹窗（不在「知情配置」页维护） */
type ScreeningScheduleEditorContext = 'screening_modal' | 'create_modal'

const SCREENING_SCHEDULE_TIP_LIST_RELATION =
  '筛选开始日期：仅统计正式筛选计划行，取其中日期升序第一日；测试筛选日更早也不会把该列提前。筛选结束日期：正式计划行中最晚一日。签署进度：按现场日列出，测试筛选日行带「测」；发布知情前须删除全部测试筛选计划行。'

const SCREENING_SCHEDULE_TIP_ROW_EDIT = (maxRows: number) =>
  `每行对应一个现场筛选日与预约人数。可在任意行使用「下方插入」、底部「末尾添加一行」追加，或使用「按日期升序」排序。最多 ${maxRows} 行；保存时未选中日期的空行会自动忽略。`

const SCREENING_SCHEDULE_TIP_BULK =
  '每行一条：YYYY-MM-DD|人数（人数可写 10 或 10人）。正式场+签署人员：YYYY-MM-DD|人数|姓名。测试筛选：YYYY-MM-DD|人数|测；测试+签署人员：YYYY-MM-DD|人数|姓名|测（「测」须写在最后一段）。分隔符支持 |。点击「合并到列表」与下方表格合并，同一日期以粘贴为准覆盖。'

function ScreeningScheduleHintIcon({ title, ariaLabel }: { title: string; ariaLabel: string }) {
  return (
    <RichTooltip content={<span className="block">{title}</span>}>
      <button
        type="button"
        className="inline-flex shrink-0 rounded p-0.5 text-slate-400 hover:text-indigo-600 cursor-help focus:outline-none focus:ring-2 focus:ring-indigo-500/30 align-middle"
        aria-label={ariaLabel}
      >
        <HelpCircle className="w-3.5 h-3.5" aria-hidden />
      </button>
    </RichTooltip>
  )
}

/** 知情配置侧栏：? 说明仅用文案，统一 RichTooltip 白底样式（避免原生 title 带大问号/灰底观感） */
function ConsentHelpIcon({ text, ariaLabel }: { text: string; ariaLabel: string }) {
  return (
    <RichTooltip content={<span className="block">{text}</span>} side="top" align="start">
      <button
        type="button"
        className="inline-flex shrink-0 rounded p-0.5 text-slate-400 hover:text-indigo-600 cursor-help focus:outline-none focus:ring-2 focus:ring-indigo-500/30 align-middle"
        aria-label={ariaLabel}
      >
        <HelpCircle className="w-3.5 h-3.5" aria-hidden />
      </button>
    </RichTooltip>
  )
}

function ScreeningScheduleEditor({
  value,
  onChange,
  disabled,
  context = 'screening_modal',
  maxRows = SCREENING_SCHEDULE_MAX_ROWS,
  allowedSigningStaffNames = [],
}: {
  value: ScreeningDay[] | undefined
  onChange: (next: ScreeningDay[]) => void
  disabled?: boolean
  /** 计划弹窗 / 新建项目弹窗 */
  context?: ScreeningScheduleEditorContext
  /** 与后端 screening_schedule 条数上限一致 */
  maxRows?: number
  /** 知情签署人员下拉可选姓名：父组件传入；若弹窗顶部已选项目级知情签署工作人员则仅为该集合，否则为双签全量名单 */
  allowedSigningStaffNames?: string[]
}) {
  const rows = value?.length ? value : []
  const [bulkPasteText, setBulkPasteText] = useState('')
  const [bulkPasteModalOpen, setBulkPasteModalOpen] = useState(false)
  const [bulkPasteFeedback, setBulkPasteFeedback] = useState<{
    kind: 'ok' | 'warn' | 'error'
    text: string
  } | null>(null)
  const earliestFormalDateStr = useMemo(() => {
    const formal = rows.filter(
      (r) => !r.is_test_screening && /^\d{4}-\d{2}-\d{2}$/.test((r.date || '').trim().slice(0, 10)),
    )
    if (!formal.length) return null
    return formal.map((r) => (r.date || '').trim().slice(0, 10)).sort()[0]
  }, [rows])

  const patchRow = (idx: number, patch: Partial<ScreeningDay>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    onChange(next)
  }
  const addRow = () => {
    if (rows.length >= maxRows) return
    onChange([...rows, { date: '', target_count: 1, is_test_screening: false, signing_staff_name: '' }])
  }
  const removeRow = (idx: number) => {
    onChange(rows.filter((_, i) => i !== idx))
  }
  const insertAfter = (idx: number) => {
    if (rows.length >= maxRows) return
    const next = [
      ...rows.slice(0, idx + 1),
      { date: '', target_count: 1, is_test_screening: false, signing_staff_name: '' },
      ...rows.slice(idx + 1),
    ]
    onChange(next)
  }
  const sortByDateAsc = () => {
    if (rows.length < 2) return
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    const next = [...rows].sort((a, b) => {
      const da = (a.date || '').trim().slice(0, 10)
      const db = (b.date || '').trim().slice(0, 10)
      const va = dateRe.test(da)
      const vb = dateRe.test(db)
      if (!va && !vb) return 0
      if (!va) return 1
      if (!vb) return -1
      return da.localeCompare(db)
    })
    onChange(next)
  }

  const applyBulkPaste = () => {
    setBulkPasteFeedback(null)
    const parsed = parseScreeningScheduleBulkText(bulkPasteText)
    if (!parsed.length) {
      setBulkPasteFeedback({
        kind: 'error',
        text: '未解析到有效行。每行一条，例如：2026-03-10|10人；正式+签署人员：2026-03-10|10人|张三；测试：2026-03-12|5|测；测试+签署人员：2026-03-13|8|李四|测',
      })
      return
    }
    const allowedSet = new Set(allowedSigningStaffNames.map((s) => s.trim()).filter(Boolean))
    for (const p of parsed) {
      const sn = (p.signing_staff_name || '').trim()
      if (!sn) continue
      if (allowedSet.size === 0) {
        setBulkPasteFeedback({
          kind: 'error',
          text: '请先在知情配置中添加双签工作人员并保存后，再批量指定签署人员',
        })
        return
      }
      if (!allowedSet.has(sn)) {
        setBulkPasteFeedback({
          kind: 'error',
          text: '请去之前配置中选择工作人员',
        })
        return
      }
    }
    const map = new Map<string, ScreeningDay>()
    for (const r of rows) {
      const d = (r.date || '').trim().slice(0, 10)
      if (SCREENING_DAY_RE.test(d)) {
        const sn0 = (r.signing_staff_name || '').trim()
        map.set(d, {
          date: d,
          target_count: Math.max(1, Number(r.target_count) || 1),
          is_test_screening: !!r.is_test_screening,
          ...(sn0 ? { signing_staff_name: sn0 } : {}),
        })
      }
    }
    for (const p of parsed) {
      map.set(p.date, p)
    }
    let next = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
    const totalMerged = next.length
    if (next.length > maxRows) {
      next = next.slice(0, maxRows)
      setBulkPasteFeedback({
        kind: 'warn',
        text: `已合并 ${totalMerged} 条现场日，超过上限 ${maxRows} 行，已按日期升序保留较早的 ${maxRows} 条。`,
      })
    } else {
      setBulkPasteFeedback({
        kind: 'ok',
        text: `已合并 ${parsed.length} 条（与现有行同日则覆盖；已按日期升序）。`,
      })
    }
    onChange(next)
  }

  const wrapClass =
    context === 'create_modal'
      ? 'mt-2 pt-2 border-t border-slate-100'
      : 'mt-4 pt-4 border-t border-slate-100'

  const contextNoteShort =
    context === 'create_modal'
      ? '可选填写；批量导入创建的项目请稍后在列表「计划」中补录。'
      : '保存后写入本项目，并影响列表中的「筛选开始日期」「筛选结束日期」与签署进度。'
  const contextNoteFull =
    context === 'create_modal'
      ? '可选填写。批量导入创建的项目不含本项，请创建后在项目列表点击「计划」补录。'
      : '保存后写入当前项目的现场筛选计划。若知情已发布，需先取消发布方可修改。项目列表中「筛选开始日期」「筛选结束日期」「签署进度」依赖此处。'

  const screeningSectionHelpTooltip = useMemo(
    () => (
      <div className="max-w-[min(90vw,22rem)] space-y-2.5 text-left text-sm leading-snug">
        <p className="text-slate-800">{contextNoteShort}</p>
        <p className="text-slate-600">{contextNoteFull}</p>
        <p className="border-t border-slate-200/80 pt-2 text-slate-700">{SCREENING_SCHEDULE_TIP_LIST_RELATION}</p>
        <p className="border-t border-slate-200/80 pt-2 text-slate-700">{SCREENING_SCHEDULE_TIP_ROW_EDIT(maxRows)}</p>
      </div>
    ),
    [contextNoteShort, contextNoteFull, maxRows],
  )

  return (
    <div className={wrapClass}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-slate-800">现场筛选日期与预约人数</span>
            <RichTooltip content={screeningSectionHelpTooltip}>
              <button
                type="button"
                className="inline-flex shrink-0 rounded p-0.5 text-slate-400 hover:text-indigo-600 cursor-help focus:outline-none focus:ring-2 focus:ring-indigo-500/30 align-middle"
                aria-label="现场筛选计划说明（保存影响、列表字段、逐行编辑）"
              >
                <HelpCircle className="w-3.5 h-3.5" aria-hidden />
              </button>
            </RichTooltip>
          </div>
        </div>
        <div className="shrink-0 flex items-center self-start pt-0.5">
          {!disabled ? (
            <button
              type="button"
              onClick={() => setBulkPasteModalOpen(true)}
              className="inline-flex items-center rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
            >
              批量添加
            </button>
          ) : null}
        </div>
      </div>
      {!disabled ? (
        <Modal
          open={bulkPasteModalOpen}
          onClose={() => setBulkPasteModalOpen(false)}
          title="批量添加"
          size="lg"
          footer={null}
          zIndex={60}
        >
          <div className="mt-1 space-y-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-slate-800">批量粘贴</span>
              <ScreeningScheduleHintIcon title={SCREENING_SCHEDULE_TIP_BULK} ariaLabel="批量粘贴格式说明" />
            </div>
            <textarea
              value={bulkPasteText}
              onChange={(e) => {
                setBulkPasteText(e.target.value)
                setBulkPasteFeedback(null)
              }}
              rows={8}
              placeholder={'2026-03-10|10人\n2026-03-11|20|张三\n2026-03-12|5|测\n2026-03-13|8|李四|测'}
              className="w-full min-h-[10rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 font-mono placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={applyBulkPaste}
                className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                合并到列表
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkPasteText('')
                  setBulkPasteFeedback(null)
                }}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
              >
                清空输入
              </button>
            </div>
            {bulkPasteFeedback ? (
              <p
                role="status"
                className={
                  bulkPasteFeedback.kind === 'error'
                    ? 'text-sm text-rose-600'
                    : bulkPasteFeedback.kind === 'warn'
                      ? 'text-sm text-amber-800'
                      : 'text-sm text-emerald-800'
                }
              >
                {bulkPasteFeedback.text}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">合并结果会写入上方列表；关闭本窗口不会撤销已合并的数据。</p>
          </div>
        </Modal>
      ) : null}
      <div className="overflow-x-auto -mx-0.5 px-0.5 pb-0.5">
        <div className="space-y-2 min-w-[720px] max-w-full">
        {rows.map((row, idx) => (
          <Fragment key={idx}>
          <div
            className="flex w-full min-w-0 flex-nowrap items-end gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm sm:gap-4"
          >
            <div className="min-w-0 shrink-[1] basis-[200px]">
              <label className="block text-xs text-slate-500 mb-1">现场筛选日</label>
              <input
                type="date"
                value={row.date ? row.date.slice(0, 10) : ''}
                disabled={disabled}
                onChange={(e) => patchRow(idx, { date: e.target.value })}
                className="w-full min-w-[148px] max-w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
              />
            </div>
            <div className="w-[5.5rem] shrink-0">
              <label className="block text-xs text-slate-500 mb-1">预约人数</label>
              <input
                type="number"
                min={1}
                max={99999}
                value={row.target_count}
                disabled={disabled}
                onChange={(e) => patchRow(idx, { target_count: Math.max(1, Number(e.target.value) || 1) })}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
              />
            </div>
            <div className="w-[10.5rem] shrink-0">
              <label className="block text-xs text-slate-500 mb-1">知情签署人员</label>
              <SigningStaffInlineSelect
                disabled={disabled || (allowedSigningStaffNames.length === 0 && !(row.signing_staff_name || '').trim())}
                value={(row.signing_staff_name || '').trim()}
                onChange={(v) => patchRow(idx, { signing_staff_name: v })}
                placeholder={
                  allowedSigningStaffNames.length > 0 ? '未指定' : '请先配置双签名单'
                }
                allowClear
                clearLabel="清空为未指定"
                options={(() => {
                  const allowed = allowedSigningStaffNames
                  const cur = (row.signing_staff_name || '').trim()
                  const opts: SelectOption[] = allowed.map((n) => ({ value: n, label: n }))
                  if (cur && !allowed.includes(cur)) {
                    opts.unshift({ value: cur, label: `${cur}（不在名单，请改选）` })
                  }
                  return opts
                })()}
              />
            </div>
            <div className="shrink-0 flex flex-col justify-end pb-0.5 min-w-[7.5rem]">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!row.is_test_screening}
                  disabled={disabled}
                  onChange={(e) => patchRow(idx, { is_test_screening: e.target.checked })}
                  className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                测试筛选
              </label>
            </div>
            {!disabled && (
              <div className="ml-auto flex shrink-0 items-center gap-2 border-l border-slate-100 pl-3 sm:pl-4">
                <button
                  type="button"
                  title="在本行下方插入一行"
                  onClick={() => insertAfter(idx)}
                  disabled={rows.length >= maxRows}
                  className="whitespace-nowrap text-xs font-medium text-indigo-600 hover:underline disabled:opacity-40 disabled:pointer-events-none"
                >
                  下方插入
                </button>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="whitespace-nowrap text-xs font-medium text-rose-600 hover:underline"
                >
                  删除
                </button>
              </div>
            )}
          </div>
          {row.is_test_screening && earliestFormalDateStr && row.date && row.date.slice(0, 10) >= earliestFormalDateStr ? (
            <p className="text-[11px] text-rose-600 col-span-full -mt-1 sm:col-span-1">
              测试筛选日期须早于最早正式筛选日（{earliestFormalDateStr}）
            </p>
          ) : null}
          {row.is_test_screening && !earliestFormalDateStr ? (
            <p className="text-[11px] text-amber-700 -mt-1">请先至少填写一条正式筛选日期，再使用测试筛选。</p>
          ) : null}
          </Fragment>
        ))}
        </div>
      </div>
      {!disabled ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {rows.length < maxRows ? (
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              末尾添加一行
            </button>
          ) : null}
          {rows.length >= 2 ? (
            <button
              type="button"
              title="按现场筛选日升序重排（未填日期的行排在已填日期之后）"
              onClick={sortByDateAsc}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-800"
            >
              <SortAsc className="w-3.5 h-3.5 shrink-0" aria-hidden />
              按日期升序
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** 从接口返回的知情配置复制为可编辑草稿（不含发布状态，由保存逻辑保留原协议状态） */
function cloneConsentRuleSettings(raw: ConsentSettings): ConsentSettings {
  const sched = screeningScheduleFromConsent(raw)
  return {
    require_face_verify: false,
    require_dual_sign: !!raw.require_dual_sign,
    require_comprehension_quiz: !!raw.require_comprehension_quiz,
    enable_min_reading_duration: raw.enable_min_reading_duration !== false,
    min_reading_duration_seconds: normalizeProjectMinReadingSeconds(raw.min_reading_duration_seconds),
    dual_sign_staffs: (raw.dual_sign_staffs || []).map((s) => ({
      staff_id: s.staff_id || '',
      name: s.name || '',
      id_card_no: s.id_card_no || '',
      email: s.email || '',
      phone: s.phone || '',
      identity_verified: !!s.identity_verified,
    })),
    collect_id_card: !!raw.collect_id_card,
    collect_screening_number: !!raw.collect_screening_number,
    collect_initials: !!raw.collect_initials,
    collect_subject_name: !!raw.collect_subject_name,
    collect_other_information: !!raw.collect_other_information,
    supplemental_collect_labels: Array.isArray(raw.supplemental_collect_labels)
      ? raw.supplemental_collect_labels.map((x) => String(x).trim()).filter(Boolean)
      : [],
    enable_checkbox_recognition: !!raw.enable_checkbox_recognition,
    enable_staff_signature: !!raw.enable_staff_signature,
    staff_signature_times: clampOneOrTwo(raw.staff_signature_times, 1),
    enable_subject_signature: !!raw.enable_subject_signature,
    subject_signature_times: clampOneOrTwo(raw.subject_signature_times, 1),
    enable_guardian_signature: !!raw.enable_guardian_signature,
    guardian_parent_count: clampOneOrTwo(raw.guardian_parent_count, 1),
    guardian_signature_times: clampOneOrTwo(raw.guardian_signature_times, 1),
    enable_auto_sign_date: !!raw.enable_auto_sign_date,
    planned_screening_dates: sched.map((x) => x.date),
    screening_schedule: sched.map((x) => ({
      ...x,
      is_test_screening: !!x.is_test_screening,
    })),
    consent_signing_staff_name: (raw.consent_signing_staff_name || '').trim(),
  }
}

const CONFIG_STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: '待配置', label: '待配置' },
  { value: '配置中', label: '配置中' },
  { value: '待认证授权', label: '待认证授权' },
  { value: '已授权待测试', label: '已授权待测试' },
  { value: '已测试待开始', label: '已测试待开始' },
  { value: '进行中', label: '进行中' },
  { value: '已结束', label: '已结束' },
]

/** 列表「知情配置状态」：每种状态独立色系，避免与其它状态共用同一 Badge variant */
function configStatusBadgeProps(s: ProtocolConsentOverview['config_status']): {
  variant: BadgeVariant
  className?: string
} {
  const x = String(s ?? '').trim()
  if (x === '已结束') return { variant: 'default', className: '!bg-zinc-200/90 !text-zinc-800' }
  if (x === '待配置') return { variant: 'default' }
  if (x === '配置中') return { variant: 'primary' }
  if (x === '待认证授权' || x === '核验测试中') return { variant: 'warning' }
  if (x === '已授权待测试' || x === '待测试') return { variant: 'info' }
  if (x === '已测试待开始' || x === '待开始') return { variant: 'success' }
  if (x === '进行中') return { variant: 'default', className: '!bg-indigo-100 !text-indigo-900' }
  return { variant: 'default' }
}

interface ConfigCenterViewProps {
  configProtocols: ProtocolConsentOverview[]
  configProtocolId: number | null
  setConfigProtocolId: (id: number | null) => void
  configProtocolDraft: ConsentSettings
  setConfigProtocolDraft: React.Dispatch<React.SetStateAction<ConsentSettings>>
  configProtocolIcf: ICFVersion[]
  saveConfigProtocolMutation: { mutate: (data: ConsentSettings) => void; isPending: boolean }
}

function ConfigCenterView({
  configProtocols,
  configProtocolId,
  setConfigProtocolId,
  configProtocolDraft,
  setConfigProtocolDraft,
  configProtocolIcf,
  saveConfigProtocolMutation,
}: ConfigCenterViewProps) {
  const draft = configProtocolDraft
  const setDraft = setConfigProtocolDraft
  const [comprehensionQuizComingSoonOpen, setComprehensionQuizComingSoonOpen] = useState(false)
  const [faceVerifyComingSoonOpen, setFaceVerifyComingSoonOpen] = useState(false)
  const configMinReadingFieldRef = useRef<MinReadingSecondsFieldHandle | null>(null)

  const handleSaveProtocol = () => {
    if (!configProtocolId) return
    const minReadingSec =
      configMinReadingFieldRef.current?.commit() ?? configProtocolDraft.min_reading_duration_seconds
    const sched = cleanScreeningScheduleForApi(configProtocolDraft.screening_schedule)
    saveConfigProtocolMutation.mutate({
      ...configProtocolDraft,
      min_reading_duration_seconds: minReadingSec,
      require_face_verify: false,
      screening_schedule: sched,
      planned_screening_dates: sched.map((x) => x.date),
    })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 space-y-4">
        <p className="text-xs text-slate-500 leading-relaxed">
          此处针对<strong className="text-slate-700">所选项目</strong>维护小程序签署规则、采集项与双签人员（按项目保存）。
          不再支持从<strong className="text-slate-700">其他项目</strong>一键填入，避免串项；多节点可在<strong className="text-slate-700">该项目 → 知情配置</strong>中分别编辑各签署节点文档。
          <strong className="text-slate-700">现场筛选日期与预约人数</strong>不在此编辑，请到<strong className="text-slate-700">知情管理项目列表</strong>中点击该项目<strong className="text-slate-700">「计划」</strong>维护。
        </p>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">选择要配置的协议</label>
          <select
            value={configProtocolId ?? ''}
            onChange={(e) => setConfigProtocolId(e.target.value ? Number(e.target.value) : null)}
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">请选择协议</option>
            {configProtocols.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code || p.id} — {p.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {configProtocolId ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="text-sm font-medium text-slate-700 mb-2">协议预览（已上传的签署节点）</div>
            <p className="text-xs text-slate-500 mb-3">便于了解该协议需采集的受试者信息</p>
            {configProtocolIcf.length === 0 ? (
              <p className="text-sm text-slate-500">该协议暂无签署节点</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {configProtocolIcf.map((icf, i) => (
                  <div key={icf.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                    <div className="font-medium text-slate-800">{i + 1}. {icf.node_title?.trim() || `v${icf.version}`}</div>
                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {icf.content ? icf.content.replace(/\s+/g, ' ').slice(0, 200) + (icf.content.length > 200 ? '…' : '') : '无正文'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-800 font-medium mb-3">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            小程序签署规则
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start">
              <FaceVerifySigningLockedControl onRequestExplain={() => setFaceVerifyComingSoonOpen(true)} />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.require_dual_sign}
                onChange={(e) => setDraft((prev) => ({ ...prev, require_dual_sign: e.target.checked }))}
              />
              启用工作人员见证双签
            </label>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:col-span-2">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-700 cursor-pointer sm:flex-initial">
                <input
                  type="checkbox"
                  checked={draft.enable_min_reading_duration !== false}
                  onChange={(e) => setDraft((prev) => ({ ...prev, enable_min_reading_duration: e.target.checked }))}
                  className="w-4 h-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>启用小程序内阅读最短时长（秒）</span>
              </label>
              <MinReadingSecondsField
                ref={configMinReadingFieldRef}
                value={draft.min_reading_duration_seconds}
                disabled={draft.enable_min_reading_duration === false}
                onCommit={(n) => setDraft((prev) => ({ ...prev, min_reading_duration_seconds: n }))}
                className="w-[7.5rem] shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
              />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!draft.enable_staff_signature}
                  onChange={(e) => setDraft((prev) => ({ ...prev, enable_staff_signature: e.target.checked }))}
                />
                启用工作人员签名
              </label>
              {draft.enable_staff_signature ? (
                <ConsentInlineSelect
                  options={CONSENT_SIGNATURE_TIMES_OPTIONS}
                  value={(draft.staff_signature_times ?? 1) as 1 | 2}
                  onChange={(v) => setDraft((prev) => ({ ...prev, staff_signature_times: v }))}
                />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!draft.enable_subject_signature}
                  onChange={(e) => setDraft((prev) => ({ ...prev, enable_subject_signature: e.target.checked }))}
                />
                启用受试者签名
              </label>
              {draft.enable_subject_signature ? (
                <ConsentInlineSelect
                  options={CONSENT_SIGNATURE_TIMES_OPTIONS}
                  value={(draft.subject_signature_times ?? 1) as 1 | 2}
                  onChange={(v) => setDraft((prev) => ({ ...prev, subject_signature_times: v }))}
                />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!draft.enable_guardian_signature}
                  onChange={(e) => setDraft((prev) => ({ ...prev, enable_guardian_signature: e.target.checked }))}
                />
                启用受试者监护人签名
              </label>
              {draft.enable_guardian_signature ? (
                <>
                  <ConsentInlineSelect
                    options={CONSENT_GUARDIAN_PARENT_OPTIONS}
                    value={(draft.guardian_parent_count ?? 1) as 1 | 2}
                    onChange={(v) => setDraft((prev) => ({ ...prev, guardian_parent_count: v }))}
                    widthClass="w-[9.5rem] shrink-0"
                  />
                  <ConsentInlineSelect
                    options={CONSENT_GUARDIAN_EACH_TIMES_OPTIONS}
                    value={(draft.guardian_signature_times ?? 1) as 1 | 2}
                    onChange={(v) => setDraft((prev) => ({ ...prev, guardian_signature_times: v }))}
                  />
                </>
              ) : null}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={!!draft.enable_auto_sign_date}
                onChange={(e) => setDraft((prev) => ({ ...prev, enable_auto_sign_date: e.target.checked }))}
              />
              启用自动签署日期
            </label>
            <p className="text-xs text-slate-500 pl-6 -mt-1">
              开启后，签署完成时记录为签署当日日期（YYYY-MM-DD，年月日）。
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.require_comprehension_quiz}
                onChange={(e) => setDraft((prev) => ({ ...prev, require_comprehension_quiz: e.target.checked }))}
              />
              启用知情测验
            </label>
            {draft.require_comprehension_quiz ? (
              <div className="pl-6">
                <button
                  type="button"
                  onClick={() => setComprehensionQuizComingSoonOpen(true)}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800 underline-offset-2 hover:underline"
                >
                  去配置知情测验
                </button>
              </div>
            ) : null}
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-sm font-medium text-slate-700 mb-2">需采集的受试者信息（勾选后小程序将收集）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!draft.collect_id_card}
                  onChange={(e) => setDraft((prev) => ({ ...prev, collect_id_card: e.target.checked }))}
                />
                身份证号
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!draft.collect_screening_number}
                  onChange={(e) => setDraft((prev) => ({ ...prev, collect_screening_number: e.target.checked }))}
                />
                筛选编号（如 SC001）
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!draft.collect_initials}
                  onChange={(e) => setDraft((prev) => ({ ...prev, collect_initials: e.target.checked }))}
                />
                姓名首字母缩写
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!draft.collect_subject_name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, collect_subject_name: e.target.checked }))}
                />
                姓名
              </label>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-[11px] text-slate-600 leading-relaxed">
            <div className="font-medium text-slate-800 mb-1">现场筛选日期 / 预约人数</div>
            <p>
              不在本页维护。请在<strong className="text-slate-800">知情管理项目列表</strong>中点击目标项目的<strong className="text-slate-800">「计划」</strong>，在弹窗中编辑现场计划与项目信息；新建单个项目时可在「新建 → 单个新增」中可选填写。
            </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-slate-800 font-medium mb-2">双签工作人员</div>
          <p className="text-sm text-slate-600 leading-relaxed">
            请在<strong className="text-slate-800">知情管理</strong>中进入具体项目 →「知情配置」，在「启用工作人员见证双签」下方通过下拉框选择工作人员并发送认证授权邮件；或前往{' '}
            <Link to="/consent/witness-staff" className="text-indigo-700 font-medium hover:underline">
              双签工作人员名单
            </Link>
            维护档案。
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSaveProtocol}
            disabled={saveConfigProtocolMutation.isPending || !configProtocolId}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saveConfigProtocolMutation.isPending ? '保存中…' : '保存当前协议配置'}
          </button>
        </div>
      </div>

      {comprehensionQuizComingSoonOpen && (
        <Modal
          open
          onClose={() => setComprehensionQuizComingSoonOpen(false)}
          title="知情测验配置"
          size="sm"
          footer={
            <div className="flex w-full justify-end">
              <Button variant="primary" onClick={() => setComprehensionQuizComingSoonOpen(false)}>
                知道了
              </Button>
            </div>
          }
        >
          <p className="text-sm text-slate-700">功能开发中，敬请期待。</p>
        </Modal>
      )}
    </div>
  )
}

export default function ConsentManagementPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [protocolId, setProtocolId] = useState<number | null>(null)
  /** 邮件授权页等深链：#/consent?protocolId= 仅首次应用，避免与手动导航冲突 */
  const consentProtocolDeepLinkAppliedRef = useRef(false)
  /** 列表定位：#/consent?focusProtocolId= 高亮该行并滚动（由 searchParams 驱动请求，见下方 sync effect） */
  const focusProtocolIdParam = searchParams.get('focusProtocolId')
  const focusProtocolIdNum = useMemo(() => {
    if (!focusProtocolIdParam) return null
    const n = parseInt(focusProtocolIdParam, 10)
    return Number.isNaN(n) || n <= 0 ? null : n
  }, [focusProtocolIdParam])
  useEffect(() => {
    if (consentProtocolDeepLinkAppliedRef.current) return
    const raw = searchParams.get('protocolId')
    if (!raw) return
    const n = parseInt(raw, 10)
    if (Number.isNaN(n) || n <= 0) return
    consentProtocolDeepLinkAppliedRef.current = true
    setProtocolId(n)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('protocolId')
        return next
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])
  const [activeTab, setActiveTab] = useState<'consents' | 'settings'>('settings')
  const [selectedConfigIcfId, setSelectedConfigIcfId] = useState<number | null>(null)
  /** 无正文仅 .docx 时：与 iframe 预览同源异步转换后统计「请勾选」处数 */
  const [icfDocxCheckboxMatchCount, setIcfDocxCheckboxMatchCount] = useState<number | null>(null)
  const [icfCheckboxDetecting, setIcfCheckboxDetecting] = useState(false)
  /** 签署文件预览：原始 mammoth/HTML vs 勾选句式示意（仅对正文 HTML / 本地 docx 转换生效） */
  const [icfPreviewViewMode, setIcfPreviewViewMode] = useState<'original' | 'checkbox'>('original')
  const icfPreviewPanelRef = useRef<HTMLDivElement | null>(null)
  const consentMinReadingFieldRef = useRef<MinReadingSecondsFieldHandle | null>(null)
  /** 双签：提交身份验证邮件（与「保存配置」独立）；签署节点 ID 取自左侧「签署节点」选中项 */
  /** 双签发邮件：可选多名工作人员，依次调用接口发送 */
  const [dualSignNotifyEmail, setDualSignNotifyEmail] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  /** 已应用筛选（参与列表请求）；修改草稿后需点「查询」才写入 */
  const [keyword, setKeyword] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [configStatus, setConfigStatus] = useState('')
  const [configStatusInput, setConfigStatusInput] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateStartInput, setDateStartInput] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [dateEndInput, setDateEndInput] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [jumpPageInput, setJumpPageInput] = useState('')
  const [exportingList, setExportingList] = useState(false)
  const [consentStatus, setConsentStatus] = useState<'all' | 'signed' | 'pending' | 'result_no'>('all')
  /** 审核预览：单条或多条（联调同批次）consent id */
  const [previewConsentIds, setPreviewConsentIds] = useState<number[] | null>(null)
  const [staffReturnReason, setStaffReturnReason] = useState('')
  const [staffAuditActionError, setStaffAuditActionError] = useState<string | null>(null)
  const [deleteConsentIds, setDeleteConsentIds] = useState<number[] | null>(null)
  const [deleteConsentSummary, setDeleteConsentSummary] = useState('')
  const [consentTablePage, setConsentTablePage] = useState(1)
  const [consentPageSize, setConsentPageSize] = useState(20)
  const [consentSortField, setConsentSortField] = useState('signed_at')
  const [consentSortOrder, setConsentSortOrder] = useState<'asc' | 'desc'>('desc')
  const [consentSelectedIds, setConsentSelectedIds] = useState<Set<number>>(new Set())
  const [consentJumpInput, setConsentJumpInput] = useState('')
  const consentHeaderCheckboxRef = useRef<HTMLInputElement>(null)
  /** 「知情配置」保存结果：成功文案短时自动消失 */
  const [consentSettingsSaveFeedback, setConsentSettingsSaveFeedback] = useState<
    null | { kind: 'success' | 'error'; message: string }
  >(null)
  const consentSettingsSaveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const consentSettingsSaveBannerRef = useRef<HTMLDivElement | null>(null)
  /** 签署记录：YYYY-MM-DD，空表示不按该端筛选 */
  const [consentDateFrom, setConsentDateFrom] = useState('')
  const [consentDateTo, setConsentDateTo] = useState('')
  /** 签署记录关键字（防抖后参与请求） */
  const [consentSearchInput, setConsentSearchInput] = useState('')
  const [consentSearchDebounced, setConsentSearchDebounced] = useState('')
  const [icfModal, setIcfModal] = useState<'create' | null>(null)
  const [icfCreateQueue, setIcfCreateQueue] = useState<IcfCreateQueueItem[]>([])
  const [icfPickHint, setIcfPickHint] = useState<string | null>(null)
  const [icfUploadProgress, setIcfUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const icfDropDepthRef = useRef(0)
  const [icfDropHover, setIcfDropHover] = useState(false)
  const [exportingSubjects, setExportingSubjects] = useState(false)
  const [exportingPdfs, setExportingPdfs] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<ConsentSettings>(DEFAULT_SETTINGS)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  /** 知情配置保存按钮 UI：onMutate/onSettled 双保险，避免偶发卡在「保存中…」 */
  const [settingsSaveUiBusy, setSettingsSaveUiBusy] = useState(false)
  /** 知情测验配置入口：正式页面临时占位弹窗 */
  const [comprehensionQuizComingSoonOpen, setComprehensionQuizComingSoonOpen] = useState(false)
  /** 人脸认证签署未开放时的说明弹窗 */
  const [faceVerifyComingSoonOpen, setFaceVerifyComingSoonOpen] = useState(false)
  /** 编辑 ICF 正文 HTML（网页内插入占位符，无需改 Word）；预览在上、源码在下同列对照 */
  const [icfContentHtmlEditorOpen, setIcfContentHtmlEditorOpen] = useState(false)
  const [icfContentHtmlDraft, setIcfContentHtmlDraft] = useState('')
  /** 复用其他节点已保存的小程序签署规则 */
  const [reuseMiniModalOpen, setReuseMiniModalOpen] = useState(false)
  const [createTab, setCreateTab] = useState<'single' | 'batch'>('single')
  const [createTitle, setCreateTitle] = useState('')
  const [createCode, setCreateCode] = useState('')
  /** 新建项目：知情配置负责人（治理台 QA质量管理） */
  const [createConsentAssigneeId, setCreateConsentAssigneeId] = useState('')
  /** 新建项目：知情签署工作人员（与 GET /witness-staff 双签名单一致，可多选） */
  const [createConsentSigningStaffNames, setCreateConsentSigningStaffNames] = useState<string[]>([])
  const [createScreeningSchedule, setCreateScreeningSchedule] = useState<ScreeningDay[]>([])
  /** 项目列表：操作列「现场计划」弹窗 */
  const [screeningPlanProtocolId, setScreeningPlanProtocolId] = useState<number | null>(null)
  /** 打开「计划」弹窗时的列表行快照，用于把签署进度中的现场日合并进可编辑计划 */
  const [screeningPlanMergeSource, setScreeningPlanMergeSource] = useState<ProtocolConsentOverview | null>(null)
  const [screeningPlanLocal, setScreeningPlanLocal] = useState<ScreeningDay[]>([])
  const [batchFile, setBatchFile] = useState<File | null>(null)
  const [batchImporting, setBatchImporting] = useState(false)
  const [batchResult, setBatchResult] = useState<{ created: number; failed: Array<{ row: number; error: string }> } | null>(null)
  const [icfUploadError, setIcfUploadError] = useState<string | null>(null)
  const [deleteIcfTarget, setDeleteIcfTarget] = useState<ICFVersion | null>(null)
  const [deleteIcfError, setDeleteIcfError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'config'>('list')
  const [configProtocolId, setConfigProtocolId] = useState<number | null>(null)
  const [configProtocolDraft, setConfigProtocolDraft] = useState<ConsentSettings>(DEFAULT_SETTINGS)
  /** 当前页「签署进度」多日期展开状态（protocolId → 是否展开全部现场日） */
  const [signProgressExpandedById, setSignProgressExpandedById] = useState<Record<number, boolean>>({})
  /** 列表操作：软删除二次确认 */
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{ id: number; title: string; code: string } | null>(null)
  const [deleteProtocolError, setDeleteProtocolError] = useState<string | null>(null)
  /** 「计划」弹窗内：项目编号/名称（与现场计划一并保存） */
  const [screeningPlanProjectCode, setScreeningPlanProjectCode] = useState('')
  const [screeningPlanProjectTitle, setScreeningPlanProjectTitle] = useState('')
  const [screeningPlanProjectInitial, setScreeningPlanProjectInitial] = useState<{ code: string; title: string } | null>(
    null,
  )
  const [screeningPlanProjectError, setScreeningPlanProjectError] = useState<string | null>(null)
  /** 计划抽屉：保存成功提示（不自动关抽屉，用户可继续编辑或点取消关闭） */
  const [screeningPlanSaveSuccess, setScreeningPlanSaveSuccess] = useState<string | null>(null)
  /** 「计划」弹窗：知情配置负责人 account id（字符串，空表示未指定） */
  const [screeningPlanConsentAssigneeId, setScreeningPlanConsentAssigneeId] = useState('')
  /** 「计划」弹窗：项目级知情签署工作人员（可多选） */
  const [screeningPlanConsentSigningStaffNames, setScreeningPlanConsentSigningStaffNames] = useState<string[]>([])
  /** 保存按钮 UI：在 mutationFn 的 finally 中复位，避免仅依赖 isPending 时偶发卡在「保存中」 */
  const [screeningPlanSaveUiBusy, setScreeningPlanSaveUiBusy] = useState(false)
  /** 与当前打开的「计划」抽屉 protocolId 同步，供保存成功回调判断是否在途请求仍对应当前弹窗 */
  const screeningPlanOpenPidRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    screeningPlanOpenPidRef.current = screeningPlanProtocolId
  }, [screeningPlanProtocolId])
  /** 知情配置草稿灌值键：仅在切换项目/签署节点时重灌，避免后台刷新覆盖用户正在编辑的内容 */
  const settingsDraftHydratedKeyRef = useRef<string>('')
  const [createProtocolError, setCreateProtocolError] = useState<string | null>(null)
  /** 新建单个项目成功后短暂高亮对应行 */
  const [highlightNewProtocolId, setHighlightNewProtocolId] = useState<number | null>(null)
  /** 邮件/深链「定位到列表行」：高亮并滚动（与 highlightNewProtocolId 独立，样式为琥珀色） */
  const [listFocusProtocolId, setListFocusProtocolId] = useState<number | null>(null)
  /** 项目列表操作列「更多」下拉：当前展开行的协议 id */
  const [consentListMoreOpenId, setConsentListMoreOpenId] = useState<number | null>(null)
  /** 列表「下架」确认（取消发布后引导核验邮件） */
  const [listDelistModal, setListDelistModal] = useState<{ id: number; title: string } | null>(null)
  /** 列表「授权核验测试」：选工作人员发双签授权邮件 */
  const [listVerifyTestModal, setListVerifyTestModal] = useState<{
    id: number
    title: string
    /** 与列表「知情签署工作人员」列同源（项目级或现场日汇总） */
    signing_staff_display: string
  } | null>(null)

  /** 打开「编辑现场计划与项目信息」弹窗（与「计划」入口相同） */
  const openScreeningPlanModal = useCallback((record: ProtocolConsentOverview) => {
    const code = (record.code || '').trim()
    const title = record.title || ''
    setScreeningPlanProjectCode(code)
    setScreeningPlanProjectTitle(title)
    setScreeningPlanProjectInitial({ code, title })
    setScreeningPlanProjectError(null)
    setScreeningPlanSaveSuccess(null)
    setScreeningPlanMergeSource(record)
    setScreeningPlanConsentAssigneeId(
      record.consent_config_account_id != null ? String(record.consent_config_account_id) : '',
    )
    setScreeningPlanProtocolId(record.id)
  }, [])

  const { data: overviewRes, isLoading: overviewLoading, isError: overviewError, error: overviewErrorDetail } = useQuery({
    queryKey: [
      'protocol',
      'consent-overview',
      page,
      pageSize,
      keyword,
      configStatus,
      dateStart,
      dateEnd,
      focusProtocolIdParam ?? '',
    ],
    queryFn: () =>
      protocolApi.getConsentOverview({
        page,
        page_size: pageSize,
        ...(keyword && { keyword }),
        ...(configStatus && { config_status: configStatus }),
        ...(dateStart && { date_start: dateStart }),
        ...(dateEnd && { date_end: dateEnd }),
        ...(focusProtocolIdNum != null && { focus_protocol_id: focusProtocolIdNum }),
      }),
  })
  const overviewItems = (overviewRes?.data?.items ?? []) as ProtocolConsentOverview[]
  const overviewTotal = overviewRes?.data?.total ?? 0

  const { data: consentAssigneesRes } = useQuery({
    queryKey: ['protocol', 'consent-config-assignees'],
    queryFn: () => protocolApi.listConsentConfigAssignees(),
    staleTime: 5 * 60 * 1000,
  })
  const consentAssigneeOptions =
    (consentAssigneesRes?.data?.items ?? []) as Array<{
      id: number
      display_name: string
      username: string
      email: string
    }>

  /** 弹窗「知情配置人员」：不含演示种子账号 */
  const consentAssigneeOptionsVisible = useMemo(
    () => consentAssigneeOptions.filter((a) => !isDemoWitnessExampleConsentAssigneeEmail(a.email)),
    [consentAssigneeOptions],
  )

  useEffect(() => {
    const id = createConsentAssigneeId.trim()
    if (!id) return
    const acc = consentAssigneeOptions.find((a) => String(a.id) === id)
    if (acc && isDemoWitnessExampleConsentAssigneeEmail(acc.email)) {
      setCreateConsentAssigneeId('')
    }
  }, [consentAssigneeOptions, createConsentAssigneeId])

  useEffect(() => {
    const id = screeningPlanConsentAssigneeId.trim()
    if (!id) return
    const acc = consentAssigneeOptions.find((a) => String(a.id) === id)
    if (acc && isDemoWitnessExampleConsentAssigneeEmail(acc.email)) {
      setScreeningPlanConsentAssigneeId('')
    }
  }, [consentAssigneeOptions, screeningPlanConsentAssigneeId])

  /** 与「双签工作人员名单」同源：新建/计划弹窗内「知情签署工作人员」选项须完整，勿用已废弃的全局配置 dual_sign_staffs */
  const { data: witnessStaffForConsentModals = [], isLoading: witnessStaffForModalsLoading } = useQuery({
    queryKey: ['witness-staff', 'consent-overview-modals'],
    queryFn: async () => {
      const res = await protocolApi.listWitnessStaff({ page: 1, page_size: 500 })
      /** api.get 已返回 body：{ code, msg, data: { items, total } } */
      return res.data?.items ?? []
    },
    /** 页面级预取：避免首次打开弹窗时名单尚未返回，列表为空（与「已选姓名合并」兜底配合） */
    enabled: true,
    staleTime: 60 * 1000,
  })
  const signingStaffAllowedNames = useMemo(() => {
    const names = witnessStaffForConsentModals.map((w) => (w.name || '').trim()).filter(Boolean)
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
  }, [witnessStaffForConsentModals])

  /** 「计划」弹窗：现场日「知情签署人员」与顶部「知情签署工作人员」联动；顶部有选时仅从该集合选一人，否则用双签全量名单 */
  const screeningModalRowSigningStaffNames = useMemo(() => {
    const top = screeningPlanConsentSigningStaffNames.map((s) => s.trim()).filter(Boolean)
    if (top.length > 0) {
      return Array.from(new Set(top)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    }
    return signingStaffAllowedNames
  }, [screeningPlanConsentSigningStaffNames, signingStaffAllowedNames])

  /** 新建弹窗：同上，与顶部项目级知情签署工作人员联动 */
  const createModalRowSigningStaffNames = useMemo(() => {
    const top = createConsentSigningStaffNames.map((s) => s.trim()).filter(Boolean)
    if (top.length > 0) {
      return Array.from(new Set(top)).sort((a, b) => a.localeCompare(b, 'zh-CN'))
    }
    return signingStaffAllowedNames
  }, [createConsentSigningStaffNames, signingStaffAllowedNames])

  useEffect(() => {
    if (consentListMoreOpenId == null) return
    const onDoc = () => setConsentListMoreOpenId(null)
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [consentListMoreOpenId])

  const hasMultiDaySignProgressOnPage = useMemo(
    () => overviewItems.some((p) => (p.screening_batches ?? []).length > 1),
    [overviewItems],
  )

  const expandAllSignProgress = useCallback(() => {
    setSignProgressExpandedById((prev) => {
      const next = { ...prev }
      for (const p of overviewItems) {
        if ((p.screening_batches ?? []).length > 1) next[p.id] = true
      }
      return next
    })
  }, [overviewItems])

  const collapseAllSignProgress = useCallback(() => {
    setSignProgressExpandedById((prev) => {
      const next = { ...prev }
      for (const p of overviewItems) {
        if ((p.screening_batches ?? []).length > 1) next[p.id] = false
      }
      return next
    })
  }, [overviewItems])

  /** 表头批量图标高亮：仅统计「多现场日」行。全收起→收起图标绿；全展开→展开图标绿；部分展开→两枚均绿 */
  const signProgressHeaderHighlight = useMemo(() => {
    const multi = overviewItems.filter((p) => (p.screening_batches ?? []).length > 1)
    if (multi.length === 0) {
      return { expandGreen: false, collapseGreen: false }
    }
    const states = multi.map((p) => signProgressExpandedById[p.id] ?? false)
    const allExpanded = states.every(Boolean)
    const allCollapsed = states.every((s) => !s)
    if (allCollapsed) {
      return { expandGreen: false, collapseGreen: true }
    }
    if (allExpanded) {
      return { expandGreen: true, collapseGreen: false }
    }
    return { expandGreen: true, collapseGreen: true }
  }, [overviewItems, signProgressExpandedById])

  useEffect(() => {
    if (highlightNewProtocolId == null) return
    const t = window.setTimeout(() => setHighlightNewProtocolId(null), 4500)
    return () => window.clearTimeout(t)
  }, [highlightNewProtocolId])

  /** 深链 ?focusProtocolId=：服务端分页定位后同步页码、高亮行并去掉 query（避免进入单项目配置页） */
  useEffect(() => {
    if (focusProtocolIdNum == null) return
    if (!overviewRes?.data?.items) return
    const items = overviewRes.data.items as ProtocolConsentOverview[]
    const dPage = overviewRes.data.page
    if (typeof dPage === 'number' && dPage !== page) {
      setPage(dPage)
    }
    if (items.some((x) => x.id === focusProtocolIdNum)) {
      setListFocusProtocolId(focusProtocolIdNum)
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('focusProtocolId')
        return next
      },
      { replace: true },
    )
  }, [focusProtocolIdNum, overviewRes, page, setSearchParams])

  useEffect(() => {
    if (listFocusProtocolId == null) return
    const t = window.setTimeout(() => setListFocusProtocolId(null), 8000)
    return () => window.clearTimeout(t)
  }, [listFocusProtocolId])

  useLayoutEffect(() => {
    if (listFocusProtocolId == null || protocolId != null || viewMode !== 'list') return
    if (overviewLoading) return
    const id = window.setTimeout(() => {
      document.querySelector('tr.cnkis-consent-list-focus')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 80)
    return () => window.clearTimeout(id)
  }, [listFocusProtocolId, overviewLoading, page, protocolId, viewMode, overviewItems])

  const selectedProtocol = overviewItems.find((p) => p.id === protocolId) ?? null
  const { data: protocolDetailForHeader } = useQuery({
    queryKey: ['protocol', protocolId, 'detail-header'],
    queryFn: async () => {
      const res = await protocolApi.get(protocolId!)
      const body = res as { data?: Protocol }
      return body.data ?? (res as unknown as Protocol)
    },
    /** 等知情概览首屏拉完再补拉详情，避免与列表请求竞态、减少无效 GET（及控制台 404） */
    enabled: !!protocolId && !overviewLoading && selectedProtocol?.id !== protocolId,
  })
  const projectBannerCode =
    protocolId != null && selectedProtocol?.id === protocolId
      ? (selectedProtocol.code || '').trim()
      : (protocolDetailForHeader?.code || '').trim()
  const projectBannerTitle =
    protocolId != null && selectedProtocol?.id === protocolId
      ? (selectedProtocol.title || '').trim()
      : (protocolDetailForHeader?.title || '').trim()
  const totalPages = Math.max(1, Math.ceil(overviewTotal / pageSize))

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    const ids = overviewItems.map((p) => p.id)
    if (ids.length === 0) return
    const allSelected = ids.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(ids))
    }
  }, [overviewItems, selectedIds])

  const handleJumpPage = useCallback(() => {
    const n = parseInt(jumpPageInput, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
      setPage(n)
      setJumpPageInput('')
    }
  }, [jumpPageInput, totalPages])

  const { data: icfRes, isLoading: icfLoading } = useQuery({
    queryKey: ['protocol', protocolId, 'icf-versions'],
    queryFn: () => protocolApi.listIcfVersions(protocolId!),
    enabled: !!protocolId,
  })
  const icfVersions = (icfRes?.data?.items ?? []) as ICFVersion[]

  useEffect(() => {
    if (activeTab === 'settings' && icfVersions.length > 0) {
      const exists = selectedConfigIcfId && icfVersions.some((i) => i.id === selectedConfigIcfId)
      if (!exists) setSelectedConfigIcfId(icfVersions[0].id)
    }
  }, [activeTab, icfVersions, selectedConfigIcfId])

  const selectedConfigIcf = icfVersions.find((i) => i.id === selectedConfigIcfId) ?? icfVersions[0] ?? null

  useEffect(() => {
    if (!icfContentHtmlEditorOpen || !selectedConfigIcf) return
    setIcfContentHtmlDraft(selectedConfigIcf.content ?? '')
  }, [selectedConfigIcf?.id, icfContentHtmlEditorOpen])

  /** 签署预览：占位符（项目/节点）→ 勾选示意 → 补充采集行 */
  const icfSettingsPreviewHtml = useMemo(() => {
    const raw = icfContentHtmlEditorOpen
      ? icfContentHtmlDraft
      : (selectedConfigIcf?.content ?? '')
    if (!raw) return ''
    const pv = buildIcfPlaceholderValues({
      protocolCode: projectBannerCode,
      protocolTitle: projectBannerTitle,
      nodeTitle: selectedConfigIcf?.node_title,
      versionLabel: selectedConfigIcf?.version,
    })
    const subTimes =
      settingsDraft.enable_subject_signature === false
        ? 0
        : settingsDraft.subject_signature_times === 2
          ? 2
          : 1
    const staffTimes =
      settingsDraft.enable_staff_signature === false
        ? 0
        : settingsDraft.staff_signature_times === 2
          ? 2
          : 1
    const rawSig = buildIcfSignatureRawHtmlPlaceholders({
      subjectSignatureTimes: subTimes,
      staffSignatureTimes: staffTimes,
      sig1Src: null,
      sig2Src: null,
      staffSig1Src: null,
      staffSig2Src: null,
    })
    const filled = applyIcfPlaceholders(raw, pv, { escapeValues: true, rawHtmlByToken: rawSig })
    if (icfPreviewViewMode !== 'checkbox') return filled
    const rawForCheckbox = stripDocumentOtherInfoPlaceholderForCustomSupplemental(
      filled,
      settingsDraft.supplemental_collect_labels,
    )
    let html = injectCheckboxPreviewMarkers(rawForCheckbox)
    html = appendSupplementalCollectCheckboxPreviewRows(
      html,
      rawForCheckbox,
      settingsDraft.supplemental_collect_labels,
      !!settingsDraft.collect_other_information,
    )
    return html
  }, [
    icfContentHtmlEditorOpen,
    icfContentHtmlDraft,
    selectedConfigIcf?.content,
    selectedConfigIcf?.node_title,
    selectedConfigIcf?.version,
    icfPreviewViewMode,
    projectBannerCode,
    projectBannerTitle,
    settingsDraft.supplemental_collect_labels,
    settingsDraft.collect_other_information,
    settingsDraft.enable_subject_signature,
    settingsDraft.subject_signature_times,
    settingsDraft.enable_staff_signature,
    settingsDraft.staff_signature_times,
  ])

  /** 编辑态正文预览：占位符包一层带 data-icf-src-* 的 span，供点击/拖选定位源码 */
  const icfEditorAnchoredPreviewHtml = useMemo(() => {
    if (!icfContentHtmlEditorOpen) return ''
    const raw = icfContentHtmlDraft
    if (!raw.trim()) return ''
    const pv = buildIcfPlaceholderValues({
      protocolCode: projectBannerCode,
      protocolTitle: projectBannerTitle,
      nodeTitle: selectedConfigIcf?.node_title,
      versionLabel: selectedConfigIcf?.version,
    })
    const subTimes =
      settingsDraft.enable_subject_signature === false
        ? 0
        : settingsDraft.subject_signature_times === 2
          ? 2
          : 1
    const staffTimes =
      settingsDraft.enable_staff_signature === false
        ? 0
        : settingsDraft.staff_signature_times === 2
          ? 2
          : 1
    const rawSig = buildIcfSignatureRawHtmlPlaceholders({
      subjectSignatureTimes: subTimes,
      staffSignatureTimes: staffTimes,
      sig1Src: null,
      sig2Src: null,
      staffSig1Src: null,
      staffSig2Src: null,
    })
    return applyIcfPlaceholdersWithSourceAnchors(raw, pv, { escapeValues: true, rawHtmlByToken: rawSig })
  }, [
    icfContentHtmlEditorOpen,
    icfContentHtmlDraft,
    selectedConfigIcf?.node_title,
    selectedConfigIcf?.version,
    projectBannerCode,
    projectBannerTitle,
    settingsDraft.enable_subject_signature,
    settingsDraft.subject_signature_times,
    settingsDraft.enable_staff_signature,
    settingsDraft.staff_signature_times,
  ])

  const [icfEditorHydratingFromPreview, setIcfEditorHydratingFromPreview] = useState(false)
  const hydrateIcfEditorFromPreview = useCallback(async () => {
    if (!protocolId || !selectedConfigIcf?.file_path) return
    setIcfEditorHydratingFromPreview(true)
    try {
      const r = await loadIcfPreviewInLocalDev(protocolId, selectedConfigIcf)
      if (r.ok === false) {
        window.alert(r.message || '无法从预览生成可编辑 HTML')
        return
      }
      if (r.mode === 'pdf') {
        window.alert('当前文件为 PDF，无法自动转换为可编辑 HTML。请上传 Word 或手动粘贴 HTML 正文。')
        return
      }
      if (r.mode === 'docx-html') {
        const next = (r.articleHtml || '').trim()
        if (!next) {
          window.alert('未提取到可编辑 HTML，请检查源文件内容。')
          return
        }
        setIcfContentHtmlDraft(next)
        return
      }
      const blob = r.blob
      if (await isLikelyPdfBlob(blob)) {
        window.alert('服务端返回为 PDF 预览，无法自动转换为可编辑 HTML。请上传 Word 或手动粘贴 HTML 正文。')
        return
      }
      const html = (await blob.text()).trim()
      if (!html) {
        window.alert('预览内容为空，无法生成可编辑 HTML。')
        return
      }
      setIcfContentHtmlDraft(html)
    } catch (err) {
      window.alert(getMutationErrorMessage(err, '从预览生成可编辑 HTML 失败'))
    } finally {
      setIcfEditorHydratingFromPreview(false)
    }
  }, [protocolId, selectedConfigIcf])

  const showIcfPreviewModeToggle = useMemo(
    () =>
      !!selectedConfigIcf &&
      (!!selectedConfigIcf.content || /\.(docx|doc)$/i.test(selectedConfigIcf.file_path || '')),
    [selectedConfigIcf],
  )
  /** 双签发信：与左侧签署节点列表选中项一致（无选中时回退首个节点） */
  const witnessAuthIcfVersionId = selectedConfigIcfId ?? icfVersions[0]?.id ?? null

  useEffect(() => {
    setIcfPreviewViewMode('original')
    setIcfDocxCheckboxMatchCount(null)
    setIcfCheckboxDetecting(false)
  }, [selectedConfigIcfId, protocolId])

  /** 有正文 HTML 时：与右侧注入预览同源统计红色「请勾选」块数量 */
  const icfContentCheckboxMatchCount = useMemo(() => {
    if (icfPreviewViewMode !== 'checkbox' || !selectedConfigIcf) return null
    const raw = (icfContentHtmlEditorOpen ? icfContentHtmlDraft : selectedConfigIcf.content)?.trim()
    if (!raw) return null
    const rawForCount = stripDocumentOtherInfoPlaceholderForCustomSupplemental(
      raw,
      settingsDraft.supplemental_collect_labels,
    )
    return countCheckboxPreviewMarkers(rawForCount)
  }, [
    icfPreviewViewMode,
    icfContentHtmlEditorOpen,
    icfContentHtmlDraft,
    selectedConfigIcf?.content,
    selectedConfigIcf?.id,
    settingsDraft.supplemental_collect_labels,
  ])

  /** 无正文、Word 附件：按文件头判断 OOXML 后用 mammoth 统计（与预览一致；旧版 .doc 二进制不计入，避免抛错） */
  useEffect(() => {
    if (icfPreviewViewMode !== 'checkbox' || !protocolId || !selectedConfigIcf) {
      setIcfDocxCheckboxMatchCount(null)
      setIcfCheckboxDetecting(false)
      return
    }
    if (selectedConfigIcf.content?.trim()) {
      setIcfDocxCheckboxMatchCount(null)
      setIcfCheckboxDetecting(false)
      return
    }
    const fp = (selectedConfigIcf.file_path || '').toLowerCase()
    if (!fp.endsWith('.docx') && !fp.endsWith('.doc')) {
      setIcfDocxCheckboxMatchCount(null)
      setIcfCheckboxDetecting(false)
      return
    }
    let cancelled = false
    setIcfCheckboxDetecting(true)
    setIcfDocxCheckboxMatchCount(null)
    ;(async () => {
      try {
        const blob = await protocolApi.fetchIcfVersionFileBlob(protocolId, selectedConfigIcf.id)
        const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
        const isOoxmlZip = head[0] === 0x50 && head[1] === 0x4b
        if (!isOoxmlZip) {
          if (!cancelled) setIcfDocxCheckboxMatchCount(0)
          return
        }
        const ab = await blob.arrayBuffer()
        const html = await mammothConvertDocxToArticleHtml(ab)
        if (!cancelled) {
          const h = stripDocumentOtherInfoPlaceholderForCustomSupplemental(html, settingsDraft.supplemental_collect_labels)
          setIcfDocxCheckboxMatchCount(countCheckboxPreviewMarkers(h))
        }
      } catch {
        if (!cancelled) setIcfDocxCheckboxMatchCount(0)
      } finally {
        if (!cancelled) setIcfCheckboxDetecting(false)
      }
    })()
    return () => {
      cancelled = true
      setIcfCheckboxDetecting(false)
    }
  }, [
    icfPreviewViewMode,
    protocolId,
    selectedConfigIcf?.id,
    selectedConfigIcf?.content,
    selectedConfigIcf?.file_path,
    settingsDraft.supplemental_collect_labels,
  ])

  useEffect(() => {
    const t = window.setTimeout(() => setConsentSearchDebounced(consentSearchInput.trim()), 400)
    return () => window.clearTimeout(t)
  }, [consentSearchInput])

  const displayedCheckboxMatchCount = useMemo(() => {
    if (icfPreviewViewMode !== 'checkbox' || !selectedConfigIcf) return null
    const extra = countSupplementalCollectPreviewRows(
      settingsDraft.supplemental_collect_labels,
      !!settingsDraft.collect_other_information,
    )
    if (selectedConfigIcf.content?.trim()) {
      return (icfContentCheckboxMatchCount ?? 0) + extra
    }
    if (icfDocxCheckboxMatchCount === null) return null
    return icfDocxCheckboxMatchCount + extra
  }, [
    icfPreviewViewMode,
    selectedConfigIcf,
    icfContentCheckboxMatchCount,
    icfDocxCheckboxMatchCount,
    settingsDraft.supplemental_collect_labels,
    settingsDraft.collect_other_information,
  ])

  const { data: consentsRes, isLoading: consentsLoading } = useQuery({
    queryKey: [
      'protocol',
      protocolId,
      'consents',
      consentStatus,
      consentDateFrom,
      consentDateTo,
      consentSearchDebounced,
      consentTablePage,
      consentPageSize,
      consentSortField,
      consentSortOrder,
    ],
    queryFn: () =>
      protocolApi.listConsents(protocolId!, {
        status: consentStatus,
        ...(consentDateFrom.trim() && { date_from: consentDateFrom.trim() }),
        ...(consentDateTo.trim() && { date_to: consentDateTo.trim() }),
        ...(consentSearchDebounced && { search: consentSearchDebounced }),
        group_by: 'subject',
        page: consentTablePage,
        page_size: consentPageSize,
        sort: consentSortField,
        order: consentSortOrder,
      }),
    /** 仅在「签署记录」标签下请求：避免进入项目时缓存空列表后，扫码签署完成仍长期显示「暂无」 */
    enabled: !!protocolId && activeTab === 'consents',
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const consentListPayload = consentsRes?.data as
    | {
        items?: ConsentRecord[]
        total?: number
        page?: number
        page_size?: number
        group_by?: 'subject' | null
      }
    | undefined
  const consents = (consentListPayload?.items ?? []) as ConsentRecord[]
  const consentListTotal = consentListPayload?.total ?? 0
  const consentTotalPages = Math.max(1, Math.ceil((consentListTotal || 0) / consentPageSize))
  const consentIdsFlatOnPage = useMemo(() => flatConsentRecordIdsOnPage(consents), [consents])
  const consentDisplayRows = useMemo((): ConsentTableDisplayRow[] => {
    if (consents.some((c) => c.group_by_subject && (c.consent_ids?.length ?? 0) > 0)) {
      return consents.map((c) => ({ kind: 'subject_group', record: c }))
    }
    return buildConsentTableDisplayRows(consents)
  }, [consents])
  const previewConsentIdsKey =
    previewConsentIds == null || previewConsentIds.length === 0
      ? ''
      : [...previewConsentIds].sort((a, b) => a - b).join(',')

  useEffect(() => {
    setConsentTablePage(1)
    setConsentSelectedIds(new Set())
    setConsentSearchInput('')
    setConsentSearchDebounced('')
  }, [protocolId])

  useEffect(() => {
    setConsentTablePage(1)
    setConsentSelectedIds(new Set())
  }, [consentStatus, consentDateFrom, consentDateTo, consentSearchDebounced])

  useEffect(() => {
    if (consentTablePage > consentTotalPages) {
      setConsentTablePage(consentTotalPages)
    }
  }, [consentTablePage, consentTotalPages])

  useEffect(() => {
    const ids = consentIdsFlatOnPage
    const n = ids.filter((id) => consentSelectedIds.has(id)).length
    const el = consentHeaderCheckboxRef.current
    if (el) {
      el.indeterminate = n > 0 && n < ids.length
    }
  }, [consentIdsFlatOnPage, consentSelectedIds])

  const { data: previewResList, isLoading: previewLoading } = useQuery({
    queryKey: ['protocol', protocolId, 'consent-preview', previewConsentIdsKey],
    queryFn: async () => {
      const ids = previewConsentIds!
      const results = await Promise.all(ids.map((id) => protocolApi.getConsentPreview(protocolId!, id)))
      const failed = results.find((r) => r.code !== 200 || !r.data)
      if (failed) throw new Error((failed.msg as string) || '无法加载签署内容')
      return results.map((r) => r.data as ConsentPreviewData)
    },
    enabled: !!protocolId && !!previewConsentIds?.length,
  })
  const previewBatchData = previewResList ?? []

  const staffAuditPreviewHtml = useMemo(() => {
    if (!previewBatchData.length) return ''
    if (previewBatchData.length === 1) {
      const previewData = previewBatchData[0]!
      return buildStaffConsentAuditPreviewHtml({
        baseHtml: previewData.icf_content_html || '',
        isSigned: !!previewData.is_signed,
        signedAt: previewData.signed_at,
        signatureSummary: (previewData.signature_summary || {}) as Record<string, unknown>,
        rules: previewData.mini_sign_rules_preview ?? null,
        protocolCode: previewData.protocol_code,
        protocolTitle: previewData.protocol_title,
        nodeTitle: previewData.node_title,
        versionLabel: previewData.icf_version,
        receiptNo: previewData.receipt_no,
        enableAutoSignDate: previewData.mini_sign_rules_preview?.enable_auto_sign_date,
        enableSubjectSignature: previewData.mini_sign_rules_preview?.enable_subject_signature,
        subjectSignatureTimes: previewData.mini_sign_rules_preview?.subject_signature_times,
        enableStaffSignature: previewData.mini_sign_rules_preview?.enable_staff_signature,
        staffSignatureTimes: previewData.mini_sign_rules_preview?.staff_signature_times,
      })
    }
    const parts = previewBatchData.map((previewData, i) => {
      const title =
        (previewData.node_title || '').trim() || `v${previewData.icf_version || ''}` || `节点 ${i + 1}`
      const banner = `<div class="mb-2 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-800">签署节点 ${i + 1} / ${previewBatchData.length}：${escapeHtmlForPreviewTitle(title)}</div>`
      const body = buildStaffConsentAuditPreviewHtml({
        baseHtml: previewData.icf_content_html || '',
        isSigned: !!previewData.is_signed,
        signedAt: previewData.signed_at,
        signatureSummary: (previewData.signature_summary || {}) as Record<string, unknown>,
        rules: previewData.mini_sign_rules_preview ?? null,
        protocolCode: previewData.protocol_code,
        protocolTitle: previewData.protocol_title,
        nodeTitle: previewData.node_title,
        versionLabel: previewData.icf_version,
        receiptNo: previewData.receipt_no,
        enableAutoSignDate: previewData.mini_sign_rules_preview?.enable_auto_sign_date,
        enableSubjectSignature: previewData.mini_sign_rules_preview?.enable_subject_signature,
        subjectSignatureTimes: previewData.mini_sign_rules_preview?.subject_signature_times,
        enableStaffSignature: previewData.mini_sign_rules_preview?.enable_staff_signature,
        staffSignatureTimes: previewData.mini_sign_rules_preview?.staff_signature_times,
      })
      return `${banner}${body}`
    })
    return parts.join(
      '<div style="margin:1.25rem 0;height:1px;background:#e2e8f0" role="separator" aria-hidden="true"></div>',
    )
  }, [previewBatchData])

  const previewHead = previewBatchData[0]
  const consentPreviewBatchAuditable = useMemo(() => {
    if (!previewBatchData.length) return false
    return previewBatchData.every(
      (p) =>
        p.is_signed && (!p.staff_audit_status || p.staff_audit_status === 'pending_review'),
    )
  }, [previewBatchData])

  const { data: statsRes } = useQuery({
    queryKey: ['protocol', protocolId, 'consents-stats'],
    queryFn: () => protocolApi.getConsentStats(protocolId!),
    enabled: !!protocolId,
    /** 与签署记录列表一致：避免长期展示过期的「签署记录总数」等统计 */
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const stats = statsRes?.data ?? {
    total: 0,
    signed_count: 0,
    pending_count: 0,
    signed_result_no_count: 0,
    returned_resign_row_count: 0,
  }

  const { data: settingsRes, isFetching: consentSettingsFetching } = useQuery({
    queryKey: ['protocol', protocolId, 'consent-settings'],
    queryFn: () => protocolApi.getConsentSettings(protocolId!),
    enabled: !!protocolId,
  })
  const consentSettingsData = settingsRes?.data as ConsentSettings | undefined
  const loadedSettings = (consentSettingsData ?? DEFAULT_SETTINGS) as ConsentSettings

  const { data: configProtocolsRes } = useQuery({
    queryKey: ['protocol', 'consent-overview', 'all'],
    queryFn: () => protocolApi.getConsentOverview({ page: 1, page_size: 500 }),
    enabled: viewMode === 'config',
  })
  const configProtocols = (configProtocolsRes?.data?.items ?? []) as ProtocolConsentOverview[]

  const { data: configProtocolSettingsRes, isFetching: configProtocolSettingsFetching } = useQuery({
    queryKey: ['protocol', configProtocolId, 'consent-settings'],
    queryFn: () => protocolApi.getConsentSettings(configProtocolId!),
    enabled: viewMode === 'config' && !!configProtocolId,
  })
  const configProtocolSettingsRaw = configProtocolSettingsRes?.data
  const configProtocolSettings = ((configProtocolSettingsRaw && typeof configProtocolSettingsRaw === 'object' && 'data' in configProtocolSettingsRaw)
    ? (configProtocolSettingsRaw as { data?: unknown }).data
    : configProtocolSettingsRaw) ?? DEFAULT_SETTINGS

  const { data: configProtocolIcfRes } = useQuery({
    queryKey: ['protocol', configProtocolId, 'icf-versions'],
    queryFn: () => protocolApi.listIcfVersions(configProtocolId!),
    enabled: viewMode === 'config' && !!configProtocolId,
  })
  const configProtocolIcf = (configProtocolIcfRes?.data?.items ?? []) as ICFVersion[]

  useEffect(() => {
    if (viewMode === 'config' && configProtocolId && configProtocolSettings) {
      if (configProtocolSettingsFetching) return
      const s = configProtocolSettings as ConsentSettings
      const sched = screeningScheduleFromConsent(s as ConsentSettings)
      setConfigProtocolDraft({
        require_face_verify: false,
        require_dual_sign: !!s.require_dual_sign,
        require_comprehension_quiz: !!s.require_comprehension_quiz,
        enable_min_reading_duration: s.enable_min_reading_duration !== false,
        min_reading_duration_seconds: normalizeProjectMinReadingSeconds(s.min_reading_duration_seconds),
        dual_sign_staffs: (s.dual_sign_staffs || []).map((st) => ({
          staff_id: st.staff_id || '',
          name: st.name || '',
          id_card_no: st.id_card_no || '',
          email: st.email || '',
          phone: st.phone || '',
          identity_verified: !!st.identity_verified,
        })),
        collect_id_card: !!s.collect_id_card,
        collect_screening_number: !!s.collect_screening_number,
        collect_initials: !!s.collect_initials,
        collect_subject_name: !!s.collect_subject_name,
        collect_other_information: !!s.collect_other_information,
        enable_checkbox_recognition: !!s.enable_checkbox_recognition,
        enable_staff_signature: !!s.enable_staff_signature,
        staff_signature_times: clampOneOrTwo(s.staff_signature_times, 1),
        enable_subject_signature: !!s.enable_subject_signature,
        subject_signature_times: clampOneOrTwo(s.subject_signature_times, 1),
        enable_guardian_signature: !!s.enable_guardian_signature,
        guardian_parent_count: clampOneOrTwo(s.guardian_parent_count, 1),
        guardian_signature_times: clampOneOrTwo(s.guardian_signature_times, 1),
        enable_auto_sign_date: !!s.enable_auto_sign_date,
        planned_screening_dates: sched.map((x) => x.date),
        screening_schedule: sched,
      })
    }
  }, [viewMode, configProtocolId, configProtocolSettings])

  /** 切换配置中心协议时先清空草稿，避免短暂展示上一协议配置 */
  useEffect(() => {
    if (viewMode !== 'config') return
    if (!configProtocolId) {
      setConfigProtocolDraft(DEFAULT_SETTINGS)
      return
    }
    if (configProtocolSettingsFetching) {
      setConfigProtocolDraft(DEFAULT_SETTINGS)
    }
  }, [viewMode, configProtocolId, configProtocolSettingsFetching])

  const consentLaunched = !!loadedSettings.consent_launched

  /** 发布前：启用双签时须名单非空（不要求全员核验；见 consent-launch） */
  const staffVerificationForPublish = useMemo(() => {
    const s = loadedSettings as ConsentSettings
    if (!s.require_dual_sign) {
      return {
        allVerified: true as const,
        progress: '' as const,
        partialVerified: false as const,
        noneVerifiedWithStaff: false as const,
      }
    }
    const staffs = s.dual_sign_staffs ?? []
    const total = staffs.length
    const verified = staffs.filter((x) => x.identity_verified).length
    const allVerified = total > 0 && verified >= total
    const partialVerified = total > 0 && verified > 0 && verified < total
    const noneVerifiedWithStaff = total > 0 && verified === 0
    return { allVerified, progress: `${verified}/${total}`, partialVerified, noneVerifiedWithStaff }
  }, [loadedSettings])

  const hasTestScreeningInPlan = useMemo(
    () => (loadedSettings.screening_schedule ?? []).some((x) => x.is_test_screening),
    [loadedSettings.screening_schedule],
  )

  const allNodesMiniSaved = icfVersions.length > 0 && icfVersions.every((x) => x.mini_sign_rules_saved)
  /** 启用双签的节点须至少登记一名见证人员（不要求全员完成核验后再发布） */
  const everyDualNodeHasStaffWhenRequired = useMemo(() => {
    const proto = loadedSettings as ConsentSettings
    for (const icf of icfVersions) {
      const eff = deriveMiniDraftFromIcf(icf, proto)
      if (!eff.require_dual_sign) continue
      const staffs = eff.dual_sign_staffs ?? []
      if (staffs.length === 0) return false
    }
    return true
  }, [icfVersions, loadedSettings])

  /**
   * 协议级现场计划 + 当前节点小程序规则（同一次 setState，避免半更新）。
   * 仅在切换项目或切换签署节点时灌值；不要在后台 refetch 时反复覆盖草稿，避免页面闪烁与输入被重置。
   */
  useEffect(() => {
    if (!protocolId) {
      settingsDraftHydratedKeyRef.current = ''
      setSettingsDraft(DEFAULT_SETTINGS)
      setDualSignNotifyEmail('')
      return
    }
    const activeIcfId = selectedConfigIcfId ?? icfVersions[0]?.id ?? 0
    const hydrateKey = `${protocolId}:${activeIcfId}`
    // 首次拉取当前协议设置时等待数据返回；已有草稿时不因后台刷新重置
    if (!consentSettingsData && consentSettingsFetching) {
      return
    }
    if (settingsDraftHydratedKeyRef.current === hydrateKey) return
    const sched = screeningScheduleFromConsent(loadedSettings as ConsentSettings)
    const icf =
      icfVersions.find((i) => i.id === selectedConfigIcfId) ?? icfVersions[0] ?? null
    const mini = deriveMiniDraftFromIcf(icf, loadedSettings as ConsentSettings)
    setSettingsDraft({
      ...mini,
      planned_screening_dates: sched.map((x) => x.date),
      screening_schedule: sched,
    })
    settingsDraftHydratedKeyRef.current = hydrateKey
  }, [
    protocolId,
    consentSettingsData,
    consentSettingsFetching,
    loadedSettings,
    selectedConfigIcfId,
    icfVersions,
  ])

  /** 勾选「启用勾选框识别」后默认切到勾选预览；关闭则回原始预览（仍可在开启后手动切回原始文件） */
  useEffect(() => {
    if (settingsDraft.enable_checkbox_recognition && showIcfPreviewModeToggle) {
      setIcfPreviewViewMode('checkbox')
    } else if (!settingsDraft.enable_checkbox_recognition) {
      setIcfPreviewViewMode('original')
    }
  }, [settingsDraft.enable_checkbox_recognition, showIcfPreviewModeToggle, selectedConfigIcfId])

  const { data: screeningPlanSettingsRaw, isLoading: screeningPlanSettingsLoading } = useQuery({
    queryKey: ['protocol', screeningPlanProtocolId, 'consent-settings', 'list-screening-modal'],
    queryFn: async () => {
      const res = await protocolApi.getConsentSettings(screeningPlanProtocolId!)
      const body = res as { data?: ConsentSettings }
      const payload = body?.data ?? (res as unknown as ConsentSettings)
      return cloneConsentRuleSettings(payload)
    },
    enabled: !!screeningPlanProtocolId,
  })

  /**
   * 仅在首次拉到「当前弹窗对应协议」的设置时，把服务端数据灌入本地草稿。
   * 若每次 `screeningPlanSettingsRaw` 变更（含 React Query 后台 refetch）都同步，会覆盖用户未保存的
   * 「知情签署工作人员」多选与现场计划编辑，表现为「选完保存前被清空 / 保存后再次打开仍像没存」。
   */
  const screeningPlanModalHydratedForPidRef = useRef<number | null>(null)
  useEffect(() => {
    if (!screeningPlanProtocolId) {
      screeningPlanModalHydratedForPidRef.current = null
      return
    }
    if (!screeningPlanSettingsRaw) return
    if (screeningPlanModalHydratedForPidRef.current === screeningPlanProtocolId) return
    screeningPlanModalHydratedForPidRef.current = screeningPlanProtocolId
    setScreeningPlanConsentSigningStaffNames(
      parseSigningStaffNames(screeningPlanSettingsRaw.consent_signing_staff_name || ''),
    )
    const base = screeningScheduleFromConsent(screeningPlanSettingsRaw)
    const merged = mergeScreeningScheduleWithBatchDates(base, screeningPlanMergeSource?.screening_batches)
    setScreeningPlanLocal(merged)
  }, [screeningPlanProtocolId, screeningPlanSettingsRaw, screeningPlanMergeSource])

  const saveScreeningPlanMutation = useMutation({
    mutationFn: async (args: {
      consent: ConsentSettings
      localSched: ScreeningDay[]
      pid: number
      projectCode: string
      projectTitle: string
      initial: { code: string; title: string }
      initialConsentAccountId: number | null | undefined
      consentAssigneeIdInput: string
      consentSigningStaffNames: string[]
      /** 与 GET /witness-staff 一致的姓名字段，用于保存前校验 */
      allowedWitnessSigningNames: string[]
    }) => {
      const traceId = `consent-plan-save-${args.pid}-${Date.now().toString(36)}`
      const t0 = Date.now()
      console.info(`[${traceId}] start`, {
        pid: args.pid,
        launched: !!args.consent.consent_launched,
        localSchedRows: args.localSched?.length ?? 0,
        consentSigningStaffCount: args.consentSigningStaffNames?.length ?? 0,
      })
      const code = args.projectCode.trim()
      const title = args.projectTitle.trim()
      if (!code || !title) {
        throw new Error('请填写项目编号与项目名称')
      }
      const ic = args.initial.code.trim()
      const it = args.initial.title.trim()
      const launched = !!args.consent.consent_launched
      const wantAid = args.consentAssigneeIdInput.trim() ? Number(args.consentAssigneeIdInput) : 0
      const wantResolved = Number.isFinite(wantAid) && wantAid > 0 ? wantAid : null
      const initAid = args.initialConsentAccountId ?? null
      if (wantResolved !== initAid) {
        console.info(`[${traceId}] updateBasic consent_config_account_id`, { wantResolved, initAid })
        await protocolApi.updateBasic(args.pid, { consent_config_account_id: wantResolved ?? 0 })
      }
      const assigneeChanged = wantResolved !== initAid
      const titleChanged = ic !== code || it !== title
      if (launched) {
        if (!assigneeChanged && !titleChanged) {
          throw new Error('未修改任何内容')
        }
        if (titleChanged) {
          console.info(`[${traceId}] launched updateBasic title/code`)
          return await protocolApi.updateBasic(args.pid, { title, code })
        }
        console.info(`[${traceId}] launched getConsentSettings fallback`)
        return await protocolApi.getConsentSettings(args.pid)
      }
      if (ic !== code || it !== title) {
        console.info(`[${traceId}] updateBasic title/code`)
        await protocolApi.updateBasic(args.pid, { title, code })
      }
      const allowedSigningNames = new Set(
        (args.allowedWitnessSigningNames ?? []).map((s) => s.trim()).filter(Boolean),
      )
      for (const s of args.consent.dual_sign_staffs ?? []) {
        const n = (s.name || '').trim()
        if (n) allowedSigningNames.add(n)
      }
      for (const n of args.consentSigningStaffNames ?? []) {
        const t = (n || '').trim()
        if (t && !allowedSigningNames.has(t)) {
          throw new Error('知情签署工作人员须从双签工作人员名单中选择')
        }
      }
      for (const row of args.localSched ?? []) {
        const sn = (row.signing_staff_name || '').trim()
        if (!sn) continue
        if (!allowedSigningNames.has(sn)) {
          throw new Error('知情签署工作人员须从双签工作人员名单中选择')
        }
      }
      const sched = cleanScreeningScheduleForApi(args.localSched)
      const csn = serializeSigningStaffNames(args.consentSigningStaffNames ?? [])
      console.info(`[${traceId}] updateConsentSettings`, {
        screeningScheduleRows: sched.length,
        consentSigningStaffName: csn,
      })
      const ret = await protocolApi.updateConsentSettings(args.pid, {
        ...args.consent,
        screening_schedule: sched,
        planned_screening_dates: sched.map((x) => x.date),
        consent_signing_staff_name: csn,
      })
      console.info(`[${traceId}] done`, { elapsedMs: Date.now() - t0 })
      return ret
    },
    onMutate: () => {
      setScreeningPlanSaveUiBusy(true)
      setScreeningPlanSaveSuccess(null)
    },
    onSettled: () => {
      setScreeningPlanSaveUiBusy(false)
    },
    onSuccess: async (_data, variables) => {
      try {
        const savedPid = variables.pid
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] }),
          queryClient.invalidateQueries({ queryKey: ['protocol', savedPid, 'consent-settings'] }),
        ])
        // 若用户已关闭抽屉或已打开其他项目，勿更新当前抽屉状态
        if (screeningPlanOpenPidRef.current !== savedPid) return
        setScreeningPlanProjectError(null)
        setScreeningPlanSaveSuccess('保存成功')
        const code = variables.projectCode.trim()
        const title = variables.projectTitle.trim()
        setScreeningPlanProjectInitial({ code, title })
        const wantAid = variables.consentAssigneeIdInput.trim() ? Number(variables.consentAssigneeIdInput) : 0
        const wantResolved = Number.isFinite(wantAid) && wantAid > 0 ? wantAid : null
        setScreeningPlanMergeSource((prev) =>
          prev && prev.id === savedPid
            ? { ...prev, consent_config_account_id: wantResolved, code, title }
            : prev,
        )
      } catch (e) {
        console.error('saveScreeningPlan onSuccess', e)
        setScreeningPlanProjectError('保存已成功，但刷新列表时出错，请手动刷新页面')
      }
    },
    onError: (err: Error) => {
      console.error('[consent-plan-save] failed', err)
      setScreeningPlanSaveSuccess(null)
      setScreeningPlanProjectError(getMutationErrorMessage(err, '保存失败，请重试'))
    },
  })

  /** 关闭「计划」抽屉：始终可关；若保存请求卡住，reset mutation 解除「保存中」锁死 */
  const closeScreeningPlanModal = useCallback(() => {
    saveScreeningPlanMutation.reset()
    setScreeningPlanSaveUiBusy(false)
    setScreeningPlanSaveSuccess(null)
    setScreeningPlanMergeSource(null)
    setScreeningPlanProtocolId(null)
    setScreeningPlanProjectError(null)
    setScreeningPlanProjectInitial(null)
    setScreeningPlanConsentAssigneeId('')
    setScreeningPlanConsentSigningStaffNames([])
  }, [saveScreeningPlanMutation])

  const deleteProtocolMutation = useMutation({
    mutationFn: (id: number) => protocolApi.softDeleteProtocol(id),
    onMutate: () => {
      setDeleteProtocolError(null)
    },
    onSuccess: (_, deletedId) => {
      setDeleteConfirmTarget(null)
      setDeleteProtocolError(null)
      if (protocolId === deletedId) {
        setProtocolId(null)
        setViewMode('list')
      }
      if (screeningPlanProtocolId === deletedId) {
        setScreeningPlanMergeSource(null)
        setScreeningPlanProtocolId(null)
        setScreeningPlanSaveSuccess(null)
        setScreeningPlanConsentSigningStaffNames([])
      }
      if (configProtocolId === deletedId) {
        setConfigProtocolId(null)
      }
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deletedId)
        return next
      })
      setSignProgressExpandedById((prev) => {
        const { [deletedId]: _, ...rest } = prev
        return rest
      })
      /**
       * 必须在同步阶段结束 onSuccess，勿 await invalidateQueries。
       * TanStack Query v5 会 await mutation 的 onSuccess；invalidateQueries 会等 consent-overview
       * 重拉完成（该请求 timeout 可达 120s），导致按钮长期停在「处理中…」。
       */
      queueMicrotask(() => {
        void queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
        void queryClient.invalidateQueries({ queryKey: ['protocol', deletedId] })
      })
    },
    onError: (err: Error) => {
      setDeleteProtocolError(getMutationErrorMessage(err, '删除失败，请重试'))
    },
  })

  const createProtocol = useMutation({
    mutationFn: (data: {
      title: string
      code?: string
      screening_schedule?: ScreeningDay[]
      consent_config_account_id?: number
      consent_signing_staff_name?: string
    }) => {
      const sched = data.screening_schedule?.length ? cleanScreeningScheduleForApi(data.screening_schedule) : []
      for (const row of sched) {
        if ((row.signing_staff_name || '').trim()) {
          throw new Error('请先在「知情配置」中添加双签工作人员并保存后，再指定各现场日知情签署人员')
        }
      }
      return protocolApi.create({
        title: data.title,
        ...(data.code && { code: data.code }),
        ...(sched.length > 0 && { screening_schedule: sched }),
        ...(data.consent_config_account_id != null &&
          data.consent_config_account_id > 0 && { consent_config_account_id: data.consent_config_account_id }),
        ...(data.consent_signing_staff_name?.trim() && {
          consent_signing_staff_name: data.consent_signing_staff_name.trim(),
        }),
      })
    },
    onSuccess: (res) => {
      setCreateProtocolError(null)
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      setCreateModalOpen(false)
      setCreateTitle('')
      setCreateCode('')
      setCreateConsentAssigneeId('')
      setCreateConsentSigningStaffNames([])
      setCreateScreeningSchedule([])
      const newId = res && typeof res === 'object' && 'data' in res ? (res as { data?: { id?: number } }).data?.id : undefined
      if (typeof newId === 'number') {
        setPage(1)
        setHighlightNewProtocolId(newId)
      }
    },
    onError: (err: Error) => {
      setCreateProtocolError(getMutationErrorMessage(err, '创建失败，请重试'))
    },
  })

  const uploadIcf = useMutation({
    mutationFn: async (items: IcfCreateQueueItem[]) => {
      if (protocolId == null) throw new Error('未选择项目')
      for (let i = 0; i < items.length; i++) {
        setIcfUploadProgress({ current: i + 1, total: items.length })
        try {
          await protocolApi.uploadIcfVersion(
            protocolId,
            items[i].file,
            items[i].nodeTitle.trim() || undefined,
          )
        } catch (e) {
          await queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'icf-versions'] })
          await queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consents-stats'] })
          await queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
          throw new Error(
            `第 ${i + 1} 个文件「${items[i].file.name}」上传失败：${getMutationErrorMessage(e, '请重试')}`,
          )
        }
      }
    },
    onMutate: () => {
      setIcfUploadError(null)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'icf-versions'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consents-stats'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      setIcfModal(null)
      setIcfCreateQueue([])
      setIcfPickHint(null)
      setIcfUploadProgress(null)
      setIcfUploadError(null)
    },
    onError: (err: Error) => {
      setIcfUploadProgress(null)
      setIcfUploadError(err.message || '上传失败，请重试')
    },
  })

  const closeIcfCreateModal = useCallback(() => {
    if (uploadIcf.isPending) return
    setIcfModal(null)
    setIcfCreateQueue([])
    setIcfPickHint(null)
    setIcfUploadError(null)
    setIcfUploadProgress(null)
  }, [uploadIcf.isPending])

  const saveSettings = useMutation({
    mutationFn: async () => {
      if (protocolId == null || selectedConfigIcfId == null) {
        throw new Error('请选择签署节点后再保存')
      }
      const minReadingSec =
        consentMinReadingFieldRef.current?.commit() ?? settingsDraft.min_reading_duration_seconds
      const sched = cleanScreeningScheduleForApi(settingsDraft.screening_schedule)
      const supLabels = (settingsDraft.supplemental_collect_labels || [])
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20)
      const miniPayload: MiniSignRules = {
        require_face_verify: false,
        require_dual_sign: settingsDraft.require_dual_sign,
        require_comprehension_quiz: settingsDraft.require_comprehension_quiz,
        enable_min_reading_duration: settingsDraft.enable_min_reading_duration !== false,
        min_reading_duration_seconds: minReadingSec,
        dual_sign_staffs: buildDualSignStaffsForSave(),
        collect_id_card: !!settingsDraft.collect_id_card,
        collect_screening_number: !!settingsDraft.collect_screening_number,
        collect_initials: !!settingsDraft.collect_initials,
        collect_subject_name: !!settingsDraft.collect_subject_name,
        collect_other_information: supLabels.length > 0 || !!settingsDraft.collect_other_information,
        supplemental_collect_labels: supLabels,
        enable_checkbox_recognition: !!settingsDraft.enable_checkbox_recognition,
        enable_staff_signature: !!settingsDraft.enable_staff_signature,
        staff_signature_times: clampOneOrTwo(settingsDraft.staff_signature_times, 1),
        enable_subject_signature: !!settingsDraft.enable_subject_signature,
        subject_signature_times: clampOneOrTwo(settingsDraft.subject_signature_times, 1),
        enable_guardian_signature: !!settingsDraft.enable_guardian_signature,
        guardian_parent_count: clampOneOrTwo(settingsDraft.guardian_parent_count, 1),
        guardian_signature_times: clampOneOrTwo(settingsDraft.guardian_signature_times, 1),
        enable_auto_sign_date: !!settingsDraft.enable_auto_sign_date,
      }
      await protocolApi.updateIcfMiniSignRules(protocolId, selectedConfigIcfId, miniPayload)
      // 必须用当前表单草稿，勿用 loadedSettings 展开：否则会用陈旧缓存覆盖刚写入的双签名单等字段，导致保存失败或数据回滚
      await protocolApi.updateConsentSettings(protocolId, {
        require_face_verify: false,
        require_dual_sign: settingsDraft.require_dual_sign,
        require_comprehension_quiz: settingsDraft.require_comprehension_quiz,
        enable_min_reading_duration: settingsDraft.enable_min_reading_duration !== false,
        min_reading_duration_seconds: minReadingSec,
        dual_sign_staffs: buildDualSignStaffsForSave(),
        collect_id_card: !!settingsDraft.collect_id_card,
        collect_screening_number: !!settingsDraft.collect_screening_number,
        collect_initials: !!settingsDraft.collect_initials,
        collect_subject_name: !!settingsDraft.collect_subject_name,
        collect_other_information: supLabels.length > 0 || !!settingsDraft.collect_other_information,
        enable_checkbox_recognition: !!settingsDraft.enable_checkbox_recognition,
        enable_staff_signature: !!settingsDraft.enable_staff_signature,
        staff_signature_times: clampOneOrTwo(settingsDraft.staff_signature_times, 1),
        enable_subject_signature: !!settingsDraft.enable_subject_signature,
        subject_signature_times: clampOneOrTwo(settingsDraft.subject_signature_times, 1),
        enable_guardian_signature: !!settingsDraft.enable_guardian_signature,
        guardian_parent_count: clampOneOrTwo(settingsDraft.guardian_parent_count, 1),
        guardian_signature_times: clampOneOrTwo(settingsDraft.guardian_signature_times, 1),
        enable_auto_sign_date: !!settingsDraft.enable_auto_sign_date,
        screening_schedule: sched,
        planned_screening_dates: sched.map((x) => x.date),
        consent_signing_staff_name: (settingsDraft.consent_signing_staff_name || '').trim(),
      })
    },
    onMutate: () => {
      setSettingsSaveUiBusy(true)
      setConsentSettingsSaveFeedback(null)
      if (consentSettingsSaveFeedbackTimerRef.current) {
        clearTimeout(consentSettingsSaveFeedbackTimerRef.current)
        consentSettingsSaveFeedbackTimerRef.current = null
      }
    },
    onSuccess: () => {
      try {
        queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consent-settings'] })
        queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'icf-versions'] })
        queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
        queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'dual-sign-staff-status'] })
      } catch (e) {
        console.error('saveSettings onSuccess invalidate failed', e)
      }
      setConsentSettingsSaveFeedback({ kind: 'success', message: '保存成功' })
      if (consentSettingsSaveFeedbackTimerRef.current) {
        clearTimeout(consentSettingsSaveFeedbackTimerRef.current)
      }
      consentSettingsSaveFeedbackTimerRef.current = setTimeout(() => {
        setConsentSettingsSaveFeedback(null)
        consentSettingsSaveFeedbackTimerRef.current = null
      }, 4000)
    },
    onError: (err: Error) => {
      setConsentSettingsSaveFeedback({
        kind: 'error',
        message: getMutationErrorMessage(err, '保存失败，请重试'),
      })
    },
    onSettled: () => {
      setSettingsSaveUiBusy(false)
    },
  })

  useEffect(() => {
    return () => {
      if (consentSettingsSaveFeedbackTimerRef.current) {
        clearTimeout(consentSettingsSaveFeedbackTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!protocolId) {
      setSettingsSaveUiBusy(false)
      saveSettings.reset()
    }
  }, [protocolId, saveSettings])

  const saveConfigProtocolMutation = useMutation({
    mutationFn: (data: ConsentSettings) => protocolApi.updateConsentSettings(configProtocolId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', configProtocolId!, 'consent-settings'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
    },
  })


  const staffReturnMutation = useMutation({
    mutationFn: async ({ ids, reason }: { ids: number[]; reason: string }) => {
      const trimmed = reason.trim()
      const body = trimmed ? { reason: trimmed.slice(0, 500) } : undefined
      for (const id of ids) {
        const r = await protocolApi.staffReturnConsent(protocolId!, id, body)
        if ((r as { code?: number }).code !== 200) {
          throw new Error((r as { msg?: string }).msg || '退回重签失败')
        }
      }
    },
    onSuccess: () => {
      setStaffAuditActionError(null)
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consents'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consents-stats'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consent-preview'] })
      setPreviewConsentIds(null)
      setStaffReturnReason('')
    },
    onError: (err: Error) => {
      setStaffAuditActionError(getMutationErrorMessage(err, '退回重签失败'))
    },
  })

  const staffApproveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        const r = await protocolApi.staffApproveConsent(protocolId!, id)
        if ((r as { code?: number }).code !== 200) {
          throw new Error((r as { msg?: string }).msg || '通过审核失败')
        }
      }
    },
    onSuccess: () => {
      setStaffAuditActionError(null)
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consents'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consents-stats'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consent-preview'] })
      setPreviewConsentIds(null)
      setStaffReturnReason('')
    },
    onError: (err: Error) => {
      setStaffAuditActionError(getMutationErrorMessage(err, '通过审核失败'))
    },
  })

  const softDeleteConsentMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await protocolApi.softDeleteConsent(protocolId!, id)
      }
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consents'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consents-stats'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consent-preview'] })
      setDeleteConsentIds(null)
      setDeleteConsentSummary('')
      setConsentSelectedIds((prev) => {
        if (prev.size === 0) return prev
        const next = new Set(prev)
        ids.forEach((id) => next.delete(id))
        return next
      })
      setPreviewConsentIds((prev) => {
        if (prev != null && ids.some((id) => prev.includes(id))) {
          setStaffAuditActionError(null)
          return null
        }
        return prev
      })
    },
    onError: (err: Error) => {
      window.alert(getMutationErrorMessage(err, '删除失败'))
    },
  })

  const reorderIcf = useMutation({
    mutationFn: (idOrder: number[]) => protocolApi.reorderIcfVersions(protocolId!, idOrder),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'icf-versions'] })
    },
  })

  const deleteIcfMutation = useMutation({
    mutationFn: (icfId: number) => protocolApi.deleteIcfVersion(protocolId!, icfId),
    onSuccess: (_, icfId) => {
      setDeleteIcfTarget(null)
      setDeleteIcfError(null)
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'icf-versions'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consents-stats'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consents'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consent-settings'] })
      if (selectedConfigIcfId === icfId) {
        setSelectedConfigIcfId(null)
      }
    },
    onError: (err: Error) => {
      setDeleteIcfError(getMutationErrorMessage(err, '删除失败，请重试'))
    },
  })

  const launchMutation = useMutation({
    mutationFn: (launched: boolean) => protocolApi.consentLaunch(protocolId!, launched),
    onMutate: () => {
      if (consentSettingsSaveFeedbackTimerRef.current) {
        clearTimeout(consentSettingsSaveFeedbackTimerRef.current)
        consentSettingsSaveFeedbackTimerRef.current = null
      }
    },
    onSuccess: (_data, launched) => {
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consent-settings'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'icf-versions'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      setConsentSettingsSaveFeedback({
        kind: 'success',
        message: launched ? '发布成功，知情配置已锁定' : '已取消发布，可继续编辑配置',
      })
      if (consentSettingsSaveFeedbackTimerRef.current) {
        clearTimeout(consentSettingsSaveFeedbackTimerRef.current)
      }
      consentSettingsSaveFeedbackTimerRef.current = setTimeout(() => {
        setConsentSettingsSaveFeedback(null)
        consentSettingsSaveFeedbackTimerRef.current = null
      }, 4000)
    },
    onError: (err: Error) => {
      setConsentSettingsSaveFeedback({
        kind: 'error',
        message: getMutationErrorMessage(err, '发布失败，请重试'),
      })
    },
  })

  /** 不满足发布条件时的说明（悬停与点击提示共用） */
  const publishBlockedMessage = useMemo(() => {
    if (hasTestScreeningInPlan) return '发布前请在「计划」或知情配置中删除全部测试筛选计划行'
    if (icfVersions.length === 0) return '请先新建至少一个签署节点并上传文档'
    if (!allNodesMiniSaved) return '请先在「知情配置」中为每个签署节点保存小程序签署规则（至少一次）'
    if (!everyDualNodeHasStaffWhenRequired) return '启用双签的节点须至少添加一名见证工作人员后方可发布'
    return null
  }, [
    hasTestScreeningInPlan,
    icfVersions.length,
    allNodesMiniSaved,
    everyDualNodeHasStaffWhenRequired,
  ])

  /** 发布：与「签署节点」标签页、知情配置左侧栏共用同一套条件 */
  const consentPublishLaunchDisabled = launchMutation.isPending || publishBlockedMessage != null
  const consentPublishLaunchTitle = publishBlockedMessage ?? undefined

  const handlePublishConsentClick = useCallback(() => {
    if (launchMutation.isPending || !protocolId) return
    if (publishBlockedMessage) {
      setConsentSettingsSaveFeedback({ kind: 'error', message: publishBlockedMessage })
      requestAnimationFrame(() => {
        consentSettingsSaveBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }
    launchMutation.mutate(true)
  }, [launchMutation, protocolId, publishBlockedMessage])

  const listConsentLaunchMutation = useMutation({
    mutationFn: (args: { protocolId: number; launched: boolean }) =>
      protocolApi.consentLaunch(args.protocolId, args.launched),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      setConsentListMoreOpenId(null)
      setListDelistModal(null)
    },
  })

  const [listVerifyTestSendingWitnessId, setListVerifyTestSendingWitnessId] = useState<number | null>(null)

  const listVerifyTestAuthMutation = useMutation({
    mutationFn: (args: { protocolId: number; witness_staff_id: number; icf_version_id: number }) =>
      protocolApi.requestDualSignAuth(args.protocolId, {
        witness_staff_id: args.witness_staff_id,
        icf_version_id: args.icf_version_id,
      }),
    onMutate: (args) => {
      setListVerifyTestSendingWitnessId(args.witness_staff_id)
    },
    onSettled: () => {
      setListVerifyTestSendingWitnessId(null)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      queryClient.invalidateQueries({
        queryKey: ['protocol', variables.protocolId, 'dual-sign-staff-status', 'list-verify-test-modal'],
      })
    },
  })

  const listVerifyTestIcfQuery = useQuery({
    queryKey: ['protocol', listVerifyTestModal?.id, 'icf-versions', 'list-verify-test'],
    queryFn: async () => {
      const res = await protocolApi.listIcfVersions(listVerifyTestModal!.id)
      const ax = res as { data?: { items?: ICFVersion[] } }
      return ax.data?.items ?? []
    },
    enabled: !!listVerifyTestModal?.id,
  })
  const listVerifyTestWitnessQuery = useQuery({
    queryKey: ['witness-staff', 'list-verify-test-modal', listVerifyTestModal?.id],
    queryFn: async () => {
      const res = await protocolApi.listWitnessStaff({ page: 1, page_size: 500 })
      return res.data?.items ?? []
    },
    enabled: !!listVerifyTestModal?.id,
  })
  const listVerifyTestWitnessByName = useMemo(() => {
    const m = new Map<string, WitnessStaffRecord>()
    for (const w of listVerifyTestWitnessQuery.data ?? []) {
      const n = (w.name || '').trim()
      if (n && !m.has(n)) m.set(n, w)
    }
    return m
  }, [listVerifyTestWitnessQuery.data])
  const listVerifyTestSigningNames = useMemo(
    () => parseSigningStaffNames((listVerifyTestModal?.signing_staff_display || '').trim()),
    [listVerifyTestModal?.signing_staff_display],
  )

  const listVerifyTestStaffIdsForStatus = useMemo(
    () =>
      listVerifyTestSigningNames
        .map((n) => listVerifyTestWitnessByName.get(n)?.id)
        .filter((id): id is number => typeof id === 'number'),
    [listVerifyTestSigningNames, listVerifyTestWitnessByName],
  )

  const listVerifyTestFirstIcfId = listVerifyTestIcfQuery.data?.[0]?.id

  const listVerifyTestDualSignStatusQuery = useQuery({
    queryKey: [
      'protocol',
      listVerifyTestModal?.id,
      'dual-sign-staff-status',
      'list-verify-test-modal',
      listVerifyTestFirstIcfId,
      listVerifyTestStaffIdsForStatus.join(','),
    ],
    queryFn: async () => {
      const pid = listVerifyTestModal!.id
      const icfId = listVerifyTestFirstIcfId!
      return protocolApi.getDualSignStaffStatus(pid, icfId, listVerifyTestStaffIdsForStatus)
    },
    enabled:
      !!listVerifyTestModal?.id && !!listVerifyTestFirstIcfId && listVerifyTestStaffIdsForStatus.length > 0,
    refetchInterval: (query) => {
      const res = query.state.data as
        | { data?: { items?: Array<{ status: DualSignStaffVerificationStatus }> } }
        | undefined
      const items = res?.data?.items ?? []
      const needPoll = items.some((x) => x.status === 'pending_verify' || x.status === 'verifying')
      return needPoll ? 15000 : false
    },
  })

  const listVerifyTestStatusByWitnessId = useMemo(() => {
    const res = listVerifyTestDualSignStatusQuery.data as
      | { data?: { items?: Array<{ witness_staff_id: number; status: DualSignStaffVerificationStatus }> } }
      | undefined
    const items = res?.data?.items ?? []
    const m = new Map<number, DualSignStaffVerificationStatus>()
    for (const it of items) {
      m.set(it.witness_staff_id, it.status)
    }
    return m
  }, [listVerifyTestDualSignStatusQuery.data])

  const witnessStaffPickerQuery = useQuery({
    queryKey: ['witness-staff', 'picker', protocolId],
    queryFn: async () => {
      const res = await protocolApi.listWitnessStaff({ page: 1, page_size: 500 })
      return res.data?.items ?? []
    },
    enabled: !!protocolId && activeTab === 'settings',
  })
  const witnessPickerRows: WitnessStaffRecord[] = witnessStaffPickerQuery.data ?? []

  /** 知情管理列表「知情签署工作人员」：姓名 + 邮箱（双签档案优先，其次治理台账号按 display_name 匹配） */
  const projectSigningStaffEmailRows = useMemo(() => {
    const names = parseSigningStaffNames(
      (settingsDraft.consent_signing_staff_name || loadedSettings.consent_signing_staff_name || '').trim(),
    )
    if (names.length === 0) return []
    const witnessByName = new Map<string, WitnessStaffRecord>()
    for (const w of witnessPickerRows) {
      const n = (w.name || '').trim()
      if (n && !witnessByName.has(n)) witnessByName.set(n, w)
    }
    const accountByDisplay = new Map(consentAssigneeOptions.map((a) => [(a.display_name || '').trim(), a] as const))
    return names.map((name) => {
      const w = witnessByName.get(name)
      const em = (w?.email || '').trim()
      if (em) return { name, email: em, via: 'witness' as const }
      const acc = accountByDisplay.get(name)
      const ae = (acc?.email || '').trim()
      if (ae) return { name, email: ae, via: 'account' as const }
      return { name, email: null as string | null, via: 'none' as const }
    })
  }, [settingsDraft.consent_signing_staff_name, loadedSettings.consent_signing_staff_name, witnessPickerRows, consentAssigneeOptions])

  /** 项目级姓名顺序下，能在双签档案中匹配到的工作人员（与上方卡片一致，用于发信/核验状态/保存） */
  const projectSigningStaffWitnessOrder = useMemo(() => {
    const names = parseSigningStaffNames(
      (settingsDraft.consent_signing_staff_name || loadedSettings.consent_signing_staff_name || '').trim(),
    )
    const witnessByName = new Map<string, WitnessStaffRecord>()
    for (const w of witnessPickerRows) {
      const n = (w.name || '').trim()
      if (n && !witnessByName.has(n)) witnessByName.set(n, w)
    }
    return names.map((name) => witnessByName.get(name)).filter((x): x is WitnessStaffRecord => !!x)
  }, [settingsDraft.consent_signing_staff_name, loadedSettings.consent_signing_staff_name, witnessPickerRows])

  const projectSigningStaffWitnessIds = useMemo(
    () => projectSigningStaffWitnessOrder.map((w) => w.id),
    [projectSigningStaffWitnessOrder],
  )

  /** 与「统一通知邮箱」提示联动：仅档案中有邮箱的工作人员 */
  const selectedPickerWitnesses = projectSigningStaffWitnessOrder

  useEffect(() => {
    if (!protocolId) return
    const rows = projectSigningStaffEmailRows
    if (rows.length === 0) {
      setDualSignNotifyEmail('')
      return
    }
    setDualSignNotifyEmail(rows.map((r) => (r.email || '').trim()).join(', '))
  }, [protocolId, projectSigningStaffEmailRows])

  const projectSigningNameListForNotify = useMemo(
    () =>
      parseSigningStaffNames(
        (settingsDraft.consent_signing_staff_name || loadedSettings.consent_signing_staff_name || '').trim(),
      ),
    [settingsDraft.consent_signing_staff_name, loadedSettings.consent_signing_staff_name],
  )

  /** 保存知情配置时写入后端的双签名单（含每人通知邮箱，与「发送认证授权邮件」独立） */
  const buildDualSignStaffsForSave = useCallback((): DualSignStaff[] => {
    if (!settingsDraft.require_dual_sign) return []
    const segments = parseDualSignNotifyEmailSegments(dualSignNotifyEmail)
    const prevById = new Map(
      (settingsDraft.dual_sign_staffs ?? []).map((s) => [String(s.staff_id ?? ''), s]),
    )
    const nameList = parseSigningStaffNames(
      (settingsDraft.consent_signing_staff_name || loadedSettings.consent_signing_staff_name || '').trim(),
    )
    return projectSigningStaffWitnessOrder.map((w) => {
      const staffNumId = w.id
      const staffIdStr = String(staffNumId)
      const staffRowEmail = (w?.email || '').trim()
      const ni = nameList.findIndex((n) => n === (w.name || '').trim())
      const segIdx = ni >= 0 ? ni : 0
      const eff = effectiveDualSignNotifyForIndex(segments, segIdx, staffRowEmail)
      const prev = prevById.get(staffIdStr)
      return {
        staff_id: staffIdStr,
        name: (w?.name || prev?.name || '').trim(),
        email: eff,
        phone: (w?.phone || prev?.phone || '').trim(),
        id_card_no: (w?.id_card_no || prev?.id_card_no || '').trim(),
        identity_verified: !!prev?.identity_verified,
      }
    })
  }, [
    settingsDraft.require_dual_sign,
    settingsDraft.dual_sign_staffs,
    settingsDraft.consent_signing_staff_name,
    loadedSettings.consent_signing_staff_name,
    projectSigningStaffWitnessOrder,
    dualSignNotifyEmail,
  ])

  const canSubmitDualSignAuth = useMemo(() => {
    if (projectSigningStaffWitnessIds.length === 0 || witnessAuthIcfVersionId == null || consentLaunched) return false
    const segments = parseDualSignNotifyEmailSegments(dualSignNotifyEmail)
    return projectSigningStaffWitnessIds.every((id) => {
      const w = witnessPickerRows.find((x) => x.id === id)
      const ni = projectSigningNameListForNotify.findIndex((n) => n === (w?.name || '').trim())
      const segIdx = ni >= 0 ? ni : 0
      const eff = effectiveDualSignNotifyForIndex(segments, segIdx, w?.email || '')
      return !!eff.trim()
    })
  }, [
    projectSigningStaffWitnessIds,
    witnessAuthIcfVersionId,
    consentLaunched,
    dualSignNotifyEmail,
    witnessPickerRows,
    projectSigningNameListForNotify,
  ])

  const dualSignAuthMutation = useMutation({
    mutationFn: (payload: { witness_staff_id: number; icf_version_id: number; notify_email?: string }) =>
      protocolApi.requestDualSignAuth(protocolId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'consent-settings'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'icf-versions'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      queryClient.invalidateQueries({ queryKey: ['witness-staff'] })
      queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'dual-sign-staff-status'] })
    },
  })

  /** 每人双签阶段：待发邮件 / 待核验 / 核验中 / 已核验（与当前签署节点 + 发信记录对齐） */
  const dualSignStaffStatusQuery = useQuery({
    queryKey: [
      'protocol',
      protocolId,
      'dual-sign-staff-status',
      witnessAuthIcfVersionId,
      projectSigningStaffWitnessIds.join(','),
    ],
    queryFn: () => protocolApi.getDualSignStaffStatus(protocolId!, witnessAuthIcfVersionId!, projectSigningStaffWitnessIds),
    enabled:
      !!protocolId &&
      !!witnessAuthIcfVersionId &&
      settingsDraft.require_dual_sign &&
      projectSigningStaffWitnessIds.length > 0,
    refetchInterval: (query) => {
      const res = query.state.data as { data?: { items?: Array<{ status: DualSignStaffVerificationStatus }> } } | undefined
      const items = res?.data?.items ?? []
      const needPoll = items.some((x) => x.status === 'pending_verify' || x.status === 'verifying')
      return needPoll ? 15000 : false
    },
  })
  const dualSignStaffStatusPayload = useMemo(() => {
    const res = dualSignStaffStatusQuery.data as
      | {
          data?: {
            items?: Array<{
              witness_staff_id: number
              status: DualSignStaffVerificationStatus
              signature_auth_status?: WitnessSignatureAuthStatus
              test_signing_completed?: boolean
            }>
          }
        }
      | undefined
    const items = res?.data?.items ?? []
    const byStatus = new Map<number, DualSignStaffVerificationStatus>()
    const bySig = new Map<number, WitnessSignatureAuthStatus>()
    for (const it of items) {
      byStatus.set(it.witness_staff_id, it.status)
      bySig.set(it.witness_staff_id, it.signature_auth_status ?? 'none')
    }
    const protocolTestSigningCompleted = items[0]?.test_signing_completed ?? false
    return { byStatus, bySig, protocolTestSigningCompleted }
  }, [dualSignStaffStatusQuery.data])

  const dualSignStatusByStaffId = dualSignStaffStatusPayload.byStatus
  const dualSignSigAuthByStaffId = dualSignStaffStatusPayload.bySig
  const protocolTestSigningCompleted = dualSignStaffStatusPayload.protocolTestSigningCompleted

  /**
   * 「发送认证授权邮件」主按钮文案。
   * 「核验进行中」仅当当前签署节点下**至少一人**处于待核验/核验中（与 dual-sign-staff-status 一致）；
   * 不再用 consent-settings 的 identity_verified 汇总（partialVerified），否则易与按节点状态不一致，出现全员「待发邮件」却显示「核验进行中」。
   */
  const dualSignAuthButtonLabel = useMemo(() => {
    if (dualSignAuthMutation.isPending) return '发送中…'
    const anyInVerifyFlow = projectSigningStaffWitnessIds.some((id) => {
      const st = dualSignStatusByStaffId.get(id)
      return st === 'pending_verify' || st === 'verifying'
    })
    if (anyInVerifyFlow) return '核验进行中'
    const s = loadedSettings as ConsentSettings
    if (s.require_dual_sign) {
      if (
        dualSignAuthMutation.isSuccess &&
        staffVerificationForPublish.noneVerifiedWithStaff
      ) {
        return projectSigningStaffWitnessIds.length > 1
          ? `已发送认证授权邮件（${projectSigningStaffWitnessIds.length} 人）`
          : '已发送认证授权邮件'
      }
    }
    return projectSigningStaffWitnessIds.length > 1
      ? `发送认证授权邮件（${projectSigningStaffWitnessIds.length} 人）`
      : '发送认证授权邮件'
  }, [
    dualSignAuthMutation.isPending,
    dualSignAuthMutation.isSuccess,
    loadedSettings,
    staffVerificationForPublish.noneVerifiedWithStaff,
    projectSigningStaffWitnessIds,
    dualSignStatusByStaffId,
  ])

  useEffect(() => {
    dualSignAuthMutation.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅随项目重置发信请求状态
  }, [protocolId])

  const [draggedIcfIndex, setDraggedIcfIndex] = useState<number | null>(null)
  const icfJustDraggedRef = useRef(false)
  const handleIcfDragStart = (index: number) => (e: React.DragEvent) => {
    icfJustDraggedRef.current = true
    setDraggedIcfIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(icfVersions[index].id))
    e.dataTransfer.setData('application/json', JSON.stringify({ index }))
  }
  const handleIcfDragOver = (targetIndex: number) => (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const handleIcfDrop = (targetIndex: number) => (e: React.DragEvent) => {
    e.preventDefault()
    setDraggedIcfIndex(null)
    let fromIndex: number
    try {
      const raw = e.dataTransfer.getData('application/json')
      fromIndex = raw ? JSON.parse(raw).index : -1
    } catch {
      fromIndex = -1
    }
    if (fromIndex < 0 || fromIndex === targetIndex) return
    const next = [...icfVersions]
    const [removed] = next.splice(fromIndex, 1)
    next.splice(targetIndex, 0, removed)
    reorderIcf.mutate(next.map((x) => x.id))
  }
  const handleIcfDragEnd = () => {
    setDraggedIcfIndex(null)
    setTimeout(() => { icfJustDraggedRef.current = false }, 100)
  }

  const openCreateIcf = () => {
    setIcfCreateQueue([])
    setIcfPickHint(null)
    setIcfUploadError(null)
    setIcfUploadProgress(null)
    icfDropDepthRef.current = 0
    setIcfDropHover(false)
    setIcfModal('create')
  }

  const appendIcfFilesToQueue = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    const valid: File[] = []
    let skipped = 0
    for (const f of arr) {
      if (isAllowedIcfUploadFile(f)) valid.push(f)
      else skipped += 1
    }
    if (skipped > 0) {
      setIcfPickHint(`已跳过 ${skipped} 个不支持的文件（仅支持 PDF、DOC、DOCX）`)
    } else if (valid.length > 0) {
      setIcfPickHint(null)
    }
    if (valid.length === 0) return
    setIcfCreateQueue((prev) => [
      ...prev,
      ...valid.map((file) => ({
        id: newIcfQueueItemId(),
        file,
        nodeTitle: parseFilenameAsNodeTitle(file.name),
      })),
    ])
  }, [])

  const handleIcfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files?.length) appendIcfFilesToQueue(files)
    e.target.value = ''
  }

  const handleIcfDropZoneDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    icfDropDepthRef.current += 1
    if (e.dataTransfer.types.includes('Files')) setIcfDropHover(true)
  }

  const handleIcfDropZoneDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    icfDropDepthRef.current -= 1
    if (icfDropDepthRef.current <= 0) {
      icfDropDepthRef.current = 0
      setIcfDropHover(false)
    }
  }

  const handleIcfDropZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleIcfDropZoneDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    icfDropDepthRef.current = 0
    setIcfDropHover(false)
    if (e.dataTransfer.files?.length) appendIcfFilesToQueue(e.dataTransfer.files)
  }

  const updateIcfQueueItemTitle = (id: string, nodeTitle: string) => {
    setIcfCreateQueue((prev) => prev.map((x) => (x.id === id ? { ...x, nodeTitle } : x)))
  }

  const removeIcfQueueItem = (id: string) => {
    setIcfCreateQueue((prev) => prev.filter((x) => x.id !== id))
  }

  const moveIcfQueueItem = (id: string, dir: -1 | 1) => {
    setIcfCreateQueue((prev) => {
      const i = prev.findIndex((x) => x.id === id)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const a = next[i]!
      const b = next[j]!
      next[i] = b
      next[j] = a
      return next
    })
  }

  const handleExportSubjects = useCallback(async () => {
    if (!protocolId) return
    setExportingSubjects(true)
    try {
      const blob = (await protocolApi.exportConsents(protocolId, {
        status: consentStatus,
        ...(consentDateFrom.trim() && { date_from: consentDateFrom.trim() }),
        ...(consentDateTo.trim() && { date_to: consentDateTo.trim() }),
        ...(consentSearchDebounced && { search: consentSearchDebounced }),
      })) as Blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ymd = formatLocalDateYmd(new Date()).replace(/-/g, '')
      a.download = `${selectedProtocol?.code || protocolId}_受试者基础信息_${ymd}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      window.alert(getMutationErrorMessage(err, '导出受试者基础信息失败'))
    } finally {
      setExportingSubjects(false)
    }
  }, [protocolId, consentStatus, consentDateFrom, consentDateTo, consentSearchDebounced, selectedProtocol?.code])

  const handleExportSigningPdfs = useCallback(async () => {
    if (!protocolId) return
    setExportingPdfs(true)
    try {
      const blob = (await protocolApi.exportConsentPdfs(protocolId, {
        status: consentStatus,
        ...(consentDateFrom.trim() && { date_from: consentDateFrom.trim() }),
        ...(consentDateTo.trim() && { date_to: consentDateTo.trim() }),
        ...(consentSearchDebounced && { search: consentSearchDebounced }),
      })) as Blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ymd = formatLocalDateYmd(new Date()).replace(/-/g, '')
      a.download = `${selectedProtocol?.code || protocolId}_知情签署文件_${ymd}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      window.alert(getMutationErrorMessage(err, '批量导出失败，请确认当前筛选下存在已生成回执 PDF'))
    } finally {
      setExportingPdfs(false)
    }
  }, [protocolId, consentStatus, consentDateFrom, consentDateTo, consentSearchDebounced, selectedProtocol?.code])

  const handleConsentSort = useCallback(
    (field: string) => {
      setConsentTablePage(1)
      if (consentSortField === field) {
        setConsentSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))
      } else {
        setConsentSortField(field)
        setConsentSortOrder(['signed_at', 'create_time', 'auth_verified_at'].includes(field) ? 'desc' : 'asc')
      }
    },
    [consentSortField],
  )

  const toggleConsentSelectAllPage = useCallback(() => {
    const ids = flatConsentRecordIdsOnPage(consents)
    const allOn = ids.length > 0 && ids.every((id) => consentSelectedIds.has(id))
    setConsentSelectedIds((prev) => {
      const next = new Set(prev)
      if (allOn) {
        ids.forEach((id) => next.delete(id))
      } else {
        ids.forEach((id) => next.add(id))
      }
      return next
    })
  }, [consents, consentSelectedIds])

  const openBatchDeleteConsents = useCallback(() => {
    const ids = Array.from(consentSelectedIds)
    if (ids.length === 0) {
      window.alert('请先勾选需要删除的签署记录')
      return
    }
    setDeleteConsentIds(ids)
    setDeleteConsentSummary(`已选择 ${ids.length} 条签署记录（支持跨页勾选）`)
  }, [consentSelectedIds])

  const handleConsentJumpPage = useCallback(() => {
    const n = parseInt(consentJumpInput, 10)
    if (!Number.isNaN(n) && n >= 1 && n <= consentTotalPages) {
      setConsentTablePage(n)
      setConsentJumpInput('')
    }
  }, [consentJumpInput, consentTotalPages])

  const applyListFilters = useCallback(() => {
    setKeyword(keywordInput.trim())
    setConfigStatus(configStatusInput)
    setDateStart(dateStartInput)
    setDateEnd(dateEndInput)
    setPage(1)
  }, [keywordInput, configStatusInput, dateStartInput, dateEndInput])

  const resetFilters = useCallback(() => {
    setKeyword('')
    setKeywordInput('')
    setConfigStatus('')
    setConfigStatusInput('')
    setDateStart('')
    setDateStartInput('')
    setDateEnd('')
    setDateEndInput('')
    setPage(1)
  }, [])

  const downloadCreateTemplate = useCallback(() => {
    const csv =
      '\uFEFF项目编号,项目名称,现场筛选日1,预约人数1,现场筛选日2,预约人数2\n' +
      'C26001001,示例项目A,,,,,\n' +
      'C26001002,示例项目B,2026-06-01,8,2026-06-15,8\n' +
      'C26001003,示例项目C,2026-07-01,10,2026-07-15,10\n'
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '新建项目导入模板.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const handleBatchImport = useCallback(async () => {
    if (!batchFile) return
    setBatchImporting(true)
    setBatchResult(null)
    try {
      const res = await protocolApi.batchImport(batchFile)
      const data = (res as { data?: { created?: number; failed?: Array<{ row: number; error: string }> } })?.data
      setBatchResult({
        created: data?.created ?? 0,
        failed: data?.failed ?? [],
      })
      if ((data?.created ?? 0) > 0) {
        queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      }
    } finally {
      setBatchImporting(false)
    }
  }, [batchFile, queryClient])

  const openCreateModal = useCallback(() => {
    setCreateModalOpen(true)
    setCreateTab('single')
    setCreateTitle('')
    setCreateCode('')
    setCreateConsentAssigneeId('')
    setCreateProtocolError(null)
    setBatchFile(null)
    setBatchResult(null)
  }, [])

  const consentPageTitleBar = (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-semibold text-slate-800">知情管理</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5">
          <span className="text-xs text-slate-500 shrink-0">流程：</span>
          {[
            '新建项目',
            '编辑计划',
            '协议上传',
            '配置规则',
            '知情发布',
            '小程序签署',
            '双签见证',
            '预览审核',
            '统计导出',
          ].map((step, i, arr) => (
            <span key={step} className="inline-flex items-center gap-1.5 text-xs">
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{step}</span>
              {i < arr.length - 1 ? <span className="text-slate-300 select-none" aria-hidden>→</span> : null}
            </span>
          ))}
          {!protocolId && viewMode === 'config' && (
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className="ml-2 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
            >
              返回项目列表
            </button>
          )}
          <span className="ml-2 text-[11px] text-slate-400" title="知情管理流程与列表 UI 版本，用于确认已加载最新前端">
            v1.0
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
        <Link
          to="/consent/witness-staff"
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 shadow-sm hover:bg-indigo-100 hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 whitespace-nowrap"
        >
          <Users className="w-4 h-4 shrink-0" aria-hidden />
          双签工作人员名单
        </Link>
        {protocolId && viewMode === 'list' && (
          <button
            type="button"
            onClick={() => setProtocolId(null)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
          >
            <ChevronRight className="w-4 h-4 rotate-180 shrink-0" />
            返回项目列表
          </button>
        )}
      </div>
    </div>
  )

  const consentListFiltersCard = (
    <div className="mt-4 bg-white rounded-t-xl border border-slate-200">
      <div className="p-5 border-b border-slate-100 space-y-4 overflow-visible">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[140px] flex-1 max-w-[220px]">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">搜索</label>
            <Input
              placeholder="项目编号或名称"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="min-w-[120px] w-[140px] shrink-0">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">知情配置状态</label>
            <Select
              value={configStatusInput}
              onChange={(e) => setConfigStatusInput(e.target.value)}
              options={CONFIG_STATUS_OPTIONS}
              className="w-full"
            />
          </div>
          <div className="min-w-[130px] w-[150px] shrink-0">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">开始日期</label>
            <input
              type="date"
              value={dateStartInput}
              onChange={(e) => setDateStartInput(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <div className="min-w-[130px] w-[150px] shrink-0">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">结束日期</label>
            <input
              type="date"
              value={dateEndInput}
              onChange={(e) => setDateEndInput(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button variant="secondary" size="md" onClick={applyListFilters} className="min-w-[88px] h-10">
              <span className="inline-flex items-end gap-1.5 whitespace-nowrap">
                <Search className="w-4 h-4 shrink-0" />
                查询
              </span>
            </Button>
            <Button variant="ghost" size="md" onClick={resetFilters} className="min-w-[88px] h-10">
              <span className="inline-flex items-end gap-1.5 whitespace-nowrap">
                <RotateCcw className="w-4 h-4 shrink-0" />
                重置
              </span>
            </Button>
            <Button variant="primary" size="md" onClick={openCreateModal} className="min-w-[88px] h-10">
              <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
                <Plus className="w-4 h-4 shrink-0" />
                新建
              </span>
            </Button>
            <Button
              variant="secondary"
              size="md"
              disabled={exportingList}
              onClick={async () => {
                setExportingList(true)
                try {
                  await downloadConsentOverviewExport({
                    ...(keyword && { keyword }),
                    ...(configStatus && { config_status: configStatus }),
                    ...(dateStart && { date_start: dateStart }),
                    ...(dateEnd && { date_end: dateEnd }),
                  })
                } finally {
                  setExportingList(false)
                }
              }}
              className="min-w-[88px] h-10"
            >
              <span className="inline-flex items-end gap-1.5 whitespace-nowrap">
                <Download className="w-4 h-4 shrink-0" />
                {exportingList ? '导出中…' : '导出'}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <TooltipProvider delayDuration={250} skipDelayDuration={150}>
    <div className="space-y-6">
      {viewMode === 'list' && !protocolId ? (
        <>
          {overviewLoading ||
          overviewError ||
          overviewItems.length === 0 ? (
            <div className="sticky top-0 z-[100] -mx-2 px-2 pb-3 md:-mx-5 md:px-5 bg-slate-50 [box-shadow:0_1px_0_0_rgb(226_232_240)]">
              {consentPageTitleBar}
              {consentListFiltersCard}
              <div className="rounded-b-xl border border-slate-200 border-t-0 bg-white -mt-px px-4 py-12">
                {overviewLoading ? (
                  <div className="text-center text-sm text-slate-400">加载中...</div>
                ) : overviewError ? (
                  <div className="flex flex-col items-center justify-center text-center">
                    <AlertCircle className="w-12 h-12 text-rose-300 mb-4" />
                    <p className="text-rose-600 text-sm">项目列表加载失败</p>
                    <p className="text-slate-500 text-xs mt-1">
                      {overviewErrorDetail?.message || '请检查账号权限或后端接口'}
                    </p>
                    <p className="text-slate-400 text-xs mt-0.5">接口: GET /api/v1/protocol/consent-overview</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center">
                    <p className="text-slate-500 text-sm">暂无项目</p>
                    <p className="text-slate-400 text-xs mt-1">点击上方「新建」添加单个或批量导入</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-[calc(100dvh-6.5rem)] min-h-[320px] flex-col">
              <DataTable<ProtocolConsentOverview>
                  density="compact"
                  desktopStickyScrollGutterClassName="-mx-2 px-2 md:-mx-5 md:px-5"
                  renderDesktopStickyCluster={(headerTable) => (
                    <div className="-mx-2 px-2 pb-2 md:-mx-5 md:px-5 bg-slate-50 [box-shadow:0_1px_0_0_rgb(226_232_240)]">
                      {consentPageTitleBar}
                      {consentListFiltersCard}
                      <div className="bg-white border-x border-t border-slate-200 -mt-px">{headerTable}</div>
                    </div>
                  )}
                  rowClassName={(record) => {
                    const amber =
                      listFocusProtocolId != null && record.id === listFocusProtocolId
                        ? 'cnkis-consent-list-focus !bg-amber-50/95 shadow-[inset_0_0_0_2px_rgba(245,158,11,0.55)] ring-1 ring-amber-200/90'
                        : ''
                    const emerald =
                      highlightNewProtocolId != null && record.id === highlightNewProtocolId
                        ? '!bg-emerald-50/95 shadow-[inset_0_0_0_2px_rgba(52,211,153,0.55)] transition-colors duration-500'
                        : ''
                    const merged = [amber, emerald].filter(Boolean).join(' ')
                    return merged || undefined
                  }}
                  columns={[
                    {
                      key: 'select',
                      title: '',
                      headerRender: (
                        <input
                          type="checkbox"
                          checked={
                            overviewItems.length > 0 &&
                            overviewItems.every((p) => selectedIds.has(p.id))
                          }
                          onChange={toggleSelectAll}
                          className="rounded border-slate-300"
                          title="全选当前页"
                        />
                      ),
                      width: 32,
                      align: 'center' as const,
                      headerClassName: '!pl-2 !pr-1',
                      cellClassName: '!pl-2 !pr-1',
                      render: (_, record) => (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(record.id)}
                          onChange={() => toggleSelect(record.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-slate-300"
                        />
                      ),
                    },
                    {
                      key: 'index',
                      title: '序号',
                      width: 44,
                      align: 'center' as const,
                      headerClassName: '!px-1',
                      cellClassName: '!px-1',
                      render: (_, __, index) => (page - 1) * pageSize + index + 1,
                    },
                    {
                      key: 'code',
                      title: '项目编号',
                      width: 86,
                      headerClassName: '!pl-1.5 !pr-1',
                      cellClassName: '!pl-1.5 !pr-1',
                      render: (_, record) => record.code || '-',
                    },
                    {
                      key: 'title',
                      title: '项目名称',
                      width: 118,
                      /** 收紧右侧留白，把横向空间留给后两列 */
                      headerClassName: '!pl-2 !pr-1',
                      cellClassName: '!pl-2 !pr-1',
                      render: (_, record) => {
                        const raw = record.title || ''
                        const code = record.code || ''
                        const display =
                          code && (raw.endsWith(`（${code}）`) || raw.endsWith(`(${code})`))
                            ? raw.slice(0, -(code.length + 2)).trim()
                            : raw
                        return (
                          <span className="block min-w-0 truncate" title={display || raw}>
                            {display || '-'}
                          </span>
                        )
                      },
                    },
                    {
                      key: 'consent_assignee',
                      title: '知情配置人员',
                      width: 90,
                      headerClassName: '!px-1',
                      cellClassName: '!px-1',
                      headerRender: (
                        <span
                          className="whitespace-nowrap"
                          title="治理台中具备全局角色 QA质量管理 的账号，每项目指定一人负责知情配置"
                        >
                          知情配置人员
                        </span>
                      ),
                      render: (_, record) => {
                        const name = record.consent_config_display_name?.trim()
                        if (!name) {
                          return <span className="text-slate-400 text-sm">—</span>
                        }
                        return (
                          <span className="block min-w-0 truncate text-sm text-slate-800" title={name}>
                            {name}
                          </span>
                        )
                      },
                    },
                    {
                      key: 'signing_staff_summary',
                      title: '知情签署工作人员',
                      width: 136,
                      headerClassName: '!pl-1 !pr-2',
                      cellClassName: '!pl-1 !pr-2',
                      headerRender: (
                        <span className="inline-flex items-center gap-0.5 whitespace-nowrap min-w-0">
                          <span
                            className="whitespace-nowrap"
                            title="各现场筛选日在「计划」弹窗中指定的知情签署人员（来自双签名单）；多现场日去重展示"
                          >
                            知情签署工作人员
                          </span>
                          <ConsentHelpIcon
                            text="蓝色气泡：最近一次在本列表通过「授权核验测试」所选、并已触发双签授权邮件的姓名（与后台 consent_verify_test_staff_name 一致）。不等于「邮件/人脸已全部完成」或「列表已处于可扫码测试态」；可扫码仍以列表「知情配置状态」与是否已发布为准。未使用气泡的姓名为项目级或各现场筛选日汇总的知情签署人员。"
                            ariaLabel="知情签署工作人员列蓝色气泡说明"
                          />
                        </span>
                      ),
                      render: (_, record) => renderListSigningStaffCell(record),
                    },
                    {
                      key: 'config_status',
                      title: '知情配置状态',
                      headerRender: (
                        <span
                          title="未发布：待配置 / 配置中 / 待认证授权 / 已授权待测试 / 已测试待开始（未发布且已测签）；已发布后：已测试待开始（未到筛选日）/ 进行中 / 已结束"
                          className="whitespace-nowrap"
                        >
                          知情配置状态
                        </span>
                      ),
                      width: 96,
                      render: (_, record) => {
                        const bp = configStatusBadgeProps(record.config_status)
                        return (
                          <Badge variant={bp.variant} className={bp.className}>
                            {record.config_status}
                          </Badge>
                        )
                      },
                    },
                    {
                      key: 'earliest_screening',
                      title: '筛选开始日期',
                      headerRender: (
                        <span
                          className="whitespace-nowrap"
                          title="正式筛选计划升序第一日；无计划时取最早现场日。"
                        >
                          筛选开始日期
                        </span>
                      ),
                      width: 108,
                      render: (_, record) => {
                        const earliest = firstConfiguredScreeningDate(record)
                        if (!earliest) {
                          return <span className="text-slate-400 text-sm">—</span>
                        }
                        return (
                          <div className="text-sm text-slate-800 tabular-nums text-left">
                            <div>{earliest}</div>
                          </div>
                        )
                      },
                    },
                    {
                      key: 'latest_screening',
                      title: '筛选结束日期',
                      headerRender: (
                        <span
                          className="whitespace-nowrap"
                          title="正式筛选计划降序第一日；无计划时取最晚现场日。"
                        >
                          筛选结束日期
                        </span>
                      ),
                      width: 108,
                      render: (_, record) => {
                        const latest = lastConfiguredScreeningDate(record)
                        if (!latest) {
                          return <span className="text-slate-400 text-sm">—</span>
                        }
                        return (
                          <div className="text-sm text-slate-800 tabular-nums text-left">
                            <div>{latest}</div>
                          </div>
                        )
                      },
                    },
                    {
                      key: 'progress',
                      title: '签署进度',
                      /** 多行进度块与表头工具栏：单元格顶对齐，其余列默认垂直居中 */
                      cellVAlign: 'top' as const,
                      headerRender: (
                        <div className="inline-flex items-center gap-1 flex-nowrap min-w-0">
                          <span className="font-semibold shrink-0 whitespace-nowrap">签署进度</span>
                          <span
                            className="inline-flex items-center gap-0 shrink-0 rounded border border-slate-200/80 bg-white px-0.5 py-0.5 shadow-sm"
                            onClick={(e) => e.stopPropagation()}
                            role="group"
                            aria-label="当前页签署进度：展开或收起全部现场日"
                          >
                            <button
                              type="button"
                              title="全部展开：当前页每行显示全部现场日"
                              aria-label="全部展开当前页签署进度多现场日"
                              disabled={!hasMultiDaySignProgressOnPage}
                              onClick={(e) => {
                                e.stopPropagation()
                                expandAllSignProgress()
                              }}
                              className={
                                !hasMultiDaySignProgressOnPage
                                  ? 'inline-flex h-6 w-6 items-center justify-center rounded pointer-events-none opacity-35'
                                  : signProgressHeaderHighlight.expandGreen
                                    ? 'inline-flex h-6 w-6 items-center justify-center rounded text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200/90 shadow-sm transition-colors hover:bg-emerald-100/90'
                                    : 'inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600'
                              }
                            >
                              <Maximize2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                            </button>
                            <button
                              type="button"
                              title="全部收起：每行仅显示与「筛选开始日期」对应现场的签署进度"
                              aria-label="全部收起：签署进度仅保留筛选开始日期对应现场"
                              disabled={!hasMultiDaySignProgressOnPage}
                              onClick={(e) => {
                                e.stopPropagation()
                                collapseAllSignProgress()
                              }}
                              className={
                                !hasMultiDaySignProgressOnPage
                                  ? 'inline-flex h-6 w-6 items-center justify-center rounded pointer-events-none opacity-35'
                                  : signProgressHeaderHighlight.collapseGreen
                                    ? 'inline-flex h-6 w-6 items-center justify-center rounded text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200/90 shadow-sm transition-colors hover:bg-emerald-100/90'
                                    : 'inline-flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600'
                              }
                            >
                              <Minimize2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                            </button>
                          </span>
                        </div>
                      ),
                      width: 430,
                      render: (_, record) => (
                        <ScreeningConsentProgressColumn
                          record={record}
                          expanded={signProgressExpandedById[record.id] ?? false}
                          onExpandedChange={(v) =>
                            setSignProgressExpandedById((prev) => ({ ...prev, [record.id]: v }))
                          }
                        />
                      ),
                    },
                    {
                      key: 'consent_qr',
                      title: '二维码',
                      width: 68,
                      headerClassName: '!px-1.5',
                      cellClassName: '!px-1.5',
                      align: 'center' as const,
                      /** 顶对齐 + 有现场日时上偏移：与左侧首个现场日白框同一水平带（非整行底/几何居中） */
                      cellVAlign: 'top' as const,
                      headerRender: (
                        <span
                          className="whitespace-nowrap"
                          title="微信扫一扫：落地页拉起小程序知情页，按配置完成阅读/签署（测试签署）；需微信凭证与 IP 白名单。未发布且列表为可扫码态时可验证；知情已发布时服务端不放行"
                        >
                          二维码
                        </span>
                      ),
                      render: (_, record) => {
                        const urlRaw = (record.consent_test_scan_url || '').trim()
                        const url =
                          typeof window !== 'undefined'
                            ? normalizePrivateLanHttpIpv4ImplicitPort8001(
                                rewriteConsentTestScanUrlForBrowserClient(urlRaw, {
                                  origin: window.location.origin,
                                  hostname: window.location.hostname,
                                }),
                              )
                            : urlRaw
                        const preLaunchConsentScanOk =
                          record.config_status === '核验测试中' ||
                          record.config_status === '已授权待测试' ||
                          record.config_status === '待测试' ||
                          record.config_status === '已测试待开始'
                        const scanTestAllowed =
                          preLaunchConsentScanOk && !record.consent_launched
                        return (
                          <div className={consentOverviewSideCellWrapperClass(record, 'center')}>
                            <ConsentTestScanQr
                              scanUrl={url}
                              verificationActive={scanTestAllowed}
                              consentLaunched={!!record.consent_launched}
                              configStatus={record.config_status}
                              disabled={!url}
                            />
                          </div>
                        )
                      },
                    },
                    {
                      key: 'consent_last_update',
                      title: '最后更新时间',
                      width: 170,
                      headerClassName: '!px-1.5',
                      cellClassName: '!px-1.5',
                      cellVAlign: 'top' as const,
                      render: (_, record) => {
                        const raw = record.consent_last_update_at
                        let body: ReactNode
                        if (!raw) {
                          body = <span className="text-slate-400 text-sm">—</span>
                        } else {
                          try {
                            const shown = formatLocalDateTimeYmdHms(raw)
                            body = (
                              <span
                                className="block min-w-0 whitespace-nowrap text-sm text-slate-700 tabular-nums"
                                title={raw}
                              >
                                {shown}
                              </span>
                            )
                          } catch {
                            body = <span className="text-sm text-slate-700">{raw}</span>
                          }
                        }
                        return (
                          <div className={consentOverviewSideCellWrapperClass(record, 'start')}>{body}</div>
                        )
                      },
                    },
                    {
                      key: 'action',
                      title: '操作',
                      width: 160,
                      headerClassName: '!px-1.5',
                      cellClassName: '!px-1.5',
                      align: 'center' as const,
                      cellVAlign: 'top' as const,
                      render: (_, record) => {
                        return (
                          <div
                            className={`${consentOverviewSideCellWrapperClass(record, 'center')} flex-nowrap items-center gap-0.5 sm:gap-1`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              title="现场筛选计划、各现场日知情签署人员、项目编号/名称"
                              aria-label="编辑现场计划"
                              onClick={(e) => {
                                e.stopPropagation()
                                openScreeningPlanModal(record)
                              }}
                              className="inline-flex shrink-0 flex-col items-center gap-0.5 rounded-md border border-slate-200 bg-white px-1 py-1 text-slate-600 hover:border-indigo-200 hover:bg-indigo-50/70 hover:text-indigo-800 min-w-[2.5rem] disabled:opacity-40 disabled:pointer-events-none"
                            >
                              <ClipboardList className="w-3.5 h-3.5 text-indigo-600" aria-hidden />
                              <span className="text-[11px] font-medium leading-none tracking-tight">计划</span>
                            </button>
                            <button
                              type="button"
                              title="编辑项目知情配置"
                              aria-label="编辑项目知情配置"
                              onClick={(e) => {
                                e.stopPropagation()
                                setProtocolId(record.id)
                              }}
                              className="inline-flex shrink-0 flex-col items-center gap-0.5 rounded-md border border-indigo-100 bg-indigo-50/90 px-1 py-1 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900 min-w-[2.5rem] disabled:opacity-40 disabled:pointer-events-none"
                            >
                              <Settings className="w-3.5 h-3.5" aria-hidden />
                              <span className="text-[11px] font-medium leading-none tracking-tight">知情</span>
                            </button>
                            <ConsentRowMoreMenu
                              open={consentListMoreOpenId === record.id}
                              onToggle={() =>
                                setConsentListMoreOpenId((prev) => (prev === record.id ? null : record.id))
                              }
                              menu={
                                <ul role="menu" className="text-left text-sm">
                                  <li>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full px-3 py-2 text-left text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
                                      disabled={listConsentLaunchMutation.isPending || !!record.consent_launched}
                                      onClick={() => {
                                        if (
                                          !window.confirm(
                                            '确认发布知情？发布后小程序侧可见，列表状态将变为「已测试待开始」（尚未到筛选开始日）或进入进行中/已结束。',
                                          )
                                        )
                                          return
                                        listConsentLaunchMutation.mutate({ protocolId: record.id, launched: true })
                                      }}
                                    >
                                      发布
                                    </button>
                                  </li>
                                  <li>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full px-3 py-2 text-left text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
                                      disabled={listConsentLaunchMutation.isPending || !record.consent_launched}
                                      onClick={() => {
                                        setConsentListMoreOpenId(null)
                                        setListDelistModal({ id: record.id, title: record.title || '' })
                                      }}
                                    >
                                      下架
                                    </button>
                                  </li>
                                  <li>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full px-3 py-2 text-left text-slate-800 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none"
                                      title={
                                        record.consent_launched
                                          ? '知情已发布后须先下架，方可再次从列表发起「授权核验测试」发邮（与蓝底气泡是否曾选过人无关）'
                                          : undefined
                                      }
                                      disabled={!!record.consent_launched}
                                      onClick={() => {
                                        if (record.consent_launched) return
                                        setConsentListMoreOpenId(null)
                                        setListVerifyTestModal({
                                          id: record.id,
                                          title: record.title || '',
                                          signing_staff_display: formatListSigningStaffCell(record),
                                        })
                                      }}
                                    >
                                      授权核验测试
                                    </button>
                                  </li>
                                  <li>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full px-3 py-2 text-left text-slate-800 hover:bg-slate-50"
                                      onClick={() => {
                                        setConsentListMoreOpenId(null)
                                        setProtocolId(record.id)
                                        setActiveTab('consents')
                                      }}
                                    >
                                      签署记录
                                    </button>
                                  </li>
                                  <li className="border-t border-slate-100 mt-0.5 pt-0.5">
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="w-full px-3 py-2 text-left text-rose-700 hover:bg-rose-50 disabled:opacity-40 disabled:pointer-events-none"
                                      onClick={() => {
                                        setConsentListMoreOpenId(null)
                                        deleteProtocolMutation.reset()
                                        setDeleteProtocolError(null)
                                        setDeleteConfirmTarget({
                                          id: record.id,
                                          title: record.title || '',
                                          code: record.code || '',
                                        })
                                      }}
                                    >
                                      删除项目
                                    </button>
                                  </li>
                                </ul>
                              }
                            />
                          </div>
                        )
                      },
                    },
                  ]}
                  desktopBodyShrinkToContent
                  data={overviewItems}
                  loading={false}
                  emptyText="暂无项目"
                  rowKey="id"
                  onRowClick={(record) => {
                    setProtocolId(record.id)
                  }}
                />
              <div className="shrink-0 -mx-2 px-2 md:-mx-5 md:px-5">
              {overviewItems.length > 0 ? (
                <div className="rounded-b-xl border border-t-0 border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-slate-500">共 {overviewTotal} 条</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-sm text-slate-500">每页</span>
                      <select
                        value={pageSize}
                        onChange={(e) => (setPageSize(Number(e.target.value)), setPage(1))}
                        className="h-8 px-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary-500/30"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-sm text-slate-500">条</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1 || totalPages <= 1}
                        className="px-3 py-1.5 text-sm rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50"
                      >
                        上一页
                      </button>
                      <span className="text-sm text-slate-600">
                        第 {page} / {totalPages} 页
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages || totalPages <= 1}
                        className="px-3 py-1.5 text-sm rounded border border-slate-200 disabled:opacity-50 hover:bg-slate-50"
                      >
                        下一页
                      </button>
                      <span className="text-sm text-slate-500">跳转至</span>
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={jumpPageInput}
                        onChange={(e) => setJumpPageInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleJumpPage()}
                        className="w-14 px-2 py-1 text-sm border border-slate-200 rounded text-center"
                        placeholder="页"
                        disabled={totalPages <= 1}
                        aria-label="跳转页码"
                      />
                      <button
                        type="button"
                        onClick={handleJumpPage}
                        disabled={totalPages <= 1}
                        className="px-2 py-1 text-sm rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                      >
                        跳转
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
            </div>
          )}
        </>
      ) : (
        consentPageTitleBar
      )}

      {viewMode === 'config' && !protocolId && (
        <ConfigCenterView
          configProtocols={configProtocols}
          configProtocolId={configProtocolId}
          setConfigProtocolId={setConfigProtocolId}
          configProtocolDraft={configProtocolDraft}
          setConfigProtocolDraft={setConfigProtocolDraft}
          configProtocolIcf={configProtocolIcf}
          saveConfigProtocolMutation={saveConfigProtocolMutation}
        />
      )}

      {deleteConfirmTarget && (
        <Modal
          open
          onClose={() => {
            if (!deleteProtocolMutation.isPending) {
              deleteProtocolMutation.reset()
              setDeleteProtocolError(null)
              setDeleteConfirmTarget(null)
            }
          }}
          title="确认删除项目"
          size="sm"
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button
                variant="ghost"
                disabled={deleteProtocolMutation.isPending}
                onClick={() => {
                  deleteProtocolMutation.reset()
                  setDeleteProtocolError(null)
                  setDeleteConfirmTarget(null)
                }}
              >
                取消
              </Button>
              <Button
                variant="primary"
                disabled={deleteProtocolMutation.isPending}
                className="!bg-rose-600 hover:!bg-rose-700 focus-visible:ring-rose-500"
                onClick={() => deleteProtocolMutation.mutate(deleteConfirmTarget.id)}
              >
                {deleteProtocolMutation.isPending ? '处理中…' : '确认删除'}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-slate-700">
            确定将以下项目从<strong className="text-slate-900">知情管理列表</strong>中移除吗？
          </p>
          <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
            {deleteConfirmTarget.code
              ? `${deleteConfirmTarget.title || '（未命名）'}（${deleteConfirmTarget.code}）`
              : deleteConfirmTarget.title || `项目 #${deleteConfirmTarget.id}`}
          </p>
          {deleteProtocolError ? (
            <p className="mt-2 text-sm text-rose-600" role="alert">
              {deleteProtocolError}
            </p>
          ) : null}
        </Modal>
      )}

      {listDelistModal && (
        <Modal
          open
          onClose={() => {
            if (!listConsentLaunchMutation.isPending) setListDelistModal(null)
          }}
          title="下架知情发布"
          size="sm"
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button
                variant="ghost"
                disabled={listConsentLaunchMutation.isPending}
                onClick={() => setListDelistModal(null)}
              >
                取消
              </Button>
              <Button
                variant="primary"
                disabled={listConsentLaunchMutation.isPending}
                className="!bg-amber-700 hover:!bg-amber-800"
                onClick={() =>
                  listConsentLaunchMutation.mutate({ protocolId: listDelistModal.id, launched: false })
                }
              >
                {listConsentLaunchMutation.isPending ? '处理中…' : '确认下架'}
              </Button>
            </div>
          }
        >
          <p className="text-sm text-slate-700 leading-relaxed">
            下架后知情将对小程序侧不可见，可再次编辑配置。请在下一筛选日前，为<strong className="text-slate-900">该日对应的知情人员</strong>完成授权与核验测试（可通过下方「授权核验测试」发送邮件），通过后再发布。
          </p>
          <p className="mt-2 text-xs text-slate-500">
            项目：{listDelistModal.title || `项目 #${listDelistModal.id}`}
          </p>
        </Modal>
      )}

      {listVerifyTestModal && (
        <Modal
          open
          onClose={() => {
            if (!listVerifyTestAuthMutation.isPending) setListVerifyTestModal(null)
          }}
          title="授权核验测试"
          size="sm"
          footer={
            <div className="flex w-full justify-end gap-2">
              <Button variant="ghost" disabled={listVerifyTestAuthMutation.isPending} onClick={() => setListVerifyTestModal(null)}>
                取消
              </Button>
            </div>
          }
        >
          <p className="text-sm text-slate-700 mb-3">
            请从下方<strong className="text-slate-900">知情签署工作人员</strong>中选择一人，将<strong className="text-slate-900">自动</strong>
            向其发送双签授权邮件以完成人脸核验测试（与知情配置中「发送认证授权邮件」一致）。
          </p>
          {listVerifyTestIcfQuery.isLoading || listVerifyTestWitnessQuery.isLoading ? (
            <p className="text-sm text-slate-400">加载中…</p>
          ) : listVerifyTestIcfQuery.data?.length === 0 ? (
            <p className="text-sm text-amber-800">该协议尚无签署节点，请先上传知情。</p>
          ) : listVerifyTestSigningNames.length === 0 ? (
            <p className="text-sm text-amber-800">
              当前项目未配置「知情签署工作人员」。请先在知情配置或「计划」中配置项目级知情签署人员，或填写现场筛选日对应的签署人员后再试。
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {listVerifyTestSigningNames.map((name) => {
                  const w = listVerifyTestWitnessByName.get(name)
                  const firstIcf = (listVerifyTestIcfQuery.data ?? [])[0]
                  const statusLoading = listVerifyTestDualSignStatusQuery.isLoading
                  const sending =
                    listVerifyTestAuthMutation.isPending && listVerifyTestSendingWitnessId === w?.id
                  const actionLabel = listVerifyTestModalActionLabel({
                    sending,
                    hasWitness: !!w,
                    statusLoading,
                  })
                  const disabled = !firstIcf?.id || !w?.id || sending
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (!firstIcf?.id || !w?.id || sending) return
                          listVerifyTestAuthMutation.mutate({
                            protocolId: listVerifyTestModal.id,
                            witness_staff_id: w.id,
                            icf_version_id: firstIcf.id,
                          })
                        }}
                        className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-800 transition hover:border-primary-300 hover:bg-primary-50/40 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-900">{name}</div>
                          {w ? (
                            <div
                              className="mt-0.5 truncate text-xs text-slate-500"
                              title={(w.email || '').trim() || undefined}
                            >
                              {(w.email || '').trim() || '未登记邮箱'}
                            </div>
                          ) : (
                            <div className="mt-0.5 text-xs text-amber-700">未在双签档案中匹配，无邮箱</div>
                          )}
                        </div>
                        <span
                          className={
                            !w
                              ? 'shrink-0 self-center text-xs text-amber-700'
                              : 'shrink-0 self-center text-xs font-medium text-primary-600'
                          }
                        >
                          {actionLabel}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-3 text-xs text-slate-400">
                将使用首个签署节点「{(listVerifyTestIcfQuery.data ?? [])[0]?.node_title?.trim() || '主节点'}」发起授权。
              </p>
            </>
          )}
        </Modal>
      )}

      {createModalOpen && (
        <Modal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="新建项目"
          size="xl"
          footer={null}
        >
          <Tabs
            items={[
              { key: 'single', label: '单个新增' },
              { key: 'batch', label: '批量导入' },
            ]}
            activeKey={createTab}
            onChange={(key) => setCreateTab(key as 'single' | 'batch')}
          />
          {createTab === 'single' && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">项目编号 <span className="text-rose-500">*</span></label>
                <Input
                  placeholder="如 C26001001"
                  value={createCode}
                  onChange={(e) => {
                    setCreateCode(e.target.value)
                    setCreateProtocolError(null)
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">项目名称 <span className="text-rose-500">*</span></label>
                <Input
                  placeholder="请输入项目名称"
                  value={createTitle}
                  onChange={(e) => {
                    setCreateTitle(e.target.value)
                    setCreateProtocolError(null)
                  }}
                  className="w-full"
                />
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="block text-sm font-medium text-slate-600">知情配置人员</label>
                  {createConsentAssigneeId ? (
                    <button
                      type="button"
                      className="text-xs text-slate-500 hover:text-slate-800"
                      onClick={() => {
                        setCreateConsentAssigneeId('')
                        setCreateProtocolError(null)
                      }}
                    >
                      清除
                    </button>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 mb-1.5">
                  可选。来自治理台全局角色为 QA质量管理 的账号；每项目指定一人。
                </p>
                <SigningStaffInlineSelect
                  widthClass="w-full max-w-md"
                  placeholder="请选择知情配置人员"
                  value={createConsentAssigneeId}
                  onChange={(v) => {
                    setCreateConsentAssigneeId(v)
                    setCreateProtocolError(null)
                  }}
                  options={consentAssigneeOptionsVisible.map((a) => ({
                    value: String(a.id),
                    label: `${a.display_name}${a.email ? `（${a.email}）` : ''}`,
                  }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">知情签署工作人员</label>
                <p className="text-xs text-slate-500 mb-1.5">
                  可选，可多选。与「双签工作人员名单」一致；存储为顿号分隔姓名；新建后亦可于「计划」中维护。
                </p>
                {witnessStaffForModalsLoading ? (
                  <p className="text-xs text-slate-500 py-2">加载双签名单…</p>
                ) : null}
                <SigningStaffMultiCombobox
                  candidates={signingStaffAllowedNames}
                  value={createConsentSigningStaffNames}
                  onChange={(next) => {
                    setCreateConsentSigningStaffNames(next)
                    setCreateProtocolError(null)
                  }}
                  disabled={
                    witnessStaffForModalsLoading ||
                    (signingStaffAllowedNames.length === 0 && createConsentSigningStaffNames.length === 0)
                  }
                  className="w-full max-w-md"
                />
              </div>
              {/* 若顶部已选项目级知情签署工作人员，现场日可从该集合指定；否则与双签全量名单一致 */}
              <ScreeningScheduleEditor
                context="create_modal"
                value={createScreeningSchedule}
                onChange={setCreateScreeningSchedule}
                allowedSigningStaffNames={createModalRowSigningStaffNames}
              />
              {createProtocolError ? (
                <p className="text-sm text-rose-600 rounded-lg border border-rose-100 bg-rose-50/90 px-3 py-2" role="alert">
                  {createProtocolError}
                </p>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>取消</Button>
                <Button
                  variant="primary"
                  disabled={!createCode.trim() || !createTitle.trim() || createProtocol.isPending}
                  onClick={() =>
                    createProtocol.mutate({
                      title: createTitle.trim(),
                      code: createCode.trim(),
                      screening_schedule: createScreeningSchedule,
                      ...(createConsentAssigneeId.trim() && {
                        consent_config_account_id: Number(createConsentAssigneeId),
                      }),
                      ...(createConsentSigningStaffNames.length > 0 && {
                        consent_signing_staff_name: serializeSigningStaffNames(createConsentSigningStaffNames),
                      }),
                    })
                  }
                >
                  {createProtocol.isPending ? '创建中…' : '创建'}
                </Button>
              </div>
            </div>
          )}
          {createTab === 'batch' && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={downloadCreateTemplate}>
                  <Download className="w-4 h-4" />
                  下载模板
                </Button>
                <span className="text-xs text-slate-500">
                  支持 CSV、Excel；模板列为项目编号、项目名称及「现场筛选日1/预约人数1」等成对列（导入时若自行增加列「现场筛选计划」仍支持）
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">选择文件</label>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => setBatchFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
              </div>
              {batchResult && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-slate-700">成功创建 <strong>{batchResult.created}</strong> 条</p>
                  {batchResult.failed.length > 0 && (
                    <p className="mt-1 text-rose-600">失败 {batchResult.failed.length} 条：{batchResult.failed.slice(0, 3).map((f) => `第${f.row}行 ${f.error}`).join('；')}{batchResult.failed.length > 3 ? '…' : ''}</p>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>关闭</Button>
                <Button
                  variant="primary"
                  disabled={!batchFile || batchImporting}
                  onClick={handleBatchImport}
                >
                  {batchImporting ? '导入中…' : '导入'}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {screeningPlanProtocolId && (
        <Modal
          open
          placement="right"
          onClose={closeScreeningPlanModal}
          title="编辑现场计划与项目信息"
          size="xl"
          footer={null}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {screeningPlanSettingsLoading ? (
              <p className="text-sm text-slate-500 py-4 text-center">加载中…</p>
            ) : null}
            {screeningPlanSettingsRaw?.consent_launched ? (
              <p className="text-sm text-amber-900 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                知情已发布：<strong>现场筛选计划</strong>不可在此修改（需先在「签署节点」取消发布后再改）；仍可修改上方<strong>项目编号/名称</strong>并保存。
              </p>
            ) : null}
            {screeningPlanSaveSuccess ? (
              <p
                className="text-sm text-emerald-900 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2"
                role="status"
              >
                {screeningPlanSaveSuccess}
              </p>
            ) : null}
            {!screeningPlanSettingsLoading && screeningPlanSettingsRaw ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-3">
                  <p className="text-xs text-slate-600">
                    项目编号须全局唯一；与现场筛选计划可一并保存。
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">
                      项目编号 <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      placeholder="如 C26001001"
                      value={screeningPlanProjectCode}
                      onChange={(e) => {
                        setScreeningPlanProjectCode(e.target.value)
                        setScreeningPlanProjectError(null)
                        setScreeningPlanSaveSuccess(null)
                      }}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">
                      项目名称 <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      placeholder="请输入项目名称"
                      value={screeningPlanProjectTitle}
                      onChange={(e) => {
                        setScreeningPlanProjectTitle(e.target.value)
                        setScreeningPlanProjectError(null)
                        setScreeningPlanSaveSuccess(null)
                      }}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <label className="block text-sm font-medium text-slate-600">知情配置人员</label>
                      {screeningPlanConsentAssigneeId ? (
                        <button
                          type="button"
                          className="text-xs text-slate-500 hover:text-slate-800"
                          onClick={() => {
                            setScreeningPlanConsentAssigneeId('')
                            setScreeningPlanProjectError(null)
                            setScreeningPlanSaveSuccess(null)
                          }}
                        >
                          清除
                        </button>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500 mb-1.5">治理台 QA质量管理；每项目一人。</p>
                    <SigningStaffInlineSelect
                      widthClass="w-full max-w-md"
                      placeholder="请选择知情配置人员"
                      value={screeningPlanConsentAssigneeId}
                      onChange={(v) => {
                        setScreeningPlanConsentAssigneeId(v)
                        setScreeningPlanProjectError(null)
                        setScreeningPlanSaveSuccess(null)
                      }}
                      options={consentAssigneeOptionsVisible.map((a) => ({
                        value: String(a.id),
                        label: `${a.display_name}${a.email ? `（${a.email}）` : ''}`,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1.5">知情签署工作人员</label>
                    <p className="text-xs text-slate-500 mb-1.5">
                      可多选，与「双签工作人员名单」一致；可与下方各现场日分别指定。
                    </p>
                    {witnessStaffForModalsLoading ? (
                      <p className="text-xs text-slate-500 py-2">加载双签名单…</p>
                    ) : null}
                    <SigningStaffMultiCombobox
                      candidates={signingStaffAllowedNames}
                      value={screeningPlanConsentSigningStaffNames}
                      onChange={(next) => {
                        setScreeningPlanConsentSigningStaffNames(next)
                        setScreeningPlanProjectError(null)
                        setScreeningPlanSaveSuccess(null)
                      }}
                      disabled={
                        !!screeningPlanSettingsRaw.consent_launched ||
                        witnessStaffForModalsLoading ||
                        (signingStaffAllowedNames.length === 0 && screeningPlanConsentSigningStaffNames.length === 0)
                      }
                      className="w-full max-w-md"
                    />
                  </div>
                </div>
                <ScreeningScheduleEditor
                  context="screening_modal"
                  maxRows={SCREENING_SCHEDULE_MAX_ROWS}
                  value={screeningPlanLocal}
                  onChange={(next) => {
                    setScreeningPlanLocal(next)
                    setScreeningPlanSaveSuccess(null)
                  }}
                  disabled={!!screeningPlanSettingsRaw.consent_launched}
                  allowedSigningStaffNames={screeningModalRowSigningStaffNames}
                />
                {screeningPlanProjectError ? (
                  <p
                    className="text-sm text-rose-600 rounded-lg border border-rose-100 bg-rose-50/90 px-3 py-2"
                    role="alert"
                  >
                    {screeningPlanProjectError}
                  </p>
                ) : null}
              </>
            ) : null}
            </div>
            {!screeningPlanSettingsLoading && screeningPlanSettingsRaw ? (
              <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white pt-3">
                  <Button variant="ghost" onClick={closeScreeningPlanModal}>
                    取消
                  </Button>
                  <Button
                    variant="primary"
                    disabled={(() => {
                      const pending = screeningPlanSaveUiBusy || saveScreeningPlanMutation.isPending
                      const code = screeningPlanProjectCode.trim()
                      const title = screeningPlanProjectTitle.trim()
                      const init = screeningPlanProjectInitial
                      if (pending || !init || !code || !title) return true
                      const launched = !!screeningPlanSettingsRaw.consent_launched
                      const initAid = screeningPlanMergeSource?.consent_config_account_id ?? null
                      const wantAid = screeningPlanConsentAssigneeId.trim()
                        ? Number(screeningPlanConsentAssigneeId)
                        : 0
                      const wantResolved = Number.isFinite(wantAid) && wantAid > 0 ? wantAid : null
                      const assigneeChanged = wantResolved !== initAid
                      const titleChanged = code !== init.code.trim() || title !== init.title.trim()
                      if (launched) {
                        return !assigneeChanged && !titleChanged
                      }
                      return false
                    })()}
                    onClick={() => {
                      if (!screeningPlanSettingsRaw || !screeningPlanProtocolId || !screeningPlanProjectInitial) return
                      saveScreeningPlanMutation.mutate({
                        consent: screeningPlanSettingsRaw,
                        localSched: screeningPlanLocal,
                        pid: screeningPlanProtocolId,
                        projectCode: screeningPlanProjectCode,
                        projectTitle: screeningPlanProjectTitle,
                        initial: screeningPlanProjectInitial,
                        initialConsentAccountId: screeningPlanMergeSource?.consent_config_account_id,
                        consentAssigneeIdInput: screeningPlanConsentAssigneeId,
                        consentSigningStaffNames: screeningPlanConsentSigningStaffNames,
                        allowedWitnessSigningNames: signingStaffAllowedNames,
                      })
                    }}
                  >
                    {screeningPlanSaveUiBusy || saveScreeningPlanMutation.isPending ? '保存中…' : '保存'}
                  </Button>
              </div>
            ) : null}
          </div>
        </Modal>
      )}

      {protocolId && (
        <>
          <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-r from-indigo-50/90 to-white px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 shadow-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-indigo-600/90">当前项目</div>
            <div className="min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm font-semibold text-slate-900 tabular-nums" title="项目编号">
                {projectBannerCode || '—'}
              </span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden>
                |
              </span>
              <span className="text-sm text-slate-800 font-medium truncate max-w-[min(100%,48rem)]" title="项目名称">
                {projectBannerTitle || `项目 #${protocolId}`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-500">签署记录总数</div>
              <div className="mt-1 text-2xl font-semibold text-slate-800">{stats.total}</div>
            </div>
            <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
              <div className="text-sm font-medium text-rose-800/90">签署结果为否</div>
              <div className="mt-1 text-2xl font-semibold text-rose-700 tabular-nums">
                {stats.signed_result_no_count ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-500">退回重签数</div>
              <div className="mt-1 text-2xl font-semibold text-indigo-600 tabular-nums">
                {stats.returned_resign_row_count ?? 0}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-500">已签署受试者数</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-600">{stats.unique_subjects_signed ?? stats.signed_count}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-500">待签署</div>
              <div className="mt-1 text-2xl font-semibold text-amber-600">{stats.pending_count}</div>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onChange={(v) => setActiveTab(v as 'consents' | 'settings')}
            tabs={[
              { value: 'settings', label: '知情配置' },
              { value: 'consents', label: '签署记录' },
            ]}
          />

          {activeTab === 'settings' && (
            <div className="flex flex-col gap-4">
              <div ref={consentSettingsSaveBannerRef} className="scroll-mt-4">
                {consentSettingsSaveFeedback?.kind === 'success' ? (
                  <div
                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm"
                    role="status"
                    aria-live="polite"
                  >
                    {consentSettingsSaveFeedback.message}
                  </div>
                ) : consentSettingsSaveFeedback?.kind === 'error' ? (
                  <div
                    className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm"
                    role="alert"
                  >
                    {consentSettingsSaveFeedback.message}
                  </div>
                ) : null}
              </div>
              {/* 主体：三栏等宽（xl 各占约 1/3）；窄屏纵向堆叠 */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:items-stretch xl:min-h-0">
              {/* 左侧：签署节点列表 */}
              <aside className="order-2 xl:order-1 flex min-h-0 min-w-0 flex-col self-stretch overflow-hidden">
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm">
                  <div className="px-3 py-3.5 sm:px-4 sm:py-4 border-b border-slate-100 bg-slate-50/70 shrink-0">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-medium text-slate-700 shrink-0">签署节点</span>
                        {consentLaunched ? (
                          <Badge variant="success">已发布</Badge>
                        ) : (
                          <Badge variant="default">未发布</Badge>
                        )}
                        {!consentLaunched && (
                          <span
                            className="inline-flex text-slate-400 hover:text-slate-500 cursor-help shrink-0"
                            title="拖拽排序；点击节点切换右侧配置与预览；配置完成后点「发布」"
                          >
                            <HelpCircle className="w-3.5 h-3.5" aria-hidden />
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {consentLaunched ? (
                          <button
                            type="button"
                            onClick={() => launchMutation.mutate(false)}
                            disabled={launchMutation.isPending}
                            title="取消发布后可在本页修改配置"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            取消发布
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={openCreateIcf}
                              title="上传文件新建签署节点"
                              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              新建
                            </button>
                            <button
                              type="button"
                              aria-busy={launchMutation.isPending}
                              aria-disabled={consentPublishLaunchDisabled}
                              onClick={handlePublishConsentClick}
                              title={consentPublishLaunchTitle ?? '发布知情配置'}
                              className={`inline-flex items-center gap-1 rounded-md border border-emerald-600 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 ${
                                consentPublishLaunchDisabled ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            >
                              <Rocket className="w-3.5 h-3.5" />
                              发布
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-h-[12rem] xl:min-h-0 overflow-y-auto divide-y divide-slate-100">
                    {icfLoading ? (
                      <div className="px-3 py-4 text-center text-xs text-slate-400">加载中…</div>
                    ) : icfVersions.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-slate-400">暂无签署节点，请点击「新建签署节点」</div>
                    ) : (
                      icfVersions.map((icf, idx) => {
                        const sidebarIcfLabel = icf.node_title?.trim() || `v${icf.version}`
                        return (
                          <div
                            key={icf.id}
                            draggable={!consentLaunched}
                            onDragStart={handleIcfDragStart(idx)}
                            onDragOver={handleIcfDragOver(idx)}
                            onDrop={handleIcfDrop(idx)}
                            onDragEnd={handleIcfDragEnd}
                            className={`flex items-center gap-1.5 px-2.5 py-2 sm:px-3 ${
                              selectedConfigIcfId === icf.id ? 'bg-indigo-50/80 ring-1 ring-inset ring-indigo-100' : ''
                            } ${draggedIcfIndex === idx ? 'opacity-50' : ''} ${!consentLaunched ? 'cursor-grab active:cursor-grabbing' : ''}`}
                          >
                            {!consentLaunched && (
                              <div
                                className="shrink-0 p-1 text-slate-400 hover:text-slate-600 rounded cursor-grab active:cursor-grabbing"
                                title="拖拽调整顺序"
                              >
                                <GripVertical className="w-4 h-4" />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (icfJustDraggedRef.current) return
                                setSelectedConfigIcfId(icf.id)
                                requestAnimationFrame(() => {
                                  icfPreviewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                                })
                              }}
                              className={`min-w-0 flex-1 text-left py-1 text-sm flex items-center gap-2 rounded-md transition-colors ${
                                selectedConfigIcfId === icf.id
                                  ? 'text-indigo-700 font-medium'
                                  : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <TruncatedTooltipLabel
                                text={sidebarIcfLabel}
                                className="min-w-0 flex-1 truncate"
                              />
                              {icf.mini_sign_rules_saved ? (
                                <span
                                  className="shrink-0 ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800"
                                  title="该节点小程序签署规则已至少保存过一次"
                                >
                                  已保存
                                </span>
                              ) : (
                                <span
                                  className="shrink-0 ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200/80"
                                  title="尚未单独保存规则，当前展示协议级默认；保存后即独立存储"
                                >
                                  未保存
                                </span>
                              )}
                            </button>
                            {!consentLaunched && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDeleteIcfError(null)
                                  setDeleteIcfTarget(icf)
                                }}
                                className="shrink-0 rounded p-1.5 text-red-500 hover:bg-red-50"
                                title="删除节点"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </aside>

              {/* 中间：配置表单 */}
              <div className="order-1 min-w-0 flex flex-col gap-4 xl:order-2">
                <div className="space-y-4">
              {consentLaunched && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  已发布，配置已锁定。如需修改请先取消发布（左侧签署节点区域或「签署节点」标签页）。
                </div>
              )}
              <div className={`rounded-xl border border-slate-200 bg-white p-4 ${consentLaunched ? 'opacity-75 pointer-events-none' : ''}`}>
                <h3 className="text-sm font-semibold text-slate-800 mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                    小程序签署规则
                  </span>
                  {!consentLaunched && (
                    <button
                      type="button"
                      onClick={() => setReuseMiniModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 shrink-0"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      复用规则
                    </button>
                  )}
                </h3>
                <div className="space-y-3">
                  <FaceVerifySigningLockedControl
                    formInteractionDisabled={consentLaunched}
                    onRequestExplain={() => setFaceVerifyComingSoonOpen(true)}
                  />
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsDraft.require_dual_sign}
                      onChange={(e) => setSettingsDraft((prev) => ({ ...prev, require_dual_sign: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    启用工作人员见证双签
                  </label>
                </div>

                {settingsDraft.require_dual_sign && (
                  <div className="relative mt-3 overflow-visible rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-4 space-y-3 shadow-sm">
                    <fieldset
                      className="min-w-0 max-w-full space-y-3 overflow-visible rounded-lg border border-slate-200 bg-white/80 p-3"
                      disabled={consentLaunched || witnessStaffPickerQuery.isLoading}
                    >
                      {witnessStaffPickerQuery.isLoading ? (
                        <p className="text-xs text-slate-500">加载名单…</p>
                      ) : witnessPickerRows.length === 0 && projectSigningStaffEmailRows.length > 0 ? (
                        <p className="text-xs text-amber-700">
                          双签工作人员档案中暂无可匹配记录；请先在「双签工作人员名单」建档后，项目配置的姓名方可参与发信与核验。
                        </p>
                      ) : projectSigningStaffEmailRows.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          请先在<strong className="text-slate-700">知情管理列表 · 筛选</strong>
                          中配置项目级知情签署工作人员，再使用发信与核验。
                        </p>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-[11px] font-medium text-rose-600">知情签署工作人员</p>
                            {dualSignStaffStatusQuery.isFetching ? (
                              <span className="text-[10px] text-slate-400">同步核验阶段…</span>
                            ) : null}
                          </div>
                          {dualSignStaffStatusQuery.isError ? (
                            <p className="text-[10px] text-amber-700">
                              核验阶段暂无法同步（可稍后刷新页面）；发信与保存不受影响。
                            </p>
                          ) : null}
                          <div className="overflow-x-auto rounded-lg border border-slate-100 bg-white">
                            <table className="w-full min-w-[20rem] border-collapse text-left text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/95 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                  <th className="px-3 py-2 font-medium">姓名</th>
                                  <th className="px-3 py-2 font-medium">邮箱</th>
                                  <th className="px-3 py-2 font-medium min-w-[7rem]">状态</th>
                                </tr>
                              </thead>
                              <tbody>
                                {projectSigningStaffEmailRows.map((row, index) => {
                                  const w = witnessPickerRows.find(
                                    (x) => (x.name || '').trim() === row.name.trim(),
                                  )
                                  const staffId = w?.id
                                  const segments = parseDualSignNotifyEmailSegments(dualSignNotifyEmail)
                                  const ni = projectSigningNameListForNotify.findIndex(
                                    (n) => n === (w?.name || row.name || '').trim(),
                                  )
                                  const segIdx = ni >= 0 ? ni : 0
                                  const notifyEff = effectiveDualSignNotifyForIndex(
                                    segments,
                                    segIdx,
                                    w?.email || row.email || '',
                                  ).trim()
                                  const displayEmail =
                                    notifyEff || (row.email || '').trim() || (w?.email || '').trim() || '—'

                                  if (staffId == null) {
                                    return (
                                      <tr
                                        key={`${row.name}-${index}`}
                                        className="border-b border-slate-100 last:border-b-0 align-top"
                                      >
                                        <td className="px-3 py-2.5 font-medium text-slate-900">{row.name}</td>
                                        <td className="px-3 py-2.5 font-mono text-xs text-slate-600 break-all">
                                          {displayEmail}
                                        </td>
                                        <td className="px-3 py-2.5">
                                          <span
                                            className="inline-flex rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
                                            title="该姓名未在双签工作人员档案中匹配"
                                          >
                                            未建档
                                          </span>
                                        </td>
                                      </tr>
                                    )
                                  }

                                  const rawFace = dualSignStatusByStaffId.get(staffId)
                                  const rawSig = dualSignSigAuthByStaffId.get(staffId)
                                  const face: DualSignStaffVerificationStatus | 'unknown' =
                                    rawFace ??
                                    (dualSignStaffStatusQuery.isPending ? 'unknown' : 'pending_email')
                                  const sig: WitnessSignatureAuthStatus | 'unknown' =
                                    rawSig ?? (dualSignStaffStatusQuery.isPending ? 'unknown' : 'none')
                                  const hasSignatureOnFile = !!(w && (w.signature_file || '').trim())
                                  const testReady = isDualSignTestScanReadyForStaffName(
                                    loadedSettings as ConsentSettings,
                                    protocolTestSigningCompleted,
                                    (w?.name || row.name || '').trim(),
                                  )
                                  const rollup = computeDualSignRowRollup({
                                    hasSignatureOnFile,
                                    face,
                                    sig,
                                    protocolTestSigningCompleted,
                                    testScanReadyForThisStaff: testReady,
                                  })

                                  return (
                                    <tr
                                      key={`staff-${staffId}`}
                                      className="border-b border-slate-100 last:border-b-0 align-top"
                                    >
                                      <td className="px-3 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                                        {(w?.name || row.name || '').trim() || '—'}
                                      </td>
                                      <td
                                        className="px-3 py-2.5 font-mono text-xs text-slate-600 max-w-[14rem] break-all"
                                        title={displayEmail}
                                      >
                                        {displayEmail}
                                      </td>
                                      <td className="px-3 py-2.5">
                                        <span
                                          className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-snug ${rollup.statusClass}`}
                                          title={rollup.statusTitle}
                                        >
                                          {rollup.statusLabel}
                                        </span>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </fieldset>
                    {selectedPickerWitnesses.length > 0 &&
                    selectedPickerWitnesses.some((w) => !w.email?.trim()) ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          统一通知邮箱（有人未填工作邮箱时必填，否则无法发送）
                        </label>
                        <textarea
                          value={dualSignNotifyEmail}
                          onChange={(e) => setDualSignNotifyEmail(e.target.value)}
                          disabled={consentLaunched}
                          rows={
                            projectSigningStaffEmailRows.length > 1
                              ? Math.min(5, Math.max(2, projectSigningStaffEmailRows.length))
                              : 2
                          }
                          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-800 placeholder:text-slate-400 placeholder:font-sans disabled:opacity-50"
                          placeholder="与已选顺序对应时可用逗号分隔多个邮箱"
                        />
                      </div>
                    ) : null}
                    <div className="space-y-1 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="primary"
                          size="md"
                          disabled={!canSubmitDualSignAuth || dualSignAuthMutation.isPending}
                          onClick={() => {
                            if (!canSubmitDualSignAuth || witnessAuthIcfVersionId == null) return
                            dualSignAuthMutation.reset()
                            const segments = parseDualSignNotifyEmailSegments(dualSignNotifyEmail)
                            void (async () => {
                              try {
                                for (let i = 0; i < projectSigningStaffWitnessIds.length; i++) {
                                  const staffId = projectSigningStaffWitnessIds[i]
                                  const w = witnessPickerRows.find((x) => x.id === staffId)
                                  const ni = projectSigningNameListForNotify.findIndex((n) => n === (w?.name || '').trim())
                                  const segIdx = ni >= 0 ? ni : 0
                                  const eff = effectiveDualSignNotifyForIndex(segments, segIdx, w?.email || '')
                                  await dualSignAuthMutation.mutateAsync({
                                    witness_staff_id: staffId,
                                    icf_version_id: witnessAuthIcfVersionId,
                                    notify_email: eff.trim() || undefined,
                                  })
                                }
                              } catch {
                                /* 失败由 mutateAsync + isError 展示，避免控制台 Uncaught */
                              }
                            })()
                          }}
                        >
                          {dualSignAuthButtonLabel}
                        </Button>
                        {dualSignAuthMutation.isError ? (
                          <span className="text-xs text-rose-600">
                            {getMutationErrorMessage(dualSignAuthMutation.error, '发送失败')}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-700 cursor-pointer sm:flex-initial">
                    <input
                      type="checkbox"
                      checked={settingsDraft.enable_min_reading_duration !== false}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({ ...prev, enable_min_reading_duration: e.target.checked }))
                      }
                      disabled={consentLaunched}
                      className="w-4 h-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    <span>启用小程序内阅读最短时长（秒）</span>
                  </label>
                  <MinReadingSecondsField
                    ref={consentMinReadingFieldRef}
                    value={settingsDraft.min_reading_duration_seconds}
                    disabled={consentLaunched || settingsDraft.enable_min_reading_duration === false}
                    onCommit={(n) =>
                      setSettingsDraft((prev) => ({ ...prev, min_reading_duration_seconds: n }))
                    }
                    className="w-[7.5rem] shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <span>需采集的受试者信息</span>
                    <ConsentHelpIcon text="勾选后小程序将收集对应字段" ariaLabel="需采集的受试者信息说明" />
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!settingsDraft.collect_id_card}
                        onChange={(e) => setSettingsDraft((prev) => ({ ...prev, collect_id_card: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      身份证号
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!settingsDraft.collect_screening_number}
                        onChange={(e) => setSettingsDraft((prev) => ({ ...prev, collect_screening_number: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      筛选编号（如 SC001）
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!settingsDraft.collect_initials}
                        onChange={(e) => setSettingsDraft((prev) => ({ ...prev, collect_initials: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      姓名首字母缩写
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!settingsDraft.collect_subject_name}
                        onChange={(e) => setSettingsDraft((prev) => ({ ...prev, collect_subject_name: e.target.checked }))}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      姓名
                    </label>
                  </div>
                </div>

                  {/* 勾选框：签署预览切换；选「勾选框识别」时自动解析条数并在右侧插入示意 */}
                  <div className="mt-2 pt-4 border-t border-slate-100 space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm font-normal text-slate-700">
                      <label className="inline-flex flex-wrap items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!settingsDraft.enable_checkbox_recognition}
                          onChange={(e) =>
                            setSettingsDraft((prev) => ({ ...prev, enable_checkbox_recognition: e.target.checked }))
                          }
                          disabled={consentLaunched}
                          className="w-4 h-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                        />
                        <span>启用勾选框识别</span>
                      </label>
                      <ConsentHelpIcon
                        text="在右侧预览中按文档顺序展示「请勾选」与是/否示意（仅本页配置用）。条数依据当前节点 .docx 附件或已保存正文解析；切换到「勾选框识别」时自动识别。"
                        ariaLabel="勾选框识别说明"
                      />
                    </div>
                    {showIcfPreviewModeToggle && settingsDraft.enable_checkbox_recognition ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-600 shrink-0">签署预览</span>
                          <div
                            className="inline-flex rounded-lg border border-slate-200 bg-slate-100/90 p-0.5 text-[11px] font-medium"
                            role="group"
                            aria-label="签署预览模式"
                          >
                            <button
                              type="button"
                              className={`rounded-md px-2.5 py-1 transition-colors ${
                                icfPreviewViewMode === 'original'
                                  ? 'bg-white text-slate-900 shadow-sm'
                                  : 'text-slate-600 hover:text-slate-800'
                              }`}
                              onClick={() => setIcfPreviewViewMode('original')}
                            >
                              原始文件
                            </button>
                            <button
                              type="button"
                              disabled={icfCheckboxDetecting}
                              className={`rounded-md px-2.5 py-1 transition-colors disabled:opacity-60 ${
                                icfPreviewViewMode === 'checkbox'
                                  ? 'bg-white text-slate-900 shadow-sm'
                                  : 'text-slate-600 hover:text-slate-800'
                              }`}
                              onClick={() => setIcfPreviewViewMode('checkbox')}
                            >
                              勾选框识别
                            </button>
                          </div>
                        </div>
                        {icfPreviewViewMode === 'checkbox' ? (
                          <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 to-white px-4 py-3 shadow-sm space-y-2">
                            {icfCheckboxDetecting ? (
                              <p className="text-sm font-medium text-indigo-800">正在识别附件与正文…</p>
                            ) : (
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                <span className="text-xs font-medium text-slate-600 shrink-0">
                                  匹配红色「请勾选」示意（与右侧预览一致）
                                </span>
                                <span className="text-3xl font-bold tabular-nums leading-none text-indigo-700 tracking-tight">
                                  {displayedCheckboxMatchCount == null ? '—' : displayedCheckboxMatchCount}
                                </span>
                                <span className="text-sm font-semibold text-slate-700">处</span>
                              </div>
                            )}
                            <div className="pt-2 border-t border-indigo-100/90 space-y-2">
                              <p className="text-xs font-medium text-slate-800">补充说明类采集（小程序签署页）</p>
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                为每条采集项填写展示标题（如与文档表述一致）。保存配置后，右侧勾选预览会在正文末尾按项追加与文档一致的「请勾选」示意行。
                              </p>
                              {(settingsDraft.supplemental_collect_labels ?? []).map((label, idx) => (
                                <div key={`sup-${idx}`} className="flex flex-wrap items-center gap-2">
                                  <input
                                    type="text"
                                    value={label}
                                    disabled={consentLaunched}
                                    onChange={(e) => {
                                      const next = [...(settingsDraft.supplemental_collect_labels || [])]
                                      next[idx] = e.target.value
                                      const has = next.map((x) => x.trim()).filter(Boolean).length > 0
                                      setSettingsDraft((prev) => ({
                                        ...prev,
                                        supplemental_collect_labels: next,
                                        collect_other_information: has,
                                      }))
                                    }}
                                    className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 disabled:opacity-50"
                                    placeholder="采集项标题，如：其他补充说明"
                                    maxLength={120}
                                  />
                                  <button
                                    type="button"
                                    disabled={consentLaunched}
                                    className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                                    onClick={() => {
                                      const next = [...(settingsDraft.supplemental_collect_labels || [])]
                                      next.splice(idx, 1)
                                      const has = next.map((x) => x.trim()).filter(Boolean).length > 0
                                      setSettingsDraft((prev) => ({
                                        ...prev,
                                        supplemental_collect_labels: next,
                                        collect_other_information: has,
                                      }))
                                    }}
                                  >
                                    删除
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                disabled={consentLaunched || (settingsDraft.supplemental_collect_labels || []).length >= 20}
                                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                                onClick={() =>
                                  setSettingsDraft((prev) => ({
                                    ...prev,
                                    supplemental_collect_labels: [...(prev.supplemental_collect_labels || []), ''],
                                  }))
                                }
                              >
                                <Plus className="w-3.5 h-3.5" aria-hidden />
                                添加采集项
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!settingsDraft.enable_staff_signature}
                        disabled={consentLaunched}
                        onChange={(e) =>
                          setSettingsDraft((prev) => ({ ...prev, enable_staff_signature: e.target.checked }))
                        }
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      启用工作人员签名
                    </label>
                    {settingsDraft.enable_staff_signature ? (
                      <ConsentInlineSelect
                        options={CONSENT_SIGNATURE_TIMES_OPTIONS}
                        value={(settingsDraft.staff_signature_times ?? 1) as 1 | 2}
                        disabled={consentLaunched}
                        onChange={(v) => setSettingsDraft((prev) => ({ ...prev, staff_signature_times: v }))}
                      />
                    ) : null}
                  </div>
                  {settingsDraft.enable_staff_signature ? (
                    <p className="text-[11px] text-slate-500 leading-snug pl-1 max-w-2xl">
                      正文 HTML 中可插入工作人员手写签名占位符：
                      <code className="text-indigo-700">{'{{ICF_STAFF_SIG_1}}'}</code>
                      {settingsDraft.staff_signature_times === 2 ? (
                        <>
                          、<code className="text-indigo-700">{'{{ICF_STAFF_SIG_2}}'}</code>
                        </>
                      ) : null}
                      。右侧开启「编辑正文 HTML」后，插入按钮与预览会随此处次数变化。
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!settingsDraft.enable_subject_signature}
                        disabled={consentLaunched}
                        onChange={(e) =>
                          setSettingsDraft((prev) => ({ ...prev, enable_subject_signature: e.target.checked }))
                        }
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      启用受试者签名
                    </label>
                    {settingsDraft.enable_subject_signature ? (
                      <ConsentInlineSelect
                        options={CONSENT_SIGNATURE_TIMES_OPTIONS}
                        value={(settingsDraft.subject_signature_times ?? 1) as 1 | 2}
                        disabled={consentLaunched}
                        onChange={(v) => setSettingsDraft((prev) => ({ ...prev, subject_signature_times: v }))}
                      />
                    ) : null}
                  </div>
                  {settingsDraft.enable_subject_signature ? (
                    <p className="text-[11px] text-slate-500 leading-snug pl-1 max-w-2xl">
                      文书 Word/HTML 中可在任意位置插入占位符（与前后措辞无关）：
                      <code className="text-indigo-700">{'{{ICF_SUBJECT_SIG_1}}'}</code>
                      {settingsDraft.subject_signature_times === 2 ? (
                        <>
                          、<code className="text-indigo-700">{'{{ICF_SUBJECT_SIG_2}}'}</code>
                        </>
                      ) : null}
                      用于嵌入手写签名；签署日可用
                      <code className="text-indigo-700">{'{{ICF_SIGNED_DATE}}'}</code>
                      （与「自动签署日期」等配置一致）。右侧预览将示意虚线签名框，签署后小程序/H5/审核弹窗将替换为实际影像。
                      <span className="block mt-1">
                        推荐：点击右侧「签署文件预览」中的<strong className="font-medium text-slate-700">「编辑正文 HTML」</strong>
                        ，先查看<strong className="font-medium text-slate-700">正文预览</strong>再于源码中定位插入，无需在 Word 源文件中修改。
                      </span>
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!settingsDraft.enable_guardian_signature}
                        disabled={consentLaunched}
                        onChange={(e) =>
                          setSettingsDraft((prev) => ({ ...prev, enable_guardian_signature: e.target.checked }))
                        }
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                      />
                      启用受试者监护人签名
                    </label>
                    {settingsDraft.enable_guardian_signature ? (
                      <>
                        <ConsentInlineSelect
                          options={CONSENT_GUARDIAN_PARENT_OPTIONS}
                          value={(settingsDraft.guardian_parent_count ?? 1) as 1 | 2}
                          disabled={consentLaunched}
                          onChange={(v) => setSettingsDraft((prev) => ({ ...prev, guardian_parent_count: v }))}
                          widthClass="w-[9.5rem] shrink-0"
                        />
                        <ConsentInlineSelect
                          options={CONSENT_GUARDIAN_EACH_TIMES_OPTIONS}
                          value={(settingsDraft.guardian_signature_times ?? 1) as 1 | 2}
                          disabled={consentLaunched}
                          onChange={(v) => setSettingsDraft((prev) => ({ ...prev, guardian_signature_times: v }))}
                        />
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!settingsDraft.enable_auto_sign_date}
                      disabled={consentLaunched}
                      onChange={(e) =>
                        setSettingsDraft((prev) => ({ ...prev, enable_auto_sign_date: e.target.checked }))
                      }
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    启用自动签署日期
                  </label>
                  <p className="text-xs text-slate-500 pl-6 -mt-1">
                    开启后，受试者签署完成时记录为<strong className="text-slate-700">签署当日</strong>日期（格式 YYYY-MM-DD）。
                  </p>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settingsDraft.require_comprehension_quiz}
                      onChange={(e) => setSettingsDraft((prev) => ({ ...prev, require_comprehension_quiz: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                    />
                    启用知情测验
                  </label>
                  {settingsDraft.require_comprehension_quiz && (
                    <div className="pl-6">
                      <button
                        type="button"
                        onClick={() => setComprehensionQuizComingSoonOpen(true)}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 underline-offset-2 hover:underline disabled:opacity-50"
                        disabled={consentLaunched}
                      >
                        去配置知情测验
                      </button>
                    </div>
                  )}
                </div>

              {!consentLaunched && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => saveSettings.mutate()}
                  disabled={settingsSaveUiBusy || saveSettings.isPending || selectedConfigIcfId == null}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {settingsSaveUiBusy || saveSettings.isPending ? '保存中…' : '保存配置'}
                </button>
              </div>
              )}
                </div>
              </div>
              </div>

              {/* 右侧：签署文件预览（与左侧选中节点联动；与中栏、左栏等宽） */}
              <aside
                ref={icfPreviewPanelRef}
                className="order-3 min-w-0 flex w-full flex-col min-h-0 self-stretch xl:sticky xl:top-4 xl:max-h-[min(calc(100vh-5rem),calc(100dvh-5rem))]"
              >
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col flex-1 min-h-0 shadow-sm h-full">
                  <div className="px-3 py-2.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white shrink-0 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-800">签署文件预览</div>
                      {selectedConfigIcf ? (
                        <p
                          className="text-xs text-slate-500 mt-0.5 line-clamp-2 xl:line-clamp-none"
                          title={selectedConfigIcf.node_title?.trim() || `v${selectedConfigIcf.version}`}
                        >
                          {selectedConfigIcf.node_title?.trim() || `v${selectedConfigIcf.version}`}
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-0.5">请先在左侧选择签署节点</p>
                      )}
                    </div>
                    {selectedConfigIcf && protocolId ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (icfContentHtmlEditorOpen) {
                            setIcfContentHtmlEditorOpen(false)
                          } else {
                            setIcfContentHtmlDraft(selectedConfigIcf.content ?? '')
                            setIcfContentHtmlEditorOpen(true)
                          }
                        }}
                        disabled={consentLaunched}
                        title={
                          consentLaunched
                            ? '已发布，请先取消发布后再编辑正文 HTML'
                            : icfContentHtmlEditorOpen
                              ? '收起正文编辑区（未保存的修改将保留在输入框直至刷新或切换节点）'
                              : '先预览正文效果，再在下方 HTML 中定位并插入占位符'
                        }
                        className="shrink-0 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {icfContentHtmlEditorOpen ? '收起编辑' : '编辑正文 HTML'}
                      </button>
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col min-h-0 overflow-hidden p-3 sm:p-4 bg-slate-50/60">
                    {selectedConfigIcf ? (
                      icfContentHtmlEditorOpen && protocolId ? (
                        <div className="flex min-h-[min(52vh,520px)] flex-1 flex-col">
                          <IcfContentHtmlEditorPanel
                            protocolId={protocolId}
                            icfId={selectedConfigIcf.id}
                            nodeTitle={selectedConfigIcf.node_title?.trim() || ''}
                            initialSavedContent={selectedConfigIcf.content ?? ''}
                            value={icfContentHtmlDraft}
                            onChange={setIcfContentHtmlDraft}
                            disabled={consentLaunched}
                            insertTokens={buildIcfHtmlPrimaryInsertTokens({
                              enable_subject_signature: !!settingsDraft.enable_subject_signature,
                              subject_signature_times: (settingsDraft.subject_signature_times ?? 1) as 1 | 2,
                              enable_staff_signature: !!settingsDraft.enable_staff_signature,
                              staff_signature_times: (settingsDraft.staff_signature_times ?? 1) as 1 | 2,
                            })}
                            onCancel={() => setIcfContentHtmlEditorOpen(false)}
                            onSaved={() => setIcfContentHtmlEditorOpen(false)}
                            anchoredPreviewHtml={icfContentHtmlDraft.trim() ? icfEditorAnchoredPreviewHtml : undefined}
                            onHydrateFromPreview={!icfContentHtmlDraft.trim() ? hydrateIcfEditorFromPreview : undefined}
                            hydratingFromPreview={icfEditorHydratingFromPreview}
                            externalPreview={
                              !icfContentHtmlDraft.trim() && selectedConfigIcf.file_path ? (
                                <IcfUploadFilePreview
                                  protocolId={protocolId}
                                  icf={selectedConfigIcf}
                                  protocolCode={projectBannerCode}
                                  protocolTitle={projectBannerTitle}
                                  previewViewMode={icfPreviewViewMode}
                                  supplementalCollectLabels={settingsDraft.supplemental_collect_labels}
                                  collectOtherInformation={!!settingsDraft.collect_other_information}
                                  subjectSignatureTimes={
                                    settingsDraft.enable_subject_signature === false
                                      ? 0
                                      : settingsDraft.subject_signature_times === 2
                                        ? 2
                                        : 1
                                  }
                                  staffSignatureTimes={
                                    settingsDraft.enable_staff_signature === false
                                      ? 0
                                      : settingsDraft.staff_signature_times === 2
                                        ? 2
                                        : 1
                                  }
                                />
                              ) : undefined
                            }
                          />
                        </div>
                      ) : selectedConfigIcf.content ? (
                        <div className="min-h-0 flex-1 overflow-auto">
                            <div
                              key={icfPreviewViewMode}
                              className="consent-icf-preview prose prose-sm sm:prose-base prose-slate max-w-none text-slate-800 leading-relaxed
                            [&_h1]:text-base sm:[&_h1]:text-lg [&_h2]:text-sm sm:[&_h2]:text-base [&_p]:text-sm sm:[&_p]:text-[15px] [&_li]:text-sm sm:[&_li]:text-[15px]
                            [&_table]:text-xs sm:[&_table]:text-sm [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:border-slate-200 [&_td]:border-slate-200 [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1
                            [&_p]:has(.icf-cb-item-row):!my-0 [&_p]:has(.icf-cb-item-row):!py-0
                            [&_td]:align-top [&_td:has(.icf-cb-item-row)]:!py-1 [&_td:has(.icf-cb-item-row)]:align-top
                            [&_.icf-cb-item-row]:!block [&_.icf-cb-item-row]:!w-full [&_.icf-cb-item-row]:!max-w-full [&_.icf-cb-item-row]:!box-border [&_.icf-cb-item-row]:!m-0 [&_.icf-cb-item-row]:!py-2.5 [&_.icf-cb-item-row]:!leading-normal
                            [&_.icf-cb-preview]:not-prose [&_.icf-cb-preview]:text-[15px]"
                              dangerouslySetInnerHTML={{ __html: icfSettingsPreviewHtml }}
                            />
                        </div>
                      ) : selectedConfigIcf.file_path && protocolId ? (
                        <div className="flex min-h-0 flex-1 flex-col">
                          <IcfUploadFilePreview
                            protocolId={protocolId}
                            icf={selectedConfigIcf}
                            protocolCode={projectBannerCode}
                            protocolTitle={projectBannerTitle}
                            previewViewMode={icfPreviewViewMode}
                            supplementalCollectLabels={settingsDraft.supplemental_collect_labels}
                            collectOtherInformation={!!settingsDraft.collect_other_information}
                            subjectSignatureTimes={
                              settingsDraft.enable_subject_signature === false
                                ? 0
                                : settingsDraft.subject_signature_times === 2
                                  ? 2
                                  : 1
                            }
                            staffSignatureTimes={
                              settingsDraft.enable_staff_signature === false
                                ? 0
                                : settingsDraft.staff_signature_times === 2
                                  ? 2
                                  : 1
                            }
                          />
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">暂无正文，可在「签署节点」上传或编辑文档。</p>
                      )
                    ) : (
                      <p className="text-sm text-slate-400">在左侧列表中点击节点，此处展示对应文档预览。</p>
                    )}
                  </div>
                </div>
              </aside>
              </div>
            </div>
          )}

              {reuseMiniModalOpen && (
                <Modal
                  open
                  onClose={() => setReuseMiniModalOpen(false)}
                  title="复用已保存的签署规则"
                  size="sm"
                  footer={
                    <div className="flex w-full justify-end">
                      <Button variant="secondary" onClick={() => setReuseMiniModalOpen(false)}>
                        关闭
                      </Button>
                    </div>
                  }
                >
                  <p className="text-sm text-slate-600 mb-3">
                    选择来源节点（须已完整保存过至少一次）。规则将载入<strong>当前选中节点</strong>的编辑区，可按需修改后再点「保存配置」。
                  </p>
                  {icfVersions.filter((x) => x.mini_sign_rules_saved && x.id !== selectedConfigIcfId).length === 0 ? (
                    <p className="text-sm text-slate-500">暂无其他已保存规则的节点，请先在其他节点保存配置。</p>
                  ) : (
                    <ul className="space-y-1.5 max-h-[min(50vh,320px)] overflow-y-auto">
                      {icfVersions
                        .filter((x) => x.mini_sign_rules_saved && x.id !== selectedConfigIcfId)
                        .map((icf) => (
                          <li key={icf.id}>
                            <button
                              type="button"
                              className="w-full text-left rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800 hover:bg-indigo-50/80 hover:border-indigo-200"
                              onClick={() => {
                                const mini = deriveMiniDraftFromIcf(icf, loadedSettings as ConsentSettings)
                                setSettingsDraft((prev) => ({
                                  ...prev,
                                  ...mini,
                                  screening_schedule: prev.screening_schedule,
                                  planned_screening_dates: prev.planned_screening_dates,
                                }))
                                setReuseMiniModalOpen(false)
                              }}
                            >
                              {icf.node_title?.trim() || `v${icf.version}`}
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </Modal>
              )}

          {activeTab === 'consents' && (
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setConsentStatus(opt.value)}
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                          consentStatus === opt.value
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 shrink-0">日期</span>
                    <input
                      type="date"
                      value={consentDateFrom}
                      onChange={(e) => setConsentDateFrom(e.target.value)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <span className="text-slate-400">—</span>
                    <input
                      type="date"
                      value={consentDateTo}
                      onChange={(e) => setConsentDateTo(e.target.value)}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const t = new Date()
                        const s = formatLocalDateYmd(t)
                        setConsentDateFrom(s)
                        setConsentDateTo(s)
                        setConsentTablePage(1)
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      当日
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const t = new Date()
                        t.setDate(t.getDate() - 1)
                        const s = formatLocalDateYmd(t)
                        setConsentDateFrom(s)
                        setConsentDateTo(s)
                        setConsentTablePage(1)
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      昨日
                    </button>
                    <div className="relative flex-1 min-w-[22rem] max-w-2xl">
                      <Search
                        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                        aria-hidden
                      />
                      <Input
                        type="search"
                        value={consentSearchInput}
                        onChange={(e) => setConsentSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const v = consentSearchInput.trim()
                            setConsentSearchDebounced(v)
                          }
                        }}
                        placeholder="搜索查询"
                        className="h-9 pl-8 text-sm"
                        aria-label="搜索签署记录"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openBatchDeleteConsents}
                    disabled={softDeleteConsentMutation.isPending || consentSelectedIds.size === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    title={consentSelectedIds.size > 0 ? `删除已勾选 ${consentSelectedIds.size} 条` : '请先勾选数据'}
                  >
                    <Trash2 className="w-4 h-4" />
                    批量删除
                  </button>
                  <button
                    type="button"
                    onClick={handleExportSubjects}
                    disabled={exportingSubjects}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {exportingSubjects ? '导出中…' : '导出受试者信息'}
                  </button>
                  <button
                    type="button"
                    onClick={handleExportSigningPdfs}
                    disabled={exportingPdfs}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    {exportingPdfs ? '导出中…' : '导出签署文件'}
                  </button>
                </div>
              </div>
              {consentsLoading ? (
                <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
              ) : consentListTotal === 0 ? (
                <div className="p-6">
                  <Empty message="暂无签署记录" />
                </div>
              ) : (
                <div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80">
                        <th className="w-12 py-3 pl-4 pr-2 align-middle text-left">
                          <input
                            ref={consentHeaderCheckboxRef}
                            type="checkbox"
                            className="rounded border-slate-300"
                            checked={
                              consentIdsFlatOnPage.length > 0 &&
                              consentIdsFlatOnPage.every((id) => consentSelectedIds.has(id))
                            }
                            onChange={toggleConsentSelectAllPage}
                            title="全选本页"
                          />
                        </th>
                        <th className="text-left py-3 px-2 font-medium text-slate-600 align-middle w-12">序号</th>
                        <ConsentSortTh
                          label="姓名"
                          field="subject_name"
                          activeField={consentSortField}
                          order={consentSortOrder}
                          onSort={handleConsentSort}
                        />
                        <ConsentSortTh
                          label="SC号"
                          field="sc_number"
                          activeField={consentSortField}
                          order={consentSortOrder}
                          onSort={handleConsentSort}
                        />
                        <th className="text-left py-3 px-4 font-medium text-slate-600 align-middle">手机号</th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 align-middle min-w-[14rem]">身份证号</th>
                        <ConsentSortTh
                          label="拼音首字母"
                          field="name_pinyin_initials"
                          activeField={consentSortField}
                          order={consentSortOrder}
                          onSort={handleConsentSort}
                        />
                        <ConsentSortTh
                          label="签署结果"
                          field="signing_result"
                          activeField={consentSortField}
                          order={consentSortOrder}
                          onSort={handleConsentSort}
                        />
                        <ConsentSortTh
                          label="数据类型"
                          field="signing_type"
                          activeField={consentSortField}
                          order={consentSortOrder}
                          onSort={handleConsentSort}
                        />
                        <ConsentSortTh
                          label="签署状态"
                          field="consent_status"
                          activeField={consentSortField}
                          order={consentSortOrder}
                          onSort={handleConsentSort}
                        />
                        <ConsentSortTh
                          label="认证时间"
                          field="auth_verified_at"
                          activeField={consentSortField}
                          order={consentSortOrder}
                          onSort={handleConsentSort}
                        />
                        <ConsentSortTh
                          label="签署时间"
                          field="signed_at"
                          activeField={consentSortField}
                          order={consentSortOrder}
                          onSort={handleConsentSort}
                        />
                        <ConsentSortTh
                          label="回执号"
                          field="receipt_no"
                          activeField={consentSortField}
                          order={consentSortOrder}
                          onSort={handleConsentSort}
                        />
                        <th className="text-left py-3 px-4 font-medium text-slate-600 align-middle min-w-[10rem]">
                          知情签署人员
                        </th>
                        <th className="text-left py-3 px-4 font-medium text-slate-600 align-middle w-[11rem]">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {consentDisplayRows.map((row, idx) => {
                        const c = row.record
                        const ids =
                          row.kind === 'subject_group'
                            ? row.record.consent_ids ?? [row.record.id]
                            : [row.record.id]
                        const rowKey =
                          row.kind === 'subject_group' ? `subj-${c.subject_id}` : `s-${c.id}`
                        const signingResultDisp = c.signing_result ?? '-'
                        const receiptDisp = c.receipt_no || '-'
                        const statusLabel = consentRowStatusLabel(c)
                        const showPreviewBtn =
                          row.kind === 'subject_group' ? !!c.is_signed : !!c.is_signed
                        const rowIndex = (consentTablePage - 1) * consentPageSize + idx + 1
                        const checkboxChecked = ids.every((id) => consentSelectedIds.has(id))
                        return (
                          <tr key={rowKey} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="py-3 pl-4 pr-2 align-middle text-left">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300"
                                checked={checkboxChecked}
                                onChange={() => {
                                  setConsentSelectedIds((prev) => {
                                    const next = new Set(prev)
                                    const allOn = ids.every((id) => next.has(id))
                                    if (allOn) ids.forEach((id) => next.delete(id))
                                    else ids.forEach((id) => next.add(id))
                                    return next
                                  })
                                }}
                              />
                            </td>
                            <td className="py-3 px-2 text-slate-500 align-middle tabular-nums">{rowIndex}</td>
                            <td className="py-3 px-4 text-slate-800 align-middle">{c.subject_name || '-'}</td>
                            <td className="py-3 px-4 text-slate-700 align-middle font-mono text-xs">{c.sc_number ?? '-'}</td>
                            <td className="py-3 px-4 text-slate-700 align-middle font-mono text-xs">{c.phone ?? '-'}</td>
                            <td className="py-3 px-4 text-slate-700 align-middle font-mono text-xs whitespace-nowrap min-w-[14rem]">{c.id_card ?? '-'}</td>
                            <td className="py-3 px-4 text-slate-700 align-middle font-mono text-xs">{c.name_pinyin_initials ?? '-'}</td>
                            <td className="py-3 px-4 text-slate-700 align-middle">{signingResultDisp}</td>
                            <td className="py-3 px-4 text-slate-700 align-middle">
                              {c.signing_type === '测试' ? (
                                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200/80">
                                  测试
                                </span>
                              ) : (
                                <span className="text-slate-600">正式</span>
                              )}
                            </td>
                            <td className="py-3 px-4 align-middle">
                              <Badge variant={consentStatusBadgeVariant(statusLabel)}>{statusLabel}</Badge>
                            </td>
                            <td className="py-3 px-4 text-slate-600 align-middle">
                              {c.auth_verified_at ? new Date(c.auth_verified_at).toLocaleString() : '-'}
                            </td>
                            <td className="py-3 px-4 text-slate-600 align-middle">{c.signed_at ? new Date(c.signed_at).toLocaleString() : '-'}</td>
                            <td className="py-3 px-4 font-mono text-xs text-slate-600 align-middle">{receiptDisp}</td>
                            <td className="py-3 px-4 text-slate-700 align-middle max-w-[16rem]">
                              <span
                                className="line-clamp-2 break-words text-sm"
                                title={(c.screening_signing_staff || '').trim() || undefined}
                              >
                                {(c.screening_signing_staff || '').trim() || '-'}
                              </span>
                            </td>
                            <td className="py-3 pl-2 pr-4 align-middle">
                              <div className="flex flex-nowrap items-center justify-end gap-2">
                                {showPreviewBtn ? (
                                  <button
                                    type="button"
                                    title="审核预览"
                                    onClick={() => {
                                      setStaffAuditActionError(null)
                                      setPreviewConsentIds(ids)
                                    }}
                                    className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                    审核
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeleteConsentIds(ids)
                                    setDeleteConsentSummary(
                                      row.kind === 'subject_group'
                                        ? `${c.subject_name || '-'} · ${(c.node_title || '').trim() || `共 ${ids.length} 个知情节点`}`
                                        : `${c.subject_name || '-'} · ${c.node_title?.trim() || `v${c.icf_version}`}`,
                                    )
                                  }}
                                  className="inline-flex shrink-0 items-center gap-1 rounded border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100 text-sm text-slate-600">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-500">每页</span>
                    <select
                      value={consentPageSize}
                      onChange={(e) => {
                        setConsentPageSize(Number(e.target.value))
                        setConsentTablePage(1)
                      }}
                      className="h-8 rounded-lg border border-slate-200 px-2 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    >
                      <option value={20}>20 条</option>
                      <option value={50}>50 条</option>
                      <option value={100}>100 条</option>
                    </select>
                    <span className="text-slate-500">
                      共 <span className="font-medium text-slate-800 tabular-nums">{consentListTotal}</span> 条
                      {consentListPayload?.group_by === 'subject' ? (
                        <span className="text-xs text-slate-400 ml-1">（按受试者合并，每行一名受试者）</span>
                      ) : null}
                      {consentSelectedIds.size > 0 ? (
                        <span className="ml-2 text-indigo-600">已选 {consentSelectedIds.size} 条</span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConsentTablePage((p) => Math.max(1, p - 1))}
                      disabled={consentTablePage <= 1 || consentTotalPages <= 1}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>
                    <span className="tabular-nums px-1">
                      第 {consentTablePage} / {consentTotalPages} 页
                    </span>
                    <button
                      type="button"
                      onClick={() => setConsentTablePage((p) => Math.min(consentTotalPages, p + 1))}
                      disabled={consentTablePage >= consentTotalPages || consentTotalPages <= 1}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-500">跳转至</span>
                    <input
                      type="number"
                      min={1}
                      max={consentTotalPages}
                      value={consentJumpInput}
                      onChange={(e) => setConsentJumpInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleConsentJumpPage()
                      }}
                      className="w-14 h-8 rounded-lg border border-slate-200 px-2 text-center text-sm tabular-nums"
                      placeholder={`1-${consentTotalPages}`}
                    />
                    <button
                      type="button"
                      onClick={handleConsentJumpPage}
                      disabled={consentTotalPages <= 1}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                    >
                      确定
                    </button>
                  </div>
                </div>
              </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={!!icfModal}
        onClose={closeIcfCreateModal}
        closeOnOverlay={!uploadIcf.isPending}
        title="新建签署节点"
        size="lg"
      >
        <div className="space-y-4">
          {icfModal && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">添加文件（必填）</label>
                <div
                  role="presentation"
                  onDragEnter={handleIcfDropZoneDragEnter}
                  onDragLeave={handleIcfDropZoneDragLeave}
                  onDragOver={handleIcfDropZoneDragOver}
                  onDrop={handleIcfDropZoneDrop}
                  className={
                    'rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ' +
                    (uploadIcf.isPending
                      ? 'pointer-events-none opacity-60 border-slate-200 bg-slate-50'
                      : icfDropHover
                        ? 'border-indigo-400 bg-indigo-50/60'
                        : 'border-slate-200 bg-slate-50/80 hover:border-slate-300')
                  }
                >
                  <Upload className="mx-auto h-9 w-9 text-slate-400" aria-hidden />
                  <p className="mt-2 text-sm font-medium text-slate-700">
                    拖拽 PDF / DOC / DOCX 到此处
                  </p>
                  <p className="mt-1 text-xs text-slate-500">支持一次拖入多个文件；顺序即为创建顺序，可在下方调整</p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <label
                      className={
                        'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 ' +
                        (uploadIcf.isPending ? 'pointer-events-none opacity-50' : '')
                      }
                    >
                      <Upload className="w-4 h-4" />
                      选择文件（可多选）
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        multiple
                        className="hidden"
                        onChange={handleIcfFileChange}
                        disabled={uploadIcf.isPending}
                      />
                    </label>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  文件名会解析为默认节点标题，可在列表中逐项修改；上传按列表顺序依次创建。
                </p>
                {icfPickHint && (
                  <div
                    className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                    role="status"
                  >
                    {icfPickHint}
                  </div>
                )}
              </div>

              {icfCreateQueue.length > 0 && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700">
                      待创建列表
                      <span className="ml-1.5 text-xs font-normal text-slate-500">（{icfCreateQueue.length} 个）</span>
                    </span>
                    {!uploadIcf.isPending && (
                      <button
                        type="button"
                        onClick={() => setIcfCreateQueue([])}
                        className="text-xs font-medium text-slate-500 hover:text-rose-600"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <ul className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                    {icfCreateQueue.map((row, idx) => (
                      <li
                        key={row.id}
                        className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 sm:flex-row sm:items-center sm:gap-2"
                      >
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                          <span className="shrink-0 w-7 text-center text-xs font-semibold tabular-nums text-slate-400">
                            {idx + 1}
                          </span>
                          <div className="flex min-w-0 flex-1 items-start gap-2">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                            <span
                              className="min-w-0 flex-1 break-all text-left text-sm text-slate-700"
                              title={row.file.name}
                            >
                              {row.file.name}
                            </span>
                          </div>
                          <input
                            type="text"
                            value={row.nodeTitle}
                            onChange={(e) => updateIcfQueueItemTitle(row.id, e.target.value)}
                            disabled={uploadIcf.isPending}
                            className="w-full min-w-0 flex-[2] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 sm:max-w-[min(100%,20rem)]"
                            placeholder="节点标题"
                            aria-label={`节点标题：${row.file.name}`}
                          />
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-0.5 sm:justify-start">
                          <button
                            type="button"
                            onClick={() => moveIcfQueueItem(row.id, -1)}
                            disabled={uploadIcf.isPending || idx === 0}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-200/80 disabled:opacity-30"
                            title="上移"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveIcfQueueItem(row.id, 1)}
                            disabled={uploadIcf.isPending || idx === icfCreateQueue.length - 1}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-200/80 disabled:opacity-30"
                            title="下移"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeIcfQueueItem(row.id)}
                            disabled={uploadIcf.isPending}
                            className="rounded p-1.5 text-rose-500 hover:bg-rose-50 disabled:opacity-30"
                            title="移除此项"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {uploadIcf.isPending && icfUploadProgress && (
                <div
                  className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-sm text-indigo-900"
                  role="status"
                  aria-live="polite"
                >
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-700" />
                  正在上传第 {icfUploadProgress.current} / {icfUploadProgress.total} 个…
                </div>
              )}

              {icfUploadError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 whitespace-pre-wrap">
                  {icfUploadError}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeIcfCreateModal}
                  disabled={uploadIcf.isPending}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (icfCreateQueue.length === 0) return
                    uploadIcf.mutate(icfCreateQueue)
                  }}
                  disabled={uploadIcf.isPending || icfCreateQueue.length === 0}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {uploadIcf.isPending
                    ? '上传中…'
                    : icfCreateQueue.length > 1
                      ? `上传并创建（${icfCreateQueue.length}）`
                      : '上传并创建'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={!!deleteIcfTarget}
        onClose={() => {
          if (deleteIcfMutation.isPending) return
          setDeleteIcfTarget(null)
          setDeleteIcfError(null)
        }}
        title="删除签署节点"
      >
        <div className="p-4 space-y-4">
          {deleteIcfTarget && (
            <>
              <p className="text-sm text-slate-700">
                确定删除「<strong className="text-slate-900">{deleteIcfTarget.node_title?.trim() || `v${deleteIcfTarget.version}`}</strong>
                」吗？若该节点已有受试者签署或研究者见证记录，将无法删除。
              </p>
              {deleteIcfError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{deleteIcfError}</div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={deleteIcfMutation.isPending}
                  onClick={() => {
                    setDeleteIcfTarget(null)
                    setDeleteIcfError(null)
                  }}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={deleteIcfMutation.isPending}
                  onClick={() => {
                    setDeleteIcfError(null)
                    deleteIcfMutation.mutate(deleteIcfTarget.id)
                  }}
                >
                  {deleteIcfMutation.isPending ? '删除中…' : '确认删除'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={previewConsentIds != null && previewConsentIds.length > 0}
        onClose={() => {
          setPreviewConsentIds(null)
          setStaffAuditActionError(null)
          setStaffReturnReason('')
        }}
        title="签署内容审核"
      >
        <div className="p-4 space-y-3 max-w-[min(960px,92vw)]">
          {previewLoading ? (
            <div className="text-sm text-slate-500">加载中…</div>
          ) : !previewHead ? (
            <div className="text-sm text-rose-600">无法加载签署内容</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700">
                <span>
                  <span className="text-slate-500">受试者：</span>
                  {previewHead.subject_name || '-'}
                </span>
                <span>
                  <span className="text-slate-500">节点：</span>
                  {previewBatchData.length > 1
                    ? `多节点合并预览（${previewBatchData.length}）`
                    : previewHead.node_title?.trim() || `v${previewHead.icf_version}`}
                </span>
                <span>
                  <span className="text-slate-500">签署结果：</span>
                  {previewBatchData.length > 1
                    ? aggregatePreviewSigningResults(previewBatchData)
                    : previewHead.signing_result || '-'}
                </span>
                <span>
                  <span className="text-slate-500">状态：</span>
                  {previewBatchData.length > 1
                    ? previewBatchData.map((p, i) => `${i + 1}.${p.consent_status_label || '-'}`).join(' ')
                    : previewHead.consent_status_label || '-'}
                </span>
              </div>
              <div
                className="consent-icf-preview prose prose-sm max-w-none max-h-[min(60vh,520px)] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-slate-800
                  [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:border-slate-200 [&_td]:border-slate-200
                  [&_p]:has(.icf-cb-item-row):!my-0 [&_p]:has(.icf-cb-item-row):!py-0
                  [&_td]:align-top [&_td:has(.icf-cb-item-row)]:!py-1 [&_td:has(.icf-cb-item-row)]:align-top
                  [&_.icf-cb-item-row]:!block [&_.icf-cb-item-row]:!w-full [&_.icf-cb-item-row]:!max-w-full [&_.icf-cb-item-row]:!box-border [&_.icf-cb-item-row]:!m-0 [&_.icf-cb-item-row]:!py-2.5 [&_.icf-cb-item-row]:!leading-normal
                  [&_.icf-cb-preview]:not-prose"
                dangerouslySetInnerHTML={{
                  __html: staffAuditPreviewHtml || '<p class="text-slate-400">暂无正文</p>',
                }}
              />
              {staffAuditActionError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{staffAuditActionError}</div>
              ) : null}
              {consentPreviewBatchAuditable ? (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <label className="block text-sm font-medium text-slate-700">退回原因（选填，将展示在小程序知情页）</label>
                  <textarea
                    value={staffReturnReason}
                    onChange={(e) => setStaffReturnReason(e.target.value.slice(0, 500))}
                    rows={3}
                    placeholder="如：勾选项与现场沟通不一致，请补充说明后重新签署"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-300"
                  />
                </div>
              ) : null}
              {consentPreviewBatchAuditable ? (
                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStaffAuditActionError(null)
                      if (previewConsentIds?.length) {
                        staffReturnMutation.mutate({ ids: previewConsentIds, reason: staffReturnReason })
                      }
                    }}
                    disabled={staffReturnMutation.isPending || staffApproveMutation.isPending}
                    className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {staffReturnMutation.isPending ? '处理中…' : '退回重签'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStaffAuditActionError(null)
                      if (previewConsentIds?.length) staffApproveMutation.mutate(previewConsentIds)
                    }}
                    disabled={staffReturnMutation.isPending || staffApproveMutation.isPending}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {staffApproveMutation.isPending ? '处理中…' : '通过审核'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={deleteConsentIds != null && deleteConsentIds.length > 0}
        onClose={() => {
          if (softDeleteConsentMutation.isPending) return
          setDeleteConsentIds(null)
          setDeleteConsentSummary('')
        }}
        title="确认删除签署记录"
      >
        <div className="p-4 space-y-4">
          {deleteConsentIds != null && deleteConsentIds.length > 0 ? (
            <>
              <p className="text-sm text-slate-700">
                {deleteConsentIds.length > 1
                  ? `确定软删除这 ${deleteConsentIds.length} 条关联记录吗？删除后本列表不再展示，数据库保留 is_deleted 标记以便审计。`
                  : '确定软删除该条记录吗？删除后本列表不再展示，数据库保留 is_deleted 标记以便审计；同一受试者同一节点可重新生成任务或再次签署。'}
              </p>
              <p className="text-xs text-slate-500">{deleteConsentSummary}</p>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={softDeleteConsentMutation.isPending}
                  onClick={() => {
                    setDeleteConsentIds(null)
                    setDeleteConsentSummary('')
                  }}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={softDeleteConsentMutation.isPending}
                  onClick={() => {
                    if (deleteConsentIds?.length) softDeleteConsentMutation.mutate(deleteConsentIds)
                  }}
                >
                  {softDeleteConsentMutation.isPending ? '删除中…' : '确认删除'}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Modal>


      {comprehensionQuizComingSoonOpen && (
        <Modal
          open
          onClose={() => setComprehensionQuizComingSoonOpen(false)}
          title="知情测验配置"
          size="sm"
          footer={
            <div className="flex w-full justify-end">
              <Button variant="primary" onClick={() => setComprehensionQuizComingSoonOpen(false)}>
                知道了
              </Button>
            </div>
          }
        >
          <p className="text-sm text-slate-700">功能开发中，敬请期待。</p>
        </Modal>
      )}

      {faceVerifyComingSoonOpen && (
        <Modal
          open
          onClose={() => setFaceVerifyComingSoonOpen(false)}
          title="人脸认证签署"
          size="sm"
          footer={
            <div className="flex w-full justify-end">
              <Button variant="primary" onClick={() => setFaceVerifyComingSoonOpen(false)}>
                知道了
              </Button>
            </div>
          }
        >
          <p className="text-sm text-slate-700">功能开发中，敬请期待。</p>
        </Modal>
      )}

    </div>
    </TooltipProvider>
  )
}
