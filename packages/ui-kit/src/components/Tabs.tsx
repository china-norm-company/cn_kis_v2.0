/**
 * Tabs - IBKD规范标签页组件
 *
 * 支持两种 API 风格：
 * 1. items + activeKey + key （原始）
 * 2. tabs + value + value   （简化）
 */
import { useState } from 'react'
import { clsx } from 'clsx'

export interface TabItem {
  /** Tab 标识（与 value 二选一） */
  key?: string
  /** Tab 标识别名 */
  value?: string
  label: string
  icon?: React.ReactNode
  disabled?: boolean
}

export interface TabsProps {
  /** Tab 列表（与 tabs 二选一） */
  items?: TabItem[]
  /** Tab 列表别名 */
  tabs?: TabItem[]
  /** 当前激活 key（与 value 二选一） */
  activeKey?: string
  /** 当前激活 key 别名 */
  value?: string
  defaultActiveKey?: string
  onChange?: (key: string) => void
  className?: string
}

export function Tabs({
  items,
  tabs,
  activeKey: controlledActiveKey,
  value: controlledValue,
  defaultActiveKey,
  onChange,
  className,
}: TabsProps) {
  const resolvedItems = items ?? tabs ?? []
  const resolvedControlled = controlledActiveKey ?? controlledValue

  const [internalActiveKey, setInternalActiveKey] = useState(
    defaultActiveKey || getTabKey(resolvedItems[0])
  )

  const activeKey = resolvedControlled ?? internalActiveKey

  const handleClick = (key: string) => {
    if (resolvedControlled === undefined) {
      setInternalActiveKey(key)
    }
    onChange?.(key)
  }

  return (
    <div className={clsx('border-b border-slate-200', className)}>
      <nav className="flex gap-1 -mb-px">
        {resolvedItems.map((item) => {
          const itemKey = getTabKey(item)
          return (
            <button
              key={itemKey}
              disabled={item.disabled}
              onClick={() => handleClick(itemKey)}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                activeKey === itemKey
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
                item.disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function getTabKey(item?: TabItem): string {
  return item?.key ?? item?.value ?? ''
}

