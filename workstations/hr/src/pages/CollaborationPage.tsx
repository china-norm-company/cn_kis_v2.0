import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Card, DataTable, Button, Modal, Input, type Column } from '@cn-kis/ui-kit'
import { PermissionGuard } from '@cn-kis/feishu-sdk'

interface SnapshotItem {
  id: number
  source_workstation: string
  data_type: string
  period: string
  sync_status: string
  create_time: string
  [key: string]: unknown
}

const columns: Column<SnapshotItem>[] = [
  { key: 'source_workstation', title: '来源工作台' },
  { key: 'data_type', title: '数据类型' },
  { key: 'period', title: '统计周期' },
  { key: 'sync_status', title: '同步状态' },
  { key: 'create_time', title: '创建时间' },
]

export function CollaborationPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    source_workstation: '',
    data_type: '',
    period: '',
    sync_status: 'pending',
  })
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['hr-collaboration-snapshots'],
    queryFn: () => api.get<{ items: SnapshotItem[]; total: number }>('/hr/collaboration/snapshots/list', {
      params: { page: 1, page_size: 30 },
    }),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/hr/collaboration/snapshots/create', {
      ...form,
      payload: {},
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-collaboration-snapshots'] })
      setShowCreate(false)
      setForm({ source_workstation: '', data_type: '', period: '', sync_status: 'pending' })
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">跨台协同治理</h1>
        <PermissionGuard permission="hr.staff.manage">
          <Button onClick={() => setShowCreate(true)}>新增协同快照</Button>
        </PermissionGuard>
      </div>
      <Card>
        <div className="p-4">
          <DataTable<SnapshotItem>
            columns={columns}
            data={data?.data?.items ?? []}
            loading={isLoading}
            emptyText="暂无协同快照"
          />
        </div>
      </Card>
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="新增协同快照"
        footer={(
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button loading={createMutation.isPending} onClick={() => createMutation.mutate()}>保存</Button>
          </>
        )}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="来源工作台" value={form.source_workstation} onChange={(e) => setForm({ ...form, source_workstation: e.target.value })} />
          <Input label="数据类型" value={form.data_type} onChange={(e) => setForm({ ...form, data_type: e.target.value })} />
          <Input label="统计周期" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
          <Input label="同步状态" value={form.sync_status} onChange={(e) => setForm({ ...form, sync_status: e.target.value })} />
        </div>
      </Modal>
    </div>
  )
}
