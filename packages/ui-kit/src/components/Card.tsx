/**
 * Card - IBKD规范卡片组件
 */
import { forwardRef } from 'react'
import { clsx } from 'clsx'

export type CardVariant = 'default' | 'bordered' | 'elevated'

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: CardVariant
  title?: React.ReactNode
  subtitle?: string
  actions?: React.ReactNode
  extra?: React.ReactNode
  footer?: React.ReactNode
  hoverable?: boolean
  compactOnMobile?: boolean
}

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-white rounded-lg shadow-card',
  bordered: 'bg-white rounded-lg border border-slate-200',
  elevated: 'bg-white rounded-lg shadow-md',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      title,
      subtitle,
      actions,
      extra,
      footer,
      hoverable = false,
      compactOnMobile = true,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={clsx(
          variantStyles[variant],
          hoverable && 'transition-shadow duration-200 hover:shadow-card-hover',
          className
        )}
        {...props}
      >
        {/* 头部 */}
        {(title || actions) && (
          <div
            className={clsx(
              'flex items-start justify-between border-b border-slate-100 p-6',
              compactOnMobile && 'p-4 md:p-6',
            )}
          >
            <div className="flex-1 min-w-0">
              {typeof title === 'string' ? (
                <h3 className="truncate text-base font-semibold text-slate-800 md:text-lg">
                  {title}
                </h3>
              ) : (
                title
              )}
              {subtitle && (
                <p className="mt-1 text-xs text-slate-500 md:text-sm">{subtitle}</p>
              )}
            </div>
            {(actions || extra) && <div className="ml-4 flex-shrink-0">{actions ?? extra}</div>}
          </div>
        )}

        {/* 内容 */}
        <div className={clsx('p-6', compactOnMobile && 'p-4 md:p-6')}>{children}</div>

        {/* 页脚 */}
        {footer && (
          <div
            className={clsx(
              'rounded-b-lg border-t border-slate-100 bg-slate-50 px-6 py-4',
              compactOnMobile && 'px-4 py-3 md:px-6 md:py-4',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    )
  }
)

Card.displayName = 'Card'

