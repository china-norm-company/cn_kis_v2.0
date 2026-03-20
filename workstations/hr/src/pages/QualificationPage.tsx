import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, StatCard, DataTable, Badge, Button, Modal, Input, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Award, Users, AlertTriangle, CheckCircle, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Staff {
  id: number
  name: string
  position: string
  department: string
  gcp_cert: string
  gcp_expiry: string
  gcp_status: 'valid' | 'expiring' | 'expired' | 'none'
  other_certs: string
  training_status: string
  [key: string]: unknown
}

const gcpStatusMap: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
  valid: { label: '有效', variant: 'success' },
  expiring: { label: '即将过期', variant: 'warning' },
  expired: { label: '已过期', variant: 'error' },
  none: { label: '无证书', variant: 'default' },
}

const columns: Column<Staff>[] = [
  { key: 'name', title: '姓名', width: 80 },
  { key: 'position', title: '岗位', width: 160 },
  { key: 'department', title: '部门', width: 100 },
  { key: 'gcp_cert', title: 'GCP证书号', width: 130, render: (val) => val ? String(val) : '-' },
  {
    key: 'gcp_status',
    title: 'GCP状态',
    width: 100,
    render: (val) => {
      const info = gcpStatusMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
  },
  { key: 'gcp_expiry', title: '到期日', width: 110, render: (val) => val ? String(val) : '-' },
  { key: 'other_certs', title: '其他资质' },
  {
    key: 'training_status',
    title: '培训',
    width: 80,
    render: (val) => {
      const s = val as string
      if (s === '已完成') return <Badge variant="success">完成</Badge>
      if (s === '进行中') return <Badge variant="primary">进行</Badge>
      if (s === '已逾期') return <Badge variant="error">逾期</Badge>
      return <Badge variant="default">未始</Badge>
    },
  },
]

export function QualificationPage() {
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', employee_no: '', position: '', department: '', email: '', phone: '' })
  const pageSize = 20
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => api.post('/hr/staff/create', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      queryClient.invalidateQueries({ queryKey: ['staff-stats'] })
      setShowCreate(false)
      setForm({ name: '', employee_no: '', position: '', department: '', email: '', phone: '' })
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['staff', page, pageSize],
    queryFn: () =>
      api.get<{ items: Staff[]; total: number }>('/hr/staff/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['staff-stats'],
    queryFn: () => api.get<{ by_gcp_status: Record<string, number>; total: number }>('/hr/staff/stats'),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_gcp_status ?? {}
  const totalStaff = statsData?.data?.total ?? 0
  const trainingDone = items.filter(d => d.training_status === '已完成').length
  const trainingRate = items.length > 0 ? Math.round(trainingDone / items.length * 100) : 0

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">资质总览</h1>
        <PermissionGuard permission="hr.staff.manage">
          <Button className="min-h-11" onClick={() => setShowCreate(true)} icon={<Plus className="w-4 h-4" />}>新增人员</Button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="在职人员" value={totalStaff} icon={<Users className="w-6 h-6" />} />
        <StatCard title="GCP有效" value={stats.valid ?? 0} icon={<Award className="w-6 h-6" />} />
        <StatCard title="即将过期" value={stats.expiring ?? 0} icon={<AlertTriangle className="w-6 h-6" />} />
        <StatCard title="培训完成率" value={`${trainingRate}%`} icon={<CheckCircle className="w-6 h-6" />} />
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[980px]">
          <DataTable<Staff>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无人员数据"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
            onRowClick={(record) => navigate(`/staff/${record.id}`)}
          />
          </div>
        </div>
      </Card>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新增人员" size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={() => createMutation.mutate(form)} loading={createMutation.isPending}>确认创建</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="姓名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="请输入姓名" />
          <Input label="工号" value={form.employee_no} onChange={(e) => setForm({ ...form, employee_no: e.target.value })} placeholder="请输入工号" />
          <Input label="岗位" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="请输入岗位" />
          <Input label="部门" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="请输入部门" />
          <Input label="邮箱" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="请输入邮箱" />
          <Input label="电话" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="请输入电话" />
        </div>
      </Modal>
    </div>
  )
}
