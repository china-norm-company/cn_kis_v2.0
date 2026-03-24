/**
 * 工单管理
 *
 * 全生命周期工单管理：列表、筛选、搜索
 *
 * S5-2: 角色感知的默认筛选：
 * - 排程专员默认显示"待分配"工单
 * - 其他角色默认显示全部
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { workorderApi, subjectApi } from '@cn-kis/api-client'
import type { WorkOrder } from '@cn-kis/api-client'
import { DataTable, Badge, Empty, Modal, Button } from '@cn-kis/ui-kit'
import { Plus, Search } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待分配' },
  { value: 'assigned', label: '已分配' },
  { value: 'in_progress', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'review', label: '待审核' },
  { value: 'approved', label: '已批准' },
  { value: 'rejected', label: '已拒绝' },
]

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'error' }> = {
  pending: { label: '待处理', variant: 'default' },
  assigned: { label: '已分配', variant: 'primary' },
  in_progress: { label: '进行中', variant: 'warning' },
  completed: { label: '已完成', variant: 'success' },
  review: { label: '待审核', variant: 'warning' },
  approved: { label: '已批准', variant: 'success' },
  rejected: { label: '已拒绝', variant: 'error' },
  cancelled: { label: '已取消', variant: 'default' },
}

function isOverdue(wo: WorkOrder): boolean {
  if (!wo.due_date) return false
  if (['completed', 'approved', 'cancelled'].includes(wo.status)) return false
  return new Date(wo.due_date) < new Date()
}

export default function WorkOrderPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const { hasRole } = useFeishuContext()

  const defaultStatus = useMemo(() => {
    const urlStatus = searchParams.get('status')
    if (urlStatus) return urlStatus
    if (hasRole('scheduler')) return 'pending'
    return ''
  }, [searchParams, hasRole])

  const [statusFilter, setStatusFilter] = useState(defaultStatus)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    enrollment_id: '',
    visit_node_id: '',
    assigned_to: '',
    due_date: '',
  })

  const { data: enrollmentsRes } = useQuery({
    queryKey: ['subject', 'enrollments-for-create'],
    queryFn: () => subjectApi.listEnrollments({ status: 'enrolled', page: 1, page_size: 100 }),
    enabled: showCreate,
  })

  const createMutation = useMutation({
    mutationFn: (data: { enrollment_id: number; title: string; description?: string; visit_node_id?: number; assigned_to?: number; due_date?: string }) =>
      workorderApi.create(data),
    onSuccess: () => {
      setShowCreate(false)
      setCreateForm({ title: '', description: '', enrollment_id: '', visit_node_id: '', assigned_to: '', due_date: '' })
      queryClient.invalidateQueries({ queryKey: ['workorder'] })
    },
  })

  const handleCreateSubmit = () => {
    if (!createForm.title.trim() || !createForm.enrollment_id) return
    createMutation.mutate({
      enrollment_id: Number(createForm.enrollment_id),
      title: createForm.title.trim(),
      description: createForm.description.trim() || undefined,
      visit_node_id: createForm.visit_node_id ? Number(createForm.visit_node_id) : undefined,
      assigned_to: createForm.assigned_to ? Number(createForm.assigned_to) : undefined,
      due_date: createForm.due_date || undefined,
    })
  }

  const { data: res, isLoading } = useQuery({
    queryKey: ['workorder', 'list', statusFilter, page],
    queryFn: () =>
      workorderApi.list({
        status: statusFilter || undefined,
        page,
        page_size: pageSize,
      }),
    refetchInterval: 30_000,
  })

  const items = res?.data?.items ?? []
  const total = res?.data?.total ?? 0

  const columns = [
    {
      key: 'id',
      title: '工单号',
      render: (_v: unknown, wo: WorkOrder) => (
        <span className="font-mono text-xs text-slate-500">WO#{wo.id}</span>
      ),
    },
    {
      key: 'title',
      title: '标题',
      render: (_v: unknown, wo: WorkOrder) => (
        <span className="text-sm font-medium text-slate-800 truncate max-w-[200px] block">
          {wo.title}
        </span>
      ),
    },
    {
      key: 'work_order_type',
      title: '类型',
      render: (_v: unknown, wo: WorkOrder) => (
        <span className="text-xs text-slate-500">{wo.work_order_type || 'visit'}</span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      render: (_v: unknown, wo: WorkOrder) => {
        const info = STATUS_BADGE[wo.status] || { label: wo.status, variant: 'default' as const }
        const overdue = isOverdue(wo)
        return (
          <div className="flex items-center gap-1">
            <Badge variant={info.variant}>{info.label}</Badge>
            {overdue && <Badge variant="error">逾期</Badge>}
          </div>
        )
      },
    },
    {
      key: 'scheduled_date',
      title: '排程日期',
      render: (_v: unknown, wo: WorkOrder) => (
        <span className="text-xs text-slate-500">
          {wo.scheduled_date || '-'}
        </span>
      ),
    },
    {
      key: 'due_date',
      title: '截止时间',
      render: (_v: unknown, wo: WorkOrder) => (
        <span className={`text-xs ${isOverdue(wo) ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
          {wo.due_date ? new Date(wo.due_date).toLocaleDateString() : '-'}
        </span>
      ),
    },
    {
      key: 'create_time',
      title: '创建时间',
      render: (_v: unknown, wo: WorkOrder) => (
        <span className="text-xs text-slate-500">
          {wo.create_time ? new Date(wo.create_time).toLocaleDateString() : '-'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">工单管理</h2>
          <p className="text-sm text-slate-500 mt-1">创建、分发、跟踪、关闭工单</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          创建工单
        </button>
      </div>

      {/* 状态筛选 */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => { setStatusFilter(opt.value); setPage(1) }}
            className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors md:px-4 ${
              statusFilter === opt.value
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 工单列表 */}
      <div className="bg-white rounded-xl border border-slate-200">
        {isLoading ? (
          <div className="p-6 text-center text-sm text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-6">
            <Empty message="暂无工单数据" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            onRowClick={(wo: WorkOrder) => navigate(`/workorders/${wo.id}`)}
            pagination={{
              current: page,
              pageSize,
              total,
              onChange: setPage,
            }}
          />
        )}
      </div>

      {/* 创建工单 Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="创建工单">
        <div className="space-y-4 p-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">标题 *</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              value={createForm.title}
              onChange={(e) => setCreateForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="工单标题"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">关联入组 *</label>
            <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              value={createForm.enrollment_id}
              onChange={(e) => setCreateForm((f) => ({ ...f, enrollment_id: e.target.value }))}
              title="选择关联入组"
            >
              <option value="">请选择</option>
              {(enrollmentsRes?.data?.items ?? []).map((en: { id: number; enrollment_no?: string }) => (
                <option key={en.id} value={en.id}>
                  {en.enrollment_no || `入组#${en.id}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">描述</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="工单描述（可选）"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">分配人 ID</label>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                value={createForm.assigned_to}
                onChange={(e) => setCreateForm((f) => ({ ...f, assigned_to: e.target.value }))}
                placeholder="可选"
                title="分配人 ID"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">截止日期</label>
              <input
                type="date"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                value={createForm.due_date}
                onChange={(e) => setCreateForm((f) => ({ ...f, due_date: e.target.value }))}
                title="截止日期"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button
              variant="primary"
              onClick={handleCreateSubmit}
              disabled={!createForm.title.trim() || !createForm.enrollment_id || createMutation.isPending}
            >
              {createMutation.isPending ? '提交中...' : '创建'}
            </Button>
          </div>
          {createMutation.isError && (
            <p className="text-sm text-red-600 mt-2">创建失败，请重试</p>
          )}
        </div>
      </Modal>
    </div>
  )
}
