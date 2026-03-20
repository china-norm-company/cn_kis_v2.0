import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { DataTable, Button, Badge, Card, Modal, Input } from '@cn-kis/ui-kit'
import type { Column, BadgeVariant } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Upload, Plus, Search } from 'lucide-react'

interface Protocol {
  id: number
  title: string
  code: string
  file_path: string
  status: string
  efficacy_type: string
  sample_size: number | null
  create_time: string
  update_time: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: '草稿', variant: 'default' },
  uploaded: { label: '已上传', variant: 'info' },
  parsing: { label: '解析中', variant: 'warning' },
  parsed: { label: '已解析', variant: 'primary' },
  active: { label: '生效中', variant: 'success' },
  archived: { label: '已归档', variant: 'default' },
}

const EFFICACY_MAP: Record<string, string> = {
  superiority: '优效性',
  non_inferiority: '非劣效性',
  equivalence: '等效性',
  bioequivalence: '生物等效性',
  other: '其他',
}

export function ProtocolListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [titleFilter, setTitleFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCode, setNewCode] = useState('')
  const pageSize = 10

  const { data, isLoading } = useQuery({
    queryKey: ['protocols', page, pageSize, titleFilter],
    queryFn: () =>
      api.get<{ items: Protocol[]; total: number; page: number; page_size: number }>(
        '/protocol/list',
        { params: { page, page_size: pageSize, ...(titleFilter ? { title: titleFilter } : {}) } }
      ),
  })

  const createMutation = useMutation({
    mutationFn: (payload: { title: string; code: string }) =>
      api.post('/protocol/create', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['protocols'] })
      setShowCreate(false)
      setNewTitle('')
      setNewCode('')
    },
  })

  // api.get() 已返回 res.data，即后端 body：{ code, msg, data: { items, total, ... } }，列表在 data
  const payload = (data as { data?: { items?: Protocol[]; total?: number } } | undefined)?.data
  const protocols = payload?.items ?? []
  const total = payload?.total ?? 0

  const columns: Column<Protocol>[] = [
    {
      key: 'code',
      title: '编号',
      width: 150,
      render: (_, record) => (
        <span className="font-mono text-sm text-slate-600">{record.code || '-'}</span>
      ),
    },
    {
      key: 'title',
      title: '标题',
      render: (_, record) => (
        <span className="font-medium text-slate-800 hover:text-primary-600 cursor-pointer">
          {record.title}
        </span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (_, record) => {
        const info = STATUS_MAP[record.status] ?? { label: record.status, variant: 'default' as BadgeVariant }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
    },
    {
      key: 'efficacy_type',
      title: '功效类型',
      width: 120,
      render: (_, record) => (
        <span>{EFFICACY_MAP[record.efficacy_type] || record.efficacy_type || '-'}</span>
      ),
    },
    {
      key: 'sample_size',
      title: '样本量',
      width: 80,
      render: (_, record) => <span>{record.sample_size ?? '-'}</span>,
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 170,
      render: (_, record) => (
        <span className="text-slate-500 text-sm">
          {record.create_time ? new Date(record.create_time).toLocaleString('zh-CN') : '-'}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">协议管理</h2>
          <p className="mt-1 text-sm text-slate-500">
            管理临床研究协议，上传并解析协议文档
          </p>
        </div>
        <PermissionGuard permission="research.protocol.create">
          <div className="flex items-center gap-3">
            <Button variant="secondary" icon={<Upload className="w-4 h-4" />}>
              协议上传
            </Button>
            <Button icon={<Plus className="w-4 h-4" />} onClick={() => setShowCreate(true)}>
              新建协议
            </Button>
          </div>
        </PermissionGuard>
      </div>

      {/* 搜索栏 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder="搜索协议标题..."
            value={titleFilter}
            onChange={(e) => { setTitleFilter(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      {/* 数据表格 */}
      <Card className="!p-0">
        <DataTable<Protocol>
          columns={columns}
          data={protocols}
          loading={isLoading}
          rowKey="id"
          onRowClick={(record) => navigate(`/protocols/${record.id}`)}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
          }}
        />
      </Card>

      {/* 新建协议弹窗 */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="新建协议"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">协议标题 *</label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="输入协议标题"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">协议编号</label>
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              placeholder="输入协议编号（可选）"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>取消</Button>
            <Button
              onClick={() => createMutation.mutate({ title: newTitle, code: newCode })}
              disabled={!newTitle.trim()}
            >
              创建
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
