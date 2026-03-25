/**
 * StatCard - IBKD规范统计卡片组件
 *
 * 支持 title / label 两种传参（label 为 title 别名）
 * 支持 color 自定义强调色
 */
import { clsx } from 'clsx'
import { TrendingUp, TrendingDown } from 'lucide-react'

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue:    { bg: 'bg-blue-50',    text: 'text-blue-600'    },
  green:   { bg: 'bg-green-50',   text: 'text-green-600'   },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  amber:   { bg: 'bg-amber-50',   text: 'text-amber-600'   },
  orange:  { bg: 'bg-orange-50',  text: 'text-orange-600'  },
  indigo:  { bg: 'bg-indigo-50',  text: 'text-indigo-600'  },
  red:     { bg: 'bg-red-50',     text: 'text-red-600'     },
  purple:  { bg: 'bg-purple-50',  text: 'text-purple-600'  },
  teal:    { bg: 'bg-teal-50',    text: 'text-teal-600'    },
  violet:  { bg: 'bg-violet-50',  text: 'text-violet-600'  },
  rose:    { bg: 'bg-rose-50',    text: 'text-rose-600'    },
}

export interface StatCardProps {
  /** 卡片标题（与 label 二选一） */
  title?: string
  /** 卡片标题别名 */
  label?: string
  value: string | number
  icon?: React.ReactNode
  /** 强调色 */
  color?: 'blue' | 'green' | 'emerald' | 'amber' | 'orange' | 'indigo' | 'red' | 'purple' | 'teal' | 'violet' | 'rose'
  trend?: {
    value: number
    label?: string
  }
  footer?: React.ReactNode
  className?: string
  compactOnMobile?: boolean
}

export function StatCard({
  title,
  label,
  value,
  icon,
  color,
  trend,
  footer,
  className,
  compactOnMobile = true,
}: StatCardProps) {
  const displayTitle = title ?? label ?? ''
  const isPositive = trend && trend.value >= 0
  const colorCfg = color ? COLOR_MAP[color] : null

  return (
    <div
      className={clsx(
        'rounded-lg bg-white p-6 shadow-card dark:border dark:border-[#3b434e] dark:bg-slate-800 dark:shadow-none',
        compactOnMobile && 'p-4 md:p-6',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 md:text-sm">{displayTitle}</p>
          <p className="mt-1.5 text-xl font-bold text-slate-800 dark:text-slate-100 md:mt-2 md:text-2xl">{value}</p>
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              {isPositive ? (
                <TrendingUp className="w-4 h-4 text-success-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-error-500" />
              )}
              <span
                className={clsx(
                  'text-sm font-medium',
                  isPositive ? 'text-success-600' : 'text-error-600'
                )}
              >
                {isPositive ? '+' : ''}{trend.value}%
              </span>
              {trend.label && (
                <span className="text-sm text-slate-400">{trend.label}</span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div className={clsx(
            'rounded-lg p-2.5 md:p-3',
            colorCfg ? `${colorCfg.bg} ${colorCfg.text}` : 'bg-primary-50 text-primary-600 dark:bg-primary-900/40 dark:text-primary-300',
          )}>
            {icon}
          </div>
        )}
      </div>
      {footer && <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">{footer}</div>}
    </div>
  )
}

