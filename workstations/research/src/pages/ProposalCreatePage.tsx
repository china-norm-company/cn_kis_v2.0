/**
 * 创建方案页面
 *
 * 支持两种创建方式：
 * 1. 从商机创建（预填信息）
 * 2. 手动创建
 */
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Button } from '@cn-kis/ui-kit'
import { ArrowLeft, FilePlus } from 'lucide-react'

interface OpportunityOption {
  id: number
  title: string
  client_name: string
  estimated_amount: number
}

export default function ProposalCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromOppId = searchParams.get('opportunity_id')

  const [form, setForm] = useState({
    title: '',
    description: '',
    opportunity_id: fromOppId ? parseInt(fromOppId) : null as number | null,
  })

  const { data: oppsRes } = useQuery({
    queryKey: ['crm', 'opportunities', 'active'],
    queryFn: () =>
      api.get<{ data: { items: OpportunityOption[] } }>('/crm/opportunities/list', {
        params: { stage: 'qualification', page_size: 50 },
      }),
  })

  const opportunities = (oppsRes as any)?.data?.data?.items ?? []

  const createMutation = useMutation({
    mutationFn: async () => {
      if (form.opportunity_id) {
        return api.post('/proposal/create-from-opportunity', {
          opportunity_id: form.opportunity_id,
        })
      }
      return api.post('/proposal/create', {
        title: form.title,
        description: form.description,
      })
    },
    onSuccess: (res: any) => {
      const id = res?.data?.id
      if (id) {
        navigate(`/proposals/${id}`)
      } else {
        navigate('/proposals')
      }
    },
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/proposals')}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-800">创建方案</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            可从商机预填信息，也可手动创建
          </p>
        </div>
      </div>

      <div className="max-w-2xl bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        {/* 创建方式 */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            创建方式
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setForm(f => ({ ...f, opportunity_id: null }))}
              className={`flex-1 p-4 rounded-lg border-2 text-left transition ${
                !form.opportunity_id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-sm font-medium text-slate-700">手动创建</div>
              <div className="text-xs text-slate-500 mt-1">填写方案标题和描述</div>
            </button>
            <button
              onClick={() => setForm(f => ({ ...f, opportunity_id: opportunities[0]?.id || null }))}
              className={`flex-1 p-4 rounded-lg border-2 text-left transition ${
                form.opportunity_id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="text-sm font-medium text-slate-700">从商机创建</div>
              <div className="text-xs text-slate-500 mt-1">选择商机，自动预填信息</div>
            </button>
          </div>
        </div>

        {/* 商机选择 */}
        {form.opportunity_id !== null && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              关联商机
            </label>
            <select
              value={form.opportunity_id || ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, opportunity_id: parseInt(e.target.value) || null }))
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">请选择商机</option>
              {opportunities.map((opp) => (
                <option key={opp.id} value={opp.id}>
                  {opp.title} — {opp.client_name}
                  {opp.estimated_amount
                    ? ` (¥${(opp.estimated_amount / 10000).toFixed(1)}万)`
                    : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 手动创建的表单字段 */}
        {form.opportunity_id === null && (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                方案标题 *
              </label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="请输入方案标题"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                方案描述
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="请输入方案描述"
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              />
            </div>
          </>
        )}

        {/* 提交 */}
        <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
          <Button
            variant="secondary"
            onClick={() => navigate('/proposals')}
          >
            取消
          </Button>
          <Button
            variant="primary"
            icon={<FilePlus className="w-4 h-4" />}
            loading={createMutation.isPending}
            disabled={
              form.opportunity_id === null
                ? !form.title.trim()
                : !form.opportunity_id
            }
            onClick={() => createMutation.mutate()}
          >
            {form.opportunity_id ? '从商机创建' : '创建方案'}
          </Button>
        </div>

        {createMutation.isError && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            创建失败: {(createMutation.error as Error)?.message || '未知错误'}
          </div>
        )}
      </div>
    </div>
  )
}
