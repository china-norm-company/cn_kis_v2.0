import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { safetyApi, type AdverseEvent, type AEStats } from '@cn-kis/api-client'
import { DataTable, StatCard, Button, Tabs } from '@cn-kis/ui-kit'

const SEVERITY_LABELS: Record<string, string> = {
  mild: '轻度', moderate: '中度', severe: '重度',
}
const STATUS_LABELS: Record<string, string> = {
  reported: '已上报', under_review: '审核中', approved: '已确认',
  following: '随访中', closed: '已关闭',
}
const STATUS_COLORS: Record<string, string> = {
  reported: 'bg-yellow-100 text-yellow-800',
  under_review: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  following: 'bg-orange-100 text-orange-800',
  closed: 'bg-gray-100 text-gray-600',
}

export default function AdverseEventListPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<AdverseEvent[]>([])
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<AEStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [saeFilter, setSaeFilter] = useState<boolean | undefined>(undefined)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [listRes, statsRes] = await Promise.all([
        safetyApi.listAdverseEvents({
          status: statusFilter || undefined,
          is_sae: saeFilter,
          page,
          page_size: 20,
        }),
        safetyApi.getStats(),
      ])
      if (listRes.code === 200 && listRes.data) {
        setItems(listRes.data.items)
        setTotal(listRes.data.total)
      }
      if (statsRes.code === 200 && statsRes.data) {
        setStats(statsRes.data)
      }
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, saeFilter])

  useEffect(() => { fetchData() }, [fetchData])

  const statusTabs = [
    { key: '', label: '全部' },
    { key: 'reported', label: '已上报' },
    { key: 'under_review', label: '审核中' },
    { key: 'following', label: '随访中' },
    { key: 'closed', label: '已关闭' },
  ]

  const columns = [
    {
      key: 'id', title: 'ID', width: 80,
      render: (ae: AdverseEvent) => `AE-${String(ae.id).padStart(4, '0')}`,
    },
    { key: 'description', title: '事件描述', ellipsis: true },
    {
      key: 'severity', title: '严重程度', width: 100,
      render: (ae: AdverseEvent) => (
        <span className={ae.severity === 'severe' ? 'text-red-600 font-semibold' : ''}>
          {SEVERITY_LABELS[ae.severity] || ae.severity}
        </span>
      ),
    },
    {
      key: 'is_sae', title: 'SAE', width: 60,
      render: (ae: AdverseEvent) => ae.is_sae ? <span className="text-red-600 font-bold">SAE</span> : '-',
    },
    {
      key: 'status', title: '状态', width: 100,
      render: (ae: AdverseEvent) => (
        <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[ae.status] || ''}`}>
          {STATUS_LABELS[ae.status] || ae.status}
        </span>
      ),
    },
    { key: 'report_date', title: '上报日期', width: 120 },
    {
      key: 'actions', title: '操作', width: 80,
      render: (ae: AdverseEvent) => (
        <Button size="sm" variant="ghost" onClick={() => navigate(`/adverse-events/${ae.id}`)}>
          详情
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-5 p-4 md:space-y-6 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold md:text-2xl">不良事件管理</h1>
        <div className="flex flex-wrap gap-2">
          <Button className="min-h-11" variant="outline" onClick={() => navigate('/adverse-events/dashboard')}>
            统计仪表盘
          </Button>
          <Button
            className="min-h-11"
            variant={saeFilter === true ? 'primary' : 'outline'}
            onClick={() => setSaeFilter(saeFilter === true ? undefined : true)}
          >
            仅 SAE
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
          <StatCard title="AE 总数" value={stats.total} />
          <StatCard title="SAE 数量" value={stats.sae_count} color="red" />
          <StatCard title="未关闭" value={stats.open_count} color="orange" />
          <StatCard
            title="重度占比"
            value={stats.total > 0 ? `${Math.round(((stats.by_severity?.severe || 0) / stats.total) * 100)}%` : '0%'}
          />
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div className="min-w-[560px]">
          <Tabs
            items={statusTabs}
            activeKey={statusFilter}
            onChange={(key) => { setStatusFilter(key); setPage(1) }}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[980px]">
          <DataTable
            columns={columns}
            data={items}
            loading={loading}
            total={total}
            page={page}
            pageSize={20}
            onPageChange={setPage}
            onRowClick={(ae: AdverseEvent) => navigate(`/adverse-events/${ae.id}`)}
            emptyText="暂无不良事件记录"
          />
        </div>
      </div>
    </div>
  )
}
