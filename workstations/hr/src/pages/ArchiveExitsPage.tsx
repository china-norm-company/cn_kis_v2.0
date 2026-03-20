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

interface ExitItem {
  id: number
  staff_id: number
  staff_name: string
  exit_date: string
  exit_type: string
  reason: string
  handover_status: string
  [key: string]: unknown
}

const columns: Column<ExitItem>[] = [
  { key: 'staff_name', title: '员工' },
  { key: 'exit_date', title: '离职日期' },
  { key: 'exit_type', title: '离职类型' },
  { key: 'reason', title: '原因' },
  { key: 'handover_status', title: '交接状态' },
]

export function ArchiveExitsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    staff_id: '',
    exit_date: '',
    exit_type: '主动离职',
    reason: '',
    handover_status: 'pending',
  })
  const queryClient = useQueryClient()

  const { data: listData, isLoading } = useQuery({
    queryKey: ['hr-archive-exit-records'],
    queryFn: () => api.get<{ items: ExitItem[]; total: number }>('/hr/exit-records/list', {
      params: { page: 1, page_size: 50 },
    }),
  })

  const { data: staffData } = useQuery({
    queryKey: ['hr-archive-exit-staff-options'],
    queryFn: () => api.get<{ items: StaffOption[]; total: number }>('/hr/staff/list', {
      params: { page: 1, page_size: 200 },
    }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/hr/exit-records/create', {
      staff_id: Number(form.staff_id),
      exit_date: form.exit_date,
      exit_type: form.exit_type,
      reason: form.reason,
      handover_status: form.handover_status,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-archive-exit-records'] })
      queryClient.invalidateQueries({ queryKey: ['hr-archives'] })
      setShowCreate(false)
      setForm({ staff_id: '', exit_date: '', exit_type: '主动离职', reason: '', handover_status: 'pending' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">离职台账</h1>
        <PermissionGuard permission="hr.staff.manage">
          <Button onClick={() => setShowCreate(true)}>登记离职</Button>
        </PermissionGuard>
      </div>
      <Card>
        <div className="p-4">
          <DataTable<ExitItem>
            columns={columns}
            data={listData?.data?.items ?? []}
            loading={isLoading}
            emptyText="暂无离职记录"
          />
        </div>
      </Card>
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="登记离职"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button loading={createMutation.isPending} onClick={() => createMutation.mutate()}>保存</Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="员工"
            value={form.staff_id}
            onChange={(e) => setForm({ ...form, staff_id: e.target.value })}
            options={(staffData?.data?.items ?? []).map((s) => ({ value: String(s.id), label: s.name }))}
          />
          <Input label="离职日期" type="date" value={form.exit_date} onChange={(e) => setForm({ ...form, exit_date: e.target.value })} />
          <Input label="离职类型" value={form.exit_type} onChange={(e) => setForm({ ...form, exit_type: e.target.value })} />
          <Input label="交接状态" value={form.handover_status} onChange={(e) => setForm({ ...form, handover_status: e.target.value })} />
          <Input label="离职原因" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
      </Modal>
    </div>
  )
}
