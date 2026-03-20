/**
 * 员工详情页 - 人事台
 *
 * 展示单个员工的完整档案：基本信息、GCP 证书、培训记录、评估记录
 */
import { useQuery } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Badge, Button, DataTable, Empty, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { ArrowLeft, Award, GraduationCap, ClipboardCheck } from 'lucide-react'

interface StaffDetail {
  id: number
  name: string
  employee_no: string
  position: string
  department: string
  email: string
  phone: string
  gcp_cert: string
  gcp_expiry: string
  gcp_status: 'valid' | 'expiring' | 'expired' | 'none'
  other_certs: string
  status: string
  [key: string]: unknown
}

interface TrainingRecord {
  id: number
  course_name: string
  start_date: string
  hours: number
  status: string
  score: string | number
  [key: string]: unknown
}

interface AssessmentRecord {
  id: number
  period: string
  overall: string
  status: string
  [key: string]: unknown
}

const gcpStatusMap: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
  valid: { label: '有效', variant: 'success' },
  expiring: { label: '即将过期', variant: 'warning' },
  expired: { label: '已过期', variant: 'error' },
  none: { label: '无证书', variant: 'default' },
}

const trainingStatusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' | 'error' }> = {
  scheduled: { label: '已排期', variant: 'default' },
  in_progress: { label: '进行中', variant: 'primary' },
  completed: { label: '已完成', variant: 'success' },
  overdue: { label: '已逾期', variant: 'error' },
}

const assessmentStatusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'success' }> = {
  pending: { label: '未开始', variant: 'default' },
  in_progress: { label: '评估中', variant: 'primary' },
  completed: { label: '已完成', variant: 'success' },
}

const trainingColumns: Column<TrainingRecord>[] = [
  { key: 'course_name', title: '课程名称' },
  { key: 'start_date', title: '开始日期', width: 110 },
  { key: 'hours', title: '学时', width: 80, align: 'center', render: (val) => (val != null ? `${val}h` : '-') },
  {
    key: 'status',
    title: '状态',
    width: 90,
    render: (val) => {
      const info = trainingStatusMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : String(val ?? '-')
    },
  },
  {
    key: 'score',
    title: '考核分',
    width: 80,
    align: 'center',
    render: (val) => (val != null && val !== '' ? String(val) : '-'),
  },
]

const assessmentColumns: Column<AssessmentRecord>[] = [
  { key: 'period', title: '评估期', width: 120 },
  {
    key: 'overall',
    title: '综合评级',
    width: 100,
    render: (val) => {
      if (!val) return '-'
      const s = val as string
      if (s === '优秀') return <Badge variant="success">优秀</Badge>
      if (s === '良好') return <Badge variant="primary">良好</Badge>
      if (s === '合格') return <Badge variant="warning">合格</Badge>
      return <Badge variant="default">{s}</Badge>
    },
  },
  {
    key: 'status',
    title: '状态',
    width: 90,
    render: (val) => {
      const info = assessmentStatusMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : String(val ?? '-')
    },
  },
]

export function StaffDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: staffRes, isLoading: staffLoading } = useQuery({
    queryKey: ['hr', 'staff', id],
    queryFn: () => api.get<StaffDetail>(`/hr/staff/${id}`),
    enabled: !!id,
  })

  const { data: trainingsRes, isLoading: trainingsLoading } = useQuery({
    queryKey: ['hr', 'trainings', id],
    queryFn: () =>
      api.get<{ items: TrainingRecord[]; total: number }>('/hr/trainings/list', {
        params: { trainee_id: id },
      }),
    enabled: !!id,
  })

  const { data: assessmentsRes, isLoading: assessmentsLoading } = useQuery({
    queryKey: ['hr', 'assessments', id],
    queryFn: () =>
      api.get<{ items: AssessmentRecord[]; total: number }>('/hr/assessments/list', {
        params: { staff_id: id },
      }),
    enabled: !!id,
  })

  const staff = staffRes?.data
  const trainings = trainingsRes?.data?.items ?? trainingsRes?.data ?? []
  const assessments = assessmentsRes?.data?.items ?? assessmentsRes?.data ?? []

  const trainingsList = Array.isArray(trainings) ? trainings : []
  const assessmentsList = Array.isArray(assessments) ? assessments : []

  if (staffLoading) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">
        加载中...
      </div>
    )
  }

  if (!staff) {
    return (
      <div className="p-6">
        <Empty message="员工不存在" />
      </div>
    )
  }

  const gcpInfo = gcpStatusMap[staff.gcp_status] ?? { label: staff.gcp_status || '无', variant: 'default' as const }

  return (
    <div className="space-y-6">
      {/* 头部：返回按钮 + 员工姓名 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} icon={<ArrowLeft className="w-5 h-5" />} />
        <h1 className="text-2xl font-bold text-slate-800">{staff.name}</h1>
      </div>

      {/* 基本信息卡片 */}
      <Card>
        <h2 className="text-sm font-semibold text-slate-700 mb-4">基本信息</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <InfoRow label="工号" value={staff.employee_no} />
          <InfoRow label="岗位" value={staff.position} />
          <InfoRow label="部门" value={staff.department} />
          <InfoRow label="邮箱" value={staff.email} />
          <InfoRow label="电话" value={staff.phone} />
          <InfoRow label="状态" value={staff.status} />
        </div>
      </Card>

      {/* GCP 证书卡片 */}
      <Card>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
          <Award className="w-4 h-4" />
          GCP 证书
        </h2>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <InfoRow label="证书号" value={staff.gcp_cert || '-'} />
          <InfoRow label="到期日" value={staff.gcp_expiry || '-'} />
          <div>
            <span className="text-slate-400">状态：</span>
            <Badge variant={gcpInfo.variant}>{gcpInfo.label}</Badge>
          </div>
        </div>
      </Card>

      {/* 培训记录卡片 */}
      <Card>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
          <GraduationCap className="w-4 h-4" />
          培训记录
        </h2>
        <div className="p-1">
          <DataTable<TrainingRecord>
            columns={trainingColumns}
            data={trainingsList}
            loading={trainingsLoading}
            emptyText="暂无培训记录"
          />
        </div>
      </Card>

      {/* 评估记录卡片 */}
      <Card>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-4">
          <ClipboardCheck className="w-4 h-4" />
          评估记录
        </h2>
        <div className="p-1">
          <DataTable<AssessmentRecord>
            columns={assessmentColumns}
            data={assessmentsList}
            loading={assessmentsLoading}
            emptyText="暂无评估记录"
          />
        </div>
      </Card>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400">{label}：</span>
      <span className="text-slate-700">{value ?? '-'}</span>
    </div>
  )
}
