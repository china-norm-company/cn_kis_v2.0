import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { qrcodeApi, receptionApi } from '@cn-kis/api-client'
import { QrCode, LogIn, LogOut, User, CheckCircle, AlertCircle, Clock } from 'lucide-react'

type PageState = 'idle' | 'resolving' | 'success_checkin' | 'success_checkout' | 'error'

interface SuccessInfo {
  subject_name?: string
  subject_no?: string
  time?: string
  duration?: string
}

export default function QRScanCheckinPage() {
  const queryClient = useQueryClient()
  const [qrInput, setQrInput] = useState('')
  const [state, setState] = useState<PageState>('idle')
  const [successInfo, setSuccessInfo] = useState<SuccessInfo>({})
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const resolveMutation = useMutation({
    mutationFn: (qrHash: string) =>
      qrcodeApi.smartResolve({ qr_hash: qrHash, workstation: 'reception', scanner_role: 'receptionist' }),
    onSuccess: async (res) => {
      const result = (res as any).data ?? res
      const action = result?.recommended_action
      const actionData = result?.action_data ?? {}

      if (action === 'checkin') {
        try {
          const checkinRes = await receptionApi.quickCheckin({ subject_id: actionData.subject_id, method: 'qr_scan' })
          const data = (checkinRes as any).data ?? checkinRes
          setSuccessInfo({
            subject_name: data?.subject_name ?? result?.entity_label,
            subject_no: data?.subject_no,
            time: data?.checkin_time ?? new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          })
          setState('success_checkin')
          queryClient.invalidateQueries({ queryKey: ['reception-queue'] })
          queryClient.invalidateQueries({ queryKey: ['reception'] })
        } catch (err: any) {
          setState('error')
          setErrorMsg(err?.response?.data?.msg ?? '签到失败，请重试')
        }
      } else if (action === 'checkout') {
        try {
          const checkoutRes = await receptionApi.quickCheckout(actionData.checkin_id)
          const data = (checkoutRes as any).data ?? checkoutRes
          setSuccessInfo({
            subject_name: data?.subject_name ?? result?.entity_label,
            subject_no: data?.subject_no,
            time: data?.checkout_time ?? new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            duration: data?.stay_duration,
          })
          setState('success_checkout')
          queryClient.invalidateQueries({ queryKey: ['reception-queue'] })
          queryClient.invalidateQueries({ queryKey: ['reception'] })
        } catch (err: any) {
          setState('error')
          setErrorMsg(err?.response?.data?.msg ?? '签出失败，请重试')
        }
      } else {
        setState('error')
        setErrorMsg(`无法处理此二维码（动作：${action ?? '未知'}），请联系管理员`)
      }
    },
    onError: (err: any) => {
      setState('error')
      setErrorMsg(err?.response?.data?.msg ?? '二维码解析失败，请重试')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!qrInput.trim()) return
    setState('resolving')
    setSuccessInfo({})
    setErrorMsg('')
    resolveMutation.mutate(qrInput.trim())
    setQrInput('')
  }

  const reset = () => {
    setState('idle')
    setSuccessInfo({})
    setErrorMsg('')
    setQrInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const isProcessing = state === 'resolving'

  return (
    <div className="space-y-5 md:space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <QrCode className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">扫码签到 / 签出</h1>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col items-center gap-4 p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
          <QrCode className="w-16 h-16 text-slate-300" />
          <p className="text-sm text-slate-500 text-center">
            扫描受试者二维码，系统自动识别并执行签到或签出
          </p>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <LogIn className="w-3.5 h-3.5 text-green-500" />
              未签到 → 签到
            </span>
            <span className="flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5 text-blue-500" />
              已签到 → 签出
            </span>
          </div>
        </div>

        {state === 'success_checkin' && (
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <LogIn className="w-4 h-4 text-green-600" />
                <p className="text-sm font-semibold text-green-800">签到成功</p>
              </div>
              <p className="text-sm text-green-700 mt-0.5">
                {successInfo.subject_name}
                {successInfo.subject_no ? `（${successInfo.subject_no}）` : ''}
                已于 {successInfo.time ?? '-'} 完成签到
              </p>
            </div>
          </div>
        )}

        {state === 'success_checkout' && (
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <div className="flex items-center gap-2">
                <LogOut className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-semibold text-blue-800">签出成功</p>
              </div>
              <p className="text-sm text-blue-700 mt-0.5">
                {successInfo.subject_name}
                {successInfo.subject_no ? `（${successInfo.subject_no}）` : ''}
                已于 {successInfo.time ?? '-'} 完成签出
              </p>
              {successInfo.duration && (
                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  停留时长：{successInfo.duration}
                </p>
              )}
            </div>
          </div>
        )}

        {state === 'error' && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">操作失败</p>
              <p className="text-sm text-red-700 mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="扫描或输入二维码内容..."
              value={qrInput}
              onChange={e => setQrInput(e.target.value)}
              autoFocus
              disabled={isProcessing}
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
          </div>
          <button
            type="submit"
            disabled={!qrInput.trim() || isProcessing}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isProcessing ? '处理中...' : '确认'}
          </button>
        </form>

        {(state === 'success_checkin' || state === 'success_checkout' || state === 'error') && (
          <button onClick={reset} className="w-full py-2 text-sm text-slate-500 hover:text-slate-700 underline">
            继续扫码
          </button>
        )}
      </div>
    </div>
  )
}
