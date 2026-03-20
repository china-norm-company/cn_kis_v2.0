import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Card, DataTable, Button, Modal, Input, Select, type Column } from '@cn-kis/ui-kit'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

interface StaffOption {
  id: number
  name: string
  [key: string]: unknown
}

interface PayrollItem {
  id: number
  staff_name: string
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
  staff_name: string
  incentive_type: string
  amount: number
  reason: string
  grant_date: string
  [key: string]: unknown
}

const payrollColumns: Column<PayrollItem>[] = [
  { key: 'staff_name', title: '员工' },
  { key: 'pay_month', title: '月份' },
  { key: 'base_salary', title: '基本工资' },
  { key: 'bonus', title: '奖金' },
  { key: 'deductions', title: '扣减' },
  { key: 'net_salary', title: '实发' },
  { key: 'status', title: '状态' },
]

const incentiveColumns: Column<IncentiveItem>[] = [
  { key: 'staff_name', title: '员工' },
  { key: 'incentive_type', title: '激励类型' },
  { key: 'amount', title: '金额' },
  { key: 'grant_date', title: '发放日期' },
  { key: 'reason', title: '原因' },
]

export function CompensationPage() {
  const [showPayroll, setShowPayroll] = useState(false)
  const [showIncentive, setShowIncentive] = useState(false)
  const [payrollForm, setPayrollForm] = useState({
    staff_id: '', pay_month: '', base_salary: '', bonus: '', deductions: '', net_salary: '',
  })
  const [incentiveForm, setIncentiveForm] = useState({
    staff_id: '', incentive_type: 'bonus', amount: '', reason: '', grant_date: '',
  })
  const queryClient = useQueryClient()

  const { data: staffData } = useQuery({
    queryKey: ['hr-compensation-staff-options'],
    queryFn: () => api.get<{ items: StaffOption[]; total: number }>('/hr/staff/list', {
      params: { page: 1, page_size: 200 },
    }),
  })
  const staffOptions = (staffData?.data?.items ?? []).map((s) => ({ value: String(s.id), label: s.name }))

  const { data: payrollData, isLoading: payrollLoading } = useQuery({
    queryKey: ['hr-payroll-records'],
    queryFn: () => api.get<{ items: PayrollItem[]; total: number }>('/hr/payroll/records/list', {
      params: { page: 1, page_size: 20 },
    }),
  })

  const { data: incentiveData, isLoading: incentiveLoading } = useQuery({
    queryKey: ['hr-incentive-records'],
    queryFn: () => api.get<{ items: IncentiveItem[]; total: number }>('/hr/payroll/incentives/list', {
      params: { page: 1, page_size: 20 },
    }),
  })

  const createPayroll = useMutation({
    mutationFn: () => api.post('/hr/payroll/records/create', {
      staff_id: Number(payrollForm.staff_id),
      pay_month: payrollForm.pay_month,
      base_salary: Number(payrollForm.base_salary || 0),
      bonus: Number(payrollForm.bonus || 0),
      deductions: Number(payrollForm.deductions || 0),
      net_salary: Number(payrollForm.net_salary || 0),
      status: 'confirmed',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-payroll-records'] })
      setShowPayroll(false)
      setPayrollForm({ staff_id: '', pay_month: '', base_salary: '', bonus: '', deductions: '', net_salary: '' })
    },
  })

  const createIncentive = useMutation({
    mutationFn: () => api.post('/hr/payroll/incentives/create', {
      staff_id: Number(incentiveForm.staff_id),
      incentive_type: incentiveForm.incentive_type,
      amount: Number(incentiveForm.amount || 0),
      reason: incentiveForm.reason,
      grant_date: incentiveForm.grant_date || null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-incentive-records'] })
      setShowIncentive(false)
      setIncentiveForm({ staff_id: '', incentive_type: 'bonus', amount: '', reason: '', grant_date: '' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">薪酬与激励</h1>
        <PermissionGuard permission="hr.staff.manage">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowPayroll(true)}>新增薪资记录</Button>
            <Button onClick={() => setShowIncentive(true)}>新增激励</Button>
          </div>
        </PermissionGuard>
      </div>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">薪资记录</h2>
          <DataTable<PayrollItem> columns={payrollColumns} data={payrollData?.data?.items ?? []} loading={payrollLoading} emptyText="暂无薪资记录" />
        </div>
      </Card>

      <Card>
        <div className="p-4">
          <h2 className="font-semibold text-slate-800 mb-3">激励记录</h2>
          <DataTable<IncentiveItem> columns={incentiveColumns} data={incentiveData?.data?.items ?? []} loading={incentiveLoading} emptyText="暂无激励记录" />
        </div>
      </Card>

      <Modal
        isOpen={showPayroll}
        onClose={() => setShowPayroll(false)}
        title="新增薪资记录"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowPayroll(false)}>取消</Button>
            <Button loading={createPayroll.isPending} onClick={() => createPayroll.mutate()}>保存</Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <Select label="员工" value={payrollForm.staff_id} onChange={(e) => setPayrollForm({ ...payrollForm, staff_id: e.target.value })} options={staffOptions} />
          <Input label="薪资月份(YYYY-MM)" value={payrollForm.pay_month} onChange={(e) => setPayrollForm({ ...payrollForm, pay_month: e.target.value })} />
          <Input label="基本工资" type="number" value={payrollForm.base_salary} onChange={(e) => setPayrollForm({ ...payrollForm, base_salary: e.target.value })} />
          <Input label="奖金" type="number" value={payrollForm.bonus} onChange={(e) => setPayrollForm({ ...payrollForm, bonus: e.target.value })} />
          <Input label="扣减" type="number" value={payrollForm.deductions} onChange={(e) => setPayrollForm({ ...payrollForm, deductions: e.target.value })} />
          <Input label="实发" type="number" value={payrollForm.net_salary} onChange={(e) => setPayrollForm({ ...payrollForm, net_salary: e.target.value })} />
        </div>
      </Modal>

      <Modal
        isOpen={showIncentive}
        onClose={() => setShowIncentive(false)}
        title="新增激励记录"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowIncentive(false)}>取消</Button>
            <Button loading={createIncentive.isPending} onClick={() => createIncentive.mutate()}>保存</Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <Select label="员工" value={incentiveForm.staff_id} onChange={(e) => setIncentiveForm({ ...incentiveForm, staff_id: e.target.value })} options={staffOptions} />
          <Input label="激励类型" value={incentiveForm.incentive_type} onChange={(e) => setIncentiveForm({ ...incentiveForm, incentive_type: e.target.value })} />
          <Input label="金额" type="number" value={incentiveForm.amount} onChange={(e) => setIncentiveForm({ ...incentiveForm, amount: e.target.value })} />
          <Input label="发放日期" type="date" value={incentiveForm.grant_date} onChange={(e) => setIncentiveForm({ ...incentiveForm, grant_date: e.target.value })} />
          <Input label="原因" value={incentiveForm.reason} onChange={(e) => setIncentiveForm({ ...incentiveForm, reason: e.target.value })} />
        </div>
      </Modal>
    </div>
  )
}
