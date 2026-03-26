/**
 * 二维码扫描组件
 *
 * 使用浏览器摄像头 API 扫描二维码
 * 解析后调用后端 resolve 接口获取实体信息
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { qrcodeApi } from '@cn-kis/api-client'
import type { QRCodeRecord } from '@cn-kis/api-client'
import { Camera, X, AlertCircle, CheckCircle } from 'lucide-react'

interface QRScannerProps {
  onResolved?: (record: QRCodeRecord) => void
  onError?: (msg: string) => void
  className?: string
}

export default function QRScanner({ onResolved, onError, className = '' }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [result, setResult] = useState<QRCodeRecord | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const resolveMutation = useMutation({
    mutationFn: (qrHash: string) => qrcodeApi.resolve(qrHash),
    onSuccess: (res) => {
      const record = res.data as QRCodeRecord
      setResult(record)
      stopScanning()
      onResolved?.(record)
    },
    onError: () => {
      setErrorMsg('二维码无效或已停用')
      onError?.('二维码无效或已停用')
    },
  })

  const startScanning = useCallback(async () => {
    setErrorMsg('')
    setResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
      }
      setIsScanning(true)

      if ('BarcodeDetector' in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })
        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return
          try {
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes.length > 0) {
              const raw = barcodes[0].rawValue
              const match = raw.match(/\/qr\/([a-f0-9]+)/)
              const hash = match ? match[1] : raw.trim()
              if (hash) resolveMutation.mutate(hash)
            }
          } catch { /* frame decode errors are expected */ }
        }, 500)
      } else {
        scanIntervalRef.current = setInterval(() => {
          if (!canvasRef.current || !videoRef.current) return
          const canvas = canvasRef.current
          const ctx = canvas.getContext('2d')
          if (!ctx) return
          canvas.width = videoRef.current.videoWidth
          canvas.height = videoRef.current.videoHeight
          ctx.drawImage(videoRef.current, 0, 0)
        }, 500)
      }
    } catch (err) {
      setErrorMsg('无法访问摄像头，请检查权限设置')
    }
  }, [])

  const stopScanning = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current)
      scanIntervalRef.current = null
    }
    setIsScanning(false)
  }, [])

  useEffect(() => {
    return () => stopScanning()
  }, [])

  // Manual input for fallback (when camera not available)
  const [manualInput, setManualInput] = useState('')
  const handleManualResolve = () => {
    if (!manualInput.trim()) return
    // Extract hash from URL or use directly
    const match = manualInput.match(/\/qr\/([a-f0-9]+)/)
    const hash = match ? match[1] : manualInput.trim()
    resolveMutation.mutate(hash)
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Camera view */}
      {isScanning && (
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video ref={videoRef} className="w-full" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <button
            onClick={stopScanning}
            className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-white/60 rounded-xl" />
          </div>
        </div>
      )}

      {/* Actions */}
      {!isScanning && !result && (
        <div className="space-y-3">
          <button
            onClick={startScanning}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
          >
            <Camera className="w-5 h-5" />
            打开摄像头扫码
          </button>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="手动输入二维码内容或哈希值"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
            <button
              onClick={handleManualResolve}
              disabled={!manualInput.trim() || resolveMutation.isPending}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50"
            >
              查询
            </button>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 text-sm font-medium mb-2">
            <CheckCircle className="w-4 h-4" />
            识别成功
          </div>
          <div className="text-sm text-slate-700 space-y-1">
            <div>类型: {result.entity_type}</div>
            <div>标签: {result.label}</div>
            {result.entity_detail && (
              <div className="text-xs text-slate-500 mt-2">
                {JSON.stringify(result.entity_detail, null, 2)}
              </div>
            )}
            {result.today_work_orders && result.today_work_orders.length > 0 && (
              <div className="mt-2 border-t pt-2">
                <div className="text-xs font-medium text-slate-600 mb-1">今日关联工单：</div>
                {result.today_work_orders.map((wo) => (
                  <div key={wo.id} className="text-xs text-slate-500">
                    WO#{wo.id}: {wo.title} [{wo.status}]
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => { setResult(null); setManualInput('') }}
            className="mt-3 text-xs text-primary-600 hover:text-primary-700"
          >
            重新扫码
          </button>
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            {errorMsg}
          </div>
        </div>
      )}
    </div>
  )
}
