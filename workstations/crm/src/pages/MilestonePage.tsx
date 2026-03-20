import { useState, useMemo } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, Badge, Modal, Empty, type BadgeVariant } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Milestone, Plus, Calendar } from 'lucide-react'

interface MilestoneItem {
  id: number
  client_id: number
  client_name?: string
  milestone_type: 'first_project' | 'repeat_order' | 'new_category' | 'new_brand' | 'annual_framework' | 'innovation_collab' | 'revenue_milestone' | 'anniversary'
  title: string
  achieved_at: string
  description: string | null
  value: string | null
  [key: string]: unknown
}

interface Client {
  id: number
  name: string
  [key: string]: unknown
}

const milestoneTypeMap: Record<string, { label: string; variant: BadgeVariant }> = {
  first_project: { label: '首个项目', variant: 'primary' },
  repeat_order: { label: '首次复购', variant: 'success' },
  new_category: { label: '新品类', variant: 'warning' },
  new_brand: { label: '新品牌', variant: 'info' },
  annual_framework: { label: '年框签署', variant: 'error' },
  innovation_collab: { label: '联合创新', variant: 'primary' },
  revenue_milestone: { label: '营收里程碑', variant: 'success' },
  anniversary: { label: '合作周年', variant: 'default' },
}

export function MilestonePage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    client_id: '',
    milestone_type: 'first_project',
    title: '',
    achieved_at: new Date().toISOString().split('T')[0],
    description: '',
    value: '',
  })

  const { data: clientsData } = useQuery({
    queryKey: ['clients', 'all'],
    queryFn: () => api.get<{ items: Client[] }>('/crm/clients/list', { params: { page: 1, page_size: 1000 } }),
  })

  const clients = clientsData?.data?.items ?? []

  const milestonesQueries = useQueries({
    queries: clients.map(client => ({
      queryKey: ['milestones', client.id],
      queryFn: () => api.get<{ items: MilestoneItem[] }>(`/crm/clients/${client.id}/milestones`),
      enabled: clients.length > 0,
    })),
  })

  const allMilestones = useMemo(() => {
    const result: Array<MilestoneItem & { client_name: string }> = []
    milestonesQueries.forEach((query, idx) => {
      const client = clients[idx]
      if (client && query.data?.data?.items) {
        query.data.data.items.forEach(m => {
          result.push({ ...m, client_name: client.name })
        })
      }
    })
    return result.sort((a, b) => new Date(b.achieved_at).getTime() - new Date(a.achieved_at).getTime())
  }, [milestonesQueries, clients])

  const groupedByClient = useMemo(() => {
    const groups: Record<number, { client: Client; milestones: MilestoneItem[] }> = {}
    allMilestones.forEach(m => {
      if (!groups[m.client_id]) {
        groups[m.client_id] = { client: clients.find(c => c.id === m.client_id)!, milestones: [] }
      }
      groups[m.client_id].milestones.push(m)
    })
    return Object.values(groups).map(g => ({
      ...g,
      milestones: g.milestones.sort((a, b) => new Date(b.achieved_at).getTime() - new Date(a.achieved_at).getTime()),
    }))
  }, [allMilestones, clients])

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/crm/milestones/create', {
      ...form,
      client_id: Number(form.client_id) || undefined,
      achieved_at: form.achieved_at,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['milestones'] })
      setShowCreate(false)
      setForm({ client_id: '', milestone_type: 'first_project', title: '', achieved_at: new Date().toISOString().split('T')[0], description: '', value: '' })
    },
  })

  const isLoading = milestonesQueries.some(q => q.isLoading)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">客户里程碑</h1>
        <PermissionGuard permission="crm.milestone.create">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" /> 新建里程碑
          </button>
        </PermissionGuard>
      </div>

      {isLoading ? (
        <Card>
          <div className="p-12 text-center text-slate-400">加载中...</div>
        </Card>
      ) : groupedByClient.length === 0 ? (
        <Card>
          <Empty message="暂无里程碑数据" />
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedByClient.map(({ client, milestones }) => (
            <Card key={client.id}>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">{client.name}</h3>
                <div className="relative">
                  <div className="absolute left-5 top-3 bottom-3 w-px bg-slate-200" />
                  <div className="space-y-4">
                    {milestones.map((m) => {
                      const info = milestoneTypeMap[m.milestone_type]
                      return (
                        <div key={m.id} className="flex items-start gap-4 relative">
                          <div className="relative z-10 w-10 h-10 rounded-full border-2 border-blue-200 bg-white flex items-center justify-center flex-shrink-0">
                            <Milestone className="w-4 h-4 text-blue-500" />
                          </div>
                          <div className="flex-1 bg-white rounded-lg border border-slate-100 p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-sm font-medium text-slate-700">{m.title}</span>
                              {info && <Badge variant={info.variant}>{info.label}</Badge>}
                              <span className="text-[11px] text-slate-400 ml-auto flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(m.achieved_at).toLocaleDateString('zh-CN')}
                              </span>
                            </div>
                            {m.description && (
                              <p className="text-sm text-slate-600 mb-1">{m.description}</p>
                            )}
                            {m.value && (
                              <p className="text-xs text-slate-500">价值: {m.value}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[500px] p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建里程碑</h3>
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
                  <label className="text-xs text-slate-500">里程碑类型 *</label>
                  <select
                    value={form.milestone_type}
                    onChange={e => setForm(p => ({ ...p, milestone_type: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  >
                    {Object.entries(milestoneTypeMap).map(([k, v]) => (
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
                <label className="text-xs text-slate-500">达成时间 *</label>
                <input
                  type="date"
                  value={form.achieved_at}
                  onChange={e => setForm(p => ({ ...p, achieved_at: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">描述</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">价值</label>
                <input
                  value={form.value}
                  onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  placeholder="如：100万订单"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setShowCreate(false); setForm({ client_id: '', milestone_type: 'first_project', title: '', achieved_at: new Date().toISOString().split('T')[0], description: '', value: '' }) }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
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
