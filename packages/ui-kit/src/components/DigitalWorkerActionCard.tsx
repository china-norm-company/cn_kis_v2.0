/**
 * 数字员工内嵌动作卡片 — 用于业务详情页
 *
 * 在业务对象（协议、偏差、工单、报价）旁边展示数字员工的建议/草稿，
 * 用户可一键采纳、修改后采纳或忽略。
 */
import { useState } from 'react'
import { Bot, Check, Pencil, X, Loader2 } from 'lucide-react'

export interface ActionItem {
  key: string
  label: string
  value: string
  accepted?: boolean
}

export interface DigitalWorkerActionCardProps {
  roleCode: string
  roleName: string
  title: string
  description?: string
  items: ActionItem[]
  loading?: boolean
  onAccept?: (items: ActionItem[]) => void
  onAcceptSingle?: (item: ActionItem) => void
  onDismiss?: () => void
  onTrigger?: () => void
  triggerLabel?: string
  acceptLabel?: string
}

export function DigitalWorkerActionCard({
  roleName,
  title,
  description,
  items,
  loading,
  onAccept,
  onAcceptSingle,
  onDismiss,
  onTrigger,
  triggerLabel = '开始处理',
  acceptLabel = '全部采纳',
}: DigitalWorkerActionCardProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-5" data-testid="dw-action-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-violet-800">{title}</p>
            <p className="text-xs text-violet-600">{roleName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 text-slate-400 hover:text-slate-600 rounded"
          title="忽略"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {description && (
        <p className="mt-3 text-sm text-slate-600">{description}</p>
      )}

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-violet-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>数字员工处理中...</span>
        </div>
      ) : items.length > 0 ? (
        <>
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li
                key={item.key}
                className="flex items-start justify-between gap-3 rounded-lg border border-violet-100 bg-white px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500">{item.label}</p>
                  <p className="mt-0.5 text-sm text-slate-800 whitespace-pre-wrap">{item.value}</p>
                </div>
                {onAcceptSingle && !item.accepted && (
                  <button
                    type="button"
                    onClick={() => onAcceptSingle(item)}
                    className="shrink-0 inline-flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-xs text-white hover:bg-violet-700"
                  >
                    <Check className="h-3 w-3" />
                    采纳
                  </button>
                )}
                {item.accepted && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
                    <Check className="h-3 w-3" />
                    已采纳
                  </span>
                )}
              </li>
            ))}
          </ul>
          {onAccept && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => onAccept(items)}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
              >
                <Check className="h-4 w-4" />
                {acceptLabel}
              </button>
              <button
                type="button"
                onClick={() => onAccept(items)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4" />
                修改后采纳
              </button>
            </div>
          )}
        </>
      ) : onTrigger ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={onTrigger}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
          >
            <Bot className="h-4 w-4" />
            {triggerLabel}
          </button>
        </div>
      ) : null}
    </div>
  )
}
