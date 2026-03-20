import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, StatCard, DataTable, Badge, Modal, Button, Input, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardCheck, Plus, Play, CheckCircle, Filter } from 'lucide-react'

interface QualityAudit {
  id: number
  code: string
  title: string
  audit_type: string
  scope: string
  auditor: string
  auditor_org: string
  planned_date: string
  actual_date: string | null
  status: string
  summary: string
  create_time: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'primary' | 'warning' | 'success' }> = {
  planned: { label: '计划中', variant: 'default' },
  in_progress: { label: '执行中', variant: 'warning' },
  completed: { label: '已完成', variant: 'primary' },
  closed: { label: '已关闭', variant: 'success' },
}

const AUDIT_TYPE_MAP: Record<string, string> = {
  internal: '内部审计',
  external: '外部审计',
  client: '客户审计',
  inspection: '飞行检查',
}

const AUDIT_TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'internal', label: '内部审计' },
  { value: 'external', label: '外部审计' },
  { value: 'client', label: '客户审计' },
  { value: 'inspection', label: '飞行检查' },
]

const STATUS_FILTER_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'planned', label: '计划中' },
  { value: 'in_progress', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'closed', label: '已关闭' },
]

const CREATE_AUDIT_TYPE_OPTIONS = [
  { value: 'internal', label: '内部审计' },
  { value: 'external', label: '外部审计' },
  { value: 'client', label: '客户审计' },
  { value: 'inspection', label: '飞行检查' },
]

function countByStatus(items: QualityAudit[]): Record<string, number> {
  const counts: Record<string, number> = {
    planned: 0,
    in_progress: 0,
    completed: 0,
    closed: 0,
  }
  for (const item of items) {
    if (item.status in counts) {
      counts[item.status]++
    }
  }
  return counts
}

export function AuditManagementPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ audit_type: '', status: '' })
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    code: '',
    title: '',
    audit_type: 'internal',
    scope: '',
    auditor: '',
    auditor_org: '',
    planned_date: '',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['quality', 'audits', 'list', page, pageSize, filters],
    queryFn: () =>
      api.get<{ items: QualityAudit[]; total: number }>('/quality/audits/list', {
        params: {
          page,
          page_size: pageSize,
          ...(filters.audit_type && { audit_type: filters.audit_type }),
          ...(filters.status && { status: filters.status }),
        },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['quality', 'audits', 'stats'],
    queryFn: () =>
      api.get<{ items: QualityAudit[]; total: number }>('/quality/audits/list', {
        params: { page: 1, page_size: 1000 },
      }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<QualityAudit>('/quality/audits/create', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quality', 'audits'] })
      setShowCreate(false)
      setForm({ code: '', title: '', audit_type: 'internal', scope: '', auditor: '', auditor_org: '', planned_date: '' })
    },
  })

  const startMutation = useMutation({
    mutationFn: (id: number) => api.post(`/quality/audits/${id}/start`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quality', 'audits'] }),
  })

  const completeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/quality/audits/${id}/complete`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quality', 'audits'] }),
  })

  const closeMutation = useMutation({
    mutationFn: (id: number) => api.post(`/quality/audits/${id}/close`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quality', 'audits'] }),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const statsItems = statsData?.data?.items ?? []
  const stats = countByStatus(statsItems)

  const columns: Column<QualityAudit>[] = [
    { key: 'code', title: '审计编号', width: 140 },
    { key: 'title', title: '审计名称' },
    {
      key: 'audit_type',
      title: '类型',
      width: 110,
      render: (val) => AUDIT_TYPE_MAP[val as string] ?? val,
    },
    { key: 'auditor', title: '审计员', width: 100 },
    { key: 'planned_date', title: '计划日期', width: 120 },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (val) => {
        const info = STATUS_MAP[val as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
      },
    },
    {
      key: 'actions',
      title: '操作',
      width: 220,
      render: (_, row) => {
        const r = row as QualityAudit
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => navigate(`/audit-management/${r.id}`)}
            >
              详情
            </Button>
            {r.status === 'planned' && (
              <Button
                variant="ghost"
                size="xs"
                icon={<Play className="w-3.5 h-3.5" />}
                loading={startMutation.isPending}
                onClick={() => startMutation.mutate(r.id)}
              >
                开始
              </Button>
            )}
            {r.status === 'in_progress' && (
              <Button
                variant="ghost"
                size="xs"
                icon={<CheckCircle className="w-3.5 h-3.5" />}
                loading={completeMutation.isPending}
                onClick={() => completeMutation.mutate(r.id)}
              >
                完成
              </Button>
            )}
            {(r.status === 'completed' || r.status === 'in_progress') && (
              <Button
                variant="ghost"
                size="xs"
                loading={closeMutation.isPending}
                onClick={() => closeMutation.mutate(r.id)}
              >
                关闭
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">审计管理</h1>
        <PermissionGuard permission="quality.audit.create">
          <Button className="min-h-11" title="新建审计" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            新建审计
          </Button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard
          title="计划中"
          value={stats.planned}
          icon={<ClipboardCheck className="w-6 h-6" />}
        />
        <StatCard
          title="执行中"
          value={stats.in_progress}
          icon={<Play className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="已完成"
          value={stats.completed}
          icon={<CheckCircle className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="已关闭"
          value={stats.closed}
          icon={<CheckCircle className="w-6 h-6" />}
          color="green"
        />
      </div>

      <div className="space-y-2">
        <Button
          variant={showFilters ? 'primary' : 'secondary'}
          size="sm"
          className="min-h-10"
          title="展开筛选"
          icon={<Filter className="w-4 h-4" />}
          onClick={() => setShowFilters((s) => !s)}
        >
          筛选
        </Button>
        {showFilters && (
          <Card className="p-4">
            <div className="flex items-end gap-4 overflow-x-auto pb-1">
              <Select
                label="审计类型"
                value={filters.audit_type}
                className="min-h-11"
                title="审计类型筛选"
                onChange={(e) => {
                  setFilters((p) => ({ ...p, audit_type: e.target.value }))
                  setPage(1)
                }}
                options={AUDIT_TYPE_OPTIONS}
              />
              <Select
                label="状态"
                value={filters.status}
                className="min-h-11"
                title="状态筛选"
                onChange={(e) => {
                  setFilters((p) => ({ ...p, status: e.target.value }))
                  setPage(1)
                }}
                options={STATUS_FILTER_OPTIONS}
              />
              <Button
                variant="ghost"
                size="sm"
                className="min-h-10"
                title="清除筛选"
                onClick={() => {
                  setFilters({ audit_type: '', status: '' })
                  setPage(1)
                }}
              >
                清除筛选
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[1100px]">
          <DataTable<QualityAudit>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无审计记录"
            rowKey="id"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
          </div>
        </div>
      </Card>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="新建审计"
        size="md"
        footer={
          <>
            <Button variant="ghost" className="min-h-11" title="取消创建审计" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              className="min-h-11"
              title="创建审计"
              loading={createMutation.isPending}
              disabled={!form.code || !form.title}
              onClick={() => createMutation.mutate()}
            >
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="审计编号"
              value={form.code}
              inputClassName="min-h-11"
              title="审计编号"
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="输入审计编号"
            />
            <Input
              label="审计名称"
              value={form.title}
              inputClassName="min-h-11"
              title="审计名称"
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="输入审计名称"
            />
          </div>
          <Select
            label="审计类型"
            value={form.audit_type}
            className="min-h-11"
            title="审计类型"
            onChange={(e) => setForm((p) => ({ ...p, audit_type: e.target.value }))}
            options={CREATE_AUDIT_TYPE_OPTIONS}
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">审计范围</label>
            <textarea
              title="审计范围"
              value={form.scope}
              onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              rows={3}
              placeholder="输入审计范围"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="审计员"
              value={form.auditor}
              inputClassName="min-h-11"
              title="审计员"
              onChange={(e) => setForm((p) => ({ ...p, auditor: e.target.value }))}
              placeholder="审计员"
            />
            <Input
              label="计划日期"
              type="date"
              value={form.planned_date}
              inputClassName="min-h-11"
              title="计划日期"
              onChange={(e) => setForm((p) => ({ ...p, planned_date: e.target.value }))}
              placeholder=""
            />
          </div>
          <Input
            label="审计员组织"
            value={form.auditor_org}
            inputClassName="min-h-11"
            title="审计员组织"
            onChange={(e) => setForm((p) => ({ ...p, auditor_org: e.target.value }))}
            placeholder="审计员所属组织"
          />
        </div>
      </Modal>
    </div>
  )
}
