import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Badge, Modal, Empty, type BadgeVariant } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { FileText, Plus, Send, Sparkles, ChevronDown, ChevronUp } from 'lucide-react'

interface Bulletin {
  id: number
  title: string
  category: 'ingredient' | 'claim' | 'regulation' | 'consumer' | 'technology' | 'competition'
  summary: string
  detail: string | null
  impact_analysis: string | null
  action_items: string | null
  published: boolean
  create_time: string
  [key: string]: unknown
}

const categoryMap: Record<string, { label: string; variant: BadgeVariant }> = {
  ingredient: { label: '成分', variant: 'primary' },
  claim: { label: '宣称', variant: 'warning' },
  regulation: { label: '法规', variant: 'error' },
  consumer: { label: '消费者', variant: 'info' },
  technology: { label: '技术', variant: 'default' },
  competition: { label: '竞争', variant: 'success' },
}

export function MarketTrendPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [filters, setFilters] = useState({
    category: '',
    published: '',
  })
  const [form, setForm] = useState({
    title: '',
    category: 'ingredient',
    summary: '',
    detail: '',
    impact_analysis: '',
    action_items: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['bulletins', page, pageSize, filters],
    queryFn: () =>
      api.get<{ items: Bulletin[]; total: number }>('/crm/bulletins/list', {
        params: {
          page,
          page_size: pageSize,
          ...(filters.category ? { category: filters.category } : {}),
          ...(filters.published !== '' ? { published: filters.published === 'true' } : {}),
        },
      }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/crm/bulletins/create', {
      ...form,
      action_items: form.action_items.split(',').map(s => s.trim()).filter(Boolean).join(','),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulletins'] })
      setShowCreate(false)
      setForm({ title: '', category: 'ingredient', summary: '', detail: '', impact_analysis: '', action_items: '' })
    },
  })

  const publishMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/crm/bulletins/${id}/publish`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bulletins'] }),
  })

  const aiGenerateMutation = useMutation({
    mutationFn: () => api.post<any>('/crm/ai/generate-trend', {
      category: form.category,
    }),
    onSuccess: (res) => {
      if (res?.data) {
        setForm(p => ({ ...p, ...res.data }))
      }
    },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">市场趋势</h1>
        <PermissionGuard permission="crm.market.create">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> 新建简报
          </button>
        </PermissionGuard>
      </div>

      <div className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 p-3">
        <select
          value={filters.category}
          onChange={(e) => { setFilters(p => ({ ...p, category: e.target.value })); setPage(1) }}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">全部分类</option>
          {Object.entries(categoryMap).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={filters.published}
          onChange={(e) => { setFilters(p => ({ ...p, published: e.target.value })); setPage(1) }}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
        >
          <option value="">全部状态</option>
          <option value="true">已发布</option>
          <option value="false">未发布</option>
        </select>
      </div>

      {isLoading ? (
        <Card>
          <div className="p-12 text-center text-slate-400">加载中...</div>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <Empty message="暂无市场趋势数据" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {items.map((item) => {
            const categoryInfo = categoryMap[item.category]
            const isExpanded = expandedId === item.id
            return (
              <Card key={item.id}>
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-slate-800">{item.title}</h3>
                        {categoryInfo && <Badge variant={categoryInfo.variant}>{categoryInfo.label}</Badge>}
                        {item.published ? (
                          <Badge variant="success">已发布</Badge>
                        ) : (
                          <Badge variant="default">未发布</Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">{item.summary}</p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      {!item.published && (
                        <button
                          onClick={() => publishMutation.mutate(item.id)}
                          className="px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" /> 发布
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded flex items-center gap-1"
                      >
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        {isExpanded ? '收起' : '详情'}
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-4 space-y-3 pt-4 border-t border-slate-100">
                      {item.detail && (
                        <div>
                          <h4 className="text-xs font-medium text-slate-500 mb-1">详细内容</h4>
                          <p className="text-sm text-slate-700 whitespace-pre-line">{item.detail}</p>
                        </div>
                      )}
                      {item.impact_analysis && (
                        <div>
                          <h4 className="text-xs font-medium text-slate-500 mb-1">影响分析</h4>
                          <p className="text-sm text-slate-700 whitespace-pre-line">{item.impact_analysis}</p>
                        </div>
                      )}
                      {item.action_items && (
                        <div>
                          <h4 className="text-xs font-medium text-slate-500 mb-1">行动项</h4>
                          <div className="flex flex-wrap gap-2">
                            {item.action_items.split(',').filter(Boolean).map((action, idx) => (
                              <Badge key={idx} variant="default">{action.trim()}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="text-xs text-slate-400">
                        创建时间: {new Date(item.create_time).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[700px] max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建市场趋势简报</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">标题 *</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">分类 *</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  >
                    {Object.entries(categoryMap).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">摘要 *</label>
                <textarea
                  value={form.summary}
                  onChange={e => setForm(p => ({ ...p, summary: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={2}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">详细内容</label>
                <textarea
                  value={form.detail}
                  onChange={e => setForm(p => ({ ...p, detail: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={4}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">影响分析</label>
                <textarea
                  value={form.impact_analysis}
                  onChange={e => setForm(p => ({ ...p, impact_analysis: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">行动项（逗号分隔）</label>
                <input
                  value={form.action_items}
                  onChange={e => setForm(p => ({ ...p, action_items: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  placeholder="行动项1, 行动项2, 行动项3"
                />
              </div>
              <button
                onClick={() => aiGenerateMutation.mutate()}
                disabled={aiGenerateMutation.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-blue-200 text-blue-600 rounded-lg text-sm hover:bg-blue-50 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {aiGenerateMutation.isPending ? 'AI生成中...' : 'AI生成'}
              </button>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowCreate(false); setForm({ title: '', category: 'ingredient', summary: '', detail: '', impact_analysis: '', action_items: '' }) }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={() => createMutation.mutate()} disabled={!form.title || !form.summary || createMutation.isPending} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
