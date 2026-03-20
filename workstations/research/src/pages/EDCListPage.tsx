import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable, Button, Badge, Card, Tabs } from '@cn-kis/ui-kit'
import type { Column, BadgeVariant, TabItem } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { Database, FileSpreadsheet } from 'lucide-react'

interface CRFTemplate {
  id: number
  name: string
  version: string
  schema: Record<string, unknown>
  description: string
  is_active: boolean
  create_time: string
  [key: string]: unknown
}

interface CRFRecord {
  id: number
  template_id: number
  work_order_id: number
  data: Record<string, unknown>
  status: string
  submitted_at: string | null
  create_time: string
  update_time: string
  [key: string]: unknown
}

const RECORD_STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: '草稿', variant: 'default' },
  submitted: { label: '已提交', variant: 'info' },
  verified: { label: '已核实', variant: 'success' },
  queried: { label: '已质疑', variant: 'warning' },
  locked: { label: '已锁定', variant: 'primary' },
}

const tabItems: TabItem[] = [
  { key: 'templates', label: 'CRF 模板' },
  { key: 'records', label: 'CRF 记录' },
]

export function EDCListPage() {
  const [activeTab, setActiveTab] = useState('templates')
  const [page, setPage] = useState(1)
  const pageSize = 10

  // CRF 模板列表
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['crf-templates', page, pageSize],
    queryFn: () =>
      api.get<{ items: CRFTemplate[]; total: number; page: number; page_size: number }>(
        '/edc/templates',
        { params: { page, page_size: pageSize } }
      ),
    enabled: activeTab === 'templates',
  })

  // CRF 记录列表
  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ['crf-records', page, pageSize],
    queryFn: () =>
      api.get<{ items: CRFRecord[]; total: number; page: number; page_size: number }>(
        '/edc/records',
        { params: { page, page_size: pageSize } }
      ),
    enabled: activeTab === 'records',
  })

  const templates = templatesData?.data?.items ?? []
  const records = recordsData?.data?.items ?? []
  const totalTemplates = templatesData?.data?.total ?? 0
  const totalRecords = recordsData?.data?.total ?? 0

  const templateColumns: Column<CRFTemplate>[] = [
    { key: 'name', title: '模板名称' },
    {
      key: 'version',
      title: '版本',
      width: 80,
      render: (_, r) => <span className="font-mono text-sm">v{r.version}</span>,
    },
    {
      key: 'is_active',
      title: '状态',
      width: 80,
      render: (_, r) => (
        <Badge variant={r.is_active ? 'success' : 'default'}>
          {r.is_active ? '生效' : '停用'}
        </Badge>
      ),
    },
    {
      key: 'schema',
      title: '字段数',
      width: 80,
      render: (_, r) => {
        const fields = r.schema?.properties ? Object.keys(r.schema.properties as Record<string, unknown>).length : 0
        return <span className="text-slate-600">{fields} 个</span>
      },
    },
    { key: 'description', title: '描述', render: (_, r) => <span className="text-slate-500 text-sm">{r.description || '-'}</span> },
    {
      key: 'create_time',
      title: '创建时间',
      width: 160,
      render: (_, r) => <span className="text-slate-500 text-sm">{new Date(r.create_time).toLocaleString('zh-CN')}</span>,
    },
  ]

  const recordColumns: Column<CRFRecord>[] = [
    {
      key: 'id',
      title: 'ID',
      width: 60,
      render: (_, r) => <span className="font-mono text-sm">#{r.id}</span>,
    },
    {
      key: 'template_id',
      title: '模板 ID',
      width: 90,
      render: (_, r) => <span className="font-mono text-sm">#{r.template_id}</span>,
    },
    {
      key: 'work_order_id',
      title: '工单 ID',
      width: 90,
      render: (_, r) => <span className="font-mono text-sm">WO#{r.work_order_id}</span>,
    },
    {
      key: 'status',
      title: '状态',
      width: 90,
      render: (_, r) => {
        const info = RECORD_STATUS_MAP[r.status] ?? { label: r.status, variant: 'default' as BadgeVariant }
        return <Badge variant={info.variant}>{info.label}</Badge>
      },
    },
    {
      key: 'submitted_at',
      title: '提交时间',
      width: 160,
      render: (_, r) => (
        <span className="text-slate-500 text-sm">
          {r.submitted_at ? new Date(r.submitted_at).toLocaleString('zh-CN') : '-'}
        </span>
      ),
    },
    {
      key: 'create_time',
      title: '创建时间',
      width: 160,
      render: (_, r) => <span className="text-slate-500 text-sm">{new Date(r.create_time).toLocaleString('zh-CN')}</span>,
    },
  ]

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">数据采集 (EDC)</h2>
          <p className="mt-1 text-sm text-slate-500">电子数据采集系统，管理 CRF 模板与数据录入</p>
        </div>
      </div>

      <Tabs items={tabItems} activeKey={activeTab} onChange={handleTabChange} />

      {activeTab === 'templates' && (
        <Card className="!p-0">
          <DataTable<CRFTemplate>
            columns={templateColumns}
            data={templates}
            loading={templatesLoading}
            rowKey="id"
            pagination={{ current: page, pageSize, total: totalTemplates, onChange: setPage }}
          />
        </Card>
      )}

      {activeTab === 'records' && (
        <Card className="!p-0">
          <DataTable<CRFRecord>
            columns={recordColumns}
            data={records}
            loading={recordsLoading}
            rowKey="id"
            pagination={{ current: page, pageSize, total: totalRecords, onChange: setPage }}
          />
        </Card>
      )}
    </div>
  )
}
