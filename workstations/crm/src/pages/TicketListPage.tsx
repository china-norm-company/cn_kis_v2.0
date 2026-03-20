import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Headphones, AlertCircle, Clock, CheckCircle, Plus, Search } from 'lucide-react'
import { useState } from 'react'

interface Ticket {
  id: number
  code: string
  title: string
  client_name: string
  client_id: number
  category: string
  priority: 'high' | 'medium' | 'low'
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  assignee: string
  create_time: string
  resolved_at: string | null
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'error' | 'warning' | 'primary' | 'success' }> = {
  open: { label: '待处理', variant: 'error' },
  in_progress: { label: '处理中', variant: 'warning' },
  resolved: { label: '已解决', variant: 'primary' },
  closed: { label: '已关闭', variant: 'success' },
}

const priorityMap: Record<string, { label: string; variant: 'error' | 'warning' | 'default' }> = {
  high: { label: '高', variant: 'error' },
  medium: { label: '中', variant: 'warning' },
  low: { label: '低', variant: 'default' },
}

const columns: Column<Ticket>[] = [
  { key: 'code', title: '工单编号', width: 130 },
  { key: 'title', title: '标题' },
  { key: 'client_name', title: '客户', width: 130 },
  { key: 'category', title: '分类', width: 90 },
  {
    key: 'priority',
    title: '优先级',
    width: 80,
    render: (val) => {
      const info = priorityMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
  },
  {
    key: 'status',
    title: '状态',
    width: 90,
    render: (val) => {
      const info = statusMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
  },
  { key: 'assignee', title: '处理人', width: 90, render: (val) => val ? String(val) : '-' },
  {
    key: 'create_time',
    title: '创建时间',
    width: 120,
    render: (val) => val ? new Date(String(val)).toLocaleDateString('zh-CN') : '-',
  },
]

export function TicketListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [form, setForm] = useState({ title: '', client_id: '', category: '技术支持', priority: 'medium', description: '', assignee: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', page, pageSize, filterStatus, filterPriority],
    queryFn: () =>
      api.get<{ items: Ticket[]; total: number }>('/crm/tickets/list', {
        params: {
          page, page_size: pageSize,
          ...(filterStatus ? { status: filterStatus } : {}),
          ...(filterPriority ? { priority: filterPriority } : {}),
        },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['ticket-stats'],
    queryFn: () =>
      api.get<{ by_status: Record<string, number>; by_priority: Record<string, number>; total: number }>(
        '/crm/tickets/stats'
      ),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/crm/tickets/create', {
      ...form,
      client_id: Number(form.client_id) || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tickets'] }); setShowCreate(false) },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_status ?? {}

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">售后工单</h1>
        <PermissionGuard permission="crm.ticket.create">
          <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新建工单
          </button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="工单总数" value={statsData?.data?.total ?? 0} icon={<Headphones className="w-6 h-6" />} />
        <StatCard title="待处理" value={stats.open ?? 0} icon={<AlertCircle className="w-6 h-6" />} />
        <StatCard title="处理中" value={stats.in_progress ?? 0} icon={<Clock className="w-6 h-6" />} />
        <StatCard title="已解决" value={(stats.resolved ?? 0) + (stats.closed ?? 0)} icon={<CheckCircle className="w-6 h-6" />} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 overflow-x-auto bg-white rounded-lg border border-slate-200 p-3">
        <Search className="w-4 h-4 text-slate-400" />
        <select title="状态筛选" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }} className="shrink-0 min-h-11 px-3 py-1.5 border border-slate-200 rounded-lg text-sm">
          <option value="">全部状态</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select title="优先级筛选" value={filterPriority} onChange={(e) => { setFilterPriority(e.target.value); setPage(1) }} className="shrink-0 min-h-11 px-3 py-1.5 border border-slate-200 rounded-lg text-sm">
          <option value="">全部优先级</option>
          {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[920px]">
            <DataTable<Ticket>
              columns={columns}
              data={items}
              loading={isLoading}
              emptyText="暂无售后工单"
              pagination={{ current: page, pageSize, total, onChange: setPage }}
            />
          </div>
        </div>
      </Card>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建售后工单</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500">标题 *</label>
                <input title="工单标题" value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">分类</label>
                  <select title="工单分类" value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1">
                    <option>技术支持</option><option>数据问题</option><option>报告修改</option><option>其他</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">优先级</label>
                  <select title="工单优先级" value={form.priority} onChange={e => setForm(p => ({...p, priority: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1">
                    <option value="high">高</option><option value="medium">中</option><option value="low">低</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">处理人</label>
                <input title="处理人" value={form.assignee} onChange={e => setForm(p => ({...p, assignee: e.target.value}))} className="w-full min-h-11 px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" />
              </div>
              <div>
                <label className="text-xs text-slate-500">描述</label>
                <textarea title="工单描述" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" rows={3} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="min-h-11 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={() => createMutation.mutate()} disabled={!form.title || createMutation.isPending} className="min-h-11 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
