/**
 * 智能二维码扫描组件（评估台版本）
 *
 * 接入 smart-resolve，根据评估台上下文自动路由。
 * 支持摄像头（html5-qrcode）、扫码枪/手动输入两种方式。
 */
import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { qrcodeApi } from '@cn-kis/api-client'
import type { SmartResolveAction, SmartResolveResult } from '@cn-kis/api-client'
import { QrCode, AlertTriangle, CheckCircle, Zap } from 'lucide-react'

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
  workstation: string
  onAction?: (action: SmartResolveAction, data: Record<string, unknown>, result: SmartResolveResult) => void
  onAlternativeAction?: (action: SmartResolveAction, data: Record<string, unknown>) => void
  className?: string
}

export function SmartQRScanner({ workstation, onAction, onAlternativeAction, className = '' }: SmartQRScannerProps) {
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState<SmartResolveResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const html5QrRef = useRef<any>(null)

  const mutation = useMutation({
    mutationFn: (raw: string) => {
      const match = raw.match(/\/qr\/([a-f0-9]{8,})/)
      const hash = match ? match[1] : raw.trim()
      return qrcodeApi.smartResolve(hash, workstation)
    },
    onSuccess: (res) => {
      const data = (res as any).data as SmartResolveResult
      setResult(data)
      onAction?.(data.recommended_action, data.action_data, data)
    },
    onError: () => setErrorMsg('二维码无效或已停用，请重试'),
  })

  const startCamera = async () => {
    setCameraError('')
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const scanner = new Html5Qrcode('evaluator-scan-region')
      html5QrRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded: string) => {
          scanner.stop().catch(() => {})
          setCameraActive(false)
          mutation.mutate(decoded)
        },
        () => {},
      )
      setCameraActive(true)
    } catch (err: any) {
      setCameraError(err?.message ?? '无法访问摄像头，请使用手动输入')
    }
  }

  const stopCamera = () => {
    if (html5QrRef.current) {
      html5QrRef.current.stop().catch(() => {})
      html5QrRef.current = null
    }
    setCameraActive(false)
  }

  useEffect(() => () => stopCamera(), [])

  const reset = () => {
    setResult(null)
    setManualCode('')
    setErrorMsg('')
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {!result && (
        <>
          <div
            id="evaluator-scan-region"
            className={`bg-slate-900 rounded-lg overflow-hidden ${cameraActive ? 'h-64' : 'h-48'}`}
          >
            {!cameraActive && (
              <div className="h-full flex items-center justify-center">
                <button
                  onClick={startCamera}
                  className="flex flex-col items-center gap-2 text-slate-400 hover:text-indigo-400 transition-colors"
                >
                  <QrCode className="w-10 h-10" />
                  <span className="text-xs">点击启动摄像头扫码</span>
                </button>
              </div>
            )}
          </div>
          {cameraActive && (
            <button onClick={stopCamera} className="text-xs text-slate-500 hover:text-slate-700">
              关闭摄像头
            </button>
          )}
          {cameraError && (
            <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4" />{cameraError}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && mutation.mutate(manualCode)}
              placeholder="扫码枪扫描或手动输入受试者编号 / 二维码"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <button
              onClick={() => mutation.mutate(manualCode)}
              disabled={mutation.isPending || !manualCode.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {mutation.isPending ? '查询中...' : '查询'}
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              <AlertTriangle className="w-4 h-4" />{errorMsg}
            </div>
          )}
        </>
      )}

      {result && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-700 text-sm font-semibold">
            <CheckCircle className="w-4 h-4" />
            识别成功 · {result.entity.label}
          </div>

          <div className="flex items-center gap-2 p-3 bg-white rounded-lg border border-green-200">
            <Zap className="w-4 h-4 text-indigo-500 shrink-0" />
            <div className="flex-1">
              <div className="text-xs text-slate-500 mb-0.5">推荐动作</div>
              <div className="text-sm font-semibold text-indigo-700">
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

          <button onClick={reset} className="text-xs text-indigo-600 hover:text-indigo-700">
            重新扫码
          </button>
        </div>
      )}
    </div>
  )
}
