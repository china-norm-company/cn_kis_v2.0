import { useQuery } from '@tanstack/react-query'
import { Card, StatCard, DataTable, type Column } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { Target, TrendingUp, DollarSign, Percent } from 'lucide-react'

const STAGE_LABELS: Record<string, string> = {
  initial_contact: '初步接触',
  requirement: '需求确认',
  quotation: '报价中',
  negotiation: '谈判中',
  contract: '签约中',
  won: '已成交',
  lost: '已流失',
}

interface StageRow {
  stage: string
  label: string
  count: number
  total_value: number
}

export function SalesReportPage() {
  const { data } = useQuery({
    queryKey: ['crm', 'opportunities', 'stats'],
    queryFn: () =>
      api.get<{
        total: number
        by_stage: Record<string, number>
        total_estimated_amount: number
        total_won_amount: number
      }>('/crm/opportunities/stats'),
  })

  const total = data?.data?.total ?? 0
  const wonAmount = data?.data?.total_won_amount ?? 0
  const pipelineValue = data?.data?.total_estimated_amount ?? 0
  const byStage = data?.data?.by_stage ?? {}

  const avgWinRate = total > 0 && byStage.won != null
    ? ((byStage.won / total) * 100).toFixed(1)
    : '0'

  const stageRows: StageRow[] = Object.entries(byStage).map(([stage, count]) => ({
    stage,
    label: STAGE_LABELS[stage] ?? stage,
    count: count ?? 0,
    total_value: 0,
  }))

  const columns: Column<StageRow>[] = [
    { key: 'label', title: '阶段' },
    { key: 'count', title: '数量', align: 'right' },
    {
      key: 'total_value',
      title: '阶段价值',
      align: 'right',
      render: (_, r) => {
        if (r.stage === 'won') return `¥${Number(wonAmount).toLocaleString()}`
        return '-'
      },
    },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">销售统计</h1>

      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="总商机数"
          value={total}
          icon={<Target className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="成交金额"
          value={`¥${Number(wonAmount).toLocaleString()}`}
          icon={<DollarSign className="w-5 h-5" />}
          color="green"
        />
        <StatCard
          title="管道价值"
          value={`¥${Number(pipelineValue).toLocaleString()}`}
          icon={<TrendingUp className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          title="平均成交率"
          value={`${avgWinRate}%`}
          icon={<Percent className="w-5 h-5" />}
          color="purple"
        />
      </div>

      <Card title="阶段转化" className="p-5">
        <DataTable<StageRow>
          columns={columns}
          data={stageRows}
          emptyText="暂无数据"
        />
      </Card>
    </div>
  )
}
