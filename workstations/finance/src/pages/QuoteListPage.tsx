import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Calculator, Clock, CheckCircle, Send, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Quote {
  id: number
  code: string
  project: string
  client: string
  total_amount: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'
  created_at: string
  valid_until: string
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'error' | 'warning' }> = {
  draft: { label: '草稿', variant: 'default' },
  sent: { label: '已发送', variant: 'primary' },
  accepted: { label: '已接受', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'error' },
  expired: { label: '已过期', variant: 'warning' },
}

const baseColumns: Column<Quote>[] = [
  { key: 'code', title: '报价编号', width: 140 },
  { key: 'project', title: '项目名称' },
  { key: 'client', title: '客户', width: 130 },
  {
    key: 'total_amount',
    title: '报价金额',
    width: 130,
    align: 'right',
    render: (val) => val ? `¥${Number(val).toLocaleString()}` : '-',
  },
  {
    key: 'status',
    title: '状态',
    width: 100,
    render: (val) => {
      const info = statusMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
  },
  { key: 'created_at', title: '创建日期', width: 120 },
  { key: 'valid_until', title: '有效期至', width: 120, render: (val) => val ? String(val) : '-' },
]

function useColumns(navigate: (path: string) => void): Column<Quote>[] {
  return [
    {
      key: 'code',
      title: '报价编号',
      width: 140,
      render: (val, row) => (
        <button
          onClick={() => navigate(`/quotes/${row.id}`)}
          className="text-primary-600 hover:text-primary-700 font-medium text-left"
        >
          {String(val ?? '-')}
        </button>
      ),
    },
    ...baseColumns.slice(1),
  ]
}

export function QuoteListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ project: '', client: '', total_amount: '', valid_until: '', description: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['quotes', page, pageSize],
    queryFn: () =>
      api.get<{ items: Quote[]; total: number }>('/finance/quotes/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['quote-stats'],
    queryFn: () => api.get<{ by_status: Record<string, number>; total: number }>('/finance/quotes/stats'),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/finance/quotes/create', {
      ...form,
      total_amount: Number(form.total_amount) || 0,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['quotes'] }); setShowCreate(false) },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_status ?? {}
  const columns = useColumns(navigate)

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">报价管理</h1>
        <PermissionGuard permission="finance.quote.create">
          <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> 新建报价
          </button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="报价总数" value={statsData?.data?.total ?? 0} icon={<Calculator className="w-6 h-6" />} />
        <StatCard title="待回复" value={stats.sent ?? 0} icon={<Send className="w-6 h-6" />} />
        <StatCard title="已接受" value={stats.accepted ?? 0} icon={<CheckCircle className="w-6 h-6" />} />
        <StatCard title="草稿" value={stats.draft ?? 0} icon={<Clock className="w-6 h-6" />} />
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[980px]">
          <DataTable<Quote>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无报价记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
          </div>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建报价</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="text-xs text-slate-500">项目</label><input title="项目" value={form.project} onChange={e => setForm(p => ({...p, project: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
                <div><label className="text-xs text-slate-500">客户</label><input title="客户" value={form.client} onChange={e => setForm(p => ({...p, client: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="text-xs text-slate-500">报价金额</label><input title="报价金额" type="number" value={form.total_amount} onChange={e => setForm(p => ({...p, total_amount: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
                <div><label className="text-xs text-slate-500">有效期至</label><input title="有效期至" type="date" value={form.valid_until} onChange={e => setForm(p => ({...p, valid_until: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="min-h-11 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="min-h-11 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">{createMutation.isPending ? '创建中...' : '创建'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
