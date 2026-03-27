import { useQuery } from '@tanstack/react-query'
import { Card, DataTable, Badge, StatCard, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { PermissionGuard } from '@cn-kis/feishu-sdk'
import { TrendingUp, Plus, Calendar, CalendarRange, ClipboardList, FolderKanban, BadgeCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CreateOpportunityModal } from '../components/CreateOpportunityModal'
import { SearchableSelect, type SearchableOption } from '../components/SearchableSelect'
import { SearchableMultiSelect } from '../components/SearchableMultiSelect'
import {
  FALLBACK_BUSINESS_SEGMENTS,
  FALLBACK_RESEARCH_GROUPS,
} from '../constants/opportunityFormFallback'
import { displayOwnerName } from '../utils/displayOwnerName'

/** 与下拉最长选项匹配，略留余量，单行不换行 */
const RESEARCH_GROUP_COL_CH =
  Math.max(6, ...FALLBACK_RESEARCH_GROUPS.map((s) => [...s].length), 1) + 1

interface Opportunity {
  id: number
  code?: string
  title: string
  demand_name?: string
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

interface ClientRow {
  id: number
  name: string
}

interface OwnerRow {
  id: number
  display_name: string
  username?: string
}

interface OppFormMeta {
  research_groups?: string[]
  business_segments?: string[]
}

/** 列表仅展示五类销售阶段；非五类历史数据列中显示「其他」 */
const stageMap: Record<string, { label: string; variant: 'default' | 'info' | 'primary' | 'warning' | 'success' | 'error' }> = {
  lead: { label: '线索', variant: 'default' },
  deal: { label: '商机', variant: 'info' },
  won: { label: '赢单', variant: 'success' },
  cancelled: { label: '取消', variant: 'warning' },
  lost: { label: '输单', variant: 'error' },
}

const actionBtnCls =
  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
const actionBtnPrimaryCls =
  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700'

const filterLabelCls = 'mb-1 block text-xs font-medium text-slate-600'

const chipBtnBase =
  'inline-flex min-w-[7.25rem] flex-1 basis-[calc(50%-0.375rem)] items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors sm:min-w-[8.5rem] sm:basis-auto sm:flex-initial md:min-w-[9.5rem]'
const chipBtnOn = 'border-blue-500 bg-blue-50 text-blue-800'
const chipBtnOff = 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'

/** 顶部阶段快捷筛选：与统计数量一致（仅这五类 + 全部） */
const TOP_STAGE_CHIPS: { key: string; label: string }[] = [
  { key: 'lead', label: '线索' },
  { key: 'deal', label: '商机' },
  { key: 'won', label: '赢单' },
  { key: 'cancelled', label: '取消' },
  { key: 'lost', label: '输单' },
]

interface OpportunityStatsData {
  by_stage: Record<string, number>
  total: number
  reserve_amount: number
  pipeline_value: number
  stats_year: number
  stats_next_year: number
  sales_current_year: number
  sales_next_year: number
}

/** 卡片金额：元 → 以「万」为单位展示 */
function fmtMoneyWan(n: number) {
  if (!Number.isFinite(n)) return '—'
  const w = n / 10000
  if (w === 0) return '¥0万'
  const s = w.toFixed(2).replace(/\.?0+$/, '')
  return `¥${s}万`
}

function OpportunityStatsCards({
  stats,
  loading,
  filteredStats,
  filteredLoading,
  showFiltered,
}: {
  stats?: OpportunityStatsData
  loading: boolean
  filteredStats?: OpportunityStatsData
  filteredLoading?: boolean
  showFiltered?: boolean
}) {
  const reserve = stats?.reserve_amount ?? stats?.pipeline_value ?? 0
  const y = stats?.stats_year ?? new Date().getFullYear()
  const ny = stats?.stats_next_year ?? y + 1
  const scy = stats?.sales_current_year ?? 0
  const sny = stats?.sales_next_year ?? 0

  const fr = filteredStats?.reserve_amount ?? filteredStats?.pipeline_value ?? 0
  const fscy = filteredStats?.sales_current_year ?? 0
  const fsny = filteredStats?.sales_next_year ?? 0
  const fl = filteredLoading ?? false

  const sideReserve = showFiltered ? (fl ? '—' : fmtMoneyWan(fr)) : undefined
  const sideCy = showFiltered ? (fl ? '—' : fmtMoneyWan(fscy)) : undefined
  const sideNy = showFiltered ? (fl ? '—' : fmtMoneyWan(fsny)) : undefined

  const bs = stats?.by_stage ?? {}
  const fbs = filteredStats?.by_stage ?? {}
  const nLead = bs.lead ?? 0
  const nDeal = bs.deal ?? 0
  const nWon = bs.won ?? 0
  const fnLead = fbs.lead ?? 0
  const fnDeal = fbs.deal ?? 0
  const fnWon = fbs.won ?? 0

  const sideUnquoted = showFiltered ? (fl ? '—' : String(fnLead)) : undefined
  const sideUnproj = showFiltered ? (fl ? '—' : String(fnDeal)) : undefined
  const sidePreorder = showFiltered ? (fl ? '—' : String(fnWon)) : undefined

  return (
    <div className="grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-3">
      <StatCard
        title="储备商机"
        value={loading ? '—' : fmtMoneyWan(reserve)}
        sideLabel={showFiltered ? '当前筛选' : undefined}
        sideValue={sideReserve}
        icon={<TrendingUp className="h-5 w-5 md:h-6 md:w-6" />}
        color="purple"
        className="!p-3 md:!p-4"
      />
      <StatCard
        title={`本年销售额（${y}年）`}
        value={loading ? '—' : fmtMoneyWan(scy)}
        sideLabel={showFiltered ? '当前筛选' : undefined}
        sideValue={sideCy}
        icon={<Calendar className="h-5 w-5 md:h-6 md:w-6" />}
        color="emerald"
        className="!p-3 md:!p-4"
      />
      <StatCard
        title={`跨年销售额（${ny}年）`}
        value={loading ? '—' : fmtMoneyWan(sny)}
        sideLabel={showFiltered ? '当前筛选' : undefined}
        sideValue={sideNy}
        icon={<CalendarRange className="h-5 w-5 md:h-6 md:w-6" />}
        color="teal"
        className="!p-3 md:!p-4"
      />
      <StatCard
        title="未报价"
        value={loading ? '—' : nLead}
        sideLabel={showFiltered ? '当前筛选' : undefined}
        sideValue={sideUnquoted}
        icon={<ClipboardList className="h-5 w-5 md:h-6 md:w-6" />}
        color="amber"
        className="!p-3 md:!p-4"
      />
      <StatCard
        title="未立项"
        value={loading ? '—' : nDeal}
        sideLabel={showFiltered ? '当前筛选' : undefined}
        sideValue={sideUnproj}
        icon={<FolderKanban className="h-5 w-5 md:h-6 md:w-6" />}
        color="orange"
        className="!p-3 md:!p-4"
      />
      <StatCard
        title="预订单"
        value={loading ? '—' : nWon}
        sideLabel={showFiltered ? '当前筛选' : undefined}
        sideValue={sidePreorder}
        icon={<BadgeCheck className="h-5 w-5 md:h-6 md:w-6" />}
        color="indigo"
        className="!p-3 md:!p-4"
      />
    </div>
  )
}

export function OpportunityListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const editFrom = location.pathname + location.search
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [showCreate, setShowCreate] = useState(false)

  /** 顶部阶段多选；空表示全部商机 */
  const [selectedChipStages, setSelectedChipStages] = useState<string[]>([])
  const [filterClientId, setFilterClientId] = useState('')
  const [filterResearchGroups, setFilterResearchGroups] = useState<string[]>([])
  const [filterBusinessSegments, setFilterBusinessSegments] = useState<string[]>([])
  const [filterOwnerId, setFilterOwnerId] = useState('')
  const [filterKeyOpportunity, setFilterKeyOpportunity] = useState('')

  const { data: meta } = useQuery({
    queryKey: ['crm-opp-form-meta'],
    queryFn: async () => {
      const res = await api.get<OppFormMeta>('/crm/opportunities/form-meta')
      return res.data
    },
  })

  const { data: clientPayload } = useQuery({
    queryKey: ['opportunity-list-clients'],
    queryFn: async () => {
      const res = await api.get<{ items: ClientRow[] }>('/crm/clients/list', {
        params: { page: 1, page_size: 500 },
      })
      return res.data
    },
  })

  const { data: ownerPayload } = useQuery({
    queryKey: ['opportunity-list-owners'],
    queryFn: async () => {
      const res = await api.get<{ items: OwnerRow[] }>('/crm/opportunities/owner-candidates', {
        params: { limit: 200, q: '' },
      })
      return res.data
    },
  })

  const researchGroups = useMemo(
    () => (meta?.research_groups?.length ? meta.research_groups : FALLBACK_RESEARCH_GROUPS),
    [meta?.research_groups],
  )
  const businessSegments = useMemo(
    () => (meta?.business_segments?.length ? meta.business_segments : FALLBACK_BUSINESS_SEGMENTS),
    [meta?.business_segments],
  )

  const clientFilterOptions: SearchableOption[] = useMemo(
    () => [
      { id: '', label: '全部客户' },
      ...(clientPayload?.items ?? []).map((c) => ({ id: c.id, label: c.name })),
    ],
    [clientPayload?.items],
  )

  const researchGroupFilterOptions: SearchableOption[] = useMemo(
    () => researchGroups.map((g) => ({ id: g, label: g })),
    [researchGroups],
  )

  const businessSegmentFilterOptions: SearchableOption[] = useMemo(
    () => businessSegments.map((g) => ({ id: g, label: g })),
    [businessSegments],
  )

  const ownerFilterOptions: SearchableOption[] = useMemo(
    () => [
      { id: '', label: '全部' },
      ...(ownerPayload?.items ?? []).map((a) => ({
        id: a.id,
        label: displayOwnerName(a.display_name || ''),
      })),
    ],
    [ownerPayload?.items],
  )

  const keyOpportunityFilterOptions: SearchableOption[] = useMemo(
    () => [
      { id: '', label: '全部' },
      { id: 'yes', label: '是' },
      { id: 'no', label: '否' },
    ],
    [],
  )

  const listParams = useMemo(() => {
    const p: Record<string, string | number> = { page, page_size: pageSize }
    if (selectedChipStages.length > 0) p.stages = selectedChipStages.join(',')
    if (filterClientId) p.client_id = Number(filterClientId)
    if (filterResearchGroups.length > 0) p.research_groups = filterResearchGroups.join(',')
    if (filterBusinessSegments.length > 0) p.business_segments = filterBusinessSegments.join(',')
    if (filterOwnerId) p.owner_id = Number(filterOwnerId)
    if (filterKeyOpportunity) p.key_opportunity = filterKeyOpportunity
    return p
  }, [
    page,
    pageSize,
    selectedChipStages,
    filterClientId,
    filterResearchGroups,
    filterBusinessSegments,
    filterOwnerId,
    filterKeyOpportunity,
  ])

  const { data, isLoading } = useQuery({
    queryKey: ['opportunities', listParams],
    queryFn: () =>
      api.get<{ items: Opportunity[]; total: number }>('/crm/opportunities/list', {
        params: listParams,
      }),
  })

  /** 下方筛选（不含顶部阶段），用于阶段旁数量统计 */
  const chipCountBaseParams = useMemo(() => {
    const p: Record<string, string | number> = {}
    if (filterClientId) p.client_id = Number(filterClientId)
    if (filterResearchGroups.length > 0) p.research_groups = filterResearchGroups.join(',')
    if (filterBusinessSegments.length > 0) p.business_segments = filterBusinessSegments.join(',')
    if (filterOwnerId) p.owner_id = Number(filterOwnerId)
    if (filterKeyOpportunity) p.key_opportunity = filterKeyOpportunity
    return p
  }, [
    filterClientId,
    filterResearchGroups,
    filterBusinessSegments,
    filterOwnerId,
    filterKeyOpportunity,
  ])

  const statsFilterParams = useMemo(() => {
    const p: Record<string, string | number> = { ...chipCountBaseParams }
    if (selectedChipStages.length > 0) p.stages = selectedChipStages.join(',')
    return p
  }, [chipCountBaseParams, selectedChipStages])

  const hasActiveFilters = useMemo(() => Object.keys(statsFilterParams).length > 0, [statsFilterParams])

  const { data: chipBarStatsRes, isLoading: chipBarStatsLoading } = useQuery({
    queryKey: ['opportunity-stats', 'chip-bar', chipCountBaseParams],
    queryFn: () =>
      api.get<OpportunityStatsData>('/crm/opportunities/stats', {
        params: chipCountBaseParams,
      }),
  })

  const { data: globalStatsRes, isLoading: globalStatsLoading } = useQuery({
    queryKey: ['opportunity-stats', 'global'],
    queryFn: () => api.get<OpportunityStatsData>('/crm/opportunities/stats'),
  })

  const { data: filteredStatsRes, isLoading: filteredStatsLoading } = useQuery({
    queryKey: ['opportunity-stats', 'filtered', statsFilterParams],
    queryFn: () =>
      api.get<OpportunityStatsData>('/crm/opportunities/stats', { params: statsFilterParams }),
    enabled: hasActiveFilters,
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  const bumpPageReset = () => setPage(1)

  const columns: Column<Opportunity>[] = useMemo(
    () => [
      {
        key: 'code',
        title: '商机编号',
        width: 120,
        minWidth: 120,
        sticky: 'left',
        headerAlign: 'center',
        cellClassName: 'whitespace-nowrap',
        render: (_, row) => (row.code ? String(row.code) : '—'),
      },
      {
        key: 'demand_name',
        title: '商机名称',
        width: '20ch',
        minWidth: '20ch',
        headerAlign: 'center',
        render: (_, row) => {
          const d = row.demand_name
          if (d != null && String(d).trim() !== '') return String(d)
          return row.title ? String(row.title) : '—'
        },
      },
      {
        key: 'client_name',
        title: '客户',
        minWidth: '15ch',
        width: '15ch',
        headerAlign: 'center',
      },
      {
        key: 'business_segment',
        title: '业务板块',
        width: 110,
        headerAlign: 'center',
        render: (_, row) => (row.business_segment ? String(row.business_segment) : '—'),
      },
      {
        key: 'stage',
        title: '商机阶段',
        width: 100,
        headerAlign: 'center',
        render: (val, row) => {
          const s = val ?? row.stage
          const info = stageMap[String(s)]
          const label = info?.label ?? '其他'
          const variant = info?.variant ?? 'default'
          return <Badge variant={variant}>{label}</Badge>
        },
      },
      {
        key: 'research_group',
        title: '研究组',
        width: `${RESEARCH_GROUP_COL_CH}ch`,
        minWidth: `${RESEARCH_GROUP_COL_CH}ch`,
        headerAlign: 'center',
        cellClassName: 'whitespace-nowrap',
        render: (_, row) => (row.research_group ? String(row.research_group) : '—'),
      },
      {
        key: 'estimated_amount',
        title: '预估金额',
        width: 120,
        align: 'right',
        headerAlign: 'center',
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
        headerAlign: 'center',
        render: (_, row) => {
          const v = row.sales_amount_total
          return v != null && String(v).trim() !== '' ? `¥${Number(v).toLocaleString()}` : '—'
        },
      },
      {
        key: 'owner',
        title: '商务负责人',
        width: 110,
        headerAlign: 'center',
        render: (_, row) => {
          const name = row.commercial_owner_name || row.owner
          return name ? displayOwnerName(String(name)) : '—'
        },
      },
      {
        key: 'actions',
        title: '操作',
        width: 88,
        minWidth: 88,
        sticky: 'right',
        align: 'center',
        headerAlign: 'center',
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

      <OpportunityStatsCards
        stats={globalStatsRes?.data}
        loading={globalStatsLoading}
        filteredStats={filteredStatsRes?.data}
        filteredLoading={filteredStatsLoading}
        showFiltered={hasActiveFilters}
      />

      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedChipStages([])
                  bumpPageReset()
                }}
                className={`${chipBtnBase} ${selectedChipStages.length === 0 ? chipBtnOn : chipBtnOff}`}
              >
                全部商机
                <span className="tabular-nums text-slate-500">
                  ({chipBarStatsLoading ? '—' : chipBarStatsRes?.data?.total ?? 0})
                </span>
              </button>
              {TOP_STAGE_CHIPS.map(({ key, label }) => {
                const n = chipBarStatsRes?.data?.by_stage?.[key] ?? 0
                const active = selectedChipStages.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedChipStages((prev) => {
                        if (prev.includes(key)) return prev.filter((k) => k !== key)
                        return [...prev, key]
                      })
                      bumpPageReset()
                    }}
                    className={`${chipBtnBase} ${active ? chipBtnOn : chipBtnOff}`}
                  >
                    {label}
                    <span className="tabular-nums text-slate-500">
                      ({chipBarStatsLoading ? '—' : n})
                    </span>
                  </button>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedChipStages([])
                setFilterClientId('')
                setFilterResearchGroups([])
                setFilterBusinessSegments([])
                setFilterOwnerId('')
                setFilterKeyOpportunity('')
                bumpPageReset()
              }}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              清除所有筛选
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
          <div className="min-w-[160px] flex-1 sm:min-w-[180px]">
            <span className={filterLabelCls}>客户</span>
            <SearchableSelect
              value={filterClientId}
              onChange={(v) => {
                setFilterClientId(v)
                bumpPageReset()
              }}
              options={clientFilterOptions}
              placeholder="全部客户"
              emptyHint="暂无客户"
              searchable
              searchPlaceholder="输入关键字筛选客户…"
            />
          </div>
          <div className="min-w-[180px] flex-1 sm:min-w-[220px]">
            <span className={filterLabelCls}>小组</span>
            <SearchableMultiSelect
              value={filterResearchGroups}
              onChange={(v) => {
                setFilterResearchGroups(v)
                bumpPageReset()
              }}
              options={researchGroupFilterOptions}
              placeholder="全部"
              emptyHint="暂无选项"
              searchable={false}
            />
          </div>
          <div className="min-w-[180px] flex-1 sm:min-w-[220px]">
            <span className={filterLabelCls}>业务板块</span>
            <SearchableMultiSelect
              value={filterBusinessSegments}
              onChange={(v) => {
                setFilterBusinessSegments(v)
                bumpPageReset()
              }}
              options={businessSegmentFilterOptions}
              placeholder="全部"
              emptyHint="暂无选项"
              searchable={false}
            />
          </div>
          <div className="min-w-[160px] flex-1 sm:min-w-[200px]">
            <span className={filterLabelCls}>商务负责人</span>
            <SearchableSelect
              value={filterOwnerId}
              onChange={(v) => {
                setFilterOwnerId(v)
                bumpPageReset()
              }}
              options={ownerFilterOptions}
              placeholder="全部"
              emptyHint="暂无账号"
              searchable
              searchPlaceholder="输入关键字筛选负责人…"
            />
          </div>
          <div className="min-w-[120px] flex-1 sm:min-w-[140px]">
            <span className={filterLabelCls}>重点商机</span>
            <SearchableSelect
              value={filterKeyOpportunity}
              onChange={(v) => {
                setFilterKeyOpportunity(v)
                bumpPageReset()
              }}
              options={keyOpportunityFilterOptions}
              placeholder="全部"
              searchable={false}
              clearable={false}
            />
          </div>
        </div>
      </div>
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
