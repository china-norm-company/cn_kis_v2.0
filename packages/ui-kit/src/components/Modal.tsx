/**
 * Modal - IBKD规范模态框组件
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
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
  /** 居中对话框（默认）或右侧全高抽屉 */
  placement?: 'center' | 'right'
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  children: React.ReactNode
  footer?: React.ReactNode
  closeOnOverlay?: boolean
  /** 遮罩层 className（默认半透明+轻微模糊）；可传 `bg-transparent` 等避免压暗整页 */
  overlayClassName?: string
  /** 层级，用于多弹窗叠放时保证关键弹窗在上层（默认 50） */
  zIndex?: number
  /** 仅 placement=right 时：覆盖抽屉面板宽度等（如 `max-w-[min(100vw,90rem)]`） */
  drawerClassName?: string
  /** 覆盖内容区容器 class（如抽屉内全宽分栏时传 `!p-0`） */
  bodyClassName?: string
}

const sizeStyles = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  /** 知情审核等大预览：接近全宽可读 PDF */
  '2xl': 'max-w-[min(1200px,96vw)]',
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
  placement = 'center',
  size = 'md',
  children,
  footer,
  closeOnOverlay = true,
  overlayClassName,
  zIndex = 50,
  drawerClassName,
  bodyClassName,
}: ModalProps) {
  const visible = isOpen ?? open ?? false
  const isDrawer = placement === 'right'
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

  /** 挂到 body，避免在表格/transform/overflow 祖先内 fixed 定位导致标题栏（含关闭）被裁切 */
  const modalTree = (
    <div
      className={clsx(
        'fixed inset-0 flex',
        isDrawer ? 'items-stretch justify-end p-0' : 'items-center justify-center p-4'
      )}
      style={{ zIndex }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 遮罩层 */}
      <div
        className={clsx(
          'absolute inset-0 z-0',
          overlayClassName ?? 'bg-black/50 backdrop-blur-sm'
        )}
        onClick={closeOnOverlay ? () => onClose() : undefined}
      />

      {/* 模态框 */}
      <div
        className={clsx(
          'relative z-10 flex w-full flex-col bg-white shadow-modal',
          isDrawer
            ? clsx(
                'h-dvh max-h-dvh min-h-0 max-w-[min(100vw,42rem)] overflow-hidden rounded-none rounded-l-xl animate-in fade-in-0 slide-in-from-right duration-200',
                drawerClassName,
              )
            : clsx(
                'max-h-[min(90vh,900px)] rounded-xl',
                'animate-in fade-in-0 zoom-in-95 duration-200',
                sizeStyles[size]
              )
        )}
      >
        {/* 头部 */}
        {title && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
            <h2
              className={clsx(
                'min-w-0 flex-1 font-semibold text-slate-800',
                titleClassName ?? 'text-lg'
              )}
            >
              {title}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="关闭"
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
              className="shrink-0 !p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Button>
          </div>
        )}

        {/* 内容 */}
        <div
          className={clsx(
            'min-h-0 flex-1 px-6 py-4',
            isDrawer
              ? 'flex flex-col overflow-hidden overscroll-contain'
              : 'overflow-y-auto overscroll-contain',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {/* 页脚 */}
        {(footer || onConfirm) && (
          <div
            className={clsx(
              'flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4',
              isDrawer ? 'rounded-bl-xl' : 'rounded-b-xl'
            )}
          >
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

  if (typeof document !== 'undefined') {
    return createPortal(modalTree, document.body)
  }
  return null
}

