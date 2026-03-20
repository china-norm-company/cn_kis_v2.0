/**
 * Empty - IBKD规范空状态组件
 */
import { clsx } from 'clsx'
import { Inbox } from 'lucide-react'

export interface EmptyProps {
  icon?: React.ReactNode
  title?: string
  message?: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function Empty({
  icon,
  title = '暂无数据',
  message,
  description,
  action,
  className,
}: EmptyProps) {
  const resolvedDescription = description ?? message
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center py-12 text-center',
        className
      )}
    >
      <div className="mb-4 text-slate-300">
        {icon || <Inbox className="w-16 h-16" />}
      </div>
      <h3 className="text-lg font-medium text-slate-600">{title}</h3>
      {resolvedDescription && (
        <p className="mt-2 text-sm text-slate-500 max-w-sm">{resolvedDescription}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

