import { useQuery } from '@tanstack/react-query'
import { Card, DataTable, Badge, Button, Select, type Column } from '@cn-kis/ui-kit'
import { safetyApi, type AdverseEvent } from '@cn-kis/api-client'
import { Activity, Filter } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const severityMap: Record<string, { label: string; variant: 'default' | 'info' | 'warning' | 'error' }> = {
  mild: { label: '轻微', variant: 'info' },
  moderate: { label: '中度', variant: 'default' },
  severe: { label: '严重', variant: 'warning' },
  very_severe: { label: '非常严重', variant: 'error' },
}

const statusMap: Record<string, { label: string; variant: 'default' | 'primary' | 'warning' | 'success' | 'error' | 'info' }> = {
  reported: { label: '已上报', variant: 'info' },
  under_review: { label: '审核中', variant: 'warning' },
  approved: { label: '已确认', variant: 'primary' },
  following: { label: '随访中', variant: 'primary' },
  closed: { label: '已关闭', variant: 'success' },
}

const relationMap: Record<string, string> = {
  unrelated: '无关',
  possible: '可能有关',
  probable: '很可能有关',
  certain: '肯定有关',
}

const statusFilterOptions = [
  { value: '', label: '全部状态' },
  { value: 'reported', label: '已上报' },
  { value: 'under_review', label: '审核中' },
  { value: 'approved', label: '已确认' },
  { value: 'following', label: '随访中' },
  { value: 'closed', label: '已关闭' },
]

const dash = (v: unknown) => {
  const s = v == null ? '' : String(v).trim()
  return s || '—'
}

const baseColumns: Column<AdverseEvent>[] = [
  { key: 'id', title: 'ID', width: 72 },
  { key: 'project_code', title: '项目编号', width: 110, render: (_, row) => dash((row as AdverseEvent).project_code) },
  { key: 'project_name', title: '项目名称', width: 160, render: (_, row) => dash((row as AdverseEvent).project_name) },
  { key: 'subject_name', title: '受试者姓名', width: 100, render: (_, row) => dash((row as AdverseEvent).subject_name) },
  { key: 'sc_number', title: 'SC号', width: 80, render: (_, row) => dash((row as AdverseEvent).sc_number) },
  { key: 'rd_number', title: 'RD号', width: 80, render: (_, row) => dash((row as AdverseEvent).rd_number) },
  { key: 'enrollment_id', title: '入组ID', width: 88 },
  {
    key: 'severity',
    title: '严重程度',
    width: 100,
    render: (val) => {
      const info = severityMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : String(val)
    },
  },
  {
    key: 'status',
    title: '状态',
    width: 96,
    render: (val) => {
      const info = statusMap[val as string]
      return info ? <Badge variant={info.variant}>{info.label}</Badge> : String(val)
    },
  },
  {
    key: 'is_sae',
    title: 'SAE',
    width: 64,
    render: (v) => (v ? <Badge variant="error">是</Badge> : <span className="text-slate-400">否</span>),
  },
  {
    key: 'relation',
    title: '因果关系',
    width: 100,
    render: (val) => relationMap[val as string] || String(val),
  },
  { key: 'start_date', title: '发生日期', width: 112 },
  { key: 'report_date', title: '上报日期', width: 112 },
  { key: 'description', title: '描述' },
]

export function AdverseEventListPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showFilters, setShowFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['quality-ae-list', page, pageSize, statusFilter],
    queryFn: () =>
      safetyApi.listAdverseEvents({
        page,
        page_size: pageSize,
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  const columns: Column<AdverseEvent>[] = baseColumns.map((col) =>
    col.key === 'id'
      ? {
          ...col,
          render: (val: unknown, row: unknown) => {
            const ae = row as AdverseEvent
            return (
              <button
                type="button"
                className="text-primary-600 hover:underline font-medium"
                onClick={() => navigate(`/adverse-events/${ae.id}`)}
              >
                {String(val)}
              </button>
            )
          },
        }
      : col,
  )

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-7 h-7 text-amber-600" />
          <h1 className="text-xl font-bold text-slate-800 md:text-2xl">不良反应上报跟踪</h1>
        </div>
      </div>

      <Card title="说明">
        <p className="text-sm text-slate-600">
          列表数据来自受试者小程序上报及安全管理模块；可与入组 ID 关联项目侧数据核对。详情含随访记录。
        </p>
      </Card>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={showFilters ? 'primary' : 'ghost'}
            size="sm"
            className="min-h-10"
            title="筛选"
            icon={<Filter className="w-3 h-3" />}
            onClick={() => setShowFilters((v) => !v)}
          >
            筛选
          </Button>
        </div>
        {showFilters && (
          <Card className="p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[160px]">
                <label className="text-xs text-slate-500 mb-1 block">状态</label>
                <Select
                  value={statusFilter}
                  className="min-h-11"
                  onChange={(e) => {
                    setStatusFilter(e.target.value)
                    setPage(1)
                  }}
                  options={statusFilterOptions}
                />
              </div>
            </div>
          </Card>
        )}
      </div>

      <Card title={`记录（共 ${total} 条）`}>
        <DataTable<AdverseEvent>
          columns={columns}
          data={items}
          loading={isLoading}
          emptyText="暂无不良反应记录"
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: setPage,
          }}
        />
      </Card>
    </div>
  )
}
