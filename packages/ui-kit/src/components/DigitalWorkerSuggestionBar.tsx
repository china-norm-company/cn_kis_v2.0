/**
 * 数字员工主动推送栏 — 替代被动摘要卡
 *
 * 在仪表盘顶部展示数字员工已准备好但用户尚未采纳的建议。
 * 每条建议含：岗位名、标题、摘要、操作按钮（采纳 / 查看 / 忽略）。
 */
import { useState } from 'react'
import { Bot, ChevronDown, ChevronUp, Check, Eye, X, Loader2 } from 'lucide-react'

export interface SuggestionAction {
  action_id: string
  label: string
  endpoint: string
}

export interface SuggestionItem {
  suggestion_id: string
  type: string
  title: string
  summary: string
  business_object_type: string
  business_object_id: string
  role_code: string
  actions: SuggestionAction[]
}

export interface DigitalWorkerSuggestionBarProps {
  items: SuggestionItem[]
  loading?: boolean
  onAction?: (suggestion: SuggestionItem, action: SuggestionAction) => void
  onDismiss?: (suggestion: SuggestionItem) => void
}

export function DigitalWorkerSuggestionBar({
  items,
  loading,
  onAction,
  onDismiss,
}: DigitalWorkerSuggestionBarProps) {
  const [expanded, setExpanded] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const visible = items.filter((item) => !dismissed.has(item.suggestion_id))

  if (loading) {
    return (
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
        <div className="flex items-center gap-2 text-sm text-violet-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>数字员工正在分析业务状态...</span>
        </div>
      </div>
    )
  }

  if (visible.length === 0) return null

  const handleDismiss = (item: SuggestionItem) => {
    setDismissed((prev) => new Set(prev).add(item.suggestion_id))
    onDismiss?.(item)
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/80 overflow-hidden" data-testid="dw-suggestion-bar">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <span className="text-sm font-semibold text-violet-800">
              数字员工已准备 {visible.length} 项建议
            </span>
            <span className="ml-2 text-xs text-violet-600">点击展开查看并采纳</span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-violet-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-violet-400" />
        )}
      </button>

      {expanded && (
        <ul className="border-t border-violet-200 divide-y divide-violet-100">
          {visible.map((item) => (
            <li key={item.suggestion_id} className="px-4 py-3 bg-white/60">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{item.summary}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.actions.map((action) => {
                    const isPrimary = action.action_id !== 'view'
                    return (
                      <button
                        key={action.action_id}
                        type="button"
                        onClick={() => onAction?.(item, action)}
                        className={
                          isPrimary
                            ? 'inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700'
                            : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50'
                        }
                      >
                        {isPrimary ? <Check className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {action.label}
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    onClick={() => handleDismiss(item)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                    title="忽略"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
