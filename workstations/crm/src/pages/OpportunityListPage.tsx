import { useQuery } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { Target, TrendingUp, Clock, CheckCircle, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CreateOpportunityModal } from '../components/CreateOpportunityModal'
import { FALLBACK_RESEARCH_GROUPS } from '../constants/opportunityFormFallback'
import { opportunityStageLabel } from '../constants/opportunityStages'

/** 与下拉最长选项匹配，略留余量，单行不换行 */
const RESEARCH_GROUP_COL_CH =
  Math.max(6, ...FALLBACK_RESEARCH_GROUPS.map((s) => [...s].length), 1) + 1

interface Opportunity {
  id: number
  code?: string
  title: string
  client_name: string
  client_id: number
  stage: string
  estimated_amount: string
  sales_amount_total?: string
  probability: number
  owner: string
  commercial_owner_name?: string
  business_segment?: string
  research_group?: string
  expected_close_date: string
  create_time: string
  [key: string]: unknown
}

const stageMap: Record<string, { label: string; variant: 'default' | 'info' | 'primary' | 'warning' | 'success' | 'error' }> = {
  lead: { label: '线索', variant: 'default' },
  deal: { label: '商机', variant: 'info' },
  contact: { label: '接洽中', variant: 'info' },
  evaluation: { label: '需求评估', variant: 'info' },
  proposal: { label: '方案提交', variant: 'primary' },
  negotiation: { label: '商务谈判', variant: 'warning' },
  won: { label: '赢单', variant: 'success' },
  cancelled: { label: '取消', variant: 'warning' },
  lost: { label: '输单', variant: 'error' },
}

const actionBtnCls =
  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
const actionBtnPrimaryCls =
  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700'

export function OpportunityListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const editFrom = location.pathname + location.search
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)
  const [filterStage, setFilterStage] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities', page, pageSize, filterStage],
    queryFn: () =>
      api.get<{ items: Opportunity[]; total: number }>('/crm/opportunities/list', {
        params: { page, page_size: pageSize, ...(filterStage ? { stage: filterStage } : {}) },
      }),
  })

  const { data: statsData } = useQuery({
    queryKey: ['opportunity-stats'],
    queryFn: () =>
      api.get<{ by_stage: Record<string, number>; total: number; pipeline_value: number }>(
        '/crm/opportunities/stats'
      ),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0
  const stats = statsData?.data?.by_stage ?? {}
  const pipelineValue = statsData?.data?.pipeline_value ?? 0

  const columns: Column<Opportunity>[] = useMemo(
    () => [
      {
        key: 'code',
        title: '商机编号',
        width: 120,
        minWidth: 120,
        className: 'whitespace-nowrap',
        render: (_, row) => (row.code ? String(row.code) : '—'),
      },
      { key: 'title', title: '商机名称', width: 320, minWidth: 320 },
      {
        key: 'client_name',
        title: '客户',
        minWidth: '15ch',
        width: '15ch',
      },
      {
        key: 'business_segment',
        title: '业务板块',
        width: 110,
        render: (_, row) => (row.business_segment ? String(row.business_segment) : '—'),
      },
      {
        key: 'stage',
        title: '商机阶段',
        width: 100,
        render: (val, row) => {
          const s = val ?? row.stage
          const info = stageMap[String(s)]
          const label = info?.label ?? opportunityStageLabel(String(s))
          const variant = info?.variant ?? 'default'
          return <Badge variant={variant}>{label}</Badge>
        },
      },
      {
        key: 'research_group',
        title: '研究组',
        width: `${RESEARCH_GROUP_COL_CH}ch`,
        minWidth: `${RESEARCH_GROUP_COL_CH}ch`,
        className: 'whitespace-nowrap',
        render: (_, row) => (row.research_group ? String(row.research_group) : '—'),
      },
      {
        key: 'estimated_amount',
        title: '预估金额',
        width: 120,
        align: 'right',
        render: (val, row) => {
          const raw = val ?? row.estimated_amount
          if (raw === '' || raw == null) return '—'
          const n = Number(raw)
          return Number.isNaN(n) ? '—' : `¥${n.toLocaleString()}`
        },
      },
      {
        key: 'sales_amount_total',
        title: '销售额',
        width: 120,
        align: 'right',
        render: (_, row) => {
          const v = row.sales_amount_total
          return v != null && String(v).trim() !== '' ? `¥${Number(v).toLocaleString()}` : '—'
        },
      },
      {
        key: 'owner',
        title: '商务负责人',
        width: 110,
        render: (_, row) => {
          const name = row.commercial_owner_name || row.owner
          return name ? String(name) : '—'
        },
      },
      {
        key: 'actions',
        title: '操作',
        width: 88,
        minWidth: 88,
        align: 'center',
        render: (_, row) => (
          <div className="flex flex-col items-center justify-center gap-1.5">
            <button
              type="button"
              className={actionBtnCls}
              onClick={() => navigate(`/opportunities/${row.id}`, { state: { from: editFrom } })}
            >
              查看
            </button>
            <PermissionGuard permission="crm.opportunity.update">
              <button
                type="button"
                className={actionBtnPrimaryCls}
                onClick={() => navigate(`/opportunities/${row.id}/edit`, { state: { from: editFrom } })}
              >
                编辑
              </button>
            </PermissionGuard>
          </div>
        ),
      },
    ],
    [navigate, editFrom],
  )

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-bold text-slate-800 md:text-2xl">商机跟踪</h1>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> 新建商机
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="商机总数" value={statsData?.data?.total ?? 0} icon={<Target className="h-6 w-6" />} />
        <StatCard title="管道价值" value={`¥${(pipelineValue / 10000).toFixed(0)}万`} icon={<TrendingUp className="h-6 w-6" />} />
        <StatCard title="谈判中" value={(stats.negotiation ?? 0) + (stats.proposal ?? 0)} icon={<Clock className="h-6 w-6" />} />
        <StatCard title="已成交" value={stats.won ?? 0} icon={<CheckCircle className="h-6 w-6" />} />
      </div>

      <div className="flex items-center gap-3 overflow-x-auto rounded-lg border border-slate-200 bg-white p-3">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <select
          value={filterStage}
          onChange={(e) => {
            setFilterStage(e.target.value)
            setPage(1)
          }}
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          title="筛选商机阶段"
        >
          <option value="">全部阶段</option>
          {Object.entries(stageMap).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <Card>
        <div className="p-1">
          <DataTable<Opportunity>
            columns={columns}
            data={items}
            loading={isLoading}
            emptyText="暂无商机数据"
            pagination={{ current: page, pageSize, total, onChange: setPage }}
          />
        </div>
      </Card>

      {showCreate && <CreateOpportunityModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
