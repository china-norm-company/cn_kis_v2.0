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

interface ChangeLogItem {
  id: number
  staff_id: number
  staff_name: string
  change_type: string
  change_date: string
  operated_by: string
  reason: string
  [key: string]: unknown
}

const columns: Column<ChangeLogItem>[] = [
  { key: 'staff_name', title: '员工' },
  { key: 'change_type', title: '异动类型' },
  { key: 'change_date', title: '异动日期' },
  { key: 'operated_by', title: '操作人' },
  { key: 'reason', title: '原因' },
]

export function ArchiveChangesPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    staff_id: '',
    change_type: '调岗',
    change_date: '',
    operated_by: '',
    reason: '',
  })
  const queryClient = useQueryClient()

  const { data: listData, isLoading } = useQuery({
    queryKey: ['hr-archive-change-logs'],
    queryFn: () => api.get<{ items: ChangeLogItem[]; total: number }>('/hr/change-logs/list', {
      params: { page: 1, page_size: 50 },
    }),
  })
  const { data: staffData } = useQuery({
    queryKey: ['hr-archive-change-staff-options'],
    queryFn: () => api.get<{ items: StaffOption[]; total: number }>('/hr/staff/list', {
      params: { page: 1, page_size: 200 },
    }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/hr/change-logs/create', {
      staff_id: Number(form.staff_id),
      change_type: form.change_type,
      change_date: form.change_date,
      operated_by: form.operated_by,
      reason: form.reason,
      before_data: {},
      after_data: {},
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-archive-change-logs'] })
      setShowCreate(false)
      setForm({ staff_id: '', change_type: '调岗', change_date: '', operated_by: '', reason: '' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">异动台账</h1>
        <PermissionGuard permission="hr.staff.manage">
          <Button onClick={() => setShowCreate(true)}>新增异动</Button>
        </PermissionGuard>
      </div>
      <Card>
        <div className="p-4">
          <DataTable<ChangeLogItem>
            columns={columns}
            data={listData?.data?.items ?? []}
            loading={isLoading}
            emptyText="暂无异动记录"
          />
        </div>
      </Card>
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="新增异动记录"
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
          <Input label="异动类型" value={form.change_type} onChange={(e) => setForm({ ...form, change_type: e.target.value })} />
          <Input label="异动日期" type="date" value={form.change_date} onChange={(e) => setForm({ ...form, change_date: e.target.value })} />
          <Input label="操作人" value={form.operated_by} onChange={(e) => setForm({ ...form, operated_by: e.target.value })} />
          <Input label="原因" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </div>
      </Modal>
    </div>
  )
}
