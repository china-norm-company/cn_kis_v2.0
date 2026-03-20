/**
 * 测量工作台页面 — 方案 2：iframe 嵌入 SADC
 *
 * 在评估台内嵌 http://127.0.0.1:5002/；若 5002 连不上则显示「请先启动」或「一键启动 SADC」。
 * 方案二：在飞书工作台内无法访问本机 SADC 时，引导用户在外部浏览器中打开。
 */
import { useEffect, useRef, useState } from 'react'
import { api } from '@cn-kis/api-client'

const SADC_MEASURE_URL =
  (import.meta as { env?: { VITE_SADC_MEASURE_URL?: string } }).env?.VITE_SADC_MEASURE_URL ??
  'http://127.0.0.1:5002/'
const SADC_LAUNCHER_URL =
  (import.meta as { env?: { VITE_SADC_LAUNCHER_URL?: string } }).env?.VITE_SADC_LAUNCHER_URL ??
  'http://127.0.0.1:18765'

/** 是否可能运行在飞书内置浏览器内 */
function isLikelyFeishu(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /Lark|Feishu|飞书/i.test(ua)
}

type Status = 'checking' | 'available' | 'unavailable'

export function MeasurePage() {
  const [status, setStatus] = useState<Status>('checking')
  const [startError, setStartError] = useState<string | null>(null)
  const [copyTip, setCopyTip] = useState<string | null>(null)
  const linkInputRef = useRef<HTMLInputElement>(null)

  const check = () => {
    setStatus('checking')
    setStartError(null)
    // 使用 CORS 模式检测（SADC 已支持 CORS）
    fetch(SADC_MEASURE_URL, { method: 'GET', mode: 'cors' })
      .then((res) => {
        if (res.ok) {
          setStatus('available')
        } else {
          setStatus('unavailable')
        }
      })
      .catch(() => {
        // CORS 请求失败，可能是网络问题或服务未启动
        setStatus('unavailable')
      })
  }

  const handleStartSadc = async () => {
    setStartError(null)
    try {
      const alreadyUp = await fetch(SADC_MEASURE_URL, { method: 'HEAD', mode: 'no-cors' }).then(
        () => true,
        () => false
      )
      if (alreadyUp) {
        check()
        return
      }
      try {
        const launcherRes = await fetch(`${SADC_LAUNCHER_URL}/start`, { method: 'GET' })
        const launcherJson = (await launcherRes.json()) as { ok?: boolean; msg?: string }
        if (launcherJson?.ok) {
          await new Promise((r) => setTimeout(r, 3000))
          check()
          return
        }
        if (launcherJson?.msg) setStartError(launcherJson.msg)
      } catch {
        // 本机启动器未运行，尝试后端
      }
      const res = await api.post<{ code: number; msg?: string }>('/evaluator/start-sadc')
      const msg = (res?.data as { msg?: string })?.msg
      if (msg) setStartError(msg)
      await new Promise((r) => setTimeout(r, 3000))
      check()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '启动请求失败'
      setStartError(msg)
      setTimeout(check, 2000)
    }
  }

  useEffect(() => {
    check()
  }, [])

  if (status === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-slate-600">
        <div className="animate-pulse text-sm">正在检测测量工作台…</div>
      </div>
    )
  }

  const measurePageUrl = typeof window !== 'undefined' ? window.location.href : ''

  /** 飞书官方：URL 带此参数时，点击会在系统浏览器中打开（桌面 lk_jump_to_browser，移动 lk_mobile_jump_to_browser） */
  const measurePageUrlForBrowser = (() => {
    if (!measurePageUrl) return ''
    const sep = measurePageUrl.includes('?') ? '&' : '?'
    return `${measurePageUrl}${sep}lk_jump_to_browser=true&lk_mobile_jump_to_browser=true`
  })()

  const handleOpenInBrowser = () => {
    if (measurePageUrlForBrowser) window.open(measurePageUrlForBrowser, '_blank', 'noopener,noreferrer')
  }

  const handleCopyLink = async () => {
    const urlToCopy = measurePageUrlForBrowser || measurePageUrl
    if (!urlToCopy) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(urlToCopy)
        setCopyTip('已复制到剪贴板，请粘贴到 Chrome 等浏览器中打开')
      } else {
        throw new Error('no clipboard')
      }
    } catch {
      linkInputRef.current?.select()
      setCopyTip('请长按上方链接全选后复制，再粘贴到 Chrome 中打开')
    }
    setTimeout(() => setCopyTip(null), 4000)
  }

  if (status === 'unavailable') {
    const inFeishu = isLikelyFeishu()
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-6 text-center">
        <p className="text-slate-800 font-medium">请先启动测量工作台</p>
        <p className="text-sm text-slate-500 max-w-md">
          本页需要在本机运行 SADC 测量工作台（如在该目录执行 python app.py），
          并确保地址为：{SADC_MEASURE_URL}
        </p>
        {inFeishu && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 max-w-md text-left">
            <p className="text-sm text-amber-800 font-medium">若在飞书工作台内打开</p>
            <p className="text-sm text-amber-700 mt-1">
              无法访问本机测量服务，请使用外部浏览器（如 Chrome）打开本页后再使用测量功能。
            </p>
            <p className="text-xs text-amber-600 mt-1">
              点击「在外部浏览器中打开」将使用飞书能力跳转到系统浏览器；若无效可复制下方链接到 Chrome 打开。
            </p>
            <input
              ref={linkInputRef}
              type="text"
              readOnly
              value={measurePageUrlForBrowser}
              className="mt-2 w-full px-2 py-2 text-xs bg-white border border-amber-300 rounded select-all"
              style={{ userSelect: 'all', WebkitUserSelect: 'all' }}
              onFocus={(e) => e.target.select()}
            />
            <div className="mt-3 flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={handleOpenInBrowser}
                className="px-3 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
              >
                在外部浏览器中打开
              </button>
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3 py-2 bg-white border border-amber-400 text-amber-800 text-sm rounded-lg hover:bg-amber-50"
              >
                复制链接
              </button>
            </div>
            {copyTip && <p className="text-xs text-amber-600 mt-2">{copyTip}</p>}
          </div>
        )}
        {startError && <p className="text-sm text-amber-600 max-w-md">{startError}</p>}
        {!inFeishu && (
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={handleStartSadc}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
            >
              一键启动 SADC
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-3 justify-center">
          <button
            type="button"
            onClick={check}
            className="px-4 py-2 bg-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-300"
          >
            重新检测
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 -mx-4 -my-2">
      <iframe
        src={SADC_MEASURE_URL}
        title="测量工作台"
        className="flex-1 w-full min-h-[calc(100vh-8rem)] border-0 rounded-lg bg-slate-100"
      />
    </div>
  )
}
