import { useQuery } from '@tanstack/react-query'
import { Card, StatCard, DataTable, Badge, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { useState } from 'react'
import { GitBranch, Clock, CheckCircle, AlertTriangle } from 'lucide-react'

interface ChangeRecord {
  id: number
  title: string
  change_type: string
  status: 'pending' | 'approved' | 'rejected' | 'implemented'
  initiator: string
  created_at: string
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'primary' }> = {
  pending: { label: '待审批', variant: 'warning' },
  approved: { label: '已批准', variant: 'primary' },
  rejected: { label: '已驳回', variant: 'error' },
  implemented: { label: '已实施', variant: 'success' },
}

const columns: Column<ChangeRecord>[] = [
  { key: 'id', title: '编号', width: 80 },
  { key: 'title', title: '变更标题' },
  { key: 'change_type', title: '变更类型', width: 100 },
  {
    key: 'status',
    title: '状态',
    width: 90,
    render: (val) => {
      const info = statusMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
  },
  { key: 'initiator', title: '发起人', width: 100 },
  { key: 'created_at', title: '发起日期', width: 120, render: (val) => val ? String(val).slice(0, 10) : '-' },
]

export function ChangeControlPage() {
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['changes', page, pageSize],
    queryFn: () =>
      api.get<{ items: ChangeRecord[]; total: number }>('/quality/changes/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['change-stats'],
    queryFn: () => api.get<{ by_status: Record<string, number>; total: number }>('/quality/changes/stats'),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_status ?? {}

  return (
    <div className="space-y-5 md:space-y-6">
      <h1 className="text-xl font-bold text-slate-800 md:text-2xl">变更控制</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="待审批" value={stats.pending ?? 0} icon={<Clock className="w-6 h-6" />} color="amber" />
        <StatCard title="已批准" value={stats.approved ?? 0} icon={<GitBranch className="w-6 h-6" />} color="blue" />
        <StatCard title="已实施" value={stats.implemented ?? 0} icon={<CheckCircle className="w-6 h-6" />} color="green" />
        <StatCard title="已驳回" value={stats.rejected ?? 0} icon={<AlertTriangle className="w-6 h-6" />} color="red" />
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[760px]">
          <DataTable<ChangeRecord>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无变更记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
          </div>
        </div>
      </Card>
    </div>
  )
}
