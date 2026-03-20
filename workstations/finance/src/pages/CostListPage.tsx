import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, Button, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { useState } from 'react'

interface Cost {
  id: number
  record_no: string
  cost_type: 'labor' | 'material' | 'equipment' | 'outsource' | 'travel' | 'other'
  cost_date: string
  amount: string | number
  status: 'pending' | 'confirmed' | 'cancelled'
  protocol_id?: number
  [key: string]: unknown
}

const costTypeMap: Record<string, string> = {
  labor: '人工',
  material: '材料',
  equipment: '设备',
  outsource: '外包',
  travel: '差旅',
  other: '其他',
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' }> = {
  pending: { label: '待确认', variant: 'warning' },
  confirmed: { label: '已确认', variant: 'success' },
  cancelled: { label: '已取消', variant: 'default' },
}

function formatAmount(val: string | number | null | undefined): string {
  if (val == null || val === '') return '-'
  const n = typeof val === 'string' ? Number(val) : val
  return `¥${n.toLocaleString()}`
}

export function CostListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [costType, setCostType] = useState<string>('')
  const [status, setStatus] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['costs', page, pageSize, costType, status],
    queryFn: () =>
      api.get<{ items: Cost[]; total: number }>('/finance/costs/list', {
        params: {
          page,
          page_size: pageSize,
          ...(costType ? { cost_type: costType } : {}),
          ...(status ? { status } : {}),
        },
      }),
  })

  const confirmMutation = useMutation({
    mutationFn: (id: number) => api.post<any>(`/finance/costs/${id}/confirm`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['costs'] }),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  const columns: Column<Cost>[] = [
    { key: 'record_no', title: '记录编号', width: 140 },
    {
      key: 'cost_type',
      title: '成本类型',
      width: 100,
      render: (val) => costTypeMap[val as string] ?? String(val),
    },
    { key: 'cost_date', title: '成本日期', width: 120, render: (val) => (val ? String(val) : '-') },
    {
      key: 'amount',
      title: '金额(¥)',
      width: 120,
      align: 'right',
      render: (val) => formatAmount(val),
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
    { key: 'protocol_id', title: '协议ID', width: 100, render: (val) => (val != null ? String(val) : '-') },
    {
      key: 'actions',
      title: '操作',
      width: 100,
      render: (_, row) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {row.status === 'pending' && (
            <Button
              variant="primary"
              size="xs"
              onClick={() => confirmMutation.mutate(row.id)}
              disabled={confirmMutation.isPending}
            >
              确认
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">成本记录</h1>
      </div>

      <div className="flex gap-2">
        <Select
          options={[
            { value: '', label: '全部类型' },
            ...Object.entries(costTypeMap).map(([k, v]) => ({ value: k, label: v })),
          ]}
          value={costType}
          onChange={(e) => setCostType(e.target.value)}
          className="w-36"
        />
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
          <DataTable<Cost>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无成本记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
        </div>
      </Card>
    </div>
  )
}
