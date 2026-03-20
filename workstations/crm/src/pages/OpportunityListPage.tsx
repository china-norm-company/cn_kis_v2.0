import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { Target, TrendingUp, Clock, CheckCircle, Plus, Search } from 'lucide-react'
import { useState } from 'react'

interface Opportunity {
  id: number
  title: string
  client_name: string
  client_id: number
  stage: 'lead' | 'contact' | 'proposal' | 'negotiation' | 'won' | 'lost'
  estimated_amount: string
  probability: number
  owner: string
  expected_close_date: string
  create_time: string
  [key: string]: unknown
}

interface ClientOption {
  id: number
  name: string
}

const stageMap: Record<string, { label: string; variant: 'default' | 'info' | 'primary' | 'warning' | 'success' | 'error' }> = {
  lead: { label: '线索', variant: 'default' },
  contact: { label: '接洽中', variant: 'info' },
  proposal: { label: '方案提交', variant: 'primary' },
  negotiation: { label: '商务谈判', variant: 'warning' },
  won: { label: '已成交', variant: 'success' },
  lost: { label: '已丢失', variant: 'error' },
}

const columns: Column<Opportunity>[] = [
  { key: 'title', title: '商机名称' },
  { key: 'client_name', title: '客户', width: 130 },
  {
    key: 'stage',
    title: '阶段',
    width: 100,
    render: (val) => {
      const info = stageMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
  },
  {
    key: 'estimated_amount',
    title: '预估金额',
    width: 130,
    align: 'right',
    render: (val) => val ? `¥${Number(val).toLocaleString()}` : '-',
  },
  {
    key: 'probability',
    title: '成交概率',
    width: 90,
    align: 'center',
    render: (val) => {
      const p = val as number
      if (p >= 80) return <span className="text-emerald-600 font-medium">{p}%</span>
      if (p >= 50) return <span className="text-blue-600 font-medium">{p}%</span>
      if (p > 0) return <span className="text-amber-600 font-medium">{p}%</span>
      return <span className="text-slate-400">-</span>
    },
  },
  { key: 'owner', title: '负责人', width: 100, render: (val) => val ? String(val) : '-' },
  { key: 'expected_close_date', title: '预计成交', width: 120, render: (val) => val ? String(val) : '-' },
]

export function OpportunityListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [filterStage, setFilterStage] = useState('')
  const [form, setForm] = useState({ title: '', client_id: '', stage: 'lead', estimated_amount: '', probability: 30, owner: '', expected_close_date: '', description: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities', page, pageSize, filterStage],
    queryFn: () =>
      api.get<{ items: Opportunity[]; total: number }>('/crm/opportunities/list', {
        params: { page, page_size: pageSize, ...(filterStage ? { stage: filterStage } : {}) },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['opportunity-stats'],
    queryFn: () =>
      api.get<{ by_stage: Record<string, number>; total: number; pipeline_value: number }>(
        '/crm/opportunities/stats'
      ),
  })

  const { data: clientsData } = useQuery({
    queryKey: ['opportunity-clients'],
    queryFn: () =>
      api.get<{ items: ClientOption[] }>('/crm/clients/list', {
        params: { page: 1, page_size: 200 },
      }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/crm/opportunities/create', {
      ...form,
      client_id: Number(form.client_id) || undefined,
      estimated_amount: Number(form.estimated_amount) || 0,
      expected_close_date: form.expected_close_date || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['opportunities'] }); setShowCreate(false) },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_stage ?? {}
  const pipelineValue = statsData?.data?.pipeline_value ?? 0
  const clients = clientsData?.data?.items ?? []

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-bold text-slate-800 md:text-2xl">商机跟踪</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          <Plus className="w-4 h-4" /> 新建商机
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="商机总数" value={statsData?.data?.total ?? 0} icon={<Target className="w-6 h-6" />} />
        <StatCard title="管道价值" value={`¥${(pipelineValue / 10000).toFixed(0)}万`} icon={<TrendingUp className="w-6 h-6" />} />
        <StatCard title="谈判中" value={(stats.negotiation ?? 0) + (stats.proposal ?? 0)} icon={<Clock className="w-6 h-6" />} />
        <StatCard title="已成交" value={stats.won ?? 0} icon={<CheckCircle className="w-6 h-6" />} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3">
        <Search className="w-4 h-4 text-slate-400" />
        <select value={filterStage} onChange={(e) => { setFilterStage(e.target.value); setPage(1) }} className="shrink-0 px-3 py-1.5 border border-slate-200 rounded-lg text-sm" title="筛选商机阶段">
          <option value="">全部阶段</option>
          {Object.entries(stageMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <Card>
        <div className="p-1">
          <DataTable<Opportunity>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无商机数据"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
        </div>
      </Card>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="max-h-[90vh] w-[92vw] max-w-[500px] overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建商机</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">商机名称 *</label>
                <input value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="商机名称" />
              </div>
              <div>
                <label className="text-xs text-slate-500">关联客户 *</label>
                <select
                  value={form.client_id}
                  onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
                  title="关联客户"
                >
                  <option value="">请选择客户</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
                {clients.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">请先在客户档案中创建客户，再创建商机。</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">阶段</label>
                  <select value={form.stage} onChange={e => setForm(p => ({...p, stage: e.target.value}))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="商机阶段">
                    {Object.entries(stageMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">预估金额</label>
                  <input type="number" value={form.estimated_amount} onChange={e => setForm(p => ({...p, estimated_amount: e.target.value}))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="预估金额" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">概率 (%)</label>
                  <input type="number" value={form.probability} onChange={e => setForm(p => ({...p, probability: Number(e.target.value)}))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="成交概率" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">负责人</label>
                  <input value={form.owner} onChange={e => setForm(p => ({...p, owner: e.target.value}))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="负责人" />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">预计成交日期</label>
                <input type="date" value={form.expected_close_date} onChange={e => setForm(p => ({...p, expected_close_date: e.target.value}))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" title="预计成交日期" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
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
