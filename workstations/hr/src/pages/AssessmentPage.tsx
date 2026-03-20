import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, DataTable, Badge, Button, Modal, Input, Select, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

interface Assessment {
  id: number
  staff_name: string
  position: string
  period: string
  scores: Record<string, number>
  overall: string
  status: 'pending' | 'in_progress' | 'completed'
  assessor: string
  [key: string]: unknown
}

interface StaffOption {
  id: number
  name: string
  [key: string]: unknown
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' }> = {
  pending: { label: '未开始', variant: 'default' },
  in_progress: { label: '评估中', variant: 'primary' },
  completed: { label: '已完成', variant: 'success' },
}

function renderScore(val: unknown) {
  const score = val as number
  if (!score) return <span className="text-slate-300">-</span>
  const colors = ['', 'text-red-500', 'text-amber-500', 'text-blue-500', 'text-emerald-500']
  return <span className={`font-medium ${colors[score] || ''}`}>{score}</span>
}

const SCORE_KEYS = [
  { key: '临床试验知识', label: '临床知识' },
  { key: '方案执行能力', label: '方案执行' },
  { key: '数据管理能力', label: '数据管理' },
  { key: '沟通协调能力', label: '沟通协调' },
  { key: '质量合规意识', label: '质量合规' },
]

const defaultForm = { staff_id: '', period: '', assessor: '' }

export function AssessmentPage() {
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const pageSize = 20

  const createMutation = useMutation({
    mutationFn: (payload: typeof form) => api.post('/hr/assessments/create', {
      ...payload,
      staff_id: Number(payload.staff_id),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] })
      setShowCreate(false)
      setForm(defaultForm)
    },
  })

  const { data, isLoading } = useQuery({
    queryKey: ['assessments', page, pageSize],
    queryFn: () =>
      api.get<{ items: Assessment[]; total: number }>('/hr/assessments/list', {
        params: { page, page_size: pageSize },
      }),
  })

  const { data: staffData } = useQuery({
    queryKey: ['assessment-staff-options'],
    queryFn: () =>
      api.get<{ items: StaffOption[]; total: number }>('/hr/staff/list', {
        params: { page: 1, page_size: 200 },
      }),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const completedCount = items.filter(d => d.status === 'completed').length

  const columns: Column<Assessment>[] = [
    { key: 'staff_name', title: '姓名', width: 80 },
    { key: 'position', title: '岗位', width: 80 },
    { key: 'period', title: '评估期', width: 90 },
    ...SCORE_KEYS.map(({ key, label }) => ({
      key: key as keyof Assessment,
      title: label,
      width: 80,
      align: 'center' as const,
      render: (_: unknown, record: Assessment) => renderScore(record.scores?.[key] ?? 0),
    })),
    {
      key: 'overall',
      title: '综合',
      width: 80,
      render: (val) => {
        if (!val) return '-'
        const s = val as string
        if (s === '优秀') return <Badge variant="success">优秀</Badge>
        if (s === '良好') return <Badge variant="primary">良好</Badge>
        if (s === '合格') return <Badge variant="warning">合格</Badge>
        return <Badge variant="error">{s}</Badge>
      },
    },
    {
      key: 'status',
      title: '状态',
      width: 80,
      render: (val) => {
        const info = statusMap[val as string]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : '-'
      },
    },
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800 md:text-2xl">能力评估</h1>
          <p className="mt-1 text-sm text-slate-500">评分标准: 1-基础 2-胜任 3-熟练 4-专家</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="text-sm text-slate-500">
            已完成: <strong className="text-slate-700">{completedCount}/{items.length}</strong>
          </div>
          <PermissionGuard permission="hr.assessment.create">
            <Button className="min-h-11" onClick={() => setShowCreate(true)} icon={<Plus className="w-4 h-4" />}>新增评估</Button>
          </PermissionGuard>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto p-1">
          <div className="min-w-[1100px]">
          <DataTable<Assessment>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无评估记录"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
            onRowClick={(record) => navigate(`/assessment/${record.id}`)}
          />
          </div>
        </div>
      </Card>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新增评估" size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={() => createMutation.mutate(form)} loading={createMutation.isPending}>确认创建</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="被评估人"
            value={form.staff_id}
            onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
            options={(staffData?.data?.items ?? []).map((s) => ({ value: String(s.id), label: s.name }))}
            placeholder="请选择被评估人"
          />
          <Input label="评估期" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="如: 2026-Q1" />
          <Input label="评估人" value={form.assessor} onChange={(e) => setForm({ ...form, assessor: e.target.value })} placeholder="请输入评估人姓名" />
        </div>
      </Modal>
    </div>
  )
}
