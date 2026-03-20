/**
 * 仪器测量页 — 仪器测量入口 + 扫描入口（备用）；开始测量先检测 SADC 是否已运行，未运行再调用启动后跳转 /measure。
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutGrid, QrCode } from 'lucide-react'
import { api } from '@cn-kis/api-client'

const SADC_MEASURE_URL =
  (import.meta as { env?: { VITE_SADC_MEASURE_URL?: string } }).env?.VITE_SADC_MEASURE_URL ??
  'http://127.0.0.1:5002/'
/** 本机启动器：KIS 部署在飞书/服务器无法配置路径时，由本机启动器负责启动 SADC */
const SADC_LAUNCHER_URL =
  (import.meta as { env?: { VITE_SADC_LAUNCHER_URL?: string } }).env?.VITE_SADC_LAUNCHER_URL ??
  'http://127.0.0.1:18765'

export function InstrumentMeasurePage() {
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const isSadcAvailable = (): Promise<boolean> => {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 1500)
    return fetch(SADC_MEASURE_URL, { method: 'HEAD', mode: 'no-cors', signal: controller.signal })
      .then(() => {
        clearTimeout(t)
        return true
      })
      .catch(() => {
        clearTimeout(t)
        return false
      })
  }

  const handleStartMeasure = async () => {
    setStarting(true)
    setStartError(null)
    try {
      const available = await isSadcAvailable()
      if (available) {
        navigate('/measure')
        setStarting(false)
        return
      }
      // 优先请求本机启动器（飞书部署时 KIS 服务器无法配置 SADC 路径，由本机启动器负责）
      try {
        const launcherRes = await fetch(`${SADC_LAUNCHER_URL}/start`, { method: 'GET' })
        const launcherJson = (await launcherRes.json()) as { ok?: boolean; msg?: string }
        if (launcherJson?.ok) {
          await new Promise((r) => setTimeout(r, 2500))
          navigate('/measure')
          setStarting(false)
          return
        }
        if (launcherJson?.msg) setStartError(launcherJson.msg)
      } catch {
        // 本机启动器未运行或请求失败，继续尝试后端
      }
      const res = await api.post<{ code: number; msg?: string }>('/evaluator/start-sadc')
      const body = res?.data as { code?: number; msg?: string } | undefined
      if (body && body.code !== 0 && body.msg) {
        if (body.code === 503) {
          setStartError('请在本机运行「KIS 测量启动器」并保持窗口打开，或手动启动测量工作台后刷新')
        } else {
          setStartError(body.msg)
        }
        setStarting(false)
        return
      }
      await new Promise((r) => setTimeout(r, 2500))
      navigate('/measure')
    } catch (_) {
      navigate('/measure')
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="min-h-[70vh] flex flex-col justify-center py-8">
      <div className="max-w-lg mx-auto w-full space-y-12 flex flex-col items-center px-4">
        {/* 仪器测量入口 — 白卡 + 边框，与扫码执行区风格一致 */}
        <div className="w-full bg-white rounded-xl border border-slate-200 p-6 text-center">
          <LayoutGrid className="w-12 h-12 text-indigo-500 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-slate-800">仪器测量入口</h2>
          <p className="text-sm text-slate-500 mt-1">手动输入测试信息</p>
          <button
            type="button"
            onClick={handleStartMeasure}
            disabled={starting}
            className="mt-5 w-full py-4 bg-indigo-600 text-white text-xl font-bold rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-70"
          >
            {starting ? '正在检测/启动测量工作台…' : '开始测量'}
          </button>
          {startError && <p className="mt-3 text-sm text-amber-600">{startError}</p>}
        </div>

        {/* 扫描入口（备用）— 白卡 + 边框，与上方风格一致 */}
        <div className="w-full bg-white rounded-xl border border-slate-200 p-6 text-center">
          <QrCode className="w-12 h-12 text-indigo-500 mx-auto mb-3" />
          <h2 className="text-xl font-semibold text-slate-800">扫描入口</h2>
          <p className="text-sm text-slate-500 mt-1">扫描受试者二维码快速匹配工单（备用）</p>
          <button
            type="button"
            onClick={() => navigate('/scan')}
            className="mt-5 w-full py-4 bg-slate-600 text-white text-xl font-bold rounded-lg hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
          >
            去扫码执行
          </button>
        </div>
      </div>
    </div>
  )
}
