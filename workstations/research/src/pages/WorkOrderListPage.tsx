import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DataTable, Button, Badge, Card, Tabs, StatCard } from '@cn-kis/ui-kit'
import type { Column, BadgeVariant, TabItem } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Plus, ClipboardList, Clock, CheckCircle2, AlertCircle } from 'lucide-react'

interface WorkOrder {
  id: number
  enrollment_id: number
  visit_node_id: number | null
  title: string
  description: string
  status: string
  assigned_to: number | null
  due_date: string | null
  create_time: string
  update_time: string
  completed_at: string | null
  [key: string]: unknown
}

interface WOStats {
  total: number
  pending?: number
  in_progress?: number
  completed?: number
  review?: number
  approved?: number
  rejected?: number
  cancelled?: number
}

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: '待处理', variant: 'warning' },
  in_progress: { label: '处理中', variant: 'info' },
  completed: { label: '已完成', variant: 'success' },
  review: { label: '待审核', variant: 'primary' },
  approved: { label: '已批准', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'error' },
  cancelled: { label: '已取消', variant: 'default' },
}

const statusTabs: TabItem[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'in_progress', label: '处理中' },
  { key: 'completed', label: '已完成' },
  { key: 'review', label: '待审核' },
]

export function WorkOrderListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const pageSize = 10

  const { data, isLoading } = useQuery({
    queryKey: ['workorders', page, pageSize, statusFilter],
    queryFn: () =>
      api.get<{ items: WorkOrder[]; total: number; page: number; page_size: number }>(
        '/workorder/list',
        {
          params: {
            page, page_size: pageSize,
            ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
          },
        }
      ),
  })

  const { data: statsRes } = useQuery({
    queryKey: ['workorder-stats'],
    queryFn: () => api.get<WOStats>('/workorder/stats'),
  })

  const startMutation = useMutation({
    mutationFn: (id: number) => api.post(`/workorder/${id}/start`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workorders'] }),
  })

  const completeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/workorder/${id}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workorders'] }),
  })

  const workorders = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsRes?.data ?? { total: 0 }

  const columns: Column<WorkOrder>[] = [
    {
      key: 'id',
      title: '工单号',
      width: 90,
      render: (_, r) => <span className="font-mono text-sm font-medium text-primary-600">WO#{r.id}</span>,
    },
    { key: 'title', title: '标题' },
    {
      key: 'enrollment_id',
      title: '入组 ID',
      width: 90,
      render: (_, r) => <span className="font-mono text-sm">#{r.enrollment_id}</span>,
    },
    {
      key: 'status',
      title: '状态',
      width: 90,
      render: (_, r) => {
        const info = STATUS_MAP[r.status] ?? { label: r.status, variant: 'default' as BadgeVariant }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
    },
    {
      key: 'due_date',
      title: '截止日期',
      width: 120,
      render: (_, r) => (
        <span className="text-slate-500 text-sm">
          {r.due_date ? new Date(r.due_date).toLocaleDateString('zh-CN') : '-'}
        </span>
      ),
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 160,
      render: (_, r) => (
        <span className="text-slate-500 text-sm">{new Date(r.create_time).toLocaleString('zh-CN')}</span>
      ),
    },
    {
      key: 'actions',
      title: '操作',
      width: 120,
      render: (_, r) => (
        <div className="flex items-center gap-1">
          {r.status === 'pending' && (
            <Button size="sm" variant="ghost" onClick={() => startMutation.mutate(r.id)}>开始</Button>
          )}
          {r.status === 'in_progress' && (
            <Button size="sm" variant="ghost" onClick={() => completeMutation.mutate(r.id)}>完成</Button>
          )}
        </div>
      ),
    },
  ]

  const handleTabChange = (key: string) => {
    setStatusFilter(key)
    setPage(1)
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 md:text-xl">工单管理</h2>
          <p className="mt-1 text-sm text-slate-500">管理临床研究工单，追踪执行进度</p>
        </div>
        <PermissionGuard permission="workorder.workorder.create">
          <Button className="min-h-11" icon={<Plus className="w-4 h-4" />}>新建工单</Button>
        </PermissionGuard>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="总工单" value={stats.total} icon={<ClipboardList className="w-5 h-5" />} />
        <StatCard title="待处理" value={stats.pending ?? 0} icon={<Clock className="w-5 h-5" />} />
        <StatCard title="处理中" value={stats.in_progress ?? 0} icon={<AlertCircle className="w-5 h-5" />} />
        <StatCard title="已完成" value={(stats.completed ?? 0) + (stats.approved ?? 0)} icon={<CheckCircle2 className="w-5 h-5" />} />
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-[560px]">
          <Tabs items={statusTabs} activeKey={statusFilter} onChange={handleTabChange} />
        </div>
      </div>

      <Card className="!p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <DataTable<WorkOrder>
              columns={columns}
              data={workorders}
              loading={isLoading}
              rowKey="id"
              pagination={{ current: page, pageSize, total, onChange: setPage }}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}
