import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ethicsApi } from '@/services/ethicsApi'

const APPLICATION_TYPES = [
  { value: 'initial', label: '初始审查' },
  { value: 'amendment', label: '修正案审查' },
  { value: 'continuing', label: '跟踪审查' },
  { value: 'sae_report', label: 'SAE 报告' },
  { value: 'final_report', label: '结题报告' },
]

export function ApplicationCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    protocol_id: '',
    committee_id: '',
    application_type: 'initial',
    description: '',
  })

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      ethicsApi.createApplication({
        ...data,
        protocol_id: Number(data.protocol_id),
        committee_id: Number(data.committee_id),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ethics'] })
      navigate(`/applications/${res.data?.id}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.protocol_id || !form.committee_id) return
    mutation.mutate(form)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-semibold text-slate-800">新建伦理申请</h2>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-slate-200 p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">协议 ID</label>
          <input
            type="number"
            value={form.protocol_id}
            onChange={(e) => setForm((f) => ({ ...f, protocol_id: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">伦理委员会 ID</label>
          <input
            type="number"
            value={form.committee_id}
            onChange={(e) => setForm((f) => ({ ...f, committee_id: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">申请类型</label>
          <select
            value={form.application_type}
            onChange={(e) => setForm((f) => ({ ...f, application_type: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {APPLICATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">申请说明</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={4}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutation.isPending ? '创建中...' : '创建申请'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/applications')}
            className="px-4 py-2 border border-slate-300 text-slate-600 text-sm rounded-lg hover:bg-slate-50"
          >
            取消
          </button>
        </div>

        {mutation.isError && (
          <div className="text-sm text-rose-600">创建失败，请重试</div>
        )}
      </form>
    </div>
  )
}
