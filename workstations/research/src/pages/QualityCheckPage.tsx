/**
 * 方案质量检查 — 嵌入方案检查台（Protocol Check）
 *
 * iframe 加载外部 URL（VITE_PROTOCOL_QC_URL，如 https://china-norm.com/protocol-qc/）。
 * 502/5xx 时 iframe onError 未必触发，使用超时检测 + onLoad 清除超时。
 */
import { useState, useRef, useEffect } from 'react'
import { AlertCircle, ExternalLink } from 'lucide-react'

const DEFAULT_QC_URL = 'http://127.0.0.1:5000/'
const LOAD_TIMEOUT_MS = 15000

export default function QualityCheckPage() {
  const rawUrl =
    (import.meta.env.VITE_PROTOCOL_QC_URL as string)?.trim() || DEFAULT_QC_URL
  // 路径形式（如 /protocol-qc/）需拼接当前 origin，避免跨域与 502
  const embedUrl =
    rawUrl.startsWith('/')
      ? `${window.location.origin}${rawUrl}`
      : rawUrl
  const [loadError, setLoadError] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (loadError) return
    timeoutRef.current = setTimeout(() => {
      setLoadError(true)
    }, LOAD_TIMEOUT_MS)
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [embedUrl, loadError])

  const handleLoad = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  return (
    <div className="p-4 pb-8">
      <h2 className="text-base font-semibold text-slate-800 mb-3">方案质量检查</h2>
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden" style={{ minHeight: 'calc(100vh - 180px)' }}>
        {loadError ? (
          <div className="flex flex-col items-center justify-center gap-4 text-slate-500" style={{ minHeight: 'calc(100vh - 180px)' }}>
            <AlertCircle className="w-10 h-10 text-amber-400" />
            <p className="text-sm font-medium">嵌入加载失败或超时</p>
            <p className="text-xs text-slate-400 max-w-xs text-center">
              方案检查台服务可能暂时不可用（502），或飞书环境限制了页面内嵌。可点击下方按钮在新窗口打开。
            </p>
            <a
              href={embedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
            >
              <ExternalLink className="w-4 h-4" />
              在新窗口打开方案检查台
            </a>
          </div>
        ) : (
          <iframe
            title="方案质量检查"
            src={embedUrl}
            className="w-full h-full border-0"
            style={{ minHeight: 'calc(100vh - 180px)' }}
            onLoad={handleLoad}
            onError={() => setLoadError(true)}
          />
        )}
      </div>
    </div>
  )
}
