import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Receipt, Send, CheckCircle, AlertCircle, Plus, Download } from 'lucide-react'
import { useState } from 'react'
import { exportTableToXlsx } from '../utils/exportUtils'

interface Invoice {
  id: number
  code: string
  contract_code: string
  client: string
  amount: string
  tax_amount: string
  total: string
  type: 'milestone' | 'monthly' | 'final'
  status: 'draft' | 'submitted' | 'approved' | 'sent' | 'paid'
  invoice_date: string
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'warning' | 'info' | 'success' }> = {
  draft: { label: '草稿', variant: 'default' },
  submitted: { label: '已提交', variant: 'primary' },
  approved: { label: '已审批', variant: 'warning' },
  sent: { label: '已寄出', variant: 'info' },
  paid: { label: '已回款', variant: 'success' },
}

const typeMap: Record<string, string> = {
  milestone: '里程碑',
  monthly: '月度',
  final: '结项',
}

const columns: Column<Invoice>[] = [
  { key: 'code', title: '发票编号', width: 140 },
  { key: 'contract_code', title: '关联合同', width: 130 },
  { key: 'client', title: '客户', width: 130 },
  { key: 'type', title: '类型', width: 80, render: (val) => typeMap[val as string] || '-' },
  {
    key: 'total',
    title: '含税金额',
    width: 120,
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
  { key: 'invoice_date', title: '开票日期', width: 120, render: (val) => val ? String(val) : '-' },
]

export function InvoiceListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ contract_id: '', client: '', amount: '', tax_rate: '6', type: 'milestone', invoice_date: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page, pageSize],
    queryFn: () =>
      api.get<{ items: Invoice[]; total: number }>('/finance/invoices/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['invoice-stats'],
    queryFn: () => api.get<{ by_status: Record<string, number>; total: number }>('/finance/invoices/stats'),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/finance/invoices/create', {
      ...form,
      contract_id: Number(form.contract_id) || undefined,
      amount: Number(form.amount) || 0,
      tax_rate: Number(form.tax_rate) || 6,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); setShowCreate(false) },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_status ?? {}

  const handleExportXlsx = () => {
    exportTableToXlsx(
      items.map((inv) => ({
        code: inv.code,
        contract_code: inv.contract_code,
        client: inv.client,
        type: typeMap[inv.type] ?? inv.type,
        amount: inv.amount,
        tax_amount: inv.tax_amount,
        total: inv.total,
        status: statusMap[inv.status]?.label ?? inv.status,
        invoice_date: inv.invoice_date,
      })),
      [
        { key: 'code', header: '发票编号', width: 18 },
        { key: 'contract_code', header: '关联合同', width: 18 },
        { key: 'client', header: '客户', width: 20 },
        { key: 'type', header: '类型', width: 10 },
        { key: 'amount', header: '金额', width: 14 },
        { key: 'tax_amount', header: '税额', width: 14 },
        { key: 'total', header: '含税金额', width: 14 },
        { key: 'status', header: '状态', width: 10 },
        { key: 'invoice_date', header: '开票日期', width: 14 },
      ],
      '发票列表',
      `发票列表_${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">发票管理</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportXlsx}
            disabled={items.length === 0}
            className="flex min-h-11 items-center justify-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> 导出 xlsx
          </button>
          <PermissionGuard permission="finance.invoice.create">
            <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus className="w-4 h-4" /> 新建发票
            </button>
          </PermissionGuard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="发票总数" value={statsData?.data?.total ?? 0} icon={<Receipt className="w-6 h-6" />} />
        <StatCard title="已回款" value={stats.paid ?? 0} icon={<CheckCircle className="w-6 h-6" />} />
        <StatCard title="待收款" value={(stats.sent ?? 0) + (stats.approved ?? 0)} icon={<Send className="w-6 h-6" />} />
        <StatCard title="草稿" value={stats.draft ?? 0} icon={<AlertCircle className="w-6 h-6" />} />
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[980px]">
          <DataTable<Invoice>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无发票记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
          </div>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-[500px] max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">新建发票</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="text-xs text-slate-500">关联合同 ID</label><input title="关联合同 ID" type="number" value={form.contract_id} onChange={e => setForm(p => ({...p, contract_id: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
                <div><label className="text-xs text-slate-500">客户</label><input title="客户" value={form.client} onChange={e => setForm(p => ({...p, client: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div><label className="text-xs text-slate-500">金额</label><input title="金额" type="number" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
                <div><label className="text-xs text-slate-500">税率 %</label><input title="税率" type="number" value={form.tax_rate} onChange={e => setForm(p => ({...p, tax_rate: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
                <div>
                  <label className="text-xs text-slate-500">类型</label>
                  <select title="发票类型" value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1">
                    <option value="milestone">里程碑</option><option value="monthly">月度</option><option value="final">结项</option>
                  </select>
                </div>
              </div>
              <div><label className="text-xs text-slate-500">开票日期</label><input title="开票日期" type="date" value={form.invoice_date} onChange={e => setForm(p => ({...p, invoice_date: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
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
