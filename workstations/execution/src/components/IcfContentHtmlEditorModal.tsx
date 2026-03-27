/**
 * 执行台知情配置：在网页中编辑 ICF 正文 HTML，并插入与 @cn-kis/consent-placeholders 一致的占位符（无需在 Word 中修改）。
 * 正文预览在上、HTML 源码在下；可点击占位符示意定位到 `{{...}}`，或在预览中拖选原文以唯一匹配时跳转源码选区。
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@cn-kis/ui-kit'
import { protocolApi } from '@cn-kis/api-client'

const MORE_INSERT_TOKENS: { label: string; token: string }[] = [
  { label: '项目编号', token: '{{ICF_PROTOCOL_CODE}}' },
  { label: '项目标题', token: '{{ICF_PROTOCOL_TITLE}}' },
  { label: '节点标题', token: '{{ICF_NODE_TITLE}}' },
  { label: '版本号', token: '{{ICF_VERSION_LABEL}}' },
  { label: '受试者姓名', token: '{{ICF_SUBJECT_NAME}}' },
  { label: '身份证', token: '{{ICF_ID_CARD}}' },
  { label: '身份证后四位', token: '{{ICF_ID_CARD_LAST4}}' },
  { label: '手机', token: '{{ICF_PHONE}}' },
  { label: '手机后四位', token: '{{ICF_PHONE_LAST4}}' },
  { label: '筛选号', token: '{{ICF_SCREENING_NUMBER}}' },
  { label: '拼音首字母', token: '{{ICF_INITIALS}}' },
  { label: '签署时间 ISO', token: '{{ICF_SIGNED_AT_ISO}}' },
  { label: '签署年', token: '{{ICF_SIGNED_YEAR}}' },
  { label: '签署月', token: '{{ICF_SIGNED_MONTH}}' },
  { label: '签署日(日)', token: '{{ICF_SIGNED_DAY}}' },
  { label: '回执号', token: '{{ICF_RECEIPT_NO}}' },
]

type KeywordAnchorRule = {
  id: string
  label: string
  keyword: string
  token: string
  mode: 'before' | 'after'
}

type RuleRunResult = {
  ruleId: string
  label: string
  ok: boolean
  message: string
}

const DEFAULT_KEYWORD_RULES: KeywordAnchorRule[] = [
  { id: 'subject-1', label: '受试者签名1', keyword: '同意人', token: '{{ICF_SUBJECT_SIG_1}}', mode: 'after' },
  { id: 'subject-2', label: '受试者签名2', keyword: '受试者签名', token: '{{ICF_SUBJECT_SIG_2}}', mode: 'after' },
  { id: 'staff-1', label: '研究者/工作人员签名1', keyword: '研究者', token: '{{ICF_STAFF_SIG_1}}', mode: 'after' },
  {
    id: 'ymd',
    label: '年月日（自动签署日，需唯一匹配）',
    keyword: '年 月 日',
    token: '{{ICF_SIGNED_YEAR}}年{{ICF_SIGNED_MONTH}}月{{ICF_SIGNED_DAY}}日',
    mode: 'after',
  },
]

function ruleStorageKey(protocolId: number, icfId: number): string {
  return `icf.keyword-anchor-rules:${protocolId}:${icfId}`
}

function applyKeywordRuleOnce(source: string, rule: KeywordAnchorRule): { ok: boolean; next: string; message?: string } {
  const keyword = (rule.keyword || '').trim()
  const token = (rule.token || '').trim()
  if (!keyword || !token) return { ok: false, next: source, message: '规则缺少关键词或占位符' }
  const first = source.indexOf(keyword)
  if (first < 0) return { ok: false, next: source, message: `未找到关键词：${keyword}` }
  const second = source.indexOf(keyword, first + keyword.length)
  if (second >= 0) return { ok: false, next: source, message: `关键词「${keyword}」出现多次，请改成更唯一的关键词` }
  const insertPos = rule.mode === 'before' ? first : first + keyword.length
  const winL = Math.max(0, insertPos - 80)
  const winR = Math.min(source.length, insertPos + 80)
  const around = source.slice(winL, winR)
  if (around.includes(token)) {
    return { ok: false, next: source, message: `关键词「${keyword}」附近已存在相同占位符` }
  }
  const next = source.slice(0, insertPos) + token + source.slice(insertPos)
  return { ok: true, next }
}

function validateKeywordRules(rules: KeywordAnchorRule[]): string[] {
  const errs: string[] = []
  const seen = new Set<string>()
  for (const r of rules) {
    const key = `${r.keyword.trim()}::${r.token.trim()}::${r.mode}`
    if (!r.keyword.trim()) errs.push(`规则「${r.label || r.id}」缺少关键词`)
    if (!r.token.trim()) errs.push(`规则「${r.label || r.id}」缺少占位符`)
    if (seen.has(key)) errs.push(`存在重复规则：${r.label || r.keyword}`)
    seen.add(key)
  }
  return errs
}

function insertAtCursor(textarea: HTMLTextAreaElement, text: string) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const v = textarea.value
  const next = v.slice(0, start) + text + v.slice(end)
  textarea.value = next
  const pos = start + text.length
  textarea.selectionStart = textarea.selectionEnd = pos
  textarea.focus()
}

function getMutationErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { msg?: string } }; message?: string }
  return e?.response?.data?.msg || e?.message || fallback
}

/** 与左侧知情配置（受试者/工作人员签名次数）一致，生成「插入」主按钮列表 */
export type IcfHtmlInsertTokenSettings = {
  enable_subject_signature: boolean
  subject_signature_times: 1 | 2
  enable_staff_signature: boolean
  staff_signature_times: 1 | 2
  /** 与节点「启用自动签署日期」一致时展示拆分占位，便于对齐文书「年 月 日」行 */
  enable_auto_sign_date?: boolean
}

export function buildIcfHtmlPrimaryInsertTokens(s: IcfHtmlInsertTokenSettings): { label: string; token: string }[] {
  const out: { label: string; token: string }[] = []
  if (s.enable_subject_signature) {
    const t = s.subject_signature_times === 2 ? 2 : 1
    if (t >= 1) out.push({ label: '受试者签名1', token: '{{ICF_SUBJECT_SIG_1}}' })
    if (t >= 2) out.push({ label: '受试者签名2', token: '{{ICF_SUBJECT_SIG_2}}' })
  }
  if (s.enable_staff_signature) {
    const st = s.staff_signature_times === 2 ? 2 : 1
    if (st >= 1) out.push({ label: '工作人员签名1', token: '{{ICF_STAFF_SIG_1}}' })
    if (st >= 2) out.push({ label: '工作人员签名2', token: '{{ICF_STAFF_SIG_2}}' })
  }
  out.push({ label: '签署日', token: '{{ICF_SIGNED_DATE}}' })
  if (s.enable_auto_sign_date) {
    out.push({
      label: '签署年月日（拆分，与自动签署日一致）',
      token: '{{ICF_SIGNED_YEAR}}年{{ICF_SIGNED_MONTH}}月{{ICF_SIGNED_DAY}}日',
    })
  }
  return out
}

export type IcfContentHtmlEditorPanelProps = {
  protocolId: number
  icfId: number
  nodeTitle: string
  /** 库内当前正文（用于「尚无 HTML」提示） */
  initialSavedContent: string
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  insertTokens: { label: string; token: string }[]
  onCancel: () => void
  onSaved?: () => void
  /** 由 applyIcfPlaceholdersWithSourceAnchors 生成的 HTML，用于点击占位符/选区定位源码 */
  anchoredPreviewHtml?: string
  /** 外部预览（例如文件预览 iframe）；用于无正文 HTML 时复用右侧预览效果 */
  externalPreview?: ReactNode
  /** 无正文时：将当前预览转为可编辑 HTML */
  onHydrateFromPreview?: () => Promise<void> | void
  hydratingFromPreview?: boolean
}

export function IcfContentHtmlEditorPanel({
  protocolId,
  icfId,
  nodeTitle,
  initialSavedContent,
  value,
  onChange,
  disabled,
  insertTokens,
  onCancel,
  onSaved,
  anchoredPreviewHtml,
  externalPreview,
  onHydrateFromPreview,
  hydratingFromPreview,
}: IcfContentHtmlEditorPanelProps) {
  const queryClient = useQueryClient()
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const previewRootRef = useRef<HTMLDivElement | null>(null)
  const [showMore, setShowMore] = useState(false)
  const [pendingInsertToken, setPendingInsertToken] = useState<string | null>(null)
  const [previewInsertMode, setPreviewInsertMode] = useState<'before' | 'after'>('after')
  const [previewGhost, setPreviewGhost] = useState<{ x: number; y: number; anchorText: string } | null>(null)
  const [keywordRules, setKeywordRules] = useState<KeywordAnchorRule[]>(DEFAULT_KEYWORD_RULES)
  const [keywordRuleDraft, setKeywordRuleDraft] = useState<KeywordAnchorRule>({
    id: '',
    label: '',
    keyword: '',
    token: '{{ICF_SUBJECT_SIG_1}}',
    mode: 'after',
  })
  const [ruleRunLog, setRuleRunLog] = useState<RuleRunResult[]>([])

  const insertTokenAtRange = useCallback(
    (token: string, start: number, end: number) => {
      const len = value.length
      const safeStart = Math.min(Math.max(0, start), len)
      const safeEnd = Math.min(Math.max(0, end), len)
      const pos = previewInsertMode === 'before' ? safeStart : safeEnd
      const next = value.slice(0, pos) + token + value.slice(pos)
      onChange(next)
      setPendingInsertToken(null)
      requestAnimationFrame(() => {
        focusSourceRange(pos, pos + token.length)
      })
    },
    [focusSourceRange, onChange, previewInsertMode, value],
  )

  const focusSourceRange = useCallback((start: number, end: number) => {
    const ta = taRef.current
    if (!ta || start < 0 || end < start) return
    const len = value.length
    const s = Math.min(start, len)
    const e = Math.min(end, len)
    ta.focus()
    ta.setSelectionRange(s, e)
  }, [value])

  const handlePreviewClick = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      const anchor = (e.target as HTMLElement).closest('[data-icf-src-start]')
      if (!anchor || !previewRootRef.current?.contains(anchor)) return
      e.preventDefault()
      e.stopPropagation()
      const s = Number(anchor.getAttribute('data-icf-src-start'))
      const end = Number(anchor.getAttribute('data-icf-src-end'))
      if (Number.isNaN(s) || Number.isNaN(end)) return
      if (pendingInsertToken) {
        insertTokenAtRange(pendingInsertToken, s, end)
        return
      }
      focusSourceRange(s, end)
    },
    [focusSourceRange, insertTokenAtRange, pendingInsertToken],
  )

  const handlePreviewMouseUp = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('.icf-src-anchor')) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
      const root = previewRootRef.current
      if (!root || !sel.anchorNode || !root.contains(sel.anchorNode)) return
      let text = sel.toString().replace(/\u00a0/g, ' ')
      text = text.trim()
      if (text.length < 2) return
      const v = value
      const idx = v.indexOf(text)
      if (idx === -1) return
      if (v.indexOf(text, idx + 1) !== -1) return
      if (pendingInsertToken) {
        insertTokenAtRange(pendingInsertToken, idx, idx + text.length)
        return
      }
      focusSourceRange(idx, idx + text.length)
    },
    [focusSourceRange, insertTokenAtRange, pendingInsertToken, value],
  )

  const handlePreviewMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!pendingInsertToken || anchoredPreviewHtml === undefined) {
        if (previewGhost) setPreviewGhost(null)
        return
      }
      const anchor = (e.target as HTMLElement).closest('[data-icf-src-start]') as HTMLElement | null
      if (!anchor || !previewRootRef.current?.contains(anchor)) {
        if (previewGhost) setPreviewGhost(null)
        return
      }
      const rect = anchor.getBoundingClientRect()
      const text = (anchor.textContent || '').trim()
      const anchorText = text.length > 14 ? `${text.slice(0, 14)}…` : text
      setPreviewGhost({
        x: rect.left + rect.width / 2,
        y: rect.top - 6,
        anchorText,
      })
    },
    [anchoredPreviewHtml, pendingInsertToken, previewGhost],
  )

  const handlePreviewMouseLeave = useCallback(() => {
    if (previewGhost) setPreviewGhost(null)
  }, [previewGhost])

  useEffect(() => {
    setShowMore(false)
    setPendingInsertToken(null)
    setPreviewInsertMode('after')
    setPreviewGhost(null)
    setRuleRunLog([])
  }, [icfId])

  useEffect(() => {
    const key = ruleStorageKey(protocolId, icfId)
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) {
        setKeywordRules(DEFAULT_KEYWORD_RULES)
        return
      }
      const arr = JSON.parse(raw) as KeywordAnchorRule[]
      if (!Array.isArray(arr) || arr.length === 0) {
        setKeywordRules(DEFAULT_KEYWORD_RULES)
        return
      }
      const cleaned = arr
        .filter((x) => x && typeof x === 'object')
        .map((x) => ({
          id: String(x.id || globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
          label: String(x.label || '').trim(),
          keyword: String(x.keyword || '').trim(),
          token: String(x.token || '{{ICF_SUBJECT_SIG_1}}').trim(),
          mode: x.mode === 'before' ? 'before' : 'after',
        }))
        .filter((x) => x.keyword && x.token)
      setKeywordRules(cleaned.length ? cleaned : DEFAULT_KEYWORD_RULES)
    } catch {
      setKeywordRules(DEFAULT_KEYWORD_RULES)
    }
  }, [protocolId, icfId])

  useEffect(() => {
    const key = ruleStorageKey(protocolId, icfId)
    try {
      window.localStorage.setItem(key, JSON.stringify(keywordRules))
    } catch {
      // ignore storage errors
    }
  }, [protocolId, icfId, keywordRules])

  useEffect(() => {
    if (!pendingInsertToken) {
      setPreviewGhost(null)
      return
    }
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setPendingInsertToken(null)
        setPreviewGhost(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingInsertToken])

  const saveMutation = useMutation({
    mutationFn: () => protocolApi.updateIcfVersion(protocolId, icfId, { content: value }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['protocol', protocolId, 'icf-versions'] })
      await queryClient.invalidateQueries({ queryKey: ['protocol', 'consent-overview'] })
      onSaved?.()
    },
    onError: (err) => {
      window.alert(getMutationErrorMessage(err, '保存失败'))
    },
  })

  const insert = (token: string) => {
    if (anchoredPreviewHtml !== undefined) {
      setPendingInsertToken(token)
      return
    }
    const el = taRef.current
    if (!el) {
      onChange(value + token)
      return
    }
    insertAtCursor(el, token)
    onChange(el.value)
  }

  const insertRow = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-600 shrink-0">插入：</span>
        {insertTokens.map(({ label, token }) => (
          <button
            key={token}
            type="button"
            disabled={disabled || saveMutation.isPending}
            onClick={() => insert(token)}
            className="rounded-md border border-indigo-200 bg-indigo-50/90 px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
          >
            {label}
          </button>
        ))}
        {pendingInsertToken ? (
          <button
            type="button"
            className="text-xs text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
            onClick={() => setPendingInsertToken(null)}
          >
            取消点预览插入
          </button>
        ) : null}
        <button
          type="button"
          className="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
          onClick={() => setShowMore((s) => !s)}
        >
          {showMore ? '收起更多' : '更多占位符'}
        </button>
      </div>
      {showMore ? (
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto rounded-md border border-slate-100 bg-slate-50/80 p-2">
          {MORE_INSERT_TOKENS.map(({ label, token }) => (
            <button
              key={token}
              type="button"
              disabled={disabled || saveMutation.isPending}
              onClick={() => insert(token)}
              className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  )

  const runKeywordRules = (opts: { apply: boolean }) => {
    if (!value.trim()) {
      window.alert('请先生成或粘贴 HTML 正文，再执行定点规则')
      return
    }
    const ruleErrors = validateKeywordRules(keywordRules)
    if (ruleErrors.length) {
      window.alert(`规则校验失败：\n${ruleErrors.map((x) => `- ${x}`).join('\n')}`)
      return
    }
    let next = value
    const logs: RuleRunResult[] = []
    let hit = 0
    for (const rule of keywordRules) {
      const r = applyKeywordRuleOnce(next, rule)
      if (r.ok) {
        hit += 1
        next = r.next
        logs.push({
          ruleId: rule.id,
          label: rule.label || rule.keyword,
          ok: true,
          message: '命中并可插入',
        })
      } else {
        logs.push({
          ruleId: rule.id,
          label: rule.label || rule.keyword,
          ok: false,
          message: r.message || '未命中',
        })
      }
    }
    setRuleRunLog(logs)
    if (opts.apply && hit > 0) onChange(next)
    const lines = [opts.apply ? `已应用 ${hit} 条规则。` : `试运行命中 ${hit} 条规则（未写入）。`]
    const fails = logs.filter((x) => !x.ok)
    if (fails.length) lines.push('', '未命中/跳过：', ...fails.map((x) => `- ${x.label}: ${x.message}`))
    window.alert(lines.join('\n'))
  }

  const applyKeywordRules = () => runKeywordRules({ apply: true })
  const dryRunKeywordRules = () => runKeywordRules({ apply: false })

  const resetKeywordRules = () => {
    setKeywordRules(DEFAULT_KEYWORD_RULES)
    setRuleRunLog([])
  }

  const exportKeywordRules = async () => {
    const payload = JSON.stringify(keywordRules, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      window.alert('规则 JSON 已复制到剪贴板')
    } catch {
      window.alert(`复制失败，请手动复制：\n${payload}`)
    }
  }

  const importKeywordRules = () => {
    const raw = window.prompt('请粘贴规则 JSON（数组）')
    if (!raw) return
    try {
      const arr = JSON.parse(raw) as KeywordAnchorRule[]
      if (!Array.isArray(arr)) throw new Error('JSON 必须是数组')
      const cleaned = arr
        .map((x) => ({
          id: String(x.id || globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)),
          label: String(x.label || '').trim(),
          keyword: String(x.keyword || '').trim(),
          token: String(x.token || '').trim(),
          mode: x.mode === 'before' ? 'before' : 'after',
        }))
        .filter((x) => x.keyword && x.token)
      if (!cleaned.length) throw new Error('未解析到有效规则')
      const errs = validateKeywordRules(cleaned)
      if (errs.length) throw new Error(errs.join('; '))
      setKeywordRules(cleaned)
      setRuleRunLog([])
      window.alert(`已导入 ${cleaned.length} 条规则`)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      window.alert(`导入失败：${m}`)
    }
  }

  const actions = (
    <div className="flex justify-end gap-2 pt-2 shrink-0">
      <Button type="button" variant="secondary" disabled={saveMutation.isPending} onClick={onCancel}>
        取消
      </Button>
      <Button
        type="button"
        variant="primary"
        disabled={disabled || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? '保存中…' : '保存正文'}
      </Button>
    </div>
  )

  const hasPreviewPane = anchoredPreviewHtml !== undefined || !!externalPreview

  if (hasPreviewPane) {
    const canAnchorToSource = anchoredPreviewHtml !== undefined
    return (
      <div className="space-y-3 text-sm text-slate-700">
        <p className="text-xs text-slate-500 leading-relaxed">
          节点：<span className="font-medium text-slate-800">{nodeTitle || `节点 #${icfId}`}</span>
          。请<strong className="font-medium text-slate-700">先查看下方「正文预览」</strong>
          {canAnchorToSource ? (
            <>
              ：可<strong className="font-medium text-slate-700">点击</strong>签名/日期等占位符示意，或
              <strong className="font-medium text-slate-700">拖选</strong>
              预览中与源码一致的片段（全文仅一处匹配时），即可在下方 HTML 中定位；再在光标处用「插入」添加占位符。
            </>
          ) : (
            <>，与右侧签署预览同源渲染；可对照效果在下方 HTML 源码中插入并调整占位符。</>
          )}
        </p>
        {pendingInsertToken && anchoredPreviewHtml !== undefined ? (
          <div className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 space-y-2">
            <p>
              已选择插入：<span className="font-medium">{pendingInsertToken}</span>。请点击上方正文预览中的目标位置完成插入。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-indigo-700/90">插入位置：</span>
              <button
                type="button"
                onClick={() => setPreviewInsertMode('before')}
                className={`rounded border px-2 py-0.5 ${
                  previewInsertMode === 'before'
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                选中文本前
              </button>
              <button
                type="button"
                onClick={() => setPreviewInsertMode('after')}
                className={`rounded border px-2 py-0.5 ${
                  previewInsertMode === 'after'
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
                }`}
              >
                选中文本后
              </button>
              <span className="text-indigo-700/90">也可拖选一段唯一文本后松开鼠标插入</span>
              <span className="text-indigo-700/90">按 Esc 可取消当前插入</span>
            </div>
          </div>
        ) : null}
        {!initialSavedContent.trim() && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            当前节点尚无已保存的 HTML 正文。保存后将新建正文；请确认版式与合规要求后再发布。
          </p>
        )}
        {!anchoredPreviewHtml && externalPreview && onHydrateFromPreview ? (
          <div className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-sky-900/90">
              当前为文件预览模式。先将预览转为可编辑 HTML，随后可通过“点上方预览插入占位符”实现连续编辑。
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || saveMutation.isPending || !!hydratingFromPreview}
              onClick={() => {
                void onHydrateFromPreview()
              }}
            >
              {hydratingFromPreview ? '转换中…' : '从当前预览生成可编辑HTML'}
            </Button>
          </div>
        ) : null}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/90 px-3 py-2">
            <div className="text-xs font-semibold text-slate-800">正文预览</div>
            {canAnchorToSource ? (
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                与当前源码一致（占位符已替换为示意）。点击示意或拖选文字可定位到下方源码对应位置。
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">复用签署文件预览效果，便于对照调整样式与占位符位置。</p>
            )}
          </div>
          <div
            ref={previewRootRef}
            role="presentation"
            onClick={canAnchorToSource ? handlePreviewClick : undefined}
            onMouseUp={canAnchorToSource ? handlePreviewMouseUp : undefined}
            onMouseMove={canAnchorToSource ? handlePreviewMouseMove : undefined}
            onMouseLeave={canAnchorToSource ? handlePreviewMouseLeave : undefined}
            className="max-h-[min(50vh,520px)] min-h-[min(28vh,220px)] overflow-auto bg-white p-3 sm:p-4 cursor-text
              [&_.icf-src-anchor]:cursor-pointer [&_.icf-src-anchor]:rounded-sm [&_.icf-src-anchor]:outline [&_.icf-src-anchor]:outline-1 [&_.icf-src-anchor]:outline-offset-1 [&_.icf-src-anchor]:outline-transparent
              hover:[&_.icf-src-anchor]:outline-indigo-400/90"
          >
            {anchoredPreviewHtml ? (
              <div
                className="consent-icf-preview prose prose-sm sm:prose-base prose-slate max-w-none text-slate-800 leading-relaxed
                  [&_h1]:text-base sm:[&_h1]:text-lg [&_h2]:text-sm sm:[&_h2]:text-base [&_p]:text-sm sm:[&_p]:text-[15px] [&_li]:text-sm sm:[&_li]:text-[15px]
                  [&_table]:text-xs sm:[&_table]:text-sm [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:border-slate-200 [&_td]:border-slate-200 [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1
                  [&_p]:has(.icf-cb-item-row):!my-0 [&_p]:has(.icf-cb-item-row):!py-0
                  [&_td]:align-top [&_td:has(.icf-cb-item-row)]:!py-1 [&_td:has(.icf-cb-item-row)]:align-top
                  [&_.icf-cb-item-row]:!block [&_.icf-cb-item-row]:!w-full [&_.icf-cb-item-row]:!max-w-full [&_.icf-cb-item-row]:!box-border [&_.icf-cb-item-row]:!m-0 [&_.icf-cb-item-row]:!py-2.5 [&_.icf-cb-item-row]:!leading-normal
                  [&_.icf-cb-preview]:not-prose [&_.icf-cb-preview]:text-[15px]
                  [&_.icf-src-anchor[data-icf-token*='ICF_SUBJECT_SIG']]:!outline-rose-400/90
                  [&_.icf-src-anchor[data-icf-token*='ICF_SUBJECT_SIG']]:!bg-rose-50/50
                  [&_.icf-src-anchor[data-icf-token*='ICF_STAFF_SIG']]:!outline-rose-400/90
                  [&_.icf-src-anchor[data-icf-token*='ICF_STAFF_SIG']]:!bg-rose-50/50"
                dangerouslySetInnerHTML={{ __html: anchoredPreviewHtml }}
              />
            ) : externalPreview ? (
              <div className="min-h-[min(28vh,220px)]">{externalPreview}</div>
            ) : (
              <p className="text-sm text-slate-500">暂无正文，可在下方粘贴 HTML。</p>
            )}
          </div>
          {previewGhost && pendingInsertToken && canAnchorToSource ? (
            <div
              className="fixed z-[70] pointer-events-none -translate-x-1/2 -translate-y-full rounded-md border border-indigo-200 bg-indigo-600 px-2 py-1 text-[11px] text-white shadow-sm"
              style={{ left: `${previewGhost.x}px`, top: `${previewGhost.y}px` }}
            >
              将插入到{previewInsertMode === 'before' ? '前' : '后'}：{previewGhost.anchorText || '当前位置'}
            </div>
          ) : null}
          <div className="border-t border-slate-200 bg-slate-50/70 px-3 py-2.5 space-y-2">
            <div className="text-[11px] font-medium text-slate-600">插入占位符（光标须在下框 HTML 源码中）</div>
            {insertRow}
          </div>
          <div className="border-t border-slate-200 bg-rose-50/60 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium text-rose-700">协议定点规则（按协议+节点本地保存）</div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={dryRunKeywordRules}
                  className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
                >
                  试运行
                </button>
                <button
                  type="button"
                  onClick={applyKeywordRules}
                  className="rounded-md border border-rose-200 bg-white px-2 py-1 text-[11px] font-medium text-rose-700 hover:bg-rose-50"
                >
                  一键执行
                </button>
              </div>
            </div>
            <div className="text-[11px] text-rose-700/90">
              适用于个性化版式：将“同意人/研究者”等关键词附近自动插入对应占位符（前/后可配）。
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={exportKeywordRules}
                className="rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-50"
              >
                导出规则
              </button>
              <button
                type="button"
                onClick={importKeywordRules}
                className="rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-50"
              >
                导入规则
              </button>
              <button
                type="button"
                onClick={resetKeywordRules}
                className="rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] text-rose-700 hover:bg-rose-50"
              >
                重置默认
              </button>
            </div>
            <div className="space-y-1.5">
              {keywordRules.map((r) => (
                <div key={r.id} className="grid grid-cols-12 gap-1.5">
                  <input
                    className="col-span-3 rounded border border-rose-200 bg-white px-2 py-1 text-[11px]"
                    value={r.label}
                    onChange={(e) =>
                      setKeywordRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)))
                    }
                    placeholder="规则名"
                  />
                  <input
                    className="col-span-3 rounded border border-rose-200 bg-white px-2 py-1 text-[11px]"
                    value={r.keyword}
                    onChange={(e) =>
                      setKeywordRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, keyword: e.target.value } : x)))
                    }
                    placeholder="关键词（需唯一）"
                  />
                  <input
                    className="col-span-4 rounded border border-rose-200 bg-white px-2 py-1 text-[11px]"
                    value={r.token}
                    onChange={(e) =>
                      setKeywordRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, token: e.target.value } : x)))
                    }
                    placeholder="{{ICF_SUBJECT_SIG_1}}"
                  />
                  <select
                    className="col-span-1 rounded border border-rose-200 bg-white px-1 py-1 text-[11px]"
                    value={r.mode}
                    onChange={(e) =>
                      setKeywordRules((prev) =>
                        prev.map((x) => (x.id === r.id ? { ...x, mode: e.target.value === 'before' ? 'before' : 'after' } : x)),
                      )
                    }
                  >
                    <option value="before">前</option>
                    <option value="after">后</option>
                  </select>
                  <button
                    type="button"
                    className="col-span-1 rounded border border-rose-200 bg-white px-1 py-1 text-[11px] text-rose-700 hover:bg-rose-100"
                    onClick={() => setKeywordRules((prev) => prev.filter((x) => x.id !== r.id))}
                    title="删除规则"
                  >
                    删
                  </button>
                </div>
              ))}
              <div className="grid grid-cols-12 gap-1.5">
                <input
                  className="col-span-3 rounded border border-rose-200 bg-white px-2 py-1 text-[11px]"
                  value={keywordRuleDraft.label}
                  onChange={(e) => setKeywordRuleDraft((p) => ({ ...p, label: e.target.value }))}
                  placeholder="新规则名"
                />
                <input
                  className="col-span-3 rounded border border-rose-200 bg-white px-2 py-1 text-[11px]"
                  value={keywordRuleDraft.keyword}
                  onChange={(e) => setKeywordRuleDraft((p) => ({ ...p, keyword: e.target.value }))}
                  placeholder="新关键词"
                />
                <input
                  className="col-span-4 rounded border border-rose-200 bg-white px-2 py-1 text-[11px]"
                  value={keywordRuleDraft.token}
                  onChange={(e) => setKeywordRuleDraft((p) => ({ ...p, token: e.target.value }))}
                  placeholder="{{ICF_SUBJECT_SIG_1}}"
                />
                <select
                  className="col-span-1 rounded border border-rose-200 bg-white px-1 py-1 text-[11px]"
                  value={keywordRuleDraft.mode}
                  onChange={(e) => setKeywordRuleDraft((p) => ({ ...p, mode: e.target.value === 'before' ? 'before' : 'after' }))}
                >
                  <option value="before">前</option>
                  <option value="after">后</option>
                </select>
                <button
                  type="button"
                  className="col-span-1 rounded border border-rose-200 bg-white px-1 py-1 text-[11px] text-rose-700 hover:bg-rose-100"
                  onClick={() => {
                    const label = keywordRuleDraft.label.trim()
                    const keyword = keywordRuleDraft.keyword.trim()
                    const token = keywordRuleDraft.token.trim()
                    if (!keyword || !token) {
                      window.alert('新增规则需填写关键词和占位符')
                      return
                    }
                    setKeywordRules((prev) => [
                      ...prev,
                      {
                        id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
                        label,
                        keyword,
                        token,
                        mode: keywordRuleDraft.mode,
                      },
                    ])
                    setKeywordRuleDraft((p) => ({ ...p, label: '', keyword: '' }))
                  }}
                  title="新增规则"
                >
                  加
                </button>
              </div>
            </div>
            {ruleRunLog.length ? (
              <div className="rounded border border-rose-200 bg-white/80 p-2 space-y-1">
                <div className="text-[11px] font-medium text-rose-700">最近一次试运行结果</div>
                {ruleRunLog.map((r) => (
                  <div key={r.ruleId} className={`text-[11px] ${r.ok ? 'text-emerald-700' : 'text-slate-600'}`}>
                    {r.ok ? '✓' : '-'} {r.label}：{r.message}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="border-t border-slate-200 p-3 space-y-2">
            <div className="text-[11px] font-medium text-slate-500">HTML 源码</div>
            <textarea
              ref={taRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled || saveMutation.isPending}
              spellCheck={false}
              className="w-full min-h-[14rem] resize-y font-mono text-xs leading-relaxed rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
              placeholder="对照上方面预览，将光标移到需插入签名的标签或段落处，再点上方「插入」…"
            />
            {actions}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p className="text-xs text-slate-500 leading-relaxed">
        节点：<span className="font-medium text-slate-800">{nodeTitle || `节点 #${icfId}`}</span>
        。在下方光标处插入占位符，保存后写入数据库。若当前仅有 Word 附件且无正文，可粘贴 HTML 或从 Word「另存为网页」复制源码后再保存。
      </p>
      {!initialSavedContent.trim() && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          当前节点尚无已保存的 HTML 正文。保存后将新建正文；请确认版式与合规要求后再发布。
        </p>
      )}
      {insertRow}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || saveMutation.isPending}
        spellCheck={false}
        className="w-full min-h-[min(28vh,260px)] font-mono text-xs leading-relaxed rounded-lg border border-slate-200 bg-white p-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60"
        placeholder="在此粘贴或编辑 HTML 正文…"
      />
      {actions}
    </div>
  )
}
