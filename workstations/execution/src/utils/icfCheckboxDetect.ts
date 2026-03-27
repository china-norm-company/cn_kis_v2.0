/**
 * 从 mammoth/HTML 纯文本中启发式识别「是/否」类勾选句式，供知情配置中区展示与后续后端落库。
 * 识别结果需人工核对，非 OCR/版式理解。
 */

export type DetectedCheckboxControl = {
  /** 稳定键 */
  id: string
  /** 文档中出现顺序，从 1 开始 */
  ordinal: number
  /** 如「第 1 处」 */
  ordinalLabel: string
  /**
   * 从紧邻上文提炼的短句，便于配置人员扫读（对应「这一处在问什么」）。
   */
  headline: string
  /** 正则命中的整段句式（不含前后文），用于界面主展示 */
  matchText: string
  /** 含少量上下文的原文片段，便于核对 */
  snippet: string
  /** 命中的规则说明 */
  rule: string
}

function hashId(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h << 5) - h + s.charCodeAt(i)
  return `chk_${(h >>> 0).toString(16)}`
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * mammoth/Word 常把 □ 写成 &#9633; / &#x25A1; 等，去标签后仍是实体串则无法命中「□」类规则。
 * 在解析前将常见数字实体还原为字符，便于与 Word 表格里「姓名 □是 □否」等行对齐。
 */
function decodeNumericHtmlEntities(html: string): string {
  return html
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

/** 与 stripTags 对齐的「展平字符」，带原文 HTML 起止下标（用于在预览中替换整段匹配） */
type PlainToken = { ch: string; h0: number; h1: number }

/**
 * 将 HTML 展平为与 stripTags 完全相同的字符串，并记录每个字符对应的 [h0,h1) 原文区间。
 * 若与 stripTags 结果不一致则返回 null（不注入预览标记，避免错位）。
 */
function htmlToPlainTokens(html: string): PlainToken[] | null {
  /** 与 stripTags 最终 trim() 一致：避免 BOM 等导致 plain 与 stripTags 不一致 */
  html = html.replace(/^\uFEFF+/, '')
  const len = html.length
  let i = 0
  const raw: PlainToken[] = []

  while (i < len) {
    const rest = html.slice(i)
    const scr = rest.match(/^<script[\s\S]*?<\/script>/i)
    if (scr) {
      raw.push({ ch: ' ', h0: i, h1: i + scr[0].length })
      i += scr[0].length
      continue
    }
    const sty = rest.match(/^<style[\s\S]*?<\/style>/i)
    if (sty) {
      raw.push({ ch: ' ', h0: i, h1: i + sty[0].length })
      i += sty[0].length
      continue
    }
    if (html[i] === '<') {
      const gt = html.indexOf('>', i)
      if (gt === -1) break
      raw.push({ ch: ' ', h0: i, h1: gt + 1 })
      i = gt + 1
      continue
    }
    const cp = html.codePointAt(i)!
    const ch = String.fromCodePoint(cp)
    const w = cp > 0xffff ? 2 : 1
    raw.push({ ch, h0: i, h1: i + w })
    i += w
  }

  const collapsed: PlainToken[] = []
  for (const t of raw) {
    /** stripTags 的 \s+ 含常见 Unicode 空白；BOM 在 trim 前若残留需与之一致 */
    if (/\s/.test(t.ch) || t.ch === '\uFEFF') {
      if (collapsed.length === 0 || collapsed[collapsed.length - 1].ch !== ' ') {
        collapsed.push({ ch: ' ', h0: t.h0, h1: t.h1 })
      }
    } else {
      collapsed.push(t)
    }
  }

  while (collapsed.length > 0 && collapsed[0].ch === ' ') collapsed.shift()
  while (collapsed.length > 0 && collapsed[collapsed.length - 1].ch === ' ') collapsed.pop()

  const plain = collapsed.map((t) => t.ch).join('')
  if (plain !== stripTags(html)) return null
  return collapsed
}

/** collectSpans 返回的区间（与 rule 无关，仅用到 start/end） */
type PlainSpan = { start: number; end: number; rule: string }

const LABEL_FIELD_RULE = '□后字段名（个人信息收集表，无是/否双选项）'

function spanOverlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && a.end > b.start
}

function isLabelFieldRule(rule: string): boolean {
  return rule === LABEL_FIELD_RULE
}

/** 当前下标所在行在 plain 中的 [lineStart, lineEnd)（不含 \\n） */
function lineBoundsAt(plain: string, pos: number): { lineStart: number; lineEnd: number } {
  const n = Math.min(Math.max(0, pos), plain.length)
  const lineStart = plain.lastIndexOf('\n', n - 1) + 1
  const nextNl = plain.indexOf('\n', n)
  const lineEnd = nextNl === -1 ? plain.length : nextNl
  return { lineStart, lineEnd }
}

/**
 * 整段纯图例行（无「注」混排时）：如单独一行的 √□为同意，□x 拒绝。
 * 含「注：」的混合行不能整行排除（stripTags 常把多段合成一行，前面仍有真实 □字段）。
 */
function isStandaloneLegendLine(line: string): boolean {
  const t = line.replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (/^(注|说明|备注|附注|图例)[：:]/.test(t)) return true
  if (/^(note|legend)\s*[:：]/i.test(t)) return true
  if (/注[：:]/.test(t)) return false
  if (/√\s*□/.test(t) && /(为同意|拒绝)/.test(t)) return true
  if (/□\s*[x×]\s*拒绝/.test(t)) return true
  if (
    /为同意/.test(t) &&
    /拒绝/.test(t) &&
    /□/.test(t) &&
    (/√/.test(t) || /[x×]\s*拒绝/.test(t)) &&
    t.length <= 160
  ) {
    return true
  }
  return false
}

/**
 * 位于「注：/说明：…」之后、且与说明区之间无换行 → 视为说明/图例，不注入请勾选。
 */
function isSpanAfterLegendPrefixSameSegment(plain: string, spanStart: number): boolean {
  const before = plain.slice(0, spanStart)
  const re = /(注|说明|备注|附注|图例|note|legend)\s*[：:]/gi
  let lastEnd = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(before)) !== null) {
    lastEnd = m.index + m[0].length
  }
  if (lastEnd < 0) return false
  if (plain.slice(lastEnd, spanStart).includes('\n')) return false
  return spanStart >= lastEnd
}

/**
 * □+字段名 规则下，图例行内拆出的片段（√□为同意 / □x拒绝）不应单独成条。
 */
function isLegendLabelFieldFragment(matchedPlain: string): boolean {
  const t = matchedPlain.trim()
  const afterBox = t.replace(/^[\u25A1\u2610\u25A2\u25A3]\s*/, '')
  const head = afterBox.split(/[\u25A1\u2610\u25A2\u25A3]/)[0].trim()
  if (/^x\s*拒绝/.test(head) || /^×\s*拒绝/.test(head)) return true
  if (/^[x×][，,。.、]?$/.test(head)) return true
  if (/^为同意[，,。、]?\s*$/.test(head)) return true
  if (/^为同意[，,]/.test(head) && head.length <= 8) return true
  return false
}

function filterLegendExcludedSpans(plain: string, spans: PlainSpan[]): PlainSpan[] {
  return spans.filter((sp) => {
    const { lineStart, lineEnd } = lineBoundsAt(plain, sp.start)
    const line = plain.slice(lineStart, lineEnd)
    if (isStandaloneLegendLine(line)) return false
    if (isSpanAfterLegendPrefixSameSegment(plain, sp.start)) return false
    if (isLabelFieldRule(sp.rule) && isLegendLabelFieldFragment(plain.slice(sp.start, sp.end))) return false
    return true
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 从「□实验样本、数据」或「□病史」类片段中取出字段名（去掉首格） */
function extractLabelFromLabelFieldMatch(matchedPlain: string): string {
  const t = matchedPlain.trim()
  const withoutFirst = t.replace(/^[\u25A1\u2610\u25A2\u25A3]\s*/, '')
  return withoutFirst.split(/[\u25A1\u2610\u25A2\u25A3]/)[0].trim()
}

/**
 * 每项独占一行；用 block + 统一 padding-block，避免表格单元格/段落 margin 与行内 padding 叠算导致「组内两行」与「组间」间距不一致。
 * 具体纵向间距由页面/iframe 内样式表统一控制（见 ConsentManagementPage、icfDocxPreviewShell）。
 */
function wrapCheckboxPreviewItem(innerHtml: string): string {
  return (
    `<span class="icf-cb-item-row" style="display:block;width:100%;max-width:100%;box-sizing:border-box;margin:0;line-height:1.5;vertical-align:top;">` +
    innerHtml +
    `</span>`
  )
}

/** 勾选注入：仅展示（执行台预览）或可操作单选（联调/H5） */
export type CheckboxMarkerMode = 'preview' | 'interactive'

function buildLabelFieldThenMarkerHtml(
  matchedPlain: string,
  ordinal: number,
  mode: CheckboxMarkerMode,
): string {
  const label = extractLabelFromLabelFieldMatch(matchedPlain)
  const marker = buildMarkerHtml(ordinal, { wrapItem: false }, mode)
  if (!label) return wrapCheckboxPreviewItem(marker)
  const inner =
    `<span class="icf-cb-field" style="color:#0f172a;font-weight:500;line-height:1.5;vertical-align:middle;">${escapeHtml(label)}</span> ` + marker
  return wrapCheckboxPreviewItem(inner)
}

/** 基于展平 token 的精确替换（与识别下标一致） */
function injectByPlainTokens(
  html: string,
  tokens: PlainToken[],
  spans: PlainSpan[],
  plain: string,
  mode: CheckboxMarkerMode,
): string {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  let out = ''
  let lastH = 0
  let ord = 0
  for (const sp of sorted) {
    const { start, end } = sp
    if (start < 0 || end > tokens.length || start >= end) continue
    const h0 = tokens[start].h0
    const h1 = tokens[end - 1].h1
    if (h0 < lastH) continue
    out += html.slice(lastH, h0)
    ord += 1
    const matchedPlain = plain.slice(start, end)
    out += isLabelFieldRule(sp.rule)
      ? buildLabelFieldThenMarkerHtml(matchedPlain, ord, mode)
      : buildMarkerHtml(ord, { wrapItem: true }, mode)
    lastH = h1
  }
  out += html.slice(lastH)
  return out
}

/**
 * 当展平映射失败时，直接在原始 HTML 上按与识别相同的正则替换（多数 mammoth 正文无标签打断句式，可与左侧「识别」一致）。
 */
function injectCheckboxPreviewMarkersByRegex(html: string, mode: CheckboxMarkerMode): string {
  type Hit = { start: number; end: number }
  const byStart = new Map<number, Hit>()
  for (const { re } of PATTERNS) {
    const r = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
    let m: RegExpExecArray | null
    while ((m = r.exec(html)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (!byStart.has(start)) {
        byStart.set(start, { start, end })
      }
    }
  }
  const sorted = [...byStart.values()].sort((a, b) => a.start - b.start)
  const filtered: Hit[] = []
  let lastEnd = -1
  for (const h of sorted) {
    if (h.start >= lastEnd) {
      filtered.push(h)
      lastEnd = h.end
    }
  }
  if (filtered.length === 0) return html

  let out = html
  for (let idx = filtered.length - 1; idx >= 0; idx -= 1) {
    const h = filtered[idx]
    const ordinal = idx + 1
    const marker = buildMarkerHtml(ordinal, { wrapItem: true }, mode)
    out = out.slice(0, h.start) + marker + out.slice(h.end)
  }
  return out
}

/**
 * 在签署预览 HTML 中，将识别到的「勾选句式」替换为统一示意：红色「请勾选」+ □是 / □否（与小程序侧交互预期一致，仅展示用）。
 * `interactive`：同位置替换为可点击的「是 / 否」方形勾选（互斥 checkbox，与配置预览一致；联调/H5 受试者勾选）。
 * 优先使用与 stripTags 对齐的 token 映射；若不一致或无匹配，则回退为在 HTML 上直接正则替换（避免预览无示意）。
 */
export function injectCheckboxPreviewMarkers(html: string, mode: CheckboxMarkerMode = 'preview'): string {
  const htmlNorm = decodeNumericHtmlEntities(html)
  const tokens = htmlToPlainTokens(htmlNorm)
  const plain = tokens ? tokens.map((t) => t.ch).join('') : stripTags(htmlNorm)
  const spans = collectSpans(plain)
  if (spans.length === 0) return htmlNorm

  if (tokens && tokens.length > 0) {
    return injectByPlainTokens(htmlNorm, tokens, spans, plain, mode)
  }
  return injectCheckboxPreviewMarkersByRegex(htmlNorm, mode)
}

/** 与 `injectCheckboxPreviewMarkers(html, 'interactive')` 等价，语义上强调可交互。 */
export function injectInteractiveCheckboxMarkers(html: string): string {
  return injectCheckboxPreviewMarkers(html, 'interactive')
}

/**
 * 与右侧「勾选框识别」预览一致：统计注入后红色「请勾选」示意块数量（class=icf-cb-preview）。
 * 不依赖 detectCheckboxControlsFromHtml，避免 token/正则路径与注入结果不一致导致「预览有、统计为 0」。
 */
export function countCheckboxPreviewMarkers(html: string): number {
  if (!html || !String(html).trim()) return 0
  const out = injectCheckboxPreviewMarkers(html)
  const re = /class="icf-cb-preview"/g
  let n = 0
  while (re.exec(out) !== null) n += 1
  return n
}

function buildMarkerHtml(ordinal: number, opts: { wrapItem?: boolean } = {}, mode: CheckboxMarkerMode): string {
  if (mode === 'interactive') {
    return buildInteractiveCheckboxMarkerHtml(ordinal, opts)
  }
  return buildCheckboxPreviewMarkerHtml(ordinal, opts)
}

function buildCheckboxPreviewMarkerHtml(
  ordinal: number,
  opts: { wrapItem?: boolean } = {},
): string {
  const n = Math.max(1, Math.floor(Number(ordinal)) || 1)
  const wrapItem = opts.wrapItem !== false
  // 内联样式：预览区为 dangerouslySetInnerHTML，不依赖 Tailwind
  const core =
    `<span class="icf-cb-preview" data-icf-cb-ord="${n}" style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:0.15rem 0.45rem;margin:0;vertical-align:middle;font-size:inherit;line-height:1.5;">` +
    `<span style="color:#dc2626;font-weight:600;white-space:nowrap;">请勾选</span>` +
    `<span style="display:inline-flex;align-items:center;gap:0.35rem;flex-wrap:wrap;">` +
    `<span style="display:inline-flex;align-items:center;gap:0.12rem;">` +
    `<span style="display:inline-block;box-sizing:border-box;width:0.85em;height:0.85em;border:1px solid #64748b;border-radius:2px;background:#fff;vertical-align:-0.12em;"></span>` +
    `<span style="white-space:nowrap;">是</span>` +
    `</span>` +
    `<span style="display:inline-flex;align-items:center;gap:0.12rem;">` +
    `<span style="display:inline-block;box-sizing:border-box;width:0.85em;height:0.85em;border:1px solid #64748b;border-radius:2px;background:#fff;vertical-align:-0.12em;"></span>` +
    `<span style="white-space:nowrap;">否</span>` +
    `</span>` +
    `</span>` +
    `</span>`
  return wrapItem ? wrapCheckboxPreviewItem(core) : core
}

/** 与配置预览一致：方形勾选框；同一组「是/否」互斥（checkbox + onchange） */
const ICF_CB_MUTUAL_EXCL_ONCHANGE =
  `onchange="var p=this.closest('.icf-cb-preview');if(!p)return;var y=p.querySelector('.icf-cb-yes'),n=p.querySelector('.icf-cb-no');if(!y||!n)return;if(this.classList.contains('icf-cb-yes')){if(this.checked)n.checked=false}else{if(this.checked)y.checked=false}"`

/**
 * 联调/H5：与预览同版式（□是/□否），使用方形 checkbox 而非圆形 radio，避免与配置示意不一致。
 */
function buildInteractiveCheckboxMarkerHtml(ordinal: number, opts: { wrapItem?: boolean } = {}): string {
  const n = Math.max(1, Math.floor(Number(ordinal)) || 1)
  const wrapItem = opts.wrapItem !== false
  const name = `icf-cb-g${n}`
  const core =
    `<span class="icf-cb-preview icf-cb-interactive" data-icf-cb-ord="${n}" data-icf-cb-group="${name}" style="display:inline-flex;align-items:center;flex-wrap:wrap;gap:0.15rem 0.45rem;margin:0;vertical-align:middle;font-size:inherit;line-height:1.5;">` +
    `<span class="icf-cb-prompt" style="color:#dc2626;font-weight:600;white-space:nowrap;">请勾选</span>` +
    `<span style="display:inline-flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">` +
    `<label style="display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;margin:0;user-select:none;">` +
    `<input type="checkbox" class="icf-cb-yes" ${ICF_CB_MUTUAL_EXCL_ONCHANGE} aria-label="是" />` +
    `<span style="white-space:nowrap;">是</span>` +
    `</label>` +
    `<label style="display:inline-flex;align-items:center;gap:0.2rem;cursor:pointer;margin:0;user-select:none;">` +
    `<input type="checkbox" class="icf-cb-no" ${ICF_CB_MUTUAL_EXCL_ONCHANGE} aria-label="否" />` +
    `<span style="white-space:nowrap;">否</span>` +
    `</label>` +
    `</span>` +
    `</span>`
  return wrapItem ? wrapCheckboxPreviewItem(core) : core
}

/** 从勾选符前面的正文里取「最后一句/半句」作标题 */
function extractHeadline(contextBefore: string): string {
  const t = contextBefore.replace(/\s+/g, ' ').trim()
  if (!t) return '（紧邻上文较短，请对照原文核对）'
  const parts = t.split(/[。；]/)
  const last = parts[parts.length - 1]?.trim() || t
  if (last.length <= 72) return last
  return `${last.slice(0, 36)}…${last.slice(-28)}`
}

type PatternDef = { name: string; re: RegExp }

/**
 * 多种 Word 里常见写法：
 * - 「请勾选 [ ] 是 [ ] 否」（与纸质/截图一致时以此为识别成功标志之一）
 * - ___Yes 是 ___No 否、____Yes是 ____No否、□ 是 □ 否 等
 * 按正则分别扫描，用「起始下标」去重后按位置排序编号，保证与文档顺序一致。
 */
/** 方框/选票符（Word、个人信息表常见：□、☐ 等；不含已勾选符号以免误匹配） */
const BOX_CLASS = '[\u25A1\u2610\u25A2\u25A3]'

const PATTERNS: PatternDef[] = [
  {
    name: '请勾选 [ ] 是 [ ] 否（方括号勾选项）',
    re: /请勾选\s*\[\s*\]\s*是\s*\[\s*\]\s*否/g,
  },
  {
    name: '请勾选 [ ]是 [ ]否（无多余空格）',
    re: /请勾选\s*\[\s*\]是\s*\[\s*\]否/g,
  },
  {
    name: '请勾选 全角［ ］ 是 / 否',
    re: /请勾选\s*［\s*］\s*是\s*［\s*］\s*否/g,
  },
  {
    name: '下划线 + Yes是 / No否（含空格，如 ___Yes 是 ___No 否）',
    re: /_{2,8}\s*Yes\s*是\s*_{2,8}\s*No\s*否/gi,
  },
  {
    name: '下划线 + Yes是 / No否（无空格）',
    re: /_{2,8}\s*Yes是\s*_{2,8}\s*No否/gi,
  },
  {
    name: '□/☐ 变体 + 是 + 否（含空格，个人信息表行）',
    re: new RegExp(`${BOX_CLASS}\\s*是\\s*${BOX_CLASS}\\s*否`, 'g'),
  },
  {
    name: '□/☐ 变体紧凑是/否（表格单元格常见：□是□否）',
    re: new RegExp(`${BOX_CLASS}是${BOX_CLASS}否`, 'g'),
  },
]

type Span = PlainSpan

/**
 * 个人信息表：□姓名、□实验样本…□病史（行间无「是/否」双选项）。
 * 字段文本不得跨过「注：/说明：」等图例前缀，否则会把「 注：√」并入上一格（mammoth 常把多段合成一行）。
 */
const LABEL_BOX_IN_ROW = new RegExp(
  `[\\u25A1\\u2610\\u25A2\\u25A3]\\s*(?:(?!(?:注|说明|备注|附注|图例|note|legend)\\s*[：:])[^\\u25A1\\u2610\\u25A2\\u25A3\\n])*?(?=\\s*(?:[\\u25A1\\u2610\\u25A2\\u25A3]|(?:注|说明|备注|附注|图例|note|legend)\\s*[：:])|$)`,
  'gi',
)

function collectSpans(plain: string): Span[] {
  const byStart = new Map<number, Span>()
  for (const { name, re } of PATTERNS) {
    const r = new RegExp(re.source, re.flags && re.flags.includes('g') ? re.flags : `${re.flags || ''}g`)
    let m: RegExpExecArray | null
    while ((m = r.exec(plain)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (!byStart.has(start)) {
        byStart.set(start, { start, end, rule: name })
      }
    }
  }
  const existing = [...byStart.values()]
  let lm: RegExpExecArray | null
  LABEL_BOX_IN_ROW.lastIndex = 0
  while ((lm = LABEL_BOX_IN_ROW.exec(plain)) !== null) {
    const start = lm.index
    const end = start + lm[0].length
    const cand = { start, end }
    if (existing.some((s) => spanOverlaps(s, cand))) continue
    if (!byStart.has(start)) {
      byStart.set(start, { start, end, rule: LABEL_FIELD_RULE })
    }
  }
  const sorted = [...byStart.values()].sort((a, b) => a.start - b.start)
  return filterLegendExcludedSpans(plain, sorted)
}

/**
 * 从 mammoth 输出的 HTML 或正文 HTML 片段识别勾选句式（按出现顺序编号）。
 */
export function detectCheckboxControlsFromHtml(html: string): DetectedCheckboxControl[] {
  const htmlNorm = decodeNumericHtmlEntities(html)
  const tokens = htmlToPlainTokens(htmlNorm)
  const plain = tokens ? tokens.map((t) => t.ch).join('') : stripTags(htmlNorm)
  const spans = collectSpans(plain)
  return spans.map((span, i) => {
    const ordinal = i + 1
    const { start, end, rule } = span
    const contextBefore = plain.slice(Math.max(0, start - 260), start)
    const headline = extractHeadline(contextBefore)
    const matchText = plain.slice(start, end).trim()
    const snippet = plain.slice(Math.max(0, start - 56), Math.min(plain.length, end + 40)).trim()
    return {
      id: hashId(`${ordinal}-${start}-${snippet.slice(0, 40)}`),
      ordinal,
      ordinalLabel: `第 ${ordinal} 处`,
      headline,
      matchText,
      snippet,
      rule,
    }
  })
}

/** 文档中常见的「其他补充说明」占位句（与补充采集项配置对应） */
export const OTHER_INFO_PLACEHOLDER_PHRASE = '如有其他信息，可在此添加'

/**
 * 从正文 HTML 中移除「如有其他信息，可在此添加」占位块（整段 p / 或表格 tr）。
 * 与执行台配置一致：该行是否出现仅由 **appendSupplementalCollectCheckboxPreviewRows**（及 collect_other_information）决定，
 * 不从 Word 文档重复展示，避免与配置项不一致、且多出一组未闭合的交互勾选导致联调页按钮无法置亮。
 */
export function stripEmbeddedOtherInfoPlaceholderBlocks(html: string): string {
  if (!html || !html.includes(OTHER_INFO_PLACEHOLDER_PHRASE)) return html
  let out = html
  const pBlock =
    /<p\b[^>]*>(?:(?!<\/p>).)*如有其他信息，可在此添加(?:(?!<\/p>).)*<\/p>/gi
  const trBlock =
    /<tr\b[^>]*>(?:(?!<\/tr>).)*如有其他信息，可在此添加(?:(?!<\/tr>).)*<\/tr>/gi
  out = out.replace(pBlock, '')
  out = out.replace(trBlock, '')
  return out
}

/**
 * 兼容旧名：先移除文档内嵌的「其他信息」占位块，再按「是否已填补充采集项标题」做旧逻辑（已并入 stripEmbedded）。
 */
export function stripDocumentOtherInfoPlaceholderForCustomSupplemental(
  html: string,
  _supplementalLabels: string[] | undefined,
): string {
  return stripEmbeddedOtherInfoPlaceholderBlocks(html)
}

/** 与配置页一致：补充采集项行数（有标题的条数；仅勾选「其他信息」且无标题时计 1） */
export function countSupplementalCollectPreviewRows(
  supplementalLabels: string[] | undefined,
  collectOtherInformation: boolean,
): number {
  const labels = (supplementalLabels || []).map((s) => s.trim()).filter(Boolean)
  if (labels.length > 0) return labels.length
  if (collectOtherInformation) return 1
  return 0
}

/**
 * 在 `injectCheckboxPreviewMarkers` 输出中，定位最后一个 `span.icf-cb-item-row` 结束下标。
 * 用于将补充采集行插在与上方勾选列表紧邻处（红框位置），避免落到文末隐私说明之后。
 */
export function findInsertIndexAfterLastCheckboxItemRow(html: string): number {
  if (!html) return -1
  const re = /<span\s+class="icf-cb-item-row"[^>]*>/gi
  let lastStart = -1
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    lastStart = m.index
  }
  if (lastStart < 0) return -1
  const open = html.slice(lastStart).match(/^<span\s+class="icf-cb-item-row"[^>]*>/i)
  if (!open) return -1
  let i = lastStart + open[0].length
  let depth = 1
  while (i < html.length) {
    const rest = html.slice(i)
    const openSpan = rest.match(/^<\s*span\b[^>]*>/i)
    const closeSpan = rest.match(/^<\s*\/\s*span\s*>/i)
    if (openSpan && openSpan.index === 0) {
      depth += 1
      i += openSpan[0].length
    } else if (closeSpan && closeSpan.index === 0) {
      depth -= 1
      i += closeSpan[0].length
      if (depth === 0) return i
    } else {
      i += 1
    }
  }
  return -1
}

/**
 * 在正文勾选注入完成后，将「补充说明类采集」追加为示意行（字段名 + 红色请勾选 + □是/□否）。
 * 优先插在**最后一个文档内勾选行**之后（与 `icf-cb-item-row` 列表间距一致）；若无文档行则回退到 `</body>` 前。
 * ordinal 接在原文 `countCheckboxPreviewMarkers(raw)` 之后。
 */
export function appendSupplementalCollectCheckboxPreviewRows(
  injectedHtml: string,
  rawHtmlForOrdinals: string,
  supplementalLabels: string[] | undefined,
  collectOtherInformation: boolean,
  mode: CheckboxMarkerMode = 'preview',
): string {
  let labels = (supplementalLabels || []).map((s) => s.trim()).filter(Boolean)
  if (labels.length === 0 && collectOtherInformation) {
    labels = ['如有其他信息，可在此添加']
  }
  if (labels.length === 0) return injectedHtml

  const baseOrd = countCheckboxPreviewMarkers(rawHtmlForOrdinals)
  let frag = ''
  for (let i = 0; i < labels.length; i += 1) {
    const ord = baseOrd + i + 1
    const marker = buildMarkerHtml(ord, { wrapItem: false }, mode)
    const inner =
      `<span class="icf-cb-field" style="color:#0f172a;font-weight:500;line-height:1.5;vertical-align:middle;">${escapeHtml(labels[i])}</span> ` +
      marker
    frag += wrapCheckboxPreviewItem(inner)
  }
  const afterLastRow = findInsertIndexAfterLastCheckboxItemRow(injectedHtml)
  if (afterLastRow >= 0) {
    return injectedHtml.slice(0, afterLastRow) + frag + injectedHtml.slice(afterLastRow)
  }
  const lower = injectedHtml.toLowerCase()
  const bodyClose = lower.lastIndexOf('</body>')
  if (bodyClose !== -1) {
    return injectedHtml.slice(0, bodyClose) + frag + injectedHtml.slice(bodyClose)
  }
  return injectedHtml + frag
}

function yesNoCheckboxGroupHasSelection(groupEl: Element): boolean {
  const yes = groupEl.querySelector('input.icf-cb-yes')
  const no = groupEl.querySelector('input.icf-cb-no')
  if (!(yes instanceof HTMLInputElement) || !(no instanceof HTMLInputElement)) return false
  return (yes.checked && !no.checked) || (!yes.checked && no.checked)
}

/**
 * 联调页：是否每一处「请勾选」交互组均已选择「是」或「否」（每组方形 checkbox 二选一）。
 */
export function icfInteractiveCheckboxGroupsAllAnswered(root: HTMLElement | null): boolean {
  if (!root) return true
  const groups = root.querySelectorAll('.icf-cb-preview.icf-cb-interactive')
  if (groups.length === 0) return true
  const seenNames = new Set<string>()
  for (let i = 0; i < groups.length; i += 1) {
    const g = groups[i]
    const ord = (g.getAttribute('data-icf-cb-ord') || '').trim()
    if (!ord) return false
    const name = `icf-cb-g${ord}`
    if (seenNames.has(name)) continue
    seenNames.add(name)
    if (!yesNoCheckboxGroupHasSelection(g)) return false
  }
  return true
}

/**
 * 联调页提交：按文档顺序采集每组「是/否」的值，供写入 signature_data.icf_checkbox_answers。
 */
export function collectInteractiveCheckboxAnswers(root: HTMLElement | null): Array<{ value: string }> {
  if (!root) return []
  const groups = root.querySelectorAll('.icf-cb-preview.icf-cb-interactive')
  const out: Array<{ value: string }> = []
  const seen = new Set<string>()
  groups.forEach((g) => {
    const ord = (g.getAttribute('data-icf-cb-ord') || '').trim()
    if (!ord) return
    const name = `icf-cb-g${ord}`
    if (seen.has(name)) return
    seen.add(name)
    const yes = g.querySelector('input.icf-cb-yes')
    const no = g.querySelector('input.icf-cb-no')
    if (yes instanceof HTMLInputElement && yes.checked && !(no instanceof HTMLInputElement && no.checked)) {
      out.push({ value: 'yes' })
      return
    }
    if (no instanceof HTMLInputElement && no.checked && !(yes instanceof HTMLInputElement && yes.checked)) {
      out.push({ value: 'no' })
    }
  })
  return out
}
