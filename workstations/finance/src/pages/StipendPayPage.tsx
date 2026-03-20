import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { qrcodeApi, executionApi } from '@cn-kis/api-client'
import {
  QrCode, User, DollarSign, CheckCircle, AlertCircle,
  RotateCcw, CreditCard, Banknote,
} from 'lucide-react'

type PageState = 'idle' | 'resolving' | 'identified' | 'paying' | 'success' | 'error'

const PAYMENT_METHODS = [
  { value: 'cash', label: '现金', icon: Banknote },
  { value: 'wechat_pay', label: '微信支付', icon: CreditCard },
  { value: 'alipay', label: '支付宝', icon: CreditCard },
  { value: 'bank_transfer', label: '银行转账', icon: CreditCard },
]

interface SubjectInfo {
  subject_id: number
  subject_name?: string
  subject_no?: string
  entity_label?: string
}

export default function StipendPayPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [qrInput, setQrInput] = useState('')
  const [state, setState] = useState<PageState>('idle')
  const [subjectInfo, setSubjectInfo] = useState<SubjectInfo | null>(null)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [remark, setRemark] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [successInfo, setSuccessInfo] = useState<{ payment_no: string } | null>(null)

  const resolveMutation = useMutation({
    mutationFn: (qrHash: string) =>
      qrcodeApi.smartResolve(qrHash, 'finance'),
    onSuccess: (res) => {
      const result = (res as any).data ?? res
      const action = result?.recommended_action
      const actionData = result?.action_data ?? {}

      if (action === 'stipend_pay' && actionData.subject_id) {
        setSubjectInfo({
          subject_id: actionData.subject_id,
          entity_label: result?.entity?.label ?? result?.entity_label,
          subject_name: result?.entity?.label,
          subject_no: result?.entity?.code,
        })
        setState('identified')
      } else {
        setState('error')
        setErrorMsg(`此二维码不是受试者码，无法发放礼金（动作：${action ?? '未知'}）`)
      }
    },
    onError: (err: any) => {
      setState('error')
      setErrorMsg(err?.response?.data?.msg ?? '二维码解析失败，请重试')
    },
  })

  const payMutation = useMutation({
    mutationFn: async ({ subjectId, amt, method, note }: {
      subjectId: number; amt: number; method: string; note: string
    }) => {
      const createRes = await executionApi.createPayment(subjectId, {
        payment_type: 'stipend',
        amount: amt,
        notes: note,
      })
      const paymentId = ((createRes as any).data ?? createRes)?.id
      if (!paymentId) throw new Error('创建支付记录失败')
      const confirmRes = await executionApi.confirmPayment(paymentId, { payment_method: method })
      return (confirmRes as any).data ?? confirmRes
    },
    onSuccess: (data) => {
      setSuccessInfo({ payment_no: data?.payment_no ?? data?.id ?? '-' })
      setState('success')
    },
    onError: (err: any) => {
      setState('error')
      setErrorMsg(err?.response?.data?.msg ?? '礼金发放失败，请重试')
    },
  })

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!qrInput.trim()) return
    setState('resolving')
    setErrorMsg('')
    setSubjectInfo(null)
    resolveMutation.mutate(qrInput.trim())
    setQrInput('')
  }

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!subjectInfo || !amount) return
    const amtNum = parseFloat(amount)
    if (isNaN(amtNum) || amtNum <= 0) {
      setErrorMsg('请输入有效的发放金额')
      return
    }
    setState('paying')
    payMutation.mutate({
      subjectId: subjectInfo.subject_id,
      amt: amtNum,
      method: paymentMethod,
      note: remark,
    })
  }

  const reset = () => {
    setState('idle')
    setSubjectInfo(null)
    setAmount('')
    setPaymentMethod('cash')
    setRemark('')
    setErrorMsg('')
    setSuccessInfo(null)
    setQrInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const maskedName = (name?: string) => {
    if (!name || name.length <= 1) return name ?? ''
    return name[0] + '*'.repeat(name.length - 1)
  }

  return (
    <div className="space-y-5 md:space-y-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <DollarSign className="w-6 h-6 text-emerald-600" />
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">受试者礼金发放</h1>
      </div>

      {/* 阶段 1：扫码识别 */}
      {(state === 'idle' || state === 'resolving' || state === 'error') && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <span className="w-5 h-5 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs">1</span>
            扫码识别受试者
          </h2>

          <div className="flex flex-col items-center gap-3 p-5 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
            <QrCode className="w-12 h-12 text-slate-300" />
            <p className="text-sm text-slate-500 text-center">使用扫码枪扫描受试者手持二维码，或手动输入</p>
          </div>

          {state === 'error' && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{errorMsg}</p>
            </div>
          )}

          <form onSubmit={handleScanSubmit} className="flex gap-2">
            <div className="flex-1 relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="扫描或输入二维码内容..."
                value={qrInput}
                onChange={e => setQrInput(e.target.value)}
                autoFocus
                disabled={state === 'resolving'}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50"
              />
            </div>
            <button
              type="submit"
              disabled={!qrInput.trim() || state === 'resolving'}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              {state === 'resolving' ? '识别中...' : '识别'}
            </button>
          </form>
        </div>
      )}

      {/* 阶段 2：礼金发放表单 */}
      {(state === 'identified' || state === 'paying') && subjectInfo && (
        <div className="space-y-4">
          {/* 受试者信息卡 */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                {maskedName(subjectInfo.subject_name ?? subjectInfo.entity_label)}
              </p>
              {subjectInfo.subject_no && (
                <p className="text-xs text-emerald-600">{subjectInfo.subject_no}</p>
              )}
            </div>
            <button
              onClick={reset}
              className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              <RotateCcw className="w-3 h-3" />
              重新扫码
            </button>
          </div>

          {/* 发放表单 */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-5 h-5 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs">2</span>
              填写发放信息
            </h2>

            <form onSubmit={handlePaySubmit} className="space-y-4">
              <div>
                <label htmlFor="stipend-amount" className="block text-sm font-medium text-slate-700 mb-1">
                  发放金额（元）
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">¥</span>
                  <input
                    id="stipend-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    autoFocus
                    className="w-full pl-7 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">发放方式</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setPaymentMethod(m.value)}
                      className={`flex items-center gap-2 px-3 py-2.5 border rounded-lg text-sm transition-all ${
                        paymentMethod === m.value
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-medium'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <m.icon className="w-4 h-4" />
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="stipend-remark" className="block text-sm font-medium text-slate-700 mb-1">
                  备注（可选）
                </label>
                <textarea
                  id="stipend-remark"
                  value={remark}
                  onChange={e => setRemark(e.target.value)}
                  rows={2}
                  placeholder="访视编号、项目代码等备注信息..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={!amount || state === 'paying'}
                className="w-full py-3 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <DollarSign className="w-4 h-4" />
                {state === 'paying' ? '发放中...' : '确认发放'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 发放成功 */}
      {state === 'success' && successInfo && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-slate-800">礼金发放成功</p>
            <p className="text-sm text-slate-500 mt-1">
              流水号：<span className="font-mono font-medium text-slate-700">{successInfo.payment_no}</span>
            </p>
          </div>
          <button
            onClick={reset}
            className="mt-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            继续发放
          </button>
        </div>
      )}
    </div>
  )
}
