import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Banknote, TrendingUp, Clock, AlertTriangle, Plus, Download } from 'lucide-react'
import { useState } from 'react'
import { exportTableToXlsx } from '../utils/exportUtils'

interface Payment {
  id: number
  code: string
  invoice_code: string
  client: string
  expected_amount: string
  actual_amount: string
  payment_date: string
  method: string
  status: 'expected' | 'partial' | 'full' | 'overdue'
  days_overdue: number
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'default' | 'warning' | 'success' | 'error' }> = {
  expected: { label: '待回款', variant: 'default' },
  partial: { label: '部分回', variant: 'warning' },
  full: { label: '已到账', variant: 'success' },
  overdue: { label: '已逾期', variant: 'error' },
}

const columns: Column<Payment>[] = [
  { key: 'code', title: '回款编号', width: 140 },
  { key: 'invoice_code', title: '关联发票', width: 140 },
  { key: 'client', title: '客户', width: 130 },
  {
    key: 'expected_amount',
    title: '应收金额',
    width: 120,
    align: 'right',
    render: (val) => val ? `¥${Number(val).toLocaleString()}` : '-',
  },
  {
    key: 'actual_amount',
    title: '实收金额',
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
  { key: 'payment_date', title: '到账日', width: 120, render: (val) => val ? String(val) : '-' },
  {
    key: 'days_overdue',
    title: '逾期天数',
    width: 90,
    align: 'center',
    render: (val, record) => {
      const days = val as number
      if ((record as Payment).status === 'overdue' && days > 0) {
        return <span className="text-red-600 font-medium">{days}天</span>
      }
      return '-'
    },
  },
]

export function PaymentListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ invoice_id: '', actual_amount: '', payment_date: '', method: '银行转账' })

  const { data, isLoading } = useQuery({
    queryKey: ['payments', page, pageSize],
    queryFn: () =>
      api.get<{ items: Payment[]; total: number }>('/finance/payments/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['payment-stats'],
    queryFn: () =>
      api.get<{ by_status: Record<string, number>; total: number; total_received: number; overdue_count: number }>(
        '/finance/payments/stats'
      ),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/finance/payments/create', {
      ...form,
      invoice_id: Number(form.invoice_id) || undefined,
      actual_amount: Number(form.actual_amount) || 0,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payments'] }); setShowCreate(false) },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_status ?? {}
  const totalReceived = statsData?.data?.total_received ?? 0

  const handleExportXlsx = () => {
    exportTableToXlsx(
      items.map((p) => ({
        code: String(p['code'] ?? ''),
        contract_code: String(p['contract_code'] ?? ''),
        client: String(p['client'] ?? ''),
        expected_amount: String(p['expected_amount'] ?? ''),
        actual_amount: String(p['actual_amount'] ?? ''),
        status: String(p['status'] ?? ''),
        payment_date: String(p['payment_date'] ?? ''),
      })),
      [
        { key: 'code', header: '回款编号', width: 18 },
        { key: 'contract_code', header: '合同编号', width: 18 },
        { key: 'client', header: '客户', width: 20 },
        { key: 'expected_amount', header: '预期金额', width: 14 },
        { key: 'actual_amount', header: '实际金额', width: 14 },
        { key: 'status', header: '状态', width: 12 },
        { key: 'payment_date', header: '回款日期', width: 14 },
      ],
      '回款列表',
      `回款列表_${new Date().toISOString().slice(0, 10)}.xlsx`,
    )
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">回款管理</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportXlsx}
            disabled={items.length === 0}
            className="flex min-h-11 items-center justify-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> 导出 xlsx
          </button>
          <PermissionGuard permission="finance.payment.create">
            <button onClick={() => setShowCreate(true)} className="flex min-h-11 items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus className="w-4 h-4" /> 记录回款
            </button>
          </PermissionGuard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="回款总额" value={`¥${totalReceived.toLocaleString()}`} icon={<Banknote className="w-6 h-6" />} />
        <StatCard title="已到账" value={stats.full ?? 0} icon={<TrendingUp className="w-6 h-6" />} />
        <StatCard title="待回款" value={stats.expected ?? 0} icon={<Clock className="w-6 h-6" />} />
        <StatCard title="逾期" value={statsData?.data?.overdue_count ?? 0} icon={<AlertTriangle className="w-6 h-6" />} />
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[980px]">
          <DataTable<Payment>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无回款记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
          </div>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[92vw] max-w-[460px] max-h-[90vh] overflow-y-auto p-4 md:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">记录回款</h3>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">关联发票 ID</label><input title="关联发票 ID" type="number" value={form.invoice_id} onChange={e => setForm(p => ({...p, invoice_id: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
              <div><label className="text-xs text-slate-500">实收金额</label><input title="实收金额" type="number" value={form.actual_amount} onChange={e => setForm(p => ({...p, actual_amount: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div><label className="text-xs text-slate-500">到账日期</label><input title="到账日期" type="date" value={form.payment_date} onChange={e => setForm(p => ({...p, payment_date: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1" /></div>
                <div>
                  <label className="text-xs text-slate-500">付款方式</label>
                  <select title="付款方式" value={form.method} onChange={e => setForm(p => ({...p, method: e.target.value}))} className="min-h-11 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1">
                    <option>银行转账</option><option>支票</option><option>电汇</option><option>其他</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowCreate(false)} className="min-h-11 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">取消</button>
              <button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="min-h-11 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">{createMutation.isPending ? '创建中...' : '记录'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
