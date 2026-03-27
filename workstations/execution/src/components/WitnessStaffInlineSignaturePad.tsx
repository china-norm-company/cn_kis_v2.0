import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'
import { Button } from '@cn-kis/ui-kit'

export type WitnessStaffSignaturePadHandle = {
  clear: () => void
  getCanvas: () => HTMLCanvasElement | null
}

type Props = {
  disabled?: boolean
  busy?: boolean
}

const W = 600
const H = 200

/**
 * 单块手写签名区（与 WitnessConsentDevPage 画布逻辑一致）
 */
const WitnessStaffInlineSignaturePad = forwardRef<WitnessStaffSignaturePadHandle, Props>(
  function WitnessStaffInlineSignaturePad({ disabled, busy }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const drawing = useRef(false)
    const lastPt = useRef<{ x: number; y: number } | null>(null)

    const getCoords = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const scaleX = canvas.width / rect.width
      const scaleY = canvas.height / rect.height
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      }
    }

    const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (disabled || busy) return
      const canvas = canvasRef.current
      if (!canvas) return
      const p = 'touches' in e ? e.touches[0] : e
      if (!p) return
      drawing.current = true
      lastPt.current = getCoords(canvas, p.clientX, p.clientY)
    }

    const moveDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return
      const canvas = canvasRef.current
      const p = 'touches' in e ? e.touches[0] : e
      if (!p || !canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx || !lastPt.current) return
      const pt = getCoords(canvas, p.clientX, p.clientY)
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(lastPt.current.x, lastPt.current.y)
      ctx.lineTo(pt.x, pt.y)
      ctx.stroke()
      lastPt.current = pt
    }

    const endDraw = useCallback(() => {
      drawing.current = false
      lastPt.current = null
    }, [])

    const clear = useCallback(() => {
      const c = canvasRef.current
      const ctx = c?.getContext('2d')
      if (c && ctx) ctx.clearRect(0, 0, c.width, c.height)
    }, [])

    useImperativeHandle(
      ref,
      () => ({
        clear,
        getCanvas: () => canvasRef.current,
      }),
      [clear],
    )

    return (
      <div className="space-y-2">
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden touch-none">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="w-full h-[200px] touch-none cursor-crosshair block bg-white"
            onMouseDown={startDraw}
            onMouseMove={moveDraw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={moveDraw}
            onTouchEnd={endDraw}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={clear}>
            清除
          </Button>
        </div>
      </div>
    )
  },
)

export default WitnessStaffInlineSignaturePad

/** 从画布导出 PNG data URL；空白画布返回 null */
export function exportSignatureCanvasPng(canvas: HTMLCanvasElement | null): string | null {
  if (!canvas) return null
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const w = canvas.width
  const h = canvas.height
  const data = ctx.getImageData(0, 0, w, h).data
  let ink = false
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 8) {
      ink = true
      break
    }
  }
  if (!ink) return null
  return canvas.toDataURL('image/png')
}
