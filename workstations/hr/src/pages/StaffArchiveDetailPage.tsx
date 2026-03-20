import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '@cn-kis/api-client'
import { Card, DataTable, Button, type Column } from '@cn-kis/ui-kit'

interface ArchiveDetail {
  staff_id: number
  staff_name: string
  department: string
  manager_name: string
  job_rank: string
  employment_status: string
  employment_type: string
  hire_date: string
  regular_date: string
  sync_source: string
  sync_locked_fields: string[]
  [key: string]: unknown
}

interface ContractItem {
  id: number
  contract_no: string
  contract_type: string
  start_date: string
  end_date: string
  status: string
  [key: string]: unknown
}

interface CertificateItem {
  id: number
  cert_type: string
  cert_no: string
  issuer: string
  issue_date: string
  expiry_date: string
  status: string
  [key: string]: unknown
}

interface TrainingItem {
  id: number
  course_name: string
  category: string
  trainer: string
  start_date: string
  hours: number
  status: string
  score: string
  [key: string]: unknown
}

interface PerformanceItem {
  id: number
  cycle_name: string
  score: number
  grade: string
  status: string
  improvement_plan: string
  [key: string]: unknown
}

interface PayrollItem {
  id: number
  pay_month: string
  base_salary: number
  bonus: number
  deductions: number
  net_salary: number
  status: string
  [key: string]: unknown
}

interface IncentiveItem {
  id: number
  incentive_type: string
  amount: number
  reason: string
  grant_date: string
  [key: string]: unknown
}

const contractColumns: Column<ContractItem>[] = [
  { key: 'contract_no', title: '合同编号' },
  { key: 'contract_type', title: '类型' },
  { key: 'start_date', title: '开始日期' },
  { key: 'end_date', title: '结束日期' },
  { key: 'status', title: '状态' },
]

const certColumns: Column<CertificateItem>[] = [
  { key: 'cert_type', title: '证照类型' },
  { key: 'cert_no', title: '证照编号' },
  { key: 'issuer', title: '发证机构' },
  { key: 'issue_date', title: '发证日期' },
  { key: 'expiry_date', title: '到期日期' },
  { key: 'status', title: '状态' },
]

const trainingColumns: Column<TrainingItem>[] = [
  { key: 'course_name', title: '课程' },
  { key: 'category', title: '类别', width: 90 },
  { key: 'trainer', title: '讲师', width: 100 },
  { key: 'start_date', title: '日期', width: 120 },
  { key: 'hours', title: '学时', width: 80, align: 'center' },
  { key: 'status', title: '状态', width: 90 },
  { key: 'score', title: '考核分', width: 90, align: 'center' },
]

const performanceColumns: Column<PerformanceItem>[] = [
  { key: 'cycle_name', title: '绩效周期' },
  { key: 'score', title: '分数', width: 90, align: 'center' },
  { key: 'grade', title: '等级', width: 90 },
  { key: 'status', title: '状态', width: 90 },
  { key: 'improvement_plan', title: '改进计划' },
]

const payrollColumns: Column<PayrollItem>[] = [
  { key: 'pay_month', title: '月份' },
  { key: 'base_salary', title: '基本工资' },
  { key: 'bonus', title: '奖金' },
  { key: 'deductions', title: '扣减' },
  { key: 'net_salary', title: '实发' },
  { key: 'status', title: '状态' },
]

const incentiveColumns: Column<IncentiveItem>[] = [
  { key: 'incentive_type', title: '激励类型' },
  { key: 'amount', title: '金额' },
  { key: 'grant_date', title: '发放日期' },
  { key: 'reason', title: '原因' },
]

export function StaffArchiveDetailPage() {
  const { staffId } = useParams<{ staffId: string }>()
  const navigate = useNavigate()

  const { data: archiveData, isLoading: archiveLoading } = useQuery({
    queryKey: ['hr-archive-detail', staffId],
    queryFn: () => api.get<ArchiveDetail>(`/hr/archives/${staffId}`),
    enabled: !!staffId,
  })

  const { data: contractsData, isLoading: contractsLoading } = useQuery({
    queryKey: ['hr-archive-contracts', staffId],
    queryFn: () => api.get<{ items: ContractItem[]; total: number }>('/hr/contracts/list', {
      params: { staff_id: staffId, page: 1, page_size: 50 },
    }),
    enabled: !!staffId,
  })

  const { data: certsData, isLoading: certsLoading } = useQuery({
    queryKey: ['hr-archive-certs', staffId],
    queryFn: () => api.get<{ items: CertificateItem[]; total: number }>('/hr/certificates/list', {
      params: { staff_id: staffId, page: 1, page_size: 50 },
    }),
    enabled: !!staffId,
  })

  const { data: trainingsData, isLoading: trainingsLoading } = useQuery({
    queryKey: ['hr-archive-trainings', staffId],
    queryFn: () => api.get<{ items: TrainingItem[]; total: number }>('/hr/trainings/list', {
      params: { trainee_id: staffId, page: 1, page_size: 50 },
    }),
    enabled: !!staffId,
  })

  const { data: performanceData, isLoading: performanceLoading } = useQuery({
    queryKey: ['hr-archive-performance', staffId],
    queryFn: () => api.get<{ items: PerformanceItem[]; total: number }>('/hr/performance/records/list', {
      params: { staff_id: staffId, page: 1, page_size: 50 },
    }),
    enabled: !!staffId,
  })

  const { data: payrollData, isLoading: payrollLoading } = useQuery({
    queryKey: ['hr-archive-payroll', staffId],
    queryFn: () => api.get<{ items: PayrollItem[]; total: number }>('/hr/payroll/records/list', {
      params: { staff_id: staffId, page: 1, page_size: 50 },
    }),
    enabled: !!staffId,
  })

  const { data: incentiveData, isLoading: incentiveLoading } = useQuery({
    queryKey: ['hr-archive-incentive', staffId],
    queryFn: () => api.get<{ items: IncentiveItem[]; total: number }>('/hr/payroll/incentives/list', {
      params: { staff_id: staffId, page: 1, page_size: 50 },
    }),
    enabled: !!staffId,
  })

  const archive = archiveData?.data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">员工360档案</h1>
        <Button variant="outline" onClick={() => navigate('/archives')}>返回档案总览</Button>
      </div>

      <Card>
        <div className="p-5">
          {archiveLoading ? (
            <p className="text-slate-500">加载中...</p>
          ) : !archive ? (
            <p className="text-slate-500">档案不存在</p>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <div><span className="text-slate-400">员工：</span>{archive.staff_name}</div>
              <div><span className="text-slate-400">部门：</span>{archive.department || '-'}</div>
              <div><span className="text-slate-400">上级：</span>{archive.manager_name || '-'}</div>
              <div><span className="text-slate-400">职级：</span>{archive.job_rank || '-'}</div>
              <div><span className="text-slate-400">任职状态：</span>{archive.employment_status || '-'}</div>
              <div><span className="text-slate-400">用工类型：</span>{archive.employment_type || '-'}</div>
              <div><span className="text-slate-400">入职日期：</span>{archive.hire_date || '-'}</div>
              <div><span className="text-slate-400">转正日期：</span>{archive.regular_date || '-'}</div>
              <div><span className="text-slate-400">同步来源：</span>{archive.sync_source || '-'}</div>
              <div><span className="text-slate-400">锁定字段：</span>{(archive.sync_locked_fields || []).join(', ') || '-'}</div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">合同台账</h2>
          <DataTable<ContractItem>
            columns={contractColumns}
            data={contractsData?.data?.items ?? []}
            loading={contractsLoading}
            emptyText="暂无合同记录"
          />
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">证照台账</h2>
          <DataTable<CertificateItem>
            columns={certColumns}
            data={certsData?.data?.items ?? []}
            loading={certsLoading}
            emptyText="暂无证照记录"
          />
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">培训轨迹</h2>
          <DataTable<TrainingItem>
            columns={trainingColumns}
            data={trainingsData?.data?.items ?? []}
            loading={trainingsLoading}
            emptyText="暂无培训记录"
          />
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">绩效记录</h2>
          <DataTable<PerformanceItem>
            columns={performanceColumns}
            data={performanceData?.data?.items ?? []}
            loading={performanceLoading}
            emptyText="暂无绩效记录"
          />
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">薪资记录</h2>
          <DataTable<PayrollItem>
            columns={payrollColumns}
            data={payrollData?.data?.items ?? []}
            loading={payrollLoading}
            emptyText="暂无薪资记录"
          />
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">激励记录</h2>
          <DataTable<IncentiveItem>
            columns={incentiveColumns}
            data={incentiveData?.data?.items ?? []}
            loading={incentiveLoading}
            emptyText="暂无激励记录"
          />
        </div>
      </Card>
    </div>
  )
}
