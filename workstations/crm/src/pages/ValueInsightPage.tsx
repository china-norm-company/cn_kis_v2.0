import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Badge, DataTable, Empty, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { Lightbulb, Share2, Plus, Sparkles, Pencil } from 'lucide-react'
import { useState } from 'react'

interface Insight {
  id: number
  title: string
  insight_type: string
  client_id: number
  client_name?: string
  source: string
  shared_at: string | null
  create_time: string
  content?: string
  [key: string]: unknown
}

interface Client {
  id: number
  name: string
  [key: string]: unknown
}

const insightTypeMap: Record<string, string> = {
  market_trend: '市场趋势',
  competitor_analysis: '竞品分析',
  regulatory_update: '法规动态',
  claim_innovation: '宣称创新',
  formulation_trend: '配方趋势',
  consumer_insight: '消费者洞察',
  cost_optimization: '成本优化',
  test_method_innovation: '检测创新',
}

const sourceMap: Record<string, string> = {
  ai_generated: 'AI生成',
  manual: '人工',
  industry_report: '行业报告',
  internal_rd: '内部研发',
}

export function ValueInsightPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [showAIGenerate, setShowAIGenerate] = useState(false)
  const [aiClientId, setAiClientId] = useState('')
  const [aiResult, setAiResult] = useState<{ title: string; content: string; insight_type: string } | null>(null)
  const [form, setForm] = useState({ client_id: '', insight_type: '', title: '', content: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['insights', page, pageSize],
    queryFn: () =>
      api.get<{ items: Insight[]; total: number }>('/crm/insights/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'all'],
    queryFn: () =>
      api.get<{ items: Client[] }>('/crm/clients/list', {
        params: { page: 1, page_size: 1000 },
      }),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<any>('/crm/insights/create', {
        ...form,
        client_id: Number(form.client_id) || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] })
      setShowCreate(false)
      setForm({ client_id: '', insight_type: '', title: '', content: '' })
    },
  })

  const shareMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/crm/insights/${id}/share`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] })
    },
  })

  const aiGenerateMutation = useMutation({
    mutationFn: () =>
      api.post<{ title: string; content: string; insight_type: string }>(
        `/crm/clients/${aiClientId}/ai/generate-insight`
      ),
    onSuccess: (data) => {
      setAiResult(data.data)
    },
  })

  const saveAiResultMutation = useMutation({
    mutationFn: () =>
      api.post<any>('/crm/insights/create', {
        client_id: Number(aiClientId) || undefined,
        insight_type: aiResult?.insight_type || '',
        title: aiResult?.title || '',
        content: aiResult?.content || '',
        source: 'ai_generated',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] })
      setShowAIGenerate(false)
      setAiClientId('')
      setAiResult(null)
    },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const clients = clientsData?.data?.items ?? []

  const columns: Column<Insight>[] = [
    { key: 'title', title: '标题' },
    {
      key: 'insight_type',
      title: '类型',
      width: 120,
      render: (val) => {
        const label = insightTypeMap[val as string] || String(val)
        return <Badge variant="primary">{label}</Badge>
      },
    },
    {
      key: 'client_name',
      title: '客户',
      width: 150,
      render: (val, row) => {
        return val ? String(val) : row?.client_id ? `客户 #${row.client_id}` : '-'
      },
    },
    {
      key: 'source',
      title: '来源',
      width: 100,
      render: (val) => {
        const label = sourceMap[val as string] || String(val)
        return label
      },
    },
    {
      key: 'shared_at',
      title: '分享状态',
      width: 100,
      render: (val) => {
        return val ? <Badge variant="success">已分享</Badge> : <Badge variant="default">未分享</Badge>
      },
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 150,
      render: (val) => (val ? new Date(String(val)).toLocaleString('zh-CN') : '-'),
    },
    {
      key: 'id' as any,
      title: '操作',
      width: 120,
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => shareMutation.mutate(row!.id)}
            disabled={shareMutation.isPending || !!row!.shared_at}
            className="p-1.5 hover:bg-slate-100 rounded disabled:opacity-50"
            title="分享"
          >
            <Share2 className="w-4 h-4 text-slate-500" />
          </button>
          <button
            onClick={() => {
              setForm({
                client_id: String(row!.client_id),
                insight_type: String(row!.insight_type),
                title: String(row!.title),
                content: String(row!.content || ''),
              })
              setShowCreate(true)
            }}
            className="p-1.5 hover:bg-slate-100 rounded"
            title="编辑"
          >
            <Pencil className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">价值洞察</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAIGenerate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700"
          >
            <Sparkles className="w-4 h-4" /> AI生成
          </button>
          <button
            onClick={() => {
              setForm({ client_id: '', insight_type: '', title: '', content: '' })
              setShowCreate(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> 创建洞察
          </button>
        </div>
      </div>

      <Card>
        <div className="p-1">
          {items.length === 0 && !isLoading ? (
            <Empty icon={<Lightbulb className="w-12 h-12" />} title="暂无洞察数据" />
          ) : (
            <DataTable<Insight>
              columns={columns}
              data={items}
              loading={isLoading}
              emptyText="暂无洞察数据"
              pagination={{ current: page, pageSize, total, onChange: setPage }}
            />
          )}
        </div>
      </Card>

      {showCreate && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => setShowCreate(false)}
        >
          <div className="bg-white rounded-xl shadow-xl w-[600px] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">创建洞察</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">客户 *</label>
                <select
                  value={form.client_id}
                  onChange={(e) => setForm((p) => ({ ...p, client_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                >
                  <option value="">请选择客户</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">洞察类型 *</label>
                <select
                  value={form.insight_type}
                  onChange={(e) => setForm((p) => ({ ...p, insight_type: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                >
                  <option value="">请选择类型</option>
                  {Object.entries(insightTypeMap).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">标题 *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">内容 *</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={6}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!form.client_id || !form.insight_type || !form.title || !form.content || createMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAIGenerate && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => {
            setShowAIGenerate(false)
            setAiResult(null)
            setAiClientId('')
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-[700px] p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">AI生成洞察</h3>
            {!aiResult ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-slate-500">选择客户 *</label>
                  <select
                    value={aiClientId}
                    onChange={(e) => setAiClientId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  >
                    <option value="">请选择客户</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button
                    onClick={() => {
                      setShowAIGenerate(false)
                      setAiClientId('')
                    }}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => aiGenerateMutation.mutate()}
                    disabled={!aiClientId || aiGenerateMutation.isPending}
                    className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {aiGenerateMutation.isPending ? '生成中...' : '生成洞察'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-500">洞察类型</label>
                  <div className="mt-1 px-3 py-2 bg-slate-50 rounded-lg text-sm">
                    {insightTypeMap[aiResult.insight_type] || aiResult.insight_type}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-500">标题</label>
                  <div className="mt-1 px-3 py-2 bg-slate-50 rounded-lg text-sm">{aiResult.title}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-500">内容</label>
                  <div className="mt-1 px-3 py-2 bg-slate-50 rounded-lg text-sm whitespace-pre-wrap min-h-[200px]">
                    {aiResult.content}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-5">
                  <button
                    onClick={() => {
                      setAiResult(null)
                      setAiClientId('')
                    }}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    重新生成
                  </button>
                  <button
                    onClick={() => saveAiResultMutation.mutate()}
                    disabled={saveAiResultMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saveAiResultMutation.isPending ? '保存中...' : '保存洞察'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
