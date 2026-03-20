import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, Modal, Button, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { FileText, Plus, Send, Sparkles, Pencil } from 'lucide-react'

interface Brief {
  id: number
  title: string
  brief_type: 'quarterly' | 'project_kickoff' | 'strategic_review' | 'urgent'
  client_id: number
  client_name?: string
  published: boolean
  published_at: string | null
  create_time: string
  [key: string]: unknown
}

const briefTypeMap: Record<string, { label: string; variant: 'error' | 'warning' | 'primary' | 'default' }> = {
  quarterly: { label: '季度简报', variant: 'primary' },
  project_kickoff: { label: '启动简报', variant: 'warning' },
  strategic_review: { label: '战略回顾', variant: 'error' },
  urgent: { label: '紧急通报', variant: 'error' },
}

export function ClientBriefPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState({
    client_id: '',
    brief_type: 'quarterly',
    title: '',
    client_strategy: '',
    market_context: '',
    client_pain_points: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['briefs', page, pageSize],
    queryFn: () =>
      api.get<{ items: Brief[]; total: number }>('/crm/briefs/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'all'],
    queryFn: () => api.get<{ items: Array<{ id: number; name: string }> }>('/crm/clients/list', { params: { page: 1, page_size: 1000 } }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/crm/briefs/create', {
      ...form,
      client_id: Number(form.client_id) || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['briefs'] })
      setShowCreate(false)
      setForm({ client_id: '', brief_type: 'quarterly', title: '', client_strategy: '', market_context: '', client_pain_points: '' })
    },
  })

  const publishMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/crm/briefs/${id}/publish`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['briefs'] }),
  })

  const aiGenerateMutation = useMutation({
    mutationFn: () => api.post<any>(`/crm/clients/${form.client_id}/ai/generate-brief`, {
      brief_type: form.brief_type,
    }),
    onSuccess: (res) => {
      if (res?.data) {
        setForm(p => ({ ...p, ...res.data }))
      }
    },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const clients = clientsData?.data?.items ?? []

  const columns: Column<Brief>[] = [
    { key: 'title', title: '标题' },
    {
      key: 'brief_type',
      title: '类型',
      width: 120,
      render: (val) => {
        const info = briefTypeMap[val as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
      },
    },
    {
      key: 'client_id',
      title: '客户',
      width: 150,
      render: (val, row) => row?.client_name || `客户#${val}`,
    },
    {
      key: 'published',
      title: '状态',
      width: 100,
      render: (val) => (
        <Badge variant={val ? 'success' : 'default'}>
          {val ? '已发布' : '未发布'}
        </Badge>
      ),
    },
    {
      key: 'published_at',
      title: '发布时间',
      width: 150,
      render: (val) => val ? new Date(String(val)).toLocaleString('zh-CN') : '-',
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 150,
      render: (val) => val ? new Date(String(val)).toLocaleString('zh-CN') : '-',
    },
    {
      key: 'id' as any,
      title: '操作',
      width: 150,
      render: (_, row) => (
        <div className="flex gap-2">
          {!row?.published && (
            <button
              onClick={() => publishMutation.mutate(row!.id)}
              className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
            >
              发布
            </button>
          )}
          <button
            onClick={() => setEditingId(row!.id)}
            className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1"
          >
            <Pencil className="w-3 h-3" /> 编辑
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">客户简报</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> 新建简报
        </button>
      </div>

      <Card>
        <div className="p-1">
          <DataTable<Brief>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无简报数据"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建简报</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">客户 *</label>
                  <select
                    value={form.client_id}
                    onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  >
                    <option value="">请选择</option>
                    {clients.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">简报类型 *</label>
                  <select
                    value={form.brief_type}
                    onChange={e => setForm(p => ({ ...p, brief_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  >
                    {Object.entries(briefTypeMap).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">标题 *</label>
                <input
                  value={form.title}
                  onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">客户策略</label>
                <textarea
                  value={form.client_strategy}
                  onChange={e => setForm(p => ({ ...p, client_strategy: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">市场背景</label>
                <textarea
                  value={form.market_context}
                  onChange={e => setForm(p => ({ ...p, market_context: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">客户痛点</label>
                <textarea
                  value={form.client_pain_points}
                  onChange={e => setForm(p => ({ ...p, client_pain_points: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={3}
                />
              </div>
              {form.client_id && (
                <button
                  onClick={() => aiGenerateMutation.mutate()}
                  disabled={aiGenerateMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-blue-200 text-blue-600 rounded-lg text-sm hover:bg-blue-50 disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  {aiGenerateMutation.isPending ? 'AI生成中...' : 'AI生成'}
                </button>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowCreate(false); setForm({ client_id: '', brief_type: 'quarterly', title: '', client_strategy: '', market_context: '', client_pain_points: '' }) }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={() => createMutation.mutate()} disabled={!form.title || !form.client_id || createMutation.isPending} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
