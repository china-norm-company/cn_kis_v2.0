import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'

interface Contract {
  id: number
  code: string
  project: string
  client: string
  amount: string
  signed_date: string
  start_date: string
  end_date: string
  status: 'negotiating' | 'signed' | 'active' | 'completed' | 'terminated'
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'warning' | 'primary' | 'success' | 'default' | 'error' }> = {
  negotiating: { label: '谈判中', variant: 'warning' },
  signed: { label: '已签署', variant: 'primary' },
  active: { label: '执行中', variant: 'success' },
  completed: { label: '已完成', variant: 'default' },
  terminated: { label: '已终止', variant: 'error' },
}

const columns: Column<Contract>[] = [
  { key: 'code', title: '合同编号', width: 140 },
  { key: 'project', title: '项目名称' },
  { key: 'client', title: '客户', width: 130 },
  {
    key: 'amount',
    title: '合同金额',
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
  { key: 'signed_date', title: '签署日期', width: 120, render: (val) => val ? String(val) : '-' },
  { key: 'end_date', title: '到期日', width: 120, render: (val) => val ? String(val) : '-' },
]

export function ContractListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ project: '', client: '', amount: '', start_date: '', end_date: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', page, pageSize],
    queryFn: () =>
      api.get<{ items: Contract[]; total: number }>('/finance/contracts/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/finance/contracts/create', { ...form, amount: Number(form.amount) || 0 }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['contracts'] }); setShowCreate(false) },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const activeCount = items.filter(d => d.status === 'active').length

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">合同管理</h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <span className="text-sm text-slate-500">执行中: <strong className="text-emerald-600">{activeCount}</strong> | 总数: <strong className="text-slate-700">{total}</strong></span>
          <PermissionGuard permission="finance.contract.create">
            <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus className="w-4 h-4" /> 新建合同
            </button>
          </PermissionGuard>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[980px]">
          <DataTable<Contract>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无合同记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
            onRowClick={(row) => navigate(`/contracts/${row.id}`)}
          />
          </div>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="max-h-[90vh] w-[92vw] max-w-[500px] overflow-y-auto bg-white rounded-xl shadow-xl p-4 md:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建合同</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="text-xs text-slate-500">项目</label><input title="项目" value={form.project} onChange={e => setForm(p => ({...p, project: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
                <div><label className="text-xs text-slate-500">客户</label><input title="客户" value={form.client} onChange={e => setForm(p => ({...p, client: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
              </div>
              <div><label className="text-xs text-slate-500">合同金额</label><input title="合同金额" type="number" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="text-xs text-slate-500">开始日期</label><input title="开始日期" type="date" value={form.start_date} onChange={e => setForm(p => ({...p, start_date: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
                <div><label className="text-xs text-slate-500">结束日期</label><input title="结束日期" type="date" value={form.end_date} onChange={e => setForm(p => ({...p, end_date: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
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
