import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, StatCard, DataTable, Badge, Modal, Button, Input, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { AlertTriangle, CheckCircle, Clock, XCircle, Plus, ArrowRight, FileSearch, ShieldCheck, Filter } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

type DeviationStatus = 'identified' | 'reported' | 'investigating' | 'capa_pending' | 'capa_executing' | 'capa_complete' | 'closed'

interface Deviation {
  id: number
  code: string
  title: string
  category: string
  severity: 'critical' | 'major' | 'minor'
  status: DeviationStatus
  reporter: string
  reported_at: string
  project: string
  [key: string]: unknown
}

const severityMap: Record<string, { label: string; variant: 'error' | 'warning' | 'info' }> = {
  critical: { label: '严重', variant: 'error' },
  major: { label: '重大', variant: 'warning' },
  minor: { label: '轻微', variant: 'info' },
}

const statusMap: Record<string, { label: string; variant: 'default' | 'error' | 'warning' | 'primary' | 'success' | 'info' }> = {
  identified: { label: '已识别', variant: 'default' },
  reported: { label: '已报告', variant: 'info' },
  investigating: { label: '调查中', variant: 'warning' },
  capa_pending: { label: 'CAPA待建', variant: 'warning' },
  capa_executing: { label: 'CAPA执行中', variant: 'primary' },
  capa_complete: { label: 'CAPA已完成', variant: 'primary' },
  closed: { label: '已关闭', variant: 'success' },
}

const NEXT_STATUS: Record<string, { target: DeviationStatus; label: string }> = {
  identified: { target: 'reported', label: '报告' },
  reported: { target: 'investigating', label: '开始调查' },
  investigating: { target: 'capa_pending', label: '提交CAPA' },
  capa_pending: { target: 'capa_executing', label: '开始执行' },
  capa_executing: { target: 'capa_complete', label: '标记完成' },
  capa_complete: { target: 'closed', label: '关闭' },
}

const categoryOptions = [
  { value: '操作偏差', label: '操作偏差' },
  { value: '设备偏差', label: '设备偏差' },
  { value: '环境偏差', label: '环境偏差' },
  { value: '文件偏差', label: '文件偏差' },
  { value: '其他', label: '其他' },
]

const severityOptions = [
  { value: 'critical', label: '严重' },
  { value: 'major', label: '重大' },
  { value: 'minor', label: '轻微' },
]

const filterStatusOptions = [
  { value: '', label: '全部' },
  { value: 'identified', label: '已识别' },
  { value: 'reported', label: '已报告' },
  { value: 'investigating', label: '调查中' },
  { value: 'capa_pending', label: 'CAPA待建' },
  { value: 'capa_executing', label: 'CAPA执行中' },
  { value: 'capa_complete', label: 'CAPA已完成' },
  { value: 'closed', label: '已关闭' },
]

const filterSeverityOptions = [
  { value: '', label: '全部' },
  { value: 'critical', label: '严重' },
  { value: 'major', label: '重大' },
  { value: 'minor', label: '轻微' },
]

const baseColumns: Column<Deviation>[] = [
  { key: 'code', title: '偏差编号', width: 150 },
  { key: 'title', title: '偏差描述' },
  { key: 'category', title: '分类', width: 100 },
  {
    key: 'severity',
    title: '严重度',
    width: 90,
    render: (val) => {
      const info = severityMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
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
  { key: 'project', title: '项目', width: 80 },
  { key: 'reporter', title: '报告人', width: 100 },
  { key: 'reported_at', title: '报告日期', width: 120 },
]

export function DeviationListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', category: '操作偏差', severity: 'minor', description: '', project: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ status: '', severity: '', date_from: '', date_to: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['deviations', page, pageSize, filters],
    queryFn: () =>
      api.get<{ items: Deviation[]; total: number }>('/quality/deviations/list', {
        params: {
          page,
          page_size: pageSize,
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.severity ? { severity: filters.severity } : {}),
          ...(filters.date_from ? { date_from: filters.date_from } : {}),
          ...(filters.date_to ? { date_to: filters.date_to } : {}),
        },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['deviation-stats'],
    queryFn: () => api.get<{ by_status: Record<string, number>; total: number }>('/quality/deviations/stats'),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/quality/deviations/create', form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['deviations'] }); setShowCreate(false) },
  })

  const advanceMutation = useMutation({
    mutationFn: ({ id, new_status }: { id: number; new_status: string }) =>
      api.post<any>(`/quality/deviations/${id}/advance`, { new_status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deviations'] })
      queryClient.invalidateQueries({ queryKey: ['deviation-stats'] })
    },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_status ?? {}

  const openCount = (stats.identified ?? 0) + (stats.reported ?? 0) + (stats.investigating ?? 0)
  const capaCount = (stats.capa_pending ?? 0) + (stats.capa_executing ?? 0) + (stats.capa_complete ?? 0)

  const columns: Column<Deviation>[] = baseColumns.map(col =>
    col.key === 'code'
      ? { ...col, render: (val: unknown, row: unknown) => {
          const d = row as Deviation
          return <button className="text-primary-600 hover:underline font-medium" onClick={() => navigate(`/deviations/${d.id}`)}>{String(val)}</button>
        } }
      : col
  )

  const columnsWithActions: Column<Deviation>[] = [
    ...columns,
    {
      key: 'id' as any,
      title: '操作',
      width: 100,
      render: (_, row) => {
        const d = row as Deviation
        const next = NEXT_STATUS[d.status]
        if (next) {
          return (
            <Button
              variant="ghost"
              size="xs"
              icon={<ArrowRight className="w-3 h-3" />}
              onClick={() => advanceMutation.mutate({ id: d.id, new_status: next.target })}
              disabled={advanceMutation.isPending}
            >
              {next.label}
            </Button>
          )
        }
        return null
      },
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">偏差管理</h1>
        <PermissionGuard permission="quality.deviation.create">
          <Button className="min-h-11" title="新建偏差" icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            新建偏差
          </Button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="开放中" value={openCount} icon={<XCircle className="w-6 h-6" />} color="red" />
        <StatCard title="CAPA 处理中" value={capaCount} icon={<ShieldCheck className="w-6 h-6" />} color="amber" />
        <StatCard title="已关闭" value={stats.closed ?? 0} icon={<CheckCircle className="w-6 h-6" />} color="green" />
        <StatCard title="总计" value={statsData?.data?.total ?? 0} icon={<FileSearch className="w-6 h-6" />} color="blue" />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={showFilters ? 'primary' : 'ghost'}
            size="sm"
            className="min-h-10"
            title="筛选偏差"
            icon={<Filter className="w-4 h-4" />}
            onClick={() => setShowFilters(v => !v)}
          >
            筛选
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-10"
            title="清除筛选"
            onClick={() => {
              setFilters({ status: '', severity: '', date_from: '', date_to: '' })
              setPage(1)
            }}
          >
            清除筛选
          </Button>
        </div>
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: showFilters ? '200px' : '0' }}
        >
          <div className="flex items-end gap-4 overflow-x-auto py-3 px-4 bg-slate-50 rounded-lg border border-slate-200">
            <Select
              label="状态"
              value={filters.status}
              className="min-h-11"
              title="状态筛选"
              onChange={e => {
                setFilters(p => ({ ...p, status: e.target.value }))
                setPage(1)
              }}
              options={filterStatusOptions}
            />
            <Select
              label="严重度"
              value={filters.severity}
              className="min-h-11"
              title="严重度筛选"
              onChange={e => {
                setFilters(p => ({ ...p, severity: e.target.value }))
                setPage(1)
              }}
              options={filterSeverityOptions}
            />
            <Input
              label="日期起"
              type="date"
              value={filters.date_from}
              inputClassName="min-h-11"
              title="开始日期"
              onChange={e => {
                setFilters(p => ({ ...p, date_from: e.target.value }))
                setPage(1)
              }}
            />
            <Input
              label="日期止"
              type="date"
              value={filters.date_to}
              inputClassName="min-h-11"
              title="结束日期"
              onChange={e => {
                setFilters(p => ({ ...p, date_to: e.target.value }))
                setPage(1)
              }}
            />
          </div>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[1100px]">
          <DataTable<Deviation>
            columns={columnsWithActions}
            data={items}
            loading={isLoading}
            emptyText="暂无偏差记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
          </div>
        </div>
      </Card>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="新建偏差"
        size="md"
        footer={
          <>
            <Button variant="ghost" className="min-h-11" title="取消创建偏差" onClick={() => setShowCreate(false)}>
              取消
            </Button>
            <Button
              className="min-h-11"
              title="创建偏差"
              loading={createMutation.isPending}
              disabled={!form.title}
              onClick={() => createMutation.mutate()}
            >
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="偏差描述 *"
            value={form.title}
            inputClassName="min-h-11"
            title="偏差描述"
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            placeholder="输入偏差描述"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label="分类"
              value={form.category}
              className="min-h-11"
              title="偏差分类"
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              options={categoryOptions}
            />
            <Select
              label="严重度"
              value={form.severity}
              className="min-h-11"
              title="偏差严重度"
              onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}
              options={severityOptions}
            />
          </div>
          <div>
            <label htmlFor="deviation-description" className="block text-sm font-medium text-slate-700 mb-1.5">详细描述</label>
            <textarea
              id="deviation-description"
              title="详细描述"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="输入详细描述（可选）"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              rows={3}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
