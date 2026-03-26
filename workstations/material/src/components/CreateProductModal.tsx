import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import { X } from 'lucide-react'

export type CreateProductModalVariant = 'ledger' | 'project'

export const STUDY_PROJECT_TYPE_OPTIONS = [
  { value: 'clinical', label: '临床测试' },
  { value: 'consumer_clt', label: '消费者测试-CLT' },
  { value: 'consumer_hut', label: '消费者测试-HUT' },
] as const

type Props = {
  onClose: () => void
  onSuccess: () => void
  variant?: CreateProductModalVariant
}

export function CreateProductModal({ onClose, onSuccess, variant = 'ledger' }: Props) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    batch_number: '',
    specification: '',
    storage_condition: '',
    expiry_date: '',
    product_type: '',
    sponsor: '',
    description: '',
    protocol_id: '',
    protocol_name: '',
    study_project_type: '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      let protocolId: number | undefined
      if (variant === 'project' && form.protocol_id.trim()) {
        const parsed = Number.parseInt(form.protocol_id.trim(), 10)
        if (!Number.isFinite(parsed)) {
          throw new Error('关联项目 ID 须为数字')
        }
        protocolId = parsed
      }
      if (variant === 'project' && !form.study_project_type) {
        throw new Error('请选择项目类型')
      }
      return materialApi.createProduct({
        name: form.name,
        code: form.code,
        batch_number: form.batch_number || undefined,
        specification: form.specification || undefined,
        storage_condition: form.storage_condition || undefined,
        expiry_date: form.expiry_date || undefined,
        product_type: form.product_type || undefined,
        sponsor: form.sponsor || undefined,
        description: form.description || undefined,
        study_project_type: form.study_project_type || undefined,
        ...(variant === 'project'
          ? {
              protocol_id: protocolId,
              protocol_name: form.protocol_name.trim() || undefined,
            }
          : {}),
      })
    },
    onSuccess: () => onSuccess(),
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { msg?: string } } })?.response?.data?.msg
      setError(msg || '创建失败')
    },
  })

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div
        className="relative w-[92vw] max-w-[520px] max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal
        aria-labelledby="create-product-modal-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-slate-200 bg-white px-6 py-4">
          <h3 id="create-product-modal-title" className="text-lg font-semibold">
            {variant === 'project' ? '新建项目样品关联' : '登记产品'}
          </h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-slate-100" title="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

          {variant === 'project' && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border border-amber-100 bg-amber-50/50 p-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">关联项目名称</span>
                <input
                  value={form.protocol_name}
                  onChange={(e) => set('protocol_name', e.target.value)}
                  placeholder="与项目台账或协议标题一致"
                  title="关联项目名称"
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">关联项目 ID（可选）</span>
                <input
                  value={form.protocol_id}
                  onChange={(e) => set('protocol_id', e.target.value)}
                  placeholder="数字，如协议主键"
                  title="关联项目 ID"
                  inputMode="numeric"
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">项目类型 *</span>
                <select
                  value={form.study_project_type}
                  onChange={(e) => set('study_project_type', e.target.value)}
                  title="项目类型"
                  className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">请选择</option>
                  {STUDY_PROJECT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">产品名称 *</span>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              title="产品名称"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">产品编码 *</span>
            <input
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
              placeholder="如 PRD-001"
              title="产品编码"
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">批号</span>
              <input
                value={form.batch_number}
                onChange={(e) => set('batch_number', e.target.value)}
                title="批号"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">规格</span>
              <input
                value={form.specification}
                onChange={(e) => set('specification', e.target.value)}
                title="规格"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">存储条件</span>
              <input
                value={form.storage_condition}
                onChange={(e) => set('storage_condition', e.target.value)}
                placeholder="如 2-8°C"
                title="存储条件"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">有效期至</span>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => set('expiry_date', e.target.value)}
                title="有效期至"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">产品类型</span>
              <select
                value={form.product_type}
                onChange={(e) => set('product_type', e.target.value)}
                title="产品类型"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">请选择类型</option>
                <option value="test_sample">测试样品</option>
                <option value="placebo">对照品</option>
                <option value="standard">标准品</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">委托方</span>
              <input
                value={form.sponsor}
                onChange={(e) => set('sponsor', e.target.value)}
                title="委托方"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </label>
          </div>

          {variant === 'ledger' && (
            <label className="block">
              <span className="text-sm font-medium text-slate-700">项目类型（可选）</span>
              <select
                value={form.study_project_type}
                onChange={(e) => set('study_project_type', e.target.value)}
                title="项目类型"
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">不填写</option>
                {STUDY_PROJECT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-sm font-medium text-slate-700">描述</span>
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              title="产品描述"
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </label>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                setError('')
                mutation.mutate()
              }}
              disabled={!form.name || !form.code || mutation.isPending}
              className="min-h-11 flex-1 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
            >
              {mutation.isPending ? '提交中...' : '提交'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
