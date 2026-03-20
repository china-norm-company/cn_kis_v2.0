/**
 * 人员搜索下拉框 - 可输入文字搜索人名
 * 支持单选和多选，用于周报模块的负责人、参与成员、任务负责人等
 */
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'

export interface UserItem {
  id: number
  name: string
}

interface UserSearchSelectBaseProps {
  users: UserItem[]
  placeholder?: string
  className?: string
  disabled?: boolean
  emptyText?: string
}

/** 单选：value 为选中的用户 id，null 表示未选 */
export interface UserSearchSelectSingleProps extends UserSearchSelectBaseProps {
  multiple?: false
  value: number | null
  onChange: (userId: number | null) => void
}

/** 多选：value 为选中的用户 id 数组 */
export interface UserSearchSelectMultiProps extends UserSearchSelectBaseProps {
  multiple: true
  value: number[]
  onChange: (userIds: number[]) => void
}

export type UserSearchSelectProps = UserSearchSelectSingleProps | UserSearchSelectMultiProps

function isMulti(props: UserSearchSelectProps): props is UserSearchSelectMultiProps {
  return props.multiple === true
}

export function UserSearchSelect(props: UserSearchSelectProps) {
  const {
    users,
    placeholder = '搜索人名…',
    className = '',
    disabled = false,
    emptyText = '无匹配人员',
  } = props

  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const multi = isMulti(props)
  const selectedIds = multi ? props.value : props.value != null ? [props.value] : []
  const selectedUsers = users.filter((u) => selectedIds.includes(u.id))
  const displayLabel = multi
    ? selectedUsers.length > 0
      ? selectedUsers.map((u) => u.name).join('、')
      : ''
    : selectedUsers[0]?.name ?? ''

  const keywordLower = keyword.trim().toLowerCase()
  const filtered =
    keywordLower === ''
      ? users
      : users.filter((u) => u.name.toLowerCase().includes(keywordLower))

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (user: UserItem) => {
    if (multi) {
      const next = selectedIds.includes(user.id)
        ? selectedIds.filter((id) => id !== user.id)
        : [...selectedIds, user.id]
      props.onChange(next)
    } else {
      props.onChange(user.id)
      setOpen(false)
      setKeyword('')
    }
  }

  const removeOne = (e: React.MouseEvent, id: number) => {
    e.stopPropagation()
    if (multi) {
      props.onChange(selectedIds.filter((x) => x !== id))
    } else {
      props.onChange(null)
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`flex min-h-[38px] w-full flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm transition-colors ${
          disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'cursor-pointer hover:border-slate-400'
        } ${open ? 'ring-2 ring-primary-500/20 border-primary-500' : ''}`}
      >
        {multi && selectedUsers.length > 0 ? (
          <>
            {selectedUsers.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-700"
              >
                {u.name}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => removeOne(e, u.id)}
                    className="rounded p-0.5 hover:bg-slate-200"
                    aria-label={`移除${u.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onFocus={() => setOpen(true)}
              onClick={(e) => e.stopPropagation()}
              placeholder={selectedUsers.length === 0 ? placeholder : '继续添加…'}
              disabled={disabled}
              className="min-w-[80px] flex-1 border-0 bg-transparent p-0 text-slate-800 outline-none placeholder:text-slate-400"
            />
          </>
        ) : (
          <>
            <span className={displayLabel ? 'text-slate-800' : 'text-slate-400'}>
              {displayLabel || placeholder}
            </span>
            {!disabled && <ChevronDown className="ml-auto w-4 h-4 flex-shrink-0 text-slate-400" />}
          </>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
          {!multi && (
            <div className="border-b border-slate-100 p-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="输入搜索人名"
                autoFocus
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm outline-none placeholder:text-slate-400 focus:border-primary-500"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-52 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-slate-500">{emptyText}</li>
            ) : (
              filtered.map((u) => {
                const isSelected = selectedIds.includes(u.id)
                return (
                  <li
                    key={u.id}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(u)}
                    className={`cursor-pointer px-3 py-2 text-sm ${isSelected ? 'bg-primary-50 text-primary-800' : 'text-slate-700 hover:bg-slate-50'}`}
                  >
                    {u.name}
                    {multi && isSelected && <span className="ml-1 text-primary-600">✓</span>}
                  </li>
                )
              })
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
