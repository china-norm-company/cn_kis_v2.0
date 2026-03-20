import { useState } from 'react'
import { ShieldCheck, Lock, X } from 'lucide-react'
import { evaluatorApi } from '@cn-kis/api-client'

interface SignatureDialogProps {
  resourceType: string
  resourceId: string
  resourceName?: string
  onSuccess: () => void
  onCancel: () => void
}

const REASONS = [
  { value: 'approve', label: '批准' },
  { value: 'confirm', label: '确认' },
  { value: 'review', label: '审核' },
  { value: 'complete', label: '完成操作' },
  { value: 'other', label: '其他' },
]

export function SignatureDialog({
  resourceType, resourceId, resourceName,
  onSuccess, onCancel,
}: SignatureDialogProps) {
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('confirm')
  const [customReason, setCustomReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSign = async () => {
    if (!password.trim()) {
      setError('请输入密码')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await evaluatorApi.createSignature({
        resource_type: resourceType,
        resource_id: resourceId,
        resource_name: resourceName,
        reason: reason === 'other' ? customReason : reason,
        password,
      })
      onSuccess()
    } catch (e: any) {
      setError(e?.response?.data?.msg ?? '签名失败，请检查密码后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-[440px] overflow-hidden">
        <div className="bg-indigo-600 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <ShieldCheck className="w-5 h-5" />
            <h3 className="text-lg font-semibold">电子签名确认</h3>
          </div>
          <button onClick={onCancel} className="text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <p className="text-slate-500">签名对象</p>
            <p className="text-slate-800 font-medium mt-0.5">
              {resourceName ?? `${resourceType}:${resourceId}`}
            </p>
          </div>

          <p className="text-xs text-slate-400">
            根据 21 CFR Part 11 要求，此操作需要重新验证身份。
          </p>

          <div>
            <label className="text-sm text-slate-600 block mb-1">签名原因</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            {reason === 'other' && (
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="请输入签名原因"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-2"
              />
            )}
          </div>

          <div>
            <label className="text-sm text-slate-600 block mb-1">
              <Lock className="w-3.5 h-3.5 inline mr-1" />
              密码验证
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSign()}
              placeholder="请输入账号密码"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              autoFocus
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg p-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSign}
              disabled={!password.trim() || submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {submitting ? '签名中...' : '确认签名'}
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2.5 border border-slate-300 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
