/**
 * 任务委派面板
 *
 * 创建跨部门任务 + 跟踪状态 + 飞书任务联动
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, identityApi } from '@cn-kis/api-client'
import { DataTable, Badge, Button, Modal, Empty, Card, StatCard } from '@cn-kis/ui-kit'
import type { Column, BadgeVariant } from '@cn-kis/ui-kit'
import {
  SendHorizonal, Plus, Clock, CheckCircle,
  AlertTriangle, Users, Loader2,
} from 'lucide-react'

interface DelegatedTask {
  id: number
  title: string
  description: string
  assigned_to_name: string
  status: string
  due_date: string
  create_time: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  pending: { label: '待处理', variant: 'default' },
  in_progress: { label: '进行中', variant: 'info' },
  completed: { label: '已完成', variant: 'success' },
  overdue: { label: '已逾期', variant: 'error' },
}

export default function TaskDelegationPage() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    title: '',
    description: '',
    assigned_to: '',
    due_date: '',
  })

  const { data: listRes, isLoading } = useQuery({
    queryKey: ['workorder', 'delegated-tasks'],
    queryFn: () => api.get<{ items: DelegatedTask[] }>('/workorder/list', {
      params: { page: 1, page_size: 50, work_order_type: 'delegated' },
    }),
  })

  const { data: accountsRes } = useQuery({
    queryKey: ['identity', 'accounts'],
    queryFn: () => identityApi.listAccounts({ page_size: 200 }),
    staleTime: 300_000,
  })
  const accounts: { id: number; display_name: string; username: string }[] =
    (accountsRes?.data as any)?.items ?? []

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/workorder/create', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workorder', 'delegated-tasks'] })
      setShowCreate(false)
      setForm({ title: '', description: '', assigned_to: '', due_date: '' })
    },
  })

  const tasks: DelegatedTask[] = (listRes?.data as any)?.items ?? []

  const columns: Column<DelegatedTask>[] = [
    {
      key: 'title',
      title: '任务名称',
      render: (_, r) => <span className="text-sm font-medium text-slate-700">{r.title}</span>,
    },
    {
      key: 'assigned_to_name',
      title: '执行人',
      width: 120,
      render: (_, r) => (
        <span className="text-sm text-slate-600">{r.assigned_to_name || (r as any).assigned_to || '-'}</span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (_, r) => {
        const info = STATUS_MAP[r.status] || { label: r.status, variant: 'default' as BadgeVariant }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
    },
    {
      key: 'due_date',
      title: '截止日期',
      width: 120,
      render: (_, r) => {
        if (!r.due_date) return <span className="text-slate-400">-</span>
        const isOverdue = new Date(r.due_date) < new Date() && r.status !== 'completed'
        return (
          <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
            {new Date(r.due_date).toLocaleDateString('zh-CN')}
            {isOverdue && <AlertTriangle className="w-3 h-3 inline-block ml-1" />}
          </span>
        )
      },
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 160,
      render: (_, r) => (
        <span className="text-xs text-slate-400">
          {r.create_time ? new Date(r.create_time).toLocaleString('zh-CN') : '-'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 md:text-xl">任务委派</h2>
          <p className="mt-1 text-sm text-slate-500">创建跨部门任务、跟踪执行进度</p>
        </div>
        <Button className="min-h-11" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
          创建任务
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="任务总数" value={tasks.length} icon={<SendHorizonal className="w-5 h-5" />} color="blue" />
        <StatCard title="进行中" value={tasks.filter(t => t.status === 'in_progress').length} icon={<Clock className="w-5 h-5" />} color="amber" />
        <StatCard title="已完成" value={tasks.filter(t => t.status === 'completed').length} icon={<CheckCircle className="w-5 h-5" />} color="green" />
        <StatCard title="已逾期" value={tasks.filter(t => t.status === 'overdue').length} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
      </div>

      <Card className="!p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[860px]">
            <DataTable<DelegatedTask>
              columns={columns}
              data={tasks}
              loading={isLoading}
              rowKey="id"
            />
          </div>
        </div>
        {!isLoading && tasks.length === 0 && (
          <div className="py-8">
            <Empty icon={<SendHorizonal className="w-12 h-12" />} title="暂无委派任务" description="点击右上角创建第一个任务" />
          </div>
        )}
      </Card>

      {/* Create Task Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="创建委派任务"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">任务名称 *</label>
            <input
              className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="输入任务名称"
              title="任务名称"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">任务描述</label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="描述任务内容和要求..."
              title="任务描述"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">指派人 *</label>
            <select
              className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.assigned_to}
              onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
              title="选择指派人"
            >
              <option value="">请选择指派人</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.display_name || acc.username}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">截止日期</label>
            <input
              type="date"
              className="w-full min-h-11 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              title="选择截止日期"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button
              onClick={() => createMutation.mutate({
                title: form.title,
                description: form.description,
                assigned_to: form.assigned_to ? Number(form.assigned_to) : undefined,
                due_date: form.due_date || undefined,
                work_order_type: 'delegated',
              })}
              disabled={!form.title.trim() || !form.assigned_to || createMutation.isPending}
            >
              {createMutation.isPending ? '创建中...' : '创建任务'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
