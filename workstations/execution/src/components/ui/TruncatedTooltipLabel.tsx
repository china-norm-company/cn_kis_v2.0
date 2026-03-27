import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

/** 与执行台知情页卡片风格一致的 Tooltip 容器（供整页包裹） */
export const TooltipProvider = TooltipPrimitive.Provider

/** 与 TruncatedTooltipLabel 悬浮层一致的基础样式（宽度由调用方追加 max-w-*） */
export const consentTooltipContentClassName = [
  'z-[200] rounded-xl border border-slate-200/95 bg-white',
  'px-3.5 py-2.5 text-left text-xs font-normal leading-relaxed text-slate-700',
  'shadow-[0_12px_40px_-8px_rgba(15,23,42,0.18),0_0_0_1px_rgba(15,23,42,0.04)]',
  'outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
].join(' ')

export type RichTooltipProps = {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /**
   * 传给 Radix Content 的 aria-label（与可见文案一致）。
   * 传入后无障碍隐藏层用纯文本，避免重复挂载子节点导致异常观感（如叠加大问号样式）。
   */
  contentAriaLabel?: string
}

/**
 * 自定义触发器 + 多段说明文案（与知情页「?」帮助弹层 UI 一致）。
 */
export function RichTooltip({
  content,
  children,
  side = 'bottom',
  align = 'start',
  contentAriaLabel,
}: RichTooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={[consentTooltipContentClassName, 'max-w-[min(90vw,22rem)]'].join(' ')}
          aria-label={contentAriaLabel}
        >
          <div className="space-y-2 break-words">{content}</div>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

type TruncatedTooltipLabelProps = {
  text: string
  className?: string
}

/**
 * 文本仅在发生 CSS 截断（ellipsis）时显示悬浮层，避免短标题重复展示。
 * 样式与 slate 系卡片、圆角、阴影与知情配置侧栏一致。
 */
export function TruncatedTooltipLabel({ text, className }: TruncatedTooltipLabelProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [truncated, setTruncated] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      setTruncated(el.scrollWidth > el.clientWidth + 1)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, truncated])

  if (!truncated) {
    return (
      <span ref={ref} className={className}>
        {text}
      </span>
    )
  }

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>
        <span ref={ref} className={className}>
          {text}
        </span>
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className={[consentTooltipContentClassName, 'max-w-[min(90vw,28rem)]'].join(' ')}
          aria-label={text}
        >
          <span className="block break-words">{text}</span>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
