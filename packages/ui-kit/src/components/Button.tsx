/**
 * Button - IBKD规范按钮组件
 */
import { forwardRef } from 'react'
import { clsx } from 'clsx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  fullWidth?: boolean
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: clsx(
    'bg-primary-600 text-white',
    'hover:bg-primary-700',
    'active:bg-primary-800',
    'focus-visible:ring-primary-500'
  ),
  secondary: clsx(
    'bg-white text-primary-600 border border-primary-600',
    'hover:bg-primary-50',
    'active:bg-primary-100',
    'focus-visible:ring-primary-500'
  ),
  ghost: clsx(
    'bg-transparent text-primary-600',
    'hover:bg-primary-50',
    'active:bg-primary-100',
    'focus-visible:ring-primary-500'
  ),
  danger: clsx(
    'bg-error-500 text-white',
    'hover:bg-error-600',
    'active:bg-error-700',
    'focus-visible:ring-error-500'
  ),
  success: clsx(
    'bg-success-500 text-white',
    'hover:bg-success-600',
    'active:bg-success-700',
    'focus-visible:ring-success-500'
  ),
  outline: clsx(
    'bg-white text-primary-600 border border-primary-600',
    'hover:bg-primary-50',
    'active:bg-primary-100',
    'focus-visible:ring-primary-500'
  ),
}

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-xs gap-1',
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

const Spinner = ({ className }: { className?: string }) => (
  <svg
    className={clsx('animate-spin', className)}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
)

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      className,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading
    const iconSize = { xs: 'w-3 h-3', sm: 'w-3.5 h-3.5', md: 'w-4 h-4', lg: 'w-5 h-5' }[size]

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={clsx(
          'inline-flex items-center justify-center',
          'font-medium rounded-lg',
          'transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
        {...props}
      >
        {loading && iconPosition === 'left' && <Spinner className={iconSize} />}
        {!loading && icon && iconPosition === 'left' && (
          <span className={iconSize}>{icon}</span>
        )}
        {children && <span>{children}</span>}
        {loading && iconPosition === 'right' && <Spinner className={iconSize} />}
        {!loading && icon && iconPosition === 'right' && (
          <span className={iconSize}>{icon}</span>
        )}
      </button>
    )
  }
)

Button.displayName = 'Button'

