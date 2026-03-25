/**
 * Badge - IBKD规范徽章组件
 */
import { clsx } from 'clsx'

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'secondary'
  | 'outline'
  | 'destructive'
  /** 表格/列表中的数据字段标签：明亮为浅蓝系，暗夜为奶油黄底 + 深字（与 info 区分用途） */
  | 'field'
export type BadgeSize = 'sm' | 'md'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  size?: BadgeSize
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700 dark:bg-slate-700/90 dark:text-slate-200',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/45 dark:text-primary-300',
  success: 'bg-success-100 text-success-600 dark:bg-emerald-950/50 dark:text-emerald-300',
  warning: 'bg-warning-100 text-warning-600 dark:bg-amber-950/40 dark:text-amber-300',
  error: 'bg-error-100 text-error-600 dark:bg-red-950/40 dark:text-red-300',
  info: 'bg-info-100 text-info-600 dark:bg-blue-950/45 dark:text-blue-300',
  field:
    'bg-info-100 text-info-600 border border-transparent dark:border-amber-900/20 dark:bg-[#FFFBEB] dark:text-[#5D4037] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.65)]',
  secondary: 'bg-slate-100 text-slate-600 dark:bg-slate-700/90 dark:text-slate-300',
  outline: 'border border-slate-300 bg-transparent text-slate-700 dark:border-slate-600 dark:text-slate-200',
  destructive: 'bg-error-100 text-error-700 dark:bg-red-950/40 dark:text-red-300',
}

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
}

export function Badge({
  variant = 'default',
  size = 'sm',
  children,
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  )
}

