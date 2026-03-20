import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, StatCard, DataTable, Badge, Modal, Button, Input, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { useState } from 'react'
import { Plus, Pencil, BookOpen, FileText, Clock, XCircle, Filter } from 'lucide-react'

interface SOP {
  id: number
  code: string
  title: string
  version: string
  category: string
  status: 'effective' | 'draft' | 'under_review' | 'retired'
  effective_date: string
  next_review: string
  owner: string
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'success' | 'default' | 'warning' | 'error' }> = {
  effective: { label: '生效中', variant: 'success' },
  draft: { label: '草稿', variant: 'default' },
  under_review: { label: '审核中', variant: 'warning' },
  retired: { label: '已废止', variant: 'error' },
}

const statusFilterOptions = [
  { value: '', label: '全部' },
  { value: 'effective', label: '生效中' },
  { value: 'draft', label: '草稿' },
  { value: 'under_review', label: '审核中' },
  { value: 'retired', label: '已废止' },
]

const columns: Column<SOP>[] = [
  { key: 'code', title: 'SOP编号', width: 130 },
  { key: 'title', title: '文件名称' },
  { key: 'version', title: '版本', width: 70 },
  { key: 'category', title: '分类', width: 100 },
  {
    key: 'status',
    title: '状态',
    width: 90,
    render: (val) => {
      const info = statusMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
  },
  { key: 'effective_date', title: '生效日期', width: 120, render: (val) => val ? String(val) : '-' },
  { key: 'next_review', title: '下次审查', width: 120, render: (val) => val ? String(val) : '-' },
  { key: 'owner', title: '归口部门', width: 100 },
]

export function SOPListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({ status: '', category: '' })
  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ title: '', code: '', version: '1.0', category: '', description: '', owner: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['sops', page, pageSize, filters.status, filters.category],
    queryFn: () =>
      api.get<{ items: SOP[]; total: number }>('/quality/sops/list', {
        params: {
          page,
          page_size: pageSize,
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.category ? { category: filters.category } : {}),
        },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['sop-stats'],
    queryFn: () => api.get<{ by_status: Record<string, number>; total: number }>('/quality/sops/stats'),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post<any>('/quality/sops/create', form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sops'] }); queryClient.invalidateQueries({ queryKey: ['sop-stats'] }); setShowCreate(false) },
  })

  const updateMutation = useMutation({
    mutationFn: () => api.put<any>(`/quality/sops/${editId}`, form),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['sops'] }); queryClient.invalidateQueries({ queryKey: ['sop-stats'] }); setEditId(null) },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const sopStats = statsData?.data?.by_status ?? {}

  const columnsWithActions: Column<SOP>[] = [
    ...columns,
    {
      key: 'id' as any,
      title: '操作',
      width: 60,
      render: (_, row) => (
        <Button
          variant="ghost"
          size="xs"
          icon={<Pencil className="w-3.5 h-3.5" />}
          onClick={() => {
            const s = row as SOP
            setForm({ title: s.title, code: s.code, version: s.version, category: s.category, description: '', owner: s.owner })
            setEditId(s.id)
          }}
        />
      ),
    },
  ]

  const isEditing = editId !== null
  const isPending = createMutation.isPending || updateMutation.isPending

  const cancel = () => {
    setShowCreate(false)
    setEditId(null)
  }

  const save = () => {
    if (isEditing) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">SOP管理</h1>
        <PermissionGuard permission="quality.sop.create">
          <Button
            className="min-h-11"
            title="新建SOP"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => {
              setForm({ title: '', code: '', version: '1.0', category: '', description: '', owner: '' })
              setShowCreate(true)
            }}
          >
            新建 SOP
          </Button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="生效中" value={sopStats.effective ?? 0} icon={<BookOpen className="w-6 h-6" />} color="green" />
        <StatCard title="草稿" value={sopStats.draft ?? 0} icon={<FileText className="w-6 h-6" />} color="blue" />
        <StatCard title="审核中" value={sopStats.under_review ?? 0} icon={<Clock className="w-6 h-6" />} color="amber" />
        <StatCard title="已废止" value={sopStats.retired ?? 0} icon={<XCircle className="w-6 h-6" />} color="red" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-10"
            title="展开筛选"
            icon={<Filter className="w-4 h-4" />}
            onClick={() => setShowFilters(p => !p)}
          >
            筛选
          </Button>
        </div>
        {showFilters && (
          <div className="flex items-end gap-3 overflow-x-auto bg-white rounded-lg border border-slate-200 p-3">
            <Select
              label="状态"
              value={filters.status}
              className="min-h-11"
              title="状态筛选"
              onChange={e => {
                setFilters(p => ({ ...p, status: e.target.value }))
                setPage(1)
              }}
              options={statusFilterOptions}
            />
            <Input
              label="分类"
              value={filters.category}
              inputClassName="min-h-11"
              title="分类筛选"
              onChange={e => {
                setFilters(p => ({ ...p, category: e.target.value }))
                setPage(1)
              }}
              placeholder="按分类搜索"
            />
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10"
              title="清除筛选"
              onClick={() => {
                setFilters({ status: '', category: '' })
                setPage(1)
              }}
            >
              清除筛选
            </Button>
          </div>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[980px]">
          <DataTable<SOP>
            columns={columnsWithActions}
            data={items}
            loading={isLoading}
            emptyText="暂无SOP文件"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
          </div>
        </div>
      </Card>

      <Modal
        isOpen={showCreate || isEditing}
        onClose={cancel}
        title={isEditing ? '编辑 SOP' : '新建 SOP'}
        size="md"
        footer={
          <>
            <Button variant="ghost" className="min-h-11" title="取消SOP编辑" onClick={cancel}>
              取消
            </Button>
            <Button loading={isPending} disabled={!form.title} className="min-h-11" title={isEditing ? '保存SOP' : '创建SOP'} onClick={save}>
              {isEditing ? '保存' : '创建'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="文件名称 *"
            value={form.title}
            inputClassName="min-h-11"
            title="文件名称"
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="编号"
              value={form.code}
              inputClassName="min-h-11"
              title="SOP编号"
              onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
              placeholder="SOP-001"
            />
            <Input
              label="版本"
              value={form.version}
              inputClassName="min-h-11"
              title="版本号"
              onChange={e => setForm(p => ({ ...p, version: e.target.value }))}
            />
            <Input
              label="分类"
              value={form.category}
              inputClassName="min-h-11"
              title="分类"
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
            />
          </div>
          <Input
            label="归口部门"
            value={form.owner}
            inputClassName="min-h-11"
            title="归口部门"
            onChange={e => setForm(p => ({ ...p, owner: e.target.value }))}
          />
          <div>
            <label htmlFor="sop-description" className="text-xs text-slate-500">内容描述</label>
            <textarea
              id="sop-description"
              title="内容描述"
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mt-1"
              rows={4}
              placeholder="输入内容描述"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
