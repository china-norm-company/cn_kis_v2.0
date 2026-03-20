import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { DataTable, Button, Badge, Card, Modal, Input, Select } from '@cn-kis/ui-kit'
import type { Column, BadgeVariant } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { UserPlus, Search } from 'lucide-react'

interface Subject {
  id: number
  name: string
  gender: string
  age: number | null
  phone: string
  skin_type: string
  risk_level: string
  status: string
  create_time: string
  update_time: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  screening: { label: '筛选中', variant: 'warning' },
  enrolled: { label: '已入组', variant: 'info' },
  active: { label: '进行中', variant: 'primary' },
  completed: { label: '已完成', variant: 'success' },
  withdrawn: { label: '已退出', variant: 'error' },
  disqualified: { label: '不符合', variant: 'default' },
}

const GENDER_MAP: Record<string, string> = {
  male: '男',
  female: '女',
  other: '其他',
}

const RISK_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  low: { label: '低', variant: 'success' },
  medium: { label: '中', variant: 'warning' },
  high: { label: '高', variant: 'error' },
}

export function SubjectListPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [phoneFilter, setPhoneFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', gender: '', age: '' })
  const pageSize = 10

  const { data, isLoading } = useQuery({
    queryKey: ['subjects', page, pageSize, phoneFilter, statusFilter],
    queryFn: () =>
      api.get<{ items: Subject[]; total: number; page: number; page_size: number }>(
        '/subject/list',
        {
          params: {
            page, page_size: pageSize,
            ...(phoneFilter ? { phone: phoneFilter } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
          },
        }
      ),
  })

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; phone: string; gender: string; age?: number }) =>
      api.post('/subject/create', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      setShowCreate(false)
      setForm({ name: '', phone: '', gender: '', age: '' })
    },
  })

  const subjects = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  const columns: Column<Subject>[] = [
    {
      key: 'id',
      title: 'ID',
      width: 60,
      render: (_, record) => <span className="font-mono text-sm text-slate-500">#{record.id}</span>,
    },
    { key: 'name', title: '姓名', width: 100 },
    {
      key: 'gender',
      title: '性别',
      width: 60,
      render: (_, record) => <span>{GENDER_MAP[record.gender] || '-'}</span>,
    },
    {
      key: 'age',
      title: '年龄',
      width: 60,
      render: (_, record) => <span>{record.age ?? '-'}</span>,
    },
    { key: 'phone', title: '手机号', width: 130 },
    {
      key: 'risk_level',
      title: '风险',
      width: 60,
      render: (_, record) => {
        const info = RISK_MAP[record.risk_level]
        return info ? <Badge variant={info.variant}>{info.label}</Badge> : <span>-</span>
      },
    },
    {
      key: 'status',
      title: '状态',
      width: 90,
      render: (_, record) => {
        const info = STATUS_MAP[record.status] ?? { label: record.status, variant: 'default' as BadgeVariant }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 160,
      render: (_, record) => (
        <span className="text-slate-500 text-sm">
          {new Date(record.create_time).toLocaleString('zh-CN')}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">受试者管理</h2>
          <p className="mt-1 text-sm text-slate-500">管理临床研究受试者信息</p>
        </div>
        <PermissionGuard permission="research.subject.create">
          <Button icon={<UserPlus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
            新增受试者
          </Button>
        </PermissionGuard>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="搜索手机号..."
            value={phoneFilter}
            onChange={(e) => { setPhoneFilter(e.target.value); setPage(1) }}
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          placeholder="全部状态"
          options={Object.entries(STATUS_MAP).map(([k, v]) => ({ value: k, label: v.label }))}
        />
      </div>

      <Card className="!p-0">
        <DataTable<Subject>
          columns={columns}
          data={subjects}
          loading={isLoading}
          rowKey="id"
          pagination={{ current: page, pageSize, total, onChange: setPage }}
        />
      </Card>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="新增受试者">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">姓名 *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="输入姓名" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">手机号</label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="输入手机号" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">性别</label>
              <Select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value })}
                placeholder="请选择"
                options={[
                  { value: 'male', label: '男' },
                  { value: 'female', label: '女' },
                ]}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">年龄</label>
              <Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="年龄" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button
              onClick={() => createMutation.mutate({
                name: form.name,
                phone: form.phone,
                gender: form.gender,
                ...(form.age ? { age: parseInt(form.age) } : {}),
              })}
              disabled={!form.name.trim()}
            >
              创建
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
