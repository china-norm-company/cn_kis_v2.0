/**
 * 执行台「签署内容审核」弹窗：在文书模板 HTML 上叠加 signature_data 中的勾选结果与签名信息。
 */
import {
  applyIcfPlaceholders,
  buildIcfPlaceholderValuesFromConsentPreview,
  buildIcfSignatureRawHtmlFromRefs,
  buildIcfSignatureRawHtmlPlaceholders,
  extractSignatureImageRefsFromSummary,
  icfTemplateHasStaffSigPlaceholders,
  icfTemplateHasSubjectSigPlaceholders,
} from '@cn-kis/consent-placeholders'
import {
  appendSupplementalCollectCheckboxPreviewRows,
  injectCheckboxPreviewMarkers,
  stripDocumentOtherInfoPlaceholderForCustomSupplemental,
  stripEmbeddedOtherInfoPlaceholderBlocks,
} from '@/utils/icfCheckboxDetect'
import { mediaUrlFromStorageKey as mediaUrlForStoredPath } from '@/utils/mediaUrl'

export type MiniSignRulesPreview = {
  enable_checkbox_recognition: boolean
  supplemental_collect_labels?: string[]
  collect_other_information?: boolean
  enable_staff_signature?: boolean
  staff_signature_times?: number
}

function answerIsYes(a: unknown): boolean {
  if (typeof a === 'object' && a !== null) {
    const o = a as Record<string, unknown>
    const v = o.value ?? o.answer ?? o.selected
    const s = String(v ?? '').trim().toLowerCase()
    return ['yes', 'y', 'true', '1', '是'].includes(s)
  }
  const s = String(a ?? '').trim().toLowerCase()
  return ['yes', 'y', 'true', '1', '是'].includes(s)
}

function answerIsNo(a: unknown): boolean {
  if (typeof a === 'object' && a !== null) {
    const o = a as Record<string, unknown>
    const v = o.value ?? o.answer ?? o.selected
    const s = String(v ?? '').trim().toLowerCase()
    return ['no', 'n', 'false', '0', '否'].includes(s)
  }
  const s = String(a ?? '').trim().toLowerCase()
  return ['no', 'n', 'false', '0', '否'].includes(s)
}

/**
 * 将勾选预览块替换为「已选：是/否」展示（与 document 顺序、ordinal 一致）。
 */
export function applySignedCheckboxAnswersToPreviewHtml(html: string, answers: unknown[]): string {
  if (!answers.length || typeof document === 'undefined') return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div class="icf-signed-root">${html}</div>`, 'text/html')
  const root = doc.querySelector('.icf-signed-root')
  if (!root) return html
  const groups = root.querySelectorAll('.icf-cb-preview')
  groups.forEach((el, idx) => {
    const ordAttr = el.getAttribute('data-icf-cb-ord')
    const ord = ordAttr ? parseInt(ordAttr, 10) : idx + 1
    const ans = answers[ord - 1] ?? answers[idx]
    if (ans === undefined) return
    const span = doc.createElement('span')
    span.className = 'icf-cb-signed-result'
    span.setAttribute('data-icf-cb-ord', String(ord))
    const yes = answerIsYes(ans)
    const no = answerIsNo(ans)
    const color = yes ? '#15803d' : no ? '#b91c1c' : '#64748b'
    const label = yes ? '已选：是（✓）' : no ? '已选：否（✓）' : '已选：未识别'
    span.style.cssText = `display:inline-flex;align-items:center;gap:0.35rem;font-weight:600;color:${color};vertical-align:middle;`
    span.textContent = label
    el.replaceWith(span)
  })
  return root.innerHTML
}

function appendAuditMetaHtml(
  base: string,
  sig: Record<string, unknown>,
  signedAtIso: string | null | undefined,
  options?: { skipSignatureImageFooter?: boolean },
): string {
  const lines: string[] = []
  const sa = sig.signed_at
  const displayDate =
    typeof sa === 'string' && sa.trim()
      ? sa.trim()
      : signedAtIso && String(signedAtIso).trim()
        ? String(signedAtIso).trim()
        : ''
  if (displayDate) {
    lines.push(`<p style="margin:0.5rem 0 0;font-size:13px;color:#334155"><strong>签署时间：</strong>${escapeHtmlLite(displayDate)}</p>`)
  }
  const oi = sig.other_information_text
  if (typeof oi === 'string' && oi.trim()) {
    lines.push(
      `<p style="margin:0.5rem 0 0;font-size:13px;color:#334155"><strong>其他补充说明：</strong>${escapeHtmlLite(oi.trim())}</p>`,
    )
  }
  const imgKey = sig.signature_image
  if (!options?.skipSignatureImageFooter && typeof imgKey === 'string' && imgKey.trim()) {
    const src = mediaUrlForStoredPath(imgKey)
    if (src) {
      const srcAttr = src.replace(/"/g, '&quot;')
      lines.push(
        `<p style="margin:0.75rem 0 0;font-size:13px;color:#334155"><strong>手写签名：</strong><br/><img src="${srcAttr}" alt="" style="max-height:120px;margin-top:0.35rem;border-radius:6px;border:1px solid #e2e8f0;background:#fff" /></p>`,
      )
    }
  }
  if (sig.witness_dev_flow === true) {
    lines.push(
      `<p style="margin:0.75rem 0 0;font-size:12px;color:#b45309">联调测试签署：若未上传逐项勾选快照，正文可能为文书模板样式。</p>`,
    )
  }
  if (lines.length === 0) return base
  return `${base}<div style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid #e2e8f0">${lines.join('')}</div>`
}

function escapeHtmlLite(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 供「签署内容审核」弹窗正文：模板 +（可选）勾选识别结果 + 签署元数据。
 */
export function buildStaffConsentAuditPreviewHtml(options: {
  baseHtml: string
  isSigned: boolean
  signedAt: string | null | undefined
  signatureSummary: Record<string, unknown>
  rules?: MiniSignRulesPreview | null
  /** 与预览 API 一致，用于 {{ICF_PROTOCOL_*}} 等占位符（可选，缺省时仍可按 signature_summary 填充签署项） */
  protocolCode?: string
  protocolTitle?: string
  nodeTitle?: string
  versionLabel?: string
  receiptNo?: string
  enableAutoSignDate?: boolean
  /** 与知情配置一致：用于 {{ICF_SUBJECT_SIG_*}} 未签署预览 */
  enableSubjectSignature?: boolean
  subjectSignatureTimes?: number
  /** 与知情配置一致：用于 {{ICF_STAFF_SIG_*}} */
  enableStaffSignature?: boolean
  staffSignatureTimes?: number
}): string {
  const { baseHtml, isSigned, signedAt, signatureSummary } = options
  const rules = options.rules
  const raw = (baseHtml || '').trim()
  if (!raw) return '<p class="text-slate-400">暂无正文</p>'

  const sig = signatureSummary || {}
  const hadSubject = icfTemplateHasSubjectSigPlaceholders(raw)
  const hadStaff = icfTemplateHasStaffSigPlaceholders(raw)
  const hadInlineSigTokens = hadSubject || hadStaff
  const placeholderValues = buildIcfPlaceholderValuesFromConsentPreview({
    protocolCode: options.protocolCode,
    protocolTitle: options.protocolTitle,
    nodeTitle: options.nodeTitle,
    versionLabel: options.versionLabel,
    signedAt: signedAt ?? null,
    receiptNo: options.receiptNo,
    enableAutoSignDate: options.enableAutoSignDate,
    signatureSummary: sig as Record<string, unknown>,
  })
  const subTimes = Math.min(2, Math.max(0, Number(options.subjectSignatureTimes ?? 1)))
  const staffTimesCfg = Math.min(2, Math.max(0, Number(options.staffSignatureTimes ?? 1)))
  const wantSub = options.enableSubjectSignature !== false && subTimes > 0
  const wantStaff = options.enableStaffSignature === true && staffTimesCfg > 0
  const effectiveSubTimes = hadSubject && wantSub ? (subTimes >= 2 ? 2 : 1) : 0
  const effectiveStaffTimes = hadStaff && wantStaff ? (staffTimesCfg >= 2 ? 2 : 1) : 0

  let rawSig: Record<string, string> = {}
  if (hadInlineSigTokens) {
    if (isSigned) {
      let refs = extractSignatureImageRefsFromSummary(sig as Record<string, unknown>)
      const staffRefs: string[] = []
      // 模板仅有工作人员占位符时，摘要中的签名影像应落在 STAFF 位而非受试者位
      if (!hadSubject && hadStaff && refs.length) {
        staffRefs.push(...refs)
        refs = []
      }
      rawSig = buildIcfSignatureRawHtmlFromRefs(refs, mediaUrlForStoredPath, { staffRefs })
    } else {
      rawSig = buildIcfSignatureRawHtmlPlaceholders({
        subjectSignatureTimes: effectiveSubTimes,
        staffSignatureTimes: effectiveStaffTimes,
        sig1Src: null,
        sig2Src: null,
        staffSig1Src: null,
        staffSig2Src: null,
      })
    }
  }
  const withPlaceholders = applyIcfPlaceholders(raw, placeholderValues, {
    escapeValues: true,
    rawHtmlByToken: rawSig,
  })
  const answersRaw = sig.icf_checkbox_answers ?? sig.checkbox_answers
  const answers = Array.isArray(answersRaw) ? answersRaw : []

  const footerOpts = { skipSignatureImageFooter: hadInlineSigTokens && isSigned }

  if (rules?.enable_checkbox_recognition) {
    let stripped = stripEmbeddedOtherInfoPlaceholderBlocks(withPlaceholders)
    stripped = stripDocumentOtherInfoPlaceholderForCustomSupplemental(
      stripped,
      rules.supplemental_collect_labels,
    )
    let html = injectCheckboxPreviewMarkers(stripped, 'preview')
    html = appendSupplementalCollectCheckboxPreviewRows(
      html,
      stripped,
      rules.supplemental_collect_labels,
      !!rules.collect_other_information,
      'preview',
    )
    if (isSigned && answers.length > 0) {
      html = applySignedCheckboxAnswersToPreviewHtml(html, answers)
    } else if (isSigned && answers.length === 0) {
      html = `${html}<p style="margin:0.75rem 0 0;font-size:12px;color:#b45309">未采集到逐项勾选快照数据，上表为文书模板；若已通过小程序正式签署，请确认客户端已上报勾选结果。</p>`
    }
    return appendAuditMetaHtml(html, sig as Record<string, unknown>, signedAt, footerOpts)
  }

  let out = withPlaceholders
  if (isSigned) {
    out = appendAuditMetaHtml(out, sig as Record<string, unknown>, signedAt, footerOpts)
  }
  return out
}
