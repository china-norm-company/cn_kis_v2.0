/**
 * 知情文书占位符：与 Word/HTML 模板约定一致，三端与后端 Python 需保持 token 字符串同步。
 *
 * 模板中书写示例：受试者姓名 {{ICF_SUBJECT_NAME}}，身份证后四位 {{ICF_ID_CARD_LAST4}}
 */

/** 文档中应使用的占位符字面量（便于校验与文档化） */
export const ICF_PLACEHOLDER_TOKENS = [
  '{{ICF_PROTOCOL_CODE}}',
  '{{ICF_PROTOCOL_TITLE}}',
  '{{ICF_NODE_TITLE}}',
  '{{ICF_VERSION_LABEL}}',
  '{{ICF_SUBJECT_NAME}}',
  '{{ICF_DECLARED_NAME}}',
  '{{ICF_ID_CARD}}',
  '{{ICF_ID_CARD_LAST4}}',
  '{{ICF_PHONE}}',
  '{{ICF_PHONE_LAST4}}',
  '{{ICF_SCREENING_NUMBER}}',
  '{{ICF_INITIALS}}',
  '{{ICF_SIGNED_DATE}}',
  '{{ICF_SIGNED_AT_ISO}}',
  '{{ICF_RECEIPT_NO}}',
  /** 正文内手写签名位（文书模板中自行择位插入，与前后文案无关） */
  '{{ICF_SUBJECT_SIG_1}}',
  '{{ICF_SUBJECT_SIG_2}}',
  /** 正文内工作人员手写签名位（与知情配置 staff_signature_times 一致） */
  '{{ICF_STAFF_SIG_1}}',
  '{{ICF_STAFF_SIG_2}}',
] as const

export type IcfPlaceholderToken = (typeof ICF_PLACEHOLDER_TOKENS)[number]

export type IcfIdentityLike = {
  declared_name?: string
  declared_id_card?: string
  declared_phone?: string
  declared_screening_number?: string
}

export type IcfMiniSignConfirmLike = {
  subject_name?: string
  screening_number?: string
  initials?: string
  id_card_last4?: string
  phone_last4?: string
}

/** 构造替换表时的输入（各端按需填写） */
export type BuildIcfPlaceholderValuesInput = {
  protocolCode?: string
  protocolTitle?: string
  nodeTitle?: string
  versionLabel?: string
  /** 核验测试 H5 identity */
  identity?: IcfIdentityLike | null
  /** 小程序签署后 mini_sign_confirm */
  miniSignConfirm?: IcfMiniSignConfirmLike | null
  /** 签署时间（受试者记录） */
  signedAt?: string | Date | null
  /** 与节点规则一致：为 true 时 ICF_SIGNED_DATE 取 signedAt 的日历日 */
  enableAutoSignDate?: boolean
  receiptNo?: string
  /**
   * 未签署预览：用当前时间填「签署日」类占位，避免留空。
   * 已签署时应传 signedAt，勿与 previewNow 混用。
   */
  previewNow?: Date
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

function last4Digits(s: string): string {
  const d = digitsOnly(s)
  return d.length >= 4 ? d.slice(-4) : d
}

function normalizeIdCardInput(s: string): string {
  return s.replace(/\s/g, '').replace(/[^0-9Xx]/g, '')
}

/** ISO 日历日 YYYY-MM-DD（本地时区） */
export function formatLocalDateYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseSignedAt(input: string | Date | null | undefined): Date | null {
  if (input == null) return null
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input
  const s = String(input).trim()
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 由业务字段构造占位符 → 替换值（值已适合写入 HTML，不含转义）。
 */
export function buildIcfPlaceholderValues(input: BuildIcfPlaceholderValuesInput): Record<string, string> {
  const id = input.identity || {}
  const mc = input.miniSignConfirm || {}

  const name =
    (typeof mc.subject_name === 'string' && mc.subject_name.trim()) ||
    (typeof id.declared_name === 'string' && id.declared_name.trim()) ||
    ''

  const idFull =
    (typeof id.declared_id_card === 'string' && normalizeIdCardInput(id.declared_id_card)) || ''
  const idLast4 =
    (typeof mc.id_card_last4 === 'string' && mc.id_card_last4.trim()) || (idFull ? last4Digits(idFull) : '')

  const phoneFull = (typeof id.declared_phone === 'string' && digitsOnly(id.declared_phone)) || ''
  const phoneLast4 =
    (typeof mc.phone_last4 === 'string' && mc.phone_last4.trim()) ||
    (phoneFull ? last4Digits(phoneFull) : '')

  const screening =
    (typeof mc.screening_number === 'string' && mc.screening_number.trim()) ||
    (typeof id.declared_screening_number === 'string' && id.declared_screening_number.trim()) ||
    ''

  const initials = (typeof mc.initials === 'string' && mc.initials.trim()) || ''

  const signed = parseSignedAt(input.signedAt)
  const preview = input.previewNow instanceof Date && !Number.isNaN(input.previewNow.getTime()) ? input.previewNow : null
  const dateForLabel = signed ?? preview

  let signedDate = ''
  let signedAtIso = ''
  if (signed) {
    signedAtIso = signed.toISOString()
    signedDate = formatLocalDateYmd(signed)
  } else if (dateForLabel) {
    signedDate = formatLocalDateYmd(dateForLabel)
  }

  const receiptNo = (input.receiptNo || '').trim()

  const out: Record<string, string> = {
    '{{ICF_PROTOCOL_CODE}}': (input.protocolCode || '').trim(),
    '{{ICF_PROTOCOL_TITLE}}': (input.protocolTitle || '').trim(),
    '{{ICF_NODE_TITLE}}': (input.nodeTitle || '').trim(),
    '{{ICF_VERSION_LABEL}}': (input.versionLabel || '').trim(),
    '{{ICF_SUBJECT_NAME}}': name,
    '{{ICF_DECLARED_NAME}}': name,
    '{{ICF_ID_CARD}}': idFull,
    '{{ICF_ID_CARD_LAST4}}': idLast4,
    '{{ICF_PHONE}}': phoneFull,
    '{{ICF_PHONE_LAST4}}': phoneLast4,
    '{{ICF_SCREENING_NUMBER}}': screening,
    '{{ICF_INITIALS}}': initials,
    '{{ICF_SIGNED_DATE}}': signedDate,
    '{{ICF_SIGNED_AT_ISO}}': signedAtIso,
    '{{ICF_RECEIPT_NO}}': receiptNo,
  }

  return out
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;')
}

/**
 * 将占位符替换为对应值。默认对值做 HTML 转义，避免姓名等破坏文档结构。
 * `rawHtmlByToken` 中的 token（如手写签名 img）按 HTML 片段插入，不做转义。
 * @param escapeValues 设为 false 时用于纯文本展示（如小程序 Text 纯文本）
 */
export function applyIcfPlaceholders(
  htmlOrText: string,
  values: Record<string, string>,
  options?: { escapeValues?: boolean; rawHtmlByToken?: Record<string, string> },
): string {
  const escapeValues = options?.escapeValues !== false
  const rawHtmlByToken = options?.rawHtmlByToken || {}
  const rawKeys = new Set(Object.keys(rawHtmlByToken))
  const entries: Array<[string, string, 'raw' | 'text']> = ([] as Array<[string, string, 'raw' | 'text']>)
    .concat(
      Object.entries(rawHtmlByToken).map(([k, v]): [string, string, 'raw'] => [k, v, 'raw']),
      Object.entries(values)
        .filter(([k]) => !rawKeys.has(k))
        .map(([k, v]): [string, string, 'text'] => [k, v, 'text']),
    )
    .sort((a, b) => b[0].length - a[0].length)

  let out = htmlOrText || ''
  for (const [token, rawVal, kind] of entries) {
    const v = kind === 'raw' ? rawVal : escapeValues ? escapeHtml(rawVal ?? '') : rawVal ?? ''
    const re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    out = out.replace(re, v)
  }
  return out
}

/**
 * 与 {@link applyIcfPlaceholders} 相同的替换规则，但将每一处被替换的占位符包在带源码偏移的 span 内，
 * 便于执行台预览区点击定位到 HTML 源码中的 `{{...}}` 字符区间。
 *
 * - `data-icf-src-start` / `data-icf-src-end` 为**原始字符串** `htmlOrText` 中的半开区间 `[start, end)`。
 * - 非占位符的 HTML 片段原样拷贝，不做转义（与直接拼接源码一致）。
 */
export function applyIcfPlaceholdersWithSourceAnchors(
  htmlOrText: string,
  values: Record<string, string>,
  options?: { escapeValues?: boolean; rawHtmlByToken?: Record<string, string> },
): string {
  const escapeValues = options?.escapeValues !== false
  const rawHtmlByToken = options?.rawHtmlByToken || {}
  const rawKeys = new Set(Object.keys(rawHtmlByToken))
  const entries: Array<[string, string, 'raw' | 'text']> = ([] as Array<[string, string, 'raw' | 'text']>)
    .concat(
      Object.entries(rawHtmlByToken).map(([k, v]): [string, string, 'raw'] => [k, v, 'raw']),
      Object.entries(values)
        .filter(([k]) => !rawKeys.has(k))
        .map(([k, v]): [string, string, 'text'] => [k, v, 'text']),
    )
    .sort((a, b) => b[0].length - a[0].length)

  const tokensSorted = entries.map(([k]) => k)

  const resolve = (token: string): string => {
    const row = entries.find(([k]) => k === token)
    if (!row) return token
    const [, rawVal, kind] = row
    return kind === 'raw' ? rawVal : escapeValues ? escapeHtml(rawVal ?? '') : rawVal ?? ''
  }

  const raw = htmlOrText || ''
  let out = ''
  let i = 0
  while (i < raw.length) {
    const brace = raw.indexOf('{', i)
    if (brace === -1) {
      out += raw.slice(i)
      break
    }
    if (brace > i) {
      out += raw.slice(i, brace)
      i = brace
    }
    let matched: string | null = null
    for (const token of tokensSorted) {
      if (raw.startsWith(token, i)) {
        matched = token
        break
      }
    }
    if (matched) {
      const start = i
      const end = i + matched.length
      const inner = resolve(matched)
      const title = escapeAttr(matched)
      out += `<span class="icf-src-anchor" data-icf-src-start="${start}" data-icf-src-end="${end}" data-icf-token="${title}" title="点击定位源码：${title}">${inner}</span>`
      i = end
    } else {
      out += raw[i]
      i += 1
    }
  }
  return out
}

const DEFAULT_SIG_EMPTY_HTML =
  '<span style="display:inline-block;min-width:3.5rem;border-bottom:1px dashed #94a3b8;padding:0 0.15rem 0.1rem;color:#64748b;font-size:12px;vertical-align:bottom;">（请签名）</span>'

export type BuildIcfSignatureRawHtmlOptions = {
  /** 0 / 1 / 2，与知情配置 subject_signature_times 一致 */
  subjectSignatureTimes: number
  /** data URL、https、或小程序本地临时路径等 */
  sig1Src?: string | null
  sig2Src?: string | null
  /** 0 / 1 / 2，与知情配置 staff_signature_times 一致 */
  staffSignatureTimes?: number
  staffSig1Src?: string | null
  staffSig2Src?: string | null
  /** 未采集签名时的占位 HTML */
  emptyHtml?: string
}

function inlineSigImgTag(src: string): string {
  const s = (src || '').trim()
  if (!s) return DEFAULT_SIG_EMPTY_HTML
  return `<img src="${escapeAttr(s)}" alt="" data-icf-inline-sig="1" style="max-height:120px;max-width:100%;vertical-align:middle;" />`
}

/**
 * 构造 {{ICF_SUBJECT_SIG_1/2}} 的 HTML 替换片段（用于正文内嵌签名预览或已签署展示）。
 */
export function buildIcfSignatureRawHtmlPlaceholders(opts: BuildIcfSignatureRawHtmlOptions): Record<string, string> {
  const empty = opts.emptyHtml ?? DEFAULT_SIG_EMPTY_HTML
  const subTimes = Math.min(2, Math.max(0, Number(opts.subjectSignatureTimes) || 0))
  const staffTimes = Math.min(2, Math.max(0, Number(opts.staffSignatureTimes ?? 0)))
  const out: Record<string, string> = {}
  if (subTimes >= 1) {
    const s1 = (opts.sig1Src || '').trim()
    out['{{ICF_SUBJECT_SIG_1}}'] = s1 ? inlineSigImgTag(s1) : empty
  } else {
    out['{{ICF_SUBJECT_SIG_1}}'] = ''
  }
  if (subTimes >= 2) {
    const s2 = (opts.sig2Src || '').trim()
    out['{{ICF_SUBJECT_SIG_2}}'] = s2 ? inlineSigImgTag(s2) : empty
  } else {
    out['{{ICF_SUBJECT_SIG_2}}'] = ''
  }
  if (staffTimes >= 1) {
    const t1 = (opts.staffSig1Src || '').trim()
    out['{{ICF_STAFF_SIG_1}}'] = t1 ? inlineSigImgTag(t1) : empty
  } else {
    out['{{ICF_STAFF_SIG_1}}'] = ''
  }
  if (staffTimes >= 2) {
    const t2 = (opts.staffSig2Src || '').trim()
    out['{{ICF_STAFF_SIG_2}}'] = t2 ? inlineSigImgTag(t2) : empty
  } else {
    out['{{ICF_STAFF_SIG_2}}'] = ''
  }
  return out
}

/**
 * 从签署摘要中提取手写签名存储 key / data URL 列表（与后端 signature_data 字段一致）。
 */
export function extractSignatureImageRefsFromSummary(sig: Record<string, unknown> | null | undefined): string[] {
  const s = sig || {}
  const test = s.consent_test_scan_signature_images
  if (Array.isArray(test) && test.length) {
    return test.map((x) => String(x).trim()).filter(Boolean)
  }
  const imgs = s.signature_images
  if (Array.isArray(imgs) && imgs.length) {
    return imgs.map((x) => String(x).trim()).filter(Boolean)
  }
  const out: string[] = []
  if (typeof s.signature_image === 'string' && s.signature_image.trim()) out.push(s.signature_image.trim())
  if (typeof s.signature_image_2 === 'string' && s.signature_image_2.trim()) out.push(s.signature_image_2.trim())
  return out
}

/**
 * 已签署：用媒体 key 或绝对 URL 生成正文内嵌签名 img（执行台 /media 等由调用方解析 URL）。
 */
export function buildIcfSignatureRawHtmlFromRefs(
  refs: string[],
  mediaUrlForKey: (key: string) => string,
  options?: { missingLabel?: string; staffRefs?: string[] },
): Record<string, string> {
  const miss = options?.missingLabel ?? '<span style="color:#94a3b8;font-size:12px">（无签名影像）</span>'
  const staffRefs = options?.staffRefs ?? []
  const one = (ref: string | undefined) => {
    const r = (ref || '').trim()
    if (!r) return miss
    const src = mediaUrlForKey(r)
    return src ? inlineSigImgTag(src) : miss
  }
  return {
    '{{ICF_SUBJECT_SIG_1}}': one(refs[0]),
    '{{ICF_SUBJECT_SIG_2}}': one(refs[1]),
    '{{ICF_STAFF_SIG_1}}': one(staffRefs[0]),
    '{{ICF_STAFF_SIG_2}}': one(staffRefs[1]),
  }
}

/** 模板中是否包含正文内嵌签名占位符（用于避免页脚重复展示签名图） */
export function icfTemplateHasSubjectSigPlaceholders(html: string): boolean {
  return /\{\{ICF_SUBJECT_SIG_[12]\}\}/.test(html || '')
}

/** 模板中是否包含正文内嵌工作人员签名占位符 */
export function icfTemplateHasStaffSigPlaceholders(html: string): boolean {
  return /\{\{ICF_STAFF_SIG_[12]\}\}/.test(html || '')
}

/**
 * 从「执行台预览 API」风格对象 + signature_summary 构造占位表（供 buildStaffConsentAuditPreviewHtml 等使用）。
 */
export function buildIcfPlaceholderValuesFromConsentPreview(args: {
  protocolCode?: string
  protocolTitle?: string
  nodeTitle?: string
  versionLabel?: string
  signedAt?: string | null
  receiptNo?: string
  enableAutoSignDate?: boolean
  signatureSummary: Record<string, unknown>
}): Record<string, string> {
  const sig = args.signatureSummary || {}
  const scan = (sig.consent_test_scan_identity as IcfIdentityLike | undefined) || undefined
  const mini = (sig.mini_sign_confirm as IcfMiniSignConfirmLike | undefined) || undefined
  return buildIcfPlaceholderValues({
    protocolCode: args.protocolCode,
    protocolTitle: args.protocolTitle,
    nodeTitle: args.nodeTitle,
    versionLabel: args.versionLabel,
    identity: scan,
    miniSignConfirm: mini,
    signedAt: args.signedAt ?? null,
    enableAutoSignDate: args.enableAutoSignDate,
    receiptNo: args.receiptNo,
  })
}
