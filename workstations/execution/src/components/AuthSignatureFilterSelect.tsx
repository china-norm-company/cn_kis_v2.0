import { useEffect, useId, useRef, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import type { WitnessStaffAuthSignatureStatus } from '@cn-kis/api-client'

export type WitnessStaffAuthSigFilter = 'all' | WitnessStaffAuthSignatureStatus

/** 下拉选项顺序：全部 → 待发送邮件 → 待认证签名 → 已完成 → 待重新认证 */
const OPTIONS: { value: WitnessStaffAuthSigFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending_mail', label: '待发送邮件' },
  { value: 'pending_sign', label: '待认证签名' },
  { value: 'completed', label: '已完成' },
  { value: 'pending_reauth', label: '待重新认证' },
]

type Props = {
  value: WitnessStaffAuthSigFilter
  onChange: (value: WitnessStaffAuthSigFilter) => void
}

/**
 * 认证签名列表筛选：自定义下拉面板，与 Input/执行台表单风格一致（非原生 select）。
 */
export function AuthSignatureFilterSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const currentLabel = OPTIONS.find((o) => o.value === value)?.label ?? '全部'

  return (
    <div ref={rootRef} className="relative w-full">
      <span className="block text-xs font-medium text-slate-500 mb-1.5" id={`${listId}-label`}>
        认证签名
      </span>
      <button
        type="button"
        id={`${listId}-trigger`}
        aria-labelledby={`${listId}-label ${listId}-trigger`}
        aria-expanded={open}
        aria-controls={`${listId}-listbox`}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm text-slate-800',
          'border-slate-300 transition-colors shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500',
          open && 'ring-2 ring-primary-500/20 border-primary-500',
        )}
      >
        <span className="truncate">{currentLabel}</span>
        <ChevronDown
          className={clsx('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          id={`${listId}-listbox`}
          role="listbox"
          aria-labelledby={`${listId}-label`}
          className="absolute z-50 mt-1 max-h-60 w-full min-w-[12rem] overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {OPTIONS.map((opt) => {
            const selected = value === opt.value
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={clsx(
                    'flex w-full items-center px-3 py-2 text-left text-sm',
                    selected
                      ? 'bg-indigo-50 text-indigo-900 font-medium'
                      : 'text-slate-700 hover:bg-slate-50',
                  )}
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
      ) : null}
    </div>
  )
}
