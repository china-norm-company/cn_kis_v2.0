/**
 * Modal - IBKD规范模态框组件
 */
import { useEffect } from 'react'
import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { Button } from './Button'

export interface ModalProps {
  isOpen?: boolean
  open?: boolean
  onClose: () => void
  onConfirm?: () => void | Promise<void>
  confirmText?: string
  cancelText?: string
  title?: string
  /** 可选：标题样式类名，如 text-xl */
  titleClassName?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: React.ReactNode
  footer?: React.ReactNode
  closeOnOverlay?: boolean
  /** 层级，用于多弹窗叠放时保证关键弹窗在上层（默认 50） */
  zIndex?: number
}

const sizeStyles = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({
  isOpen,
  open,
  onClose,
  onConfirm,
  confirmText = '确认',
  cancelText = '取消',
  title,
  titleClassName,
  size = 'md',
  children,
  footer,
  closeOnOverlay = true,
  zIndex = 50,
}: ModalProps) {
  const visible = isOpen ?? open ?? false
  // ESC键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (visible) {
      document.addEventListener('keydown', handleEsc)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = ''
    }
  }, [visible, onClose])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex }}
    >
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm z-0"
        onClick={closeOnOverlay ? onClose : undefined}
      />

      {/* 模态框 */}
      <div
        className={clsx(
          'relative z-10 w-full bg-white rounded-xl shadow-modal',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          sizeStyles[size]
        )}
      >
        {/* 头部 */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <h2 className={clsx('font-semibold text-slate-800', titleClassName ?? 'text-lg')}>{title}</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="!p-1.5"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        )}

        {/* 内容 */}
        <div className="px-6 py-4 max-h-[70vh] overflow-auto">
          {children}
        </div>

        {/* 页脚 */}
        {(footer || onConfirm) && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            {footer || (
              <>
                <Button variant="ghost" onClick={onClose}>{cancelText}</Button>
                <Button onClick={onConfirm}>{confirmText}</Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

