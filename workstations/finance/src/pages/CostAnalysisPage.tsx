import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import { PieChart as PieChartIcon, AlertTriangle } from 'lucide-react'
import {
  PieChart, Pie, Cell, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function fmtMoney(v: number) {
  return `¥${(v / 10000).toFixed(2)}万`
}

export function CostAnalysisPage() {
  const { data: structRes, isLoading: structLoading } = useQuery({
    queryKey: ['finance', 'cost', 'structure'],
    queryFn: () => api.get<any>('/finance/analytics/cost/structure'),
  })

  const { data: trendRes, isLoading: trendLoading } = useQuery({
    queryKey: ['finance', 'cost', 'trend'],
    queryFn: () => api.get<any>('/finance/analytics/cost/trend'),
  })

  const structure = structRes?.data?.items ?? structRes?.data ?? []
  const trend = trendRes?.data?.items ?? trendRes?.data ?? []
  const isLoading = structLoading || trendLoading

  const totalCost = Array.isArray(structure) ? structure.reduce((s: number, d: any) => s + parseFloat(d.amount || d.value || 0), 0) : 0

  const trendCategories = Array.isArray(trend) && trend.length > 0
    ? Object.keys(trend[0]).filter((k) => k !== 'month' && k !== 'period')
    : []

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-start gap-3">
        <PieChartIcon className="w-6 h-6 text-slate-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">成本分析</h2>
          <p className="text-sm text-slate-500 mt-1">成本结构与趋势分析</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-slate-400">加载中...</div>
      ) : (
        <>
          {/* Cost Structure */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">成本结构</h3>
            {Array.isArray(structure) && structure.length > 0 ? (
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
                <ResponsiveContainer width="100%" height={340}>
                  <PieChart>
                    <Pie
                      data={structure}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                      labelLine={{ strokeWidth: 1 }}
                    >
                      {structure.map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-500 mb-3">总成本: <span className="font-semibold text-slate-800">{fmtMoney(totalCost)}</span></div>
                  <div className="space-y-2">
                    {structure.map((d: any, i: number) => {
                      const amt = parseFloat(d.amount || d.value || 0)
                      const pct = totalCost > 0 ? (amt / totalCost * 100).toFixed(1) : '0'
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-sm text-slate-600 flex-1">{d.category || d.name}</span>
                          <span className="text-sm font-medium text-slate-800">{fmtMoney(amt)}</span>
                          <span className="text-xs text-slate-400 w-12 text-right">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <Empty message="暂无成本结构数据" />
            )}
          </div>

          {/* Cost Trend */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">成本月度趋势</h3>
            {Array.isArray(trend) && trend.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5, 7) + '月'} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                  <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                  <Bar dataKey="amount" name="成本" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty message="暂无成本趋势数据" />
            )}
          </div>

          {/* Cost Benchmark */}
          <CostBenchmarkSection />
        </>
      )}
    </div>
  )
}

function CostBenchmarkSection() {
  const { data: benchRes } = useQuery({
    queryKey: ['finance', 'cost', 'benchmark'],
    queryFn: () => api.get<any>('/finance/analytics/cost/benchmark'),
  })

  const bench = benchRes?.data ?? {}
  const projects = bench.projects ?? []

  if (projects.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">成本基准对标</h3>
      <p className="text-xs text-slate-400 mb-4">
        基准均值: {fmtMoney(bench.benchmark_mean ?? 0)} | 标准差: {fmtMoney(bench.benchmark_stdev ?? 0)} | 异常项目: {bench.anomaly_count ?? 0}
      </p>
      <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
            <th className="py-2">项目</th>
            <th className="py-2 text-right">总成本</th>
            <th className="py-2 text-right">合同额</th>
            <th className="py-2 text-right">毛利率</th>
            <th className="py-2 text-right">偏差度</th>
            <th className="py-2 text-center">状态</th>
          </tr>
        </thead>
        <tbody>
          {projects.slice(0, 20).map((p: any, i: number) => (
            <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
              <td className="py-2 font-medium text-slate-700">{p.project_name}</td>
              <td className="py-2 text-right">{fmtMoney(p.total_cost)}</td>
              <td className="py-2 text-right">{fmtMoney(p.contract_amount)}</td>
              <td className="py-2 text-right">{p.gross_margin}%</td>
              <td className="py-2 text-right">{p.deviation}σ</td>
              <td className="py-2 text-center">
                {p.is_anomaly ? (
                  <Badge variant="error">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />异常
                  </Badge>
                ) : (
                  <Badge variant="success">正常</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}
