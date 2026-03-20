import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import {
  Gauge, Clock, Target, Users, TrendingUp, Percent, ArrowUp, ArrowDown,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

function fmtPct(v: number | undefined) {
  return v != null ? `${v.toFixed(1)}%` : '--'
}

function fmtDays(v: number | undefined) {
  return v != null ? `${v.toFixed(0)} 天` : '--'
}

export function EfficiencyPage() {
  const { data: opsRes, isLoading: opsLoading } = useQuery({
    queryKey: ['finance', 'efficiency', 'operational'],
    queryFn: () => api.get<any>('/finance/analytics/efficiency/operational'),
  })

  const { data: collRes, isLoading: collLoading } = useQuery({
    queryKey: ['finance', 'efficiency', 'collection'],
    queryFn: () => api.get<any>('/finance/analytics/efficiency/collection'),
  })

  const ops = opsRes?.data
  const collection = collRes?.data
  const collTrend: any[] = collection?.trend ?? collection?.items ?? []
  const isLoading = opsLoading || collLoading

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-start gap-3">
        <Gauge className="w-6 h-6 text-slate-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">运营效率</h2>
          <p className="text-sm text-slate-500 mt-1">运营效率指标与回款效率</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-slate-400">加载中...</div>
      ) : (
        <>
          {/* Operational KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
            <StatCard
              title="人均产值"
              value={ops?.revenue_per_capita ? `¥${(ops.revenue_per_capita / 10000).toFixed(1)}万` : '--'}
              icon={<Users className="w-5 h-5" />}
              color="blue"
            />
            <StatCard
              title="项目交付周期"
              value={fmtDays(ops?.avg_delivery_days)}
              icon={<Clock className="w-5 h-5" />}
              color="amber"
            />
            <StatCard
              title="项目完成率"
              value={fmtPct(ops?.project_completion_rate)}
              icon={<Target className="w-5 h-5" />}
              color="green"
            />
            <StatCard
              title="毛利率"
              value={fmtPct(ops?.gross_margin_rate)}
              icon={<Percent className="w-5 h-5" />}
              color="emerald"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            {/* Additional Efficiency Metrics */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">效率指标</h3>
              <div className="space-y-4">
                {[
                  { label: '报价转化率', value: fmtPct(ops?.quote_conversion_rate), icon: TrendingUp },
                  { label: '合同签约周期', value: fmtDays(ops?.avg_contract_cycle), icon: Clock },
                  { label: '发票处理效率', value: fmtDays(ops?.avg_invoice_processing_days), icon: Target },
                  { label: '回款周期', value: fmtDays(ops?.avg_collection_days), icon: Clock },
                  { label: '费用报销周期', value: fmtDays(ops?.avg_expense_processing_days), icon: Clock },
                ].map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-2 p-3 rounded-lg bg-slate-50 sm:flex-row sm:items-center sm:gap-3">
                    <item.icon className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-600 flex-1">{item.label}</span>
                    <span className="text-sm font-semibold text-slate-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Collection Efficiency */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">回款效率趋势</h3>
              {collTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={collTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                    <Tooltip formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
                    <Legend />
                    <Bar dataKey="collection_rate" name="回款率" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="on_time_rate" name="按时回款率" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                    <Percent className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-600 flex-1">回款率</span>
                    <span className="text-sm font-semibold text-slate-800">{fmtPct(collection?.collection_rate)}</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                    <Target className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-600 flex-1">按时回款率</span>
                    <span className="text-sm font-semibold text-slate-800">{fmtPct(collection?.on_time_rate)}</span>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-600 flex-1">平均回款天数</span>
                    <span className="text-sm font-semibold text-slate-800">{fmtDays(collection?.avg_days)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Period Comparison */}
          <PeriodComparisonSection />
        </>
      )}
    </div>
  )
}

function PeriodComparisonSection() {
  const { data: compRes } = useQuery({
    queryKey: ['finance', 'efficiency', 'comparison'],
    queryFn: () => api.get<any>('/finance/analytics/efficiency/comparison'),
  })

  const comp = compRes?.data
  if (!comp?.comparison) return null

  const labels: Record<string, string> = {
    invoiced: '开票收入', received: '回款金额', cost: '成本',
    profit: '利润', margin: '毛利率(%)', signed: '签约金额',
  }

  function ChangeArrow({ value }: { value: number | null }) {
    if (value == null) return <span className="text-slate-400">-</span>
    const up = value >= 0
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
        {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
        {Math.abs(value).toFixed(1)}%
      </span>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">同期对比分析</h3>
      <p className="text-xs text-slate-400 mb-4">
        当期: {comp.current_period?.start} ~ {comp.current_period?.end}
      </p>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
            <th className="py-2">指标</th>
            <th className="py-2 text-right">当期</th>
            <th className="py-2 text-right">上期</th>
            <th className="py-2 text-right">环比</th>
            <th className="py-2 text-right">去年同期</th>
            <th className="py-2 text-right">同比</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(comp.comparison).map(([key, val]: [string, any]) => (
            <tr key={key} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="py-2 font-medium text-slate-700">{labels[key] || key}</td>
              <td className="py-2 text-right">
                {key === 'margin' ? `${val.current}%` : `¥${Number(val.current).toLocaleString()}`}
              </td>
              <td className="py-2 text-right text-slate-500">
                {key === 'margin' ? `${val.previous}%` : `¥${Number(val.previous).toLocaleString()}`}
              </td>
              <td className="py-2 text-right"><ChangeArrow value={val.mom_change} /></td>
              <td className="py-2 text-right text-slate-500">
                {key === 'margin' ? `${val.yoy}%` : `¥${Number(val.yoy).toLocaleString()}`}
              </td>
              <td className="py-2 text-right"><ChangeArrow value={val.yoy_change} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
