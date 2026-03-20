import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, Button, Modal, Input, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Plus } from 'lucide-react'
import { useState } from 'react'

interface Payable {
  id: number
  record_no: string
  supplier_name: string
  amount: string | number
  due_date: string
  payment_status: 'pending' | 'approved' | 'paid' | 'cancelled'
  paid_amount?: string | number
  paid_date?: string
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' }> = {
  pending: { label: '待审批', variant: 'warning' },
  approved: { label: '已审批', variant: 'primary' },
  paid: { label: '已付款', variant: 'success' },
  cancelled: { label: '已取消', variant: 'default' },
}

const costTypeOptions = [
  { value: 'material', label: '材料' },
  { value: 'service', label: '服务' },
  { value: 'equipment', label: '设备' },
  { value: 'other', label: '其他' },
]

function formatAmount(val: string | number | null | undefined): string {
  if (val == null || val === '') return '-'
  const n = typeof val === 'string' ? Number(val) : val
  return `¥${n.toLocaleString()}`
}

export function PayableListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [status, setStatus] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    record_no: '',
    supplier_name: '',
    amount: '',
    due_date: '',
    cost_type: 'other',
    notes: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['payables', page, pageSize, status],
    queryFn: () =>
      api.get<{ items: Payable[]; total: number }>('/finance/payables/list', {
        params: { page, page_size: pageSize, ...(status ? { status } : {}) },
      }),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<any>('/finance/payables/create', {
        ...form,
        amount: Number(form.amount) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] })
      setShowCreate(false)
      setForm({ record_no: '', supplier_name: '', amount: '', due_date: '', cost_type: 'other', notes: '' })
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/finance/payables/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payables'] }),
  })

  const payMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/finance/payables/${id}/pay`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payables'] }),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  const columns: Column<Payable>[] = [
    { key: 'record_no', title: '单据编号', width: 140 },
    { key: 'supplier_name', title: '供应商', width: 140 },
    {
      key: 'amount',
      title: '金额(¥)',
      width: 120,
      align: 'right',
      render: (val) => formatAmount(val),
    },
    { key: 'due_date', title: '应付日期', width: 120, render: (val) => val ? String(val) : '-' },
    {
      key: 'payment_status',
      title: '付款状态',
      width: 100,
      render: (val) => {
        const info = statusMap[val as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
      },
    },
    {
      key: 'paid_amount',
      title: '已付金额',
      width: 120,
      align: 'right',
      render: (val) => formatAmount(val),
    },
    { key: 'paid_date', title: '付款日期', width: 120, render: (val) => val ? String(val) : '-' },
    {
      key: 'actions',
      title: '操作',
      width: 140,
      render: (_, row) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {row.payment_status === 'pending' && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => approveMutation.mutate(row.id)}
              disabled={approveMutation.isPending}
            >
              审批
            </Button>
          )}
          {row.payment_status === 'approved' && (
            <Button
              variant="primary"
              size="xs"
              onClick={() => payMutation.mutate(row.id)}
              disabled={payMutation.isPending}
            >
              付款
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">应付台账</h1>
        <PermissionGuard permission="finance.payable.create">
          <Button variant="primary" size="sm" className="min-h-11" title="新建应付" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            新建应付
          </Button>
        </PermissionGuard>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Select
          options={[
            { value: '', label: '全部状态' },
            ...Object.entries(statusMap).map(([k, v]) => ({ value: k, label: v.label })),
          ]}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-36 shrink-0 min-h-11"
          title="状态筛选"
        />
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[980px]">
          <DataTable<Payable>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无应付记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
          </div>
        </div>
      </Card>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="新建应付"
        size="md"
        footer={
          <>
            <Button variant="ghost" className="min-h-11" title="取消创建" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              className="min-h-11"
              title="确认创建应付"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.record_no || !form.supplier_name || !form.amount}
            >
              {createMutation.isPending ? '创建中...' : '创建'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="单据编号"
            value={form.record_no}
            onChange={(e) => setForm((p) => ({ ...p, record_no: e.target.value }))}
            placeholder="请输入单据编号"
            inputClassName="min-h-11"
            title="单据编号"
          />
          <Input
            label="供应商"
            value={form.supplier_name}
            onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))}
            placeholder="请输入供应商名称"
            inputClassName="min-h-11"
            title="供应商"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="金额"
              type="number"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0"
              inputClassName="min-h-11"
              title="金额"
            />
            <Input
              label="应付日期"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
              inputClassName="min-h-11"
              title="应付日期"
            />
          </div>
          <Select
            label="费用类型"
            options={costTypeOptions}
            value={form.cost_type}
            onChange={(e) => setForm((p) => ({ ...p, cost_type: e.target.value }))}
            className="min-h-11"
            title="费用类型"
          />
          <Input
            label="备注"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="可选"
            inputClassName="min-h-11"
            title="备注"
          />
        </div>
      </Modal>
    </div>
  )
}
