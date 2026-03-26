/**
 * 执行台知情配置：在网页中编辑 ICF 正文 HTML，并插入与 @cn-kis/consent-placeholders 一致的占位符（无需在 Word 中修改）。
 * 正文预览在上、HTML 源码在下；可点击占位符示意定位到 `{{...}}`，或在预览中拖选原文以唯一匹配时跳转源码选区。
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
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
  { label: '回执号', token: '{{ICF_RECEIPT_NO}}' },
]

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
}: IcfContentHtmlEditorPanelProps) {
  const queryClient = useQueryClient()
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const previewRootRef = useRef<HTMLDivElement | null>(null)
  const [showMore, setShowMore] = useState(false)

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
      focusSourceRange(s, end)
    },
    [focusSourceRange],
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
      focusSourceRange(idx, idx + text.length)
    },
    [value, focusSourceRange],
  )

  useEffect(() => {
    setShowMore(false)
  }, [icfId])

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

  if (anchoredPreviewHtml !== undefined) {
    return (
      <div className="space-y-3 text-sm text-slate-700">
        <p className="text-xs text-slate-500 leading-relaxed">
          节点：<span className="font-medium text-slate-800">{nodeTitle || `节点 #${icfId}`}</span>
          。请<strong className="font-medium text-slate-700">先查看下方「正文预览」</strong>
          ：可<strong className="font-medium text-slate-700">点击</strong>签名/日期等占位符示意，或
          <strong className="font-medium text-slate-700">拖选</strong>
          预览中与源码一致的片段（全文仅一处匹配时），即可在下方 HTML 中定位；再在光标处用「插入」添加占位符。
        </p>
        {!initialSavedContent.trim() && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            当前节点尚无已保存的 HTML 正文。保存后将新建正文；请确认版式与合规要求后再发布。
          </p>
        )}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50/90 px-3 py-2">
            <div className="text-xs font-semibold text-slate-800">正文预览</div>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              与当前源码一致（占位符已替换为示意）。点击示意或拖选文字可定位到下方源码对应位置。
            </p>
          </div>
          <div
            ref={previewRootRef}
            role="presentation"
            onClick={handlePreviewClick}
            onMouseUp={handlePreviewMouseUp}
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
                  [&_.icf-cb-preview]:not-prose [&_.icf-cb-preview]:text-[15px]"
                dangerouslySetInnerHTML={{ __html: anchoredPreviewHtml }}
              />
            ) : (
              <p className="text-sm text-slate-500">暂无正文，可在下方粘贴 HTML。</p>
            )}
          </div>
          <div className="border-t border-slate-200 bg-slate-50/70 px-3 py-2.5 space-y-2">
            <div className="text-[11px] font-medium text-slate-600">插入占位符（光标须在下框 HTML 源码中）</div>
            {insertRow}
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
