/**
 * 智能二维码扫描组件
 *
 * 接入 smart-resolve 接口，根据扫码人所在工作台和返回的推荐动作自动路由。
 * 支持摄像头扫码、扫码枪输入、手动输入三种方式。
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { qrcodeApi } from '@cn-kis/api-client'
import type { SmartResolveResult, SmartResolveAction } from '@cn-kis/api-client'
import { Camera, X, AlertCircle, CheckCircle, Zap } from 'lucide-react'

const ACTION_LABELS: Record<SmartResolveAction, string> = {
  checkin: '签到',
  checkout: '签出',
  jump_to_workorder: '跳转工单',
  show_workorder_list: '选择工单',
  show_profile: '查看档案',
  station_checkin: '场所签到',
  record_ae: '上报不良反应',
  record_dropout: '记录脱落',
  stipend_pay: '礼金发放',
  asset_use: '资产使用',
  sample_collect: '样品采集',
  material_issue: '物料出库',
  unknown: '查看信息',
}

interface SmartQRScannerProps {
  /** 当前工作台标识，用于情境感知路由 */
  workstation: string
  /** smart-resolve 成功后的回调，返回推荐动作和数据 */
  onAction?: (action: SmartResolveAction, data: Record<string, unknown>, result: SmartResolveResult) => void
  /** 用户点击备选动作时的回调 */
  onAlternativeAction?: (action: SmartResolveAction, data: Record<string, unknown>) => void
  /** 降级：仅使用基础 resolve（不含情境感知），适用于无需自动路由的场景 */
  simpleMode?: boolean
  onResolved?: (record: import('@cn-kis/api-client').QRCodeRecord) => void
  onError?: (msg: string) => void
  className?: string
}

export default function SmartQRScanner({
  workstation,
  onAction,
  onAlternativeAction,
  simpleMode = false,
  onResolved,
  onError,
  className = '',
}: SmartQRScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [result, setResult] = useState<SmartResolveResult | null>(null)
  const [simpleResult, setSimpleResult] = useState<import('@cn-kis/api-client').QRCodeRecord | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [manualInput, setManualInput] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const smartMutation = useMutation({
    mutationFn: (qrHash: string) => qrcodeApi.smartResolve(qrHash, workstation),
    onSuccess: (res) => {
      const data = (res as any).data as SmartResolveResult
      setResult(data)
      stopScanning()
      onAction?.(data.recommended_action, data.action_data, data)
    },
    onError: () => {
      setErrorMsg('二维码无效或已停用')
      onError?.('二维码无效或已停用')
    },
  })

  const simpleMutation = useMutation({
    mutationFn: (qrHash: string) => qrcodeApi.resolve(qrHash),
    onSuccess: (res) => {
      const record = (res as any).data
      setSimpleResult(record)
      stopScanning()
      onResolved?.(record)
    },
    onError: () => {
      setErrorMsg('二维码无效或已停用')
      onError?.('二维码无效或已停用')
    },
  })

  const handleScan = useCallback((raw: string) => {
    setErrorMsg('')
    const match = raw.match(/\/qr\/([a-f0-9]{8,})/)
    const hash = match ? match[1] : raw.trim()
    if (!hash) return
    if (simpleMode) {
      simpleMutation.mutate(hash)
    } else {
      smartMutation.mutate(hash)
    }
  }, [workstation, simpleMode])

  const startScanning = useCallback(async () => {
    setErrorMsg('')
    setResult(null)
    setSimpleResult(null)
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
              handleScan(barcodes[0].rawValue)
            }
          } catch { /* frame decode errors are expected */ }
        }, 500)
      }
    } catch {
      setErrorMsg('无法访问摄像头，请检查权限设置，或使用手动输入')
    }
  }, [handleScan])

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

  useEffect(() => () => stopScanning(), [])

  const isPending = smartMutation.isPending || simpleMutation.isPending

  const reset = () => {
    setResult(null)
    setSimpleResult(null)
    setManualInput('')
    setErrorMsg('')
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {isScanning && (
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video ref={videoRef} className="w-full" autoPlay playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <button
            onClick={stopScanning}
            className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white"
            title="关闭摄像头"
            aria-label="关闭摄像头"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-white/60 rounded-xl" />
          </div>
        </div>
      )}

      {!isScanning && !result && !simpleResult && (
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
              onKeyDown={(e) => e.key === 'Enter' && handleScan(manualInput)}
              placeholder="扫码枪扫描或手动输入二维码内容"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              autoFocus
            />
            <button
              onClick={() => handleScan(manualInput)}
              disabled={!manualInput.trim() || isPending}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm hover:bg-slate-200 disabled:opacity-50"
            >
              {isPending ? '解析中...' : '查询'}
            </button>
          </div>
        </div>
      )}

      {result && !simpleMode && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-700 text-sm font-semibold">
            <CheckCircle className="w-4 h-4" />
            识别成功 · {result.entity.label}
          </div>

          <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-green-200">
            <Zap className="w-4 h-4 text-primary-500 shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-slate-500 mb-0.5">推荐动作</div>
              <div className="text-sm font-semibold text-primary-700">
                {ACTION_LABELS[result.recommended_action] ?? result.recommended_action}
              </div>
            </div>
          </div>

          {result.alternative_actions.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-slate-500">其他可用操作</div>
              <div className="flex flex-wrap gap-2">
                {result.alternative_actions.map((alt) => (
                  <button
                    key={alt}
                    onClick={() => onAlternativeAction?.(alt, result.action_data)}
                    className="px-3 py-1 text-xs bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-slate-50"
                  >
                    {ACTION_LABELS[alt] ?? alt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={reset} className="text-xs text-primary-600 hover:text-primary-700">
            重新扫码
          </button>
        </div>
      )}

      {simpleResult && simpleMode && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700 text-sm font-medium mb-2">
            <CheckCircle className="w-4 h-4" />
            识别成功
          </div>
          <div className="text-sm text-slate-700 space-y-1">
            <div>类型: {simpleResult.entity_type}</div>
            <div>标签: {simpleResult.label}</div>
          </div>
          <button onClick={reset} className="mt-3 text-xs text-primary-600 hover:text-primary-700">
            重新扫码
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            {errorMsg}
          </div>
          <button onClick={reset} className="mt-2 text-xs text-red-500 hover:text-red-700">
            重试
          </button>
        </div>
      )}
    </div>
  )
}
