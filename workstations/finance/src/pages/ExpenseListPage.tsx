import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, Button, Modal, Input, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'

interface Expense {
  id: number
  request_no: string
  applicant_name: string
  expense_type: 'travel' | 'procurement' | 'entertainment' | 'other'
  amount: string | number
  approval_status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed'
  description?: string
  import_source?: 'manual' | 'ekuaibao'
  ekuaibao_no?: string
  import_batch_id?: string
  // 业务关联字段
  protocol_id?: number
  project_name?: string
  client_name?: string
  cost_department?: string
  expense_template?: string
  linked_budget_no?: string
  approval_chain?: Array<{
    action: string
    node_name: string
    operator_name: string
    time: string
  }>
  [key: string]: unknown
}

const expenseTypeMap: Record<string, string> = {
  travel: '差旅',
  procurement: '采购',
  entertainment: '招待',
  other: '其他',
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'error' | 'warning' }> = {
  draft: { label: '草稿', variant: 'default' },
  submitted: { label: '已提交', variant: 'warning' },
  approved: { label: '已审批', variant: 'primary' },
  rejected: { label: '已拒绝', variant: 'error' },
  reimbursed: { label: '已报销', variant: 'success' },
}

const expenseTypeOptions = [
  { value: 'travel', label: '差旅' },
  { value: 'procurement', label: '采购' },
  { value: 'entertainment', label: '招待' },
  { value: 'other', label: '其他' },
]

function formatAmount(val: string | number | null | undefined): string {
  if (val == null || val === '') return '-'
  const n = typeof val === 'string' ? Number(val) : val
  return `¥${n.toLocaleString()}`
}

export function ExpenseListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [status, setStatus] = useState<string>('')
  const [importSource, setImportSource] = useState<string>('')
  const [keyword, setKeyword] = useState<string>('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    request_no: '',
    applicant_id: '',
    expense_type: 'other',
    amount: '',
    description: '',
    notes: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['expenses', page, pageSize, status, importSource, keyword],
    queryFn: () =>
      api.get<{ items: Expense[]; total: number }>('/finance/expenses/list', {
        params: {
          page, page_size: pageSize,
          ...(status ? { status } : {}),
          ...(importSource ? { import_source: importSource } : {}),
          ...(keyword ? { keyword } : {}),
        },
      }),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<any>('/finance/expenses/create', {
        ...form,
        applicant_id: Number(form.applicant_id) || 0,
        amount: Number(form.amount) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      setShowCreate(false)
      setForm({ request_no: '', applicant_id: '', expense_type: 'other', amount: '', description: '', notes: '' })
    },
  })

  const submitMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/finance/expenses/${id}/submit`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/finance/expenses/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/finance/expenses/${id}/reject`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  })

  const reimburseMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/finance/expenses/${id}/reimburse`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  const columns: Column<Expense>[] = [
    { key: 'request_no', title: '申请单号', width: 140 },
    {
      key: 'import_source',
      title: '来源',
      width: 80,
      render: (val) => (
        val === 'ekuaibao'
          ? <Badge variant="primary">易快报</Badge>
          : <Badge variant="default">手动</Badge>
      ),
    },
    { key: 'applicant_name', title: '申请人', width: 100 },
    {
      key: 'expense_type',
      title: '费用类型',
      width: 90,
      render: (val) => expenseTypeMap[val as string] ?? String(val),
    },
    {
      key: 'amount',
      title: '金额(¥)',
      width: 120,
      align: 'right',
      render: (val) => formatAmount(val),
    },
    {
      key: 'approval_status',
      title: '审批状态',
      width: 90,
      render: (val) => {
        const info = statusMap[val as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
      },
    },
    {
      key: 'description',
      title: '业务说明',
      render: (val, row) => {
        const parts: string[] = []
        if (row?.client_name) parts.push(row.client_name as string)
        if (row?.project_name) parts.push(row.project_name as string)
        if (row?.cost_department) parts.push(row.cost_department as string)
        const ekbNo = row?.ekuaibao_no
        return (
          <div className="text-xs">
            {parts.length > 0 && (
              <div className="text-slate-600 font-medium">{parts.join(' / ')}</div>
            )}
            <div className="text-slate-400 truncate max-w-[200px]">
              {val ? String(val).replace(/ \| (项目|客户|部门|模板):.*/g, '') : '-'}
              {ekbNo && row?.import_source === 'ekuaibao' && (
                <span className="ml-1 text-blue-400">({ekbNo})</span>
              )}
            </div>
            {row?.expense_template && (
              <div className="text-slate-300 text-[10px]">{row.expense_template as string}</div>
            )}
          </div>
        )
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: 180,
      render: (_, row) => {
        const isEkb = row.import_source === 'ekuaibao'
        return (
          <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {isEkb ? (
              <span className="text-xs text-slate-400">只读（易快报导入）</span>
            ) : (
              <>
                {row.approval_status === 'draft' && (
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => submitMutation.mutate(row.id)}
                    disabled={submitMutation.isPending}
                  >
                    提交
                  </Button>
                )}
                {row.approval_status === 'submitted' && (
                  <>
                    <Button
                      variant="primary"
                      size="xs"
                      onClick={() => approveMutation.mutate(row.id)}
                      disabled={approveMutation.isPending}
                    >
                      审批
                    </Button>
                    <Button
                      variant="danger"
                      size="xs"
                      onClick={() => rejectMutation.mutate(row.id)}
                      disabled={rejectMutation.isPending}
                    >
                      拒绝
                    </Button>
                  </>
                )}
                {row.approval_status === 'approved' && (
                  <Button
                    variant="success"
                    size="xs"
                    onClick={() => reimburseMutation.mutate(row.id)}
                    disabled={reimburseMutation.isPending}
                  >
                    报销
                  </Button>
                )}
              </>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">费用报销</h1>
        <PermissionGuard permission="finance.expense.create">
          <Button className="min-h-11" variant="primary" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            新建报销
          </Button>
        </PermissionGuard>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 flex-wrap">
        <Select
          options={[
            { value: '', label: '全部状态' },
            ...Object.entries(statusMap).map(([k, v]) => ({ value: k, label: v.label })),
          ]}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="w-36 min-h-11 shrink-0"
        />
        <Select
          options={[
            { value: '', label: '全部来源' },
            { value: 'manual', label: '手动录入' },
            { value: 'ekuaibao', label: '易快报导入' },
          ]}
          value={importSource}
          onChange={(e) => { setImportSource(e.target.value); setPage(1) }}
          className="w-36 min-h-11 shrink-0"
        />
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="h-11 pl-9 pr-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
            placeholder="搜索单号/申请人/说明"
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[1100px]">
          <DataTable<Expense>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无报销记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
          </div>
        </div>
      </Card>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="新建报销"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !form.request_no || !form.amount}
            >
              {createMutation.isPending ? '创建中...' : '创建'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="申请单号"
            value={form.request_no}
            onChange={(e) => setForm((p) => ({ ...p, request_no: e.target.value }))}
            placeholder="请输入申请单号"
          />
          <Input
            label="申请人ID"
            type="number"
            value={form.applicant_id}
            onChange={(e) => setForm((p) => ({ ...p, applicant_id: e.target.value }))}
            placeholder="请输入申请人ID"
          />
          <Select
            label="费用类型"
            options={expenseTypeOptions}
            value={form.expense_type}
            onChange={(e) => setForm((p) => ({ ...p, expense_type: e.target.value }))}
          />
          <Input
            label="金额"
            type="number"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="0"
          />
          <Input
            label="说明"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="可选"
          />
          <Input
            label="备注"
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="可选"
          />
        </div>
      </Modal>
    </div>
  )
}
