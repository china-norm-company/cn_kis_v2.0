import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Card, DataTable, Button, Modal, Select, type Column } from '@cn-kis/ui-kit'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { useNavigate } from 'react-router-dom'

interface ArchiveItem {
  staff_id: number
  staff_name: string
  department: string
  manager_name: string
  job_rank: string
  employment_status: string
  employment_type: string
  sync_source: string
  [key: string]: unknown
}

const statusOptions = [
  { value: 'probation', label: '试用期' },
  { value: 'active', label: '在职' },
  { value: 'leave', label: '停薪留职' },
  { value: 'exited', label: '已离职' },
]

const columns: Column<ArchiveItem>[] = [
  { key: 'staff_name', title: '员工' },
  { key: 'department', title: '部门' },
  { key: 'manager_name', title: '直属上级' },
  { key: 'job_rank', title: '职级' },
  { key: 'employment_status', title: '状态' },
  { key: 'employment_type', title: '类型' },
  { key: 'sync_source', title: '同步来源' },
]

export function ArchivePage() {
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<ArchiveItem | null>(null)
  const [employmentStatus, setEmploymentStatus] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['hr-archives', page],
    queryFn: () => api.get<{ items: ArchiveItem[]; total: number }>('/hr/archives/list', {
      params: { page, page_size: pageSize },
    }),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: { staff_id: number; employment_status: string }) =>
      api.put(`/hr/archives/${payload.staff_id}`, { employment_status: payload.employment_status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-archives'] })
      setEditing(null)
    },
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">人事档案总览</h1>
      </div>
      <Card>
        <div className="p-1">
          <DataTable<ArchiveItem>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无档案数据"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
            onRowClick={(row) => navigate(`/archives/${row.staff_id}`)}
          />
        </div>
      </Card>
      <Card>
        <div className="p-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate('/archive-changes')}>查看异动台账</Button>
          <Button variant="outline" onClick={() => navigate('/archive-exits')}>查看离职台账</Button>
          <PermissionGuard permission="hr.staff.manage">
            <Button
              onClick={() => {
                const row = items[0]
                if (!row) return
                setEditing(row)
                setEmploymentStatus(row.employment_status ?? 'active')
              }}
            >
              快速更新首条状态
            </Button>
          </PermissionGuard>
        </div>
      </Card>
      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={`更新档案状态 - ${editing?.staff_name ?? ''}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <PermissionGuard permission="hr.staff.manage">
              <Button
                loading={updateMutation.isPending}
                onClick={() => editing && updateMutation.mutate({ staff_id: editing.staff_id, employment_status: employmentStatus })}
              >
                保存
              </Button>
            </PermissionGuard>
          </>
        )}
      >
        <Select
          label="任职状态"
          value={employmentStatus}
          onChange={(e) => setEmploymentStatus(e.target.value)}
          options={statusOptions}
        />
      </Modal>
    </div>
  )
}
