import { useQuery } from '@tanstack/react-query'
import { Card, DataTable, Badge, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Budget {
  id: number
  budget_no: string
  budget_name: string
  status: 'draft' | 'pending' | 'approved' | 'executing' | 'completed' | 'rejected'
  protocol_id?: number
  total_cost: string | number
  actual_cost: string | number
  budget_year?: string | number
  [key: string]: unknown
}

interface BudgetAlert {
  id: number
  budget_id: number
  message: string
  severity?: string
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'error' | 'warning' }> = {
  draft: { label: '草稿', variant: 'default' },
  pending: { label: '待审批', variant: 'warning' },
  approved: { label: '已审批', variant: 'primary' },
  executing: { label: '执行中', variant: 'success' },
  completed: { label: '已完成', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'error' },
}

function formatAmount(val: string | number | null | undefined): string {
  if (val == null || val === '') return '-'
  const n = typeof val === 'string' ? Number(val) : val
  return `¥${n.toLocaleString()}`
}

export function BudgetListPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['budgets', status],
    queryFn: () =>
      api.get<{ items: Budget[] }>('/finance/budgets/list', {
        params: status ? { status } : {},
      }),
  })

  const { data: alertsData } = useQuery({
    queryKey: ['budgets', 'alerts'],
    queryFn: () => api.get<{ items: BudgetAlert[]; total?: number }>('/finance/budgets/alerts'),
  })

  const items = data?.data?.items ?? []
  const alerts = alertsData?.data?.items ?? []
  const alertCount = alertsData?.data?.total ?? alerts.length

  const columns: Column<Budget>[] = [
    {
      key: 'budget_no',
      title: '预算编号',
      width: 140,
      render: (val, row) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/budgets/${row.id}`)
          }}
          className="text-primary-600 hover:text-primary-700 font-medium text-left"
        >
          {String(val ?? '-')}
        </button>
      ),
    },
    { key: 'budget_name', title: '预算名称' },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (val) => {
        const info = statusMap[val as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
      },
    },
    { key: 'protocol_id', title: '协议ID', width: 100, render: (val) => (val != null ? String(val) : '-') },
    {
      key: 'total_cost',
      title: '预算总额(¥)',
      width: 130,
      align: 'right',
      render: (val) => formatAmount(val),
    },
    {
      key: 'actual_cost',
      title: '实际成本(¥)',
      width: 130,
      align: 'right',
      render: (val) => formatAmount(val),
    },
    { key: 'budget_year', title: '预算年度', width: 100, render: (val) => (val != null ? String(val) : '-') },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">预算管理</h1>
      </div>

      {alertCount > 0 && (
        <Card>
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-700">预算预警 ({alertCount})</h3>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-600">
              {alerts.slice(0, 5).map((a) => (
                <li key={a.id}>• {a.message}</li>
              ))}
              {alerts.length > 5 && (
                <li className="text-slate-500">... 还有 {alerts.length - 5} 条</li>
              )}
            </ul>
          </div>
        </Card>
      )}

      <div className="flex gap-2">
        <Select
          options={[
            { value: '', label: '全部状态' },
            ...Object.entries(statusMap).map(([k, v]) => ({ value: k, label: v.label })),
          ]}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-36"
        />
      </div>

      <Card>
        <div className="p-1">
          <DataTable<Budget>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无预算记录"
            onRowClick={(row) => navigate(`/budgets/${row.id}`)}
          />
        </div>
      </Card>
    </div>
  )
}
