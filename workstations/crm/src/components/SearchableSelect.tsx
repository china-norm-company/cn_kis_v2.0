import { useMemo, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

export interface SearchableOption {
  id: number | string
  label: string
}

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: SearchableOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  emptyHint?: string
  /** 是否显示顶部搜索框；为 false 时仅展示与商务负责人同款按钮+列表（无筛选） */
  searchable?: boolean
  /** 是否显示右侧清除按钮 */
  clearable?: boolean
  /** 下拉列表可视区最多同时显示的选项行数，超出部分在列表内纵向滚动并出现滚动条 */
  maxVisibleRows?: number
  /** 搜索框占位（仅 searchable 时） */
  searchPlaceholder?: string
}

/** 单行选项大致高度（与 py-2 + text-sm 一致），用于计算列表可视高度 */
const ROW_REM = 2.25

/**
 * 可配置搜索的单选下拉 — 与「商务负责人」同款按钮与面板样式；
 * 列表区域默认最多同时显示 13 行，超出时右侧滚动。
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '请选择',
  disabled = false,
  className = '',
  emptyHint = '无匹配项',
  searchable = true,
  clearable = true,
  maxVisibleRows = 13,
  searchPlaceholder = '输入关键字筛选…',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const selected = options.find((o) => String(o.id) === value)

  const filtered = useMemo(() => {
    if (!searchable) return options
    const k = q.trim().toLowerCase()
    if (!k) return options
    return options.filter((o) => o.label.toLowerCase().includes(k))
  }, [options, q, searchable])

  const listMaxHeight = `min(70vh, calc(${maxVisibleRows} * ${ROW_REM}rem))`

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-10 text-left text-sm text-slate-800 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? '' : 'text-slate-400'}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="关闭" onClick={() => setOpen(false)} />
          <div
            className={`absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg ${
              searchable ? '' : ''
            }`}
          >
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
              {filtered.map((o) => (
                <li key={String(o.id)}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => {
                      onChange(String(o.id))
                      setOpen(false)
                      setQ('')
                    }}
                  >
                    {o.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      {clearable && value && !disabled && (
        <button
          type="button"
          className="absolute right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          title="清除"
          onClick={(e) => {
            e.stopPropagation()
            onChange('')
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
