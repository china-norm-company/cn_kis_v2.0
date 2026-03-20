import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, Button, Modal, Input, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { GraduationCap, CheckCircle, Clock, AlertTriangle, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Training {
  id: number
  course_name: string
  category: string
  trainee_name: string
  trainer: string
  start_date: string
  end_date: string
  hours: number
  status: 'scheduled' | 'in_progress' | 'completed' | 'overdue'
  score: string
  [key: string]: unknown
}

interface StaffOption {
  id: number
  name: string
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'error' }> = {
  scheduled: { label: '已排期', variant: 'default' },
  in_progress: { label: '进行中', variant: 'primary' },
  completed: { label: '已完成', variant: 'success' },
  overdue: { label: '已逾期', variant: 'error' },
}

const columns: Column<Training>[] = [
  { key: 'course_name', title: '课程名称' },
  { key: 'category', title: '类别', width: 70 },
  { key: 'trainee_name', title: '学员', width: 70 },
  { key: 'trainer', title: '讲师', width: 90 },
  { key: 'start_date', title: '开始日期', width: 110 },
  { key: 'hours', title: '学时', width: 60, align: 'center', render: (val) => `${val}h` },
  {
    key: 'status',
    title: '状态',
    width: 80,
    render: (val) => {
      const info = statusMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
    },
  },
  {
    key: 'score',
    title: '考核分',
    width: 80,
    align: 'center',
    render: (val) => {
      if (!val) return '-'
      const score = Number(val)
      if (score >= 90) return <span className="font-medium text-emerald-600">{val}</span>
      if (score >= 80) return <span className="font-medium text-blue-600">{val}</span>
      return <span className="font-medium text-amber-600">{val}</span>
    },
  },
]

const defaultTrainingForm = { course_name: '', category: '', trainer: '', trainee_id: '', start_date: '', hours: '' }

export function TrainingPage() {
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(defaultTrainingForm)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const pageSize = 20

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => api.post('/hr/trainings/create', {
      ...payload,
      trainee_id: Number(payload.trainee_id),
      hours: Number(payload.hours) || 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainings'] })
      queryClient.invalidateQueries({ queryKey: ['training-stats'] })
      setShowCreate(false)
      setForm(defaultTrainingForm)
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['trainings', page, pageSize],
    queryFn: () =>
      api.get<{ items: Training[]; total: number }>('/hr/trainings/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const { data: staffData } = useQuery({
    queryKey: ['staff-options'],
    queryFn: () =>
      api.get<{ items: StaffOption[]; total: number }>('/hr/staff/list', {
        params: { page: 1, page_size: 200 },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['training-stats'],
    queryFn: () =>
      api.get<{ by_status: Record<string, number>; total: number; total_completed_hours: number }>(
        '/hr/trainings/stats'
      ),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_status ?? {}

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">培训跟踪</h1>
        <PermissionGuard permission="hr.training.manage">
          <Button className="min-h-11" onClick={() => setShowCreate(true)} icon={<Plus className="w-4 h-4" />}>新增培训</Button>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard title="培训总数" value={statsData?.data?.total ?? 0} icon={<GraduationCap className="w-6 h-6" />} />
        <StatCard title="已完成" value={stats.completed ?? 0} icon={<CheckCircle className="w-6 h-6" />} />
        <StatCard title="累计学时" value={`${statsData?.data?.total_completed_hours ?? 0}h`} icon={<Clock className="w-6 h-6" />} />
        <StatCard title="逾期未完成" value={stats.overdue ?? 0} icon={<AlertTriangle className="w-6 h-6" />} />
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[980px]">
          <DataTable<Training>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无培训记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
            onRowClick={(record) => navigate(`/training/${record.id}`)}
          />
          </div>
        </div>
      </Card>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新增培训" size="lg"
        footer={
          <>
            <Button className="min-h-11" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button className="min-h-11" onClick={() => createMutation.mutate(form)} loading={createMutation.isPending}>确认创建</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="课程名称" value={form.course_name} onChange={(e) => setForm({ ...form, course_name: e.target.value })} placeholder="请输入课程名称" />
          <Select label="类别" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
            options={[{ value: 'GCP', label: 'GCP' }, { value: 'SOP', label: 'SOP' }, { value: '专业技能', label: '专业技能' }, { value: '安全', label: '安全' }]} placeholder="请选择类别" />
          <Input label="讲师" value={form.trainer} onChange={(e) => setForm({ ...form, trainer: e.target.value })} placeholder="请输入讲师" />
          <Select
            label="学员"
            value={form.trainee_id}
            onChange={(e) => setForm({ ...form, trainee_id: e.target.value })}
            options={(staffData?.data?.items ?? []).map((s) => ({ value: String(s.id), label: s.name }))}
            placeholder="请选择学员"
          />
          <Input label="开始日期" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <Input label="学时" type="number" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="请输入学时" />
        </div>
      </Modal>
    </div>
  )
}
