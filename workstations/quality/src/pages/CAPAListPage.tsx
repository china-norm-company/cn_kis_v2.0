import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, Modal, Button, Input, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { ShieldCheck, AlertCircle, Clock, CheckCircle, Plus, Filter } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface CAPA {
  id: number
  code: string
  deviation_code: string
  type: 'corrective' | 'preventive'
  title: string
  responsible: string
  due_date: string
  status: 'planned' | 'in_progress' | 'verification' | 'closed' | 'overdue'
  effectiveness: string
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'warning' | 'success' | 'error' }> = {
  planned: { label: '计划中', variant: 'default' },
  in_progress: { label: '执行中', variant: 'primary' },
  verification: { label: '验证中', variant: 'warning' },
  closed: { label: '已关闭', variant: 'success' },
  overdue: { label: '已超期', variant: 'error' },
}

const typeMap: Record<string, { label: string; variant: 'primary' | 'info' }> = {
  corrective: { label: '纠正', variant: 'primary' },
  preventive: { label: '预防', variant: 'info' },
}

const typeOptions = [
  { value: 'corrective', label: '纠正' },
  { value: 'preventive', label: '预防' },
]

const typeFilterOptions = [
  { value: '', label: '全部' },
  { value: 'corrective', label: '纠正措施' },
  { value: 'preventive', label: '预防措施' },
]

const statusFilterOptions = [
  { value: '', label: '全部' },
  { value: 'planned', label: '待执行' },
  { value: 'in_progress', label: '执行中' },
  { value: 'verification', label: '验证中' },
  { value: 'closed', label: '已关闭' },
  { value: 'overdue', label: '超期' },
]

const baseColumns: Column<CAPA>[] = [
  { key: 'code', title: 'CAPA编号', width: 150 },
  { key: 'deviation_code', title: '关联偏差', width: 150 },
  {
    key: 'type',
    title: '类型',
    width: 80,
    render: (val) => {
      const info = typeMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
  },
  { key: 'title', title: '措施描述' },
  { key: 'responsible', title: '责任人', width: 100 },
  { key: 'due_date', title: '到期日', width: 120 },
  {
    key: 'status',
    title: '状态',
    width: 100,
    render: (val) => {
      const info = statusMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
  },
  {
    key: 'effectiveness',
    title: '有效性',
    width: 80,
    render: (val) => {
      if (val === '有效') return <Badge variant="success">有效</Badge>
      return <span className="text-slate-400">{String(val)}</span>
    },
  },
]

export function CAPAListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ status: '', type: '', is_overdue: false })
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', type: 'corrective', deviation_id: '', responsible: '', due_date: '', description: '' })
  const [actionForm, setActionForm] = useState({ capa_id: 0, description: '', assignee: '', due_date: '' })
  const [showAction, setShowAction] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['capas', page, pageSize, filters],
    queryFn: () =>
      api.get<{ items: CAPA[]; total: number }>('/quality/capas/list', {
        params: {
          page,
          page_size: pageSize,
          ...(filters.status && { status: filters.status }),
          ...(filters.type && { type: filters.type }),
          ...(filters.is_overdue && { is_overdue: true }),
        },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['capa-stats'],
    queryFn: () => api.get<{ by_status: Record<string, number>; total: number }>('/quality/capas/stats'),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/quality/capas/create', {
      ...form,
      deviation_id: Number(form.deviation_id) || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['capas'] }); setShowCreate(false) },
  })

  const addActionMutation = useMutation({
    mutationFn: () => api.post<any>(`/quality/capas/${actionForm.capa_id}/action-items/create`, {
      description: actionForm.description,
      assignee: actionForm.assignee,
      due_date: actionForm.due_date,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['capas'] }); setShowAction(false) },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_status ?? {}

  const columns: Column<CAPA>[] = baseColumns.map(col =>
    col.key === 'code'
      ? { ...col, render: (val: unknown, row: unknown) => {
          const c = row as CAPA
          return <button className="text-primary-600 hover:underline font-medium" onClick={() => navigate(`/capa/${c.id}`)}>{String(val)}</button>
        } }
      : col
  )

  const columnsWithActions: Column<CAPA>[] = [
    ...columns,
    {
      key: 'id' as any,
      title: '操作',
      width: 100,
      render: (_, row) => (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => { setActionForm({ capa_id: (row as CAPA).id, description: '', assignee: '', due_date: '' }); setShowAction(true) }}
        >
          + 行动项
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">CAPA跟踪</h1>
        <PermissionGuard permission="quality.capa.create">
          <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            新建 CAPA
          </Button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="CAPA总数" value={statsData?.data?.total ?? 0} icon={<ShieldCheck className="w-6 h-6" />} />
        <StatCard title="执行中" value={stats.in_progress ?? 0} icon={<Clock className="w-6 h-6" />} />
        <StatCard title="待验证" value={stats.verification ?? 0} icon={<AlertCircle className="w-6 h-6" />} />
        <StatCard title="已关闭" value={stats.closed ?? 0} icon={<CheckCircle className="w-6 h-6" />} />
      </div>

      <div className="space-y-2">
        <Button
          variant={showFilters ? 'primary' : 'outline'}
          size="sm"
          icon={<Filter className="w-4 h-4" />}
          onClick={() => setShowFilters(s => !s)}
        >
          筛选
        </Button>
        {showFilters && (
          <Card className="p-4">
            <div className="flex items-end gap-4 overflow-x-auto pb-1">
              <Select
                label="状态"
                value={filters.status}
                onChange={e => { setFilters(p => ({ ...p, status: e.target.value })); setPage(1) }}
                options={statusFilterOptions}
              />
              <Select
                label="类型"
                value={filters.type}
                onChange={e => { setFilters(p => ({ ...p, type: e.target.value })); setPage(1) }}
                options={typeFilterOptions}
              />
              <label className="flex shrink-0 items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.is_overdue}
                  onChange={e => { setFilters(p => ({ ...p, is_overdue: e.target.checked })); setPage(1) }}
                  className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700">仅超期</span>
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setFilters({ status: '', type: '', is_overdue: false }); setPage(1) }}
              >
                清除筛选
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Card>
        <div className="p-1">
          <DataTable<CAPA>
            columns={columnsWithActions}
            data={items}
            loading={isLoading}
            emptyText="暂无CAPA记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
        </div>
      </Card>

      {/* Create CAPA Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="新建 CAPA"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>取消</Button>
            <Button loading={createMutation.isPending} disabled={!form.title} onClick={() => createMutation.mutate()}>创建</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="措施描述 *"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="输入措施描述"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="类型"
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
              options={typeOptions}
            />
            <Input
              label="关联偏差 ID"
              type="number"
              value={form.deviation_id}
              onChange={e => setForm(p => ({ ...p, deviation_id: e.target.value }))}
              placeholder="可选"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="责任人"
              value={form.responsible}
              onChange={e => setForm(p => ({ ...p, responsible: e.target.value }))}
              placeholder="责任人"
            />
            <Input
              label="到期日"
              type="date"
              value={form.due_date}
              onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
              placeholder=""
            />
          </div>
        </div>
      </Modal>

      {/* Add Action Item Modal */}
      <Modal
        isOpen={showAction}
        onClose={() => setShowAction(false)}
        title="添加行动项"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAction(false)}>取消</Button>
            <Button loading={addActionMutation.isPending} disabled={!actionForm.description} onClick={() => addActionMutation.mutate()}>添加</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="action-description" className="block text-sm font-medium text-slate-700 mb-1.5">行动描述 *</label>
            <textarea
              id="action-description"
              value={actionForm.description}
              onChange={e => setActionForm(p => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              rows={2}
              placeholder="输入行动描述"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="执行人"
              value={actionForm.assignee}
              onChange={e => setActionForm(p => ({ ...p, assignee: e.target.value }))}
              placeholder="执行人"
            />
            <Input
              label="到期日"
              type="date"
              value={actionForm.due_date}
              onChange={e => setActionForm(p => ({ ...p, due_date: e.target.value }))}
              placeholder=""
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
