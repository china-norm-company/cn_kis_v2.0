import { useMemo, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import type { SearchableOption } from './SearchableSelect'

interface SearchableMultiSelectProps {
  value: string[]
  onChange: (value: string[]) => void
  options: SearchableOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  emptyHint?: string
  searchable?: boolean
  searchPlaceholder?: string
  maxVisibleRows?: number
}

const ROW_REM = 2.25

/**
 * 多选下拉，按钮与面板样式与 SearchableSelect / 商机表单下拉一致。
 */
export function SearchableMultiSelect({
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled = false,
  className = '',
  emptyHint = '无匹配项',
  searchable = false,
  searchPlaceholder = '输入关键字筛选…',
  maxVisibleRows = 13,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const selectedSet = useMemo(() => new Set(value.map(String)), [value])

  const filtered = useMemo(() => {
    if (!searchable) return options
    const k = q.trim().toLowerCase()
    if (!k) return options
    return options.filter((o) => o.label.toLowerCase().includes(k))
  }, [options, q, searchable])

  const summary = useMemo(() => {
    if (value.length === 0) return ''
    const labels = value
      .map((id) => options.find((o) => String(o.id) === String(id))?.label)
      .filter(Boolean)
    if (labels.length <= 2) return labels.join('、')
    return `已选 ${value.length} 项`
  }, [value, options])

  const listMaxHeight = `min(70vh, calc(${maxVisibleRows} * ${ROW_REM}rem))`

  const toggle = (id: string | number) => {
    const s = String(id)
    if (selectedSet.has(s)) {
      onChange(value.filter((v) => String(v) !== s))
    } else {
      onChange([...value, s])
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-left text-sm text-slate-800 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={summary ? '' : 'text-slate-400'}>{summary || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="关闭" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
            {searchable && (
              <div className="border-b border-slate-100 p-2">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}
            <ul
              className="overflow-y-auto overflow-x-hidden py-1 [scrollbar-gutter:stable]"
              style={{ maxHeight: listMaxHeight }}
            >
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-xs text-slate-400">{emptyHint}</li>
              )}
              {filtered.map((o) => {
                const sid = String(o.id)
                const checked = selectedSet.has(sid)
                return (
                  <li key={sid}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(o.id)}
                        className="rounded border-slate-300"
                      />
                      <span>{o.label}</span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
      {value.length > 0 && !disabled && (
        <button
          type="button"
          className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          title="清除"
          onClick={(e) => {
            e.stopPropagation()
            onChange([])
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
