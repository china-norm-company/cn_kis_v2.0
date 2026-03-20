import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import { BarChart3, TrendingUp, Banknote, Percent } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function fmtMoney(v: number) {
  return `¥${(v / 10000).toFixed(2)}万`
}

export function RevenueAnalysisPage() {
  const { data: pipelineRes, isLoading: pipeLoading } = useQuery({
    queryKey: ['finance', 'revenue', 'pipeline'],
    queryFn: () => api.get<any>('/finance/analytics/revenue/pipeline'),
  })

  const { data: trendRes, isLoading: trendLoading } = useQuery({
    queryKey: ['finance', 'revenue', 'trend'],
    queryFn: () => api.get<any>('/finance/analytics/revenue/trend'),
  })

  const { data: concRes, isLoading: concLoading } = useQuery({
    queryKey: ['finance', 'revenue', 'concentration'],
    queryFn: () => api.get<any>('/finance/analytics/revenue/concentration'),
  })

  const { data: recogRes } = useQuery({
    queryKey: ['finance', 'revenue', 'recognition'],
    queryFn: () => api.get<any>('/finance/analytics/revenue/recognition'),
  })

  const { data: forecastRes } = useQuery({
    queryKey: ['finance', 'revenue', 'forecast'],
    queryFn: () => api.get<any>('/finance/analytics/revenue/forecast'),
  })

  const pipelineData = pipelineRes?.data ?? {}
  const pipeline = [
    { stage: '签约金额', amount: pipelineData.total_contracted ?? 0 },
    { stage: '协商中', amount: pipelineData.pipeline_negotiating ?? 0 },
    { stage: '已开票', amount: pipelineData.total_invoiced ?? 0 },
    { stage: '已回款', amount: pipelineData.total_received ?? 0 },
  ]
  const trend = trendRes?.data?.trend ?? []
  const concentration = concRes?.data?.items ?? []
  const recognition = recogRes?.data ?? {}
  const forecast = forecastRes?.data?.forecast ?? []
  const isLoading = pipeLoading || trendLoading || concLoading

  const maxPipeline = Array.isArray(pipeline) ? Math.max(...pipeline.map((s: any) => parseFloat(s.amount || s.value || 0)), 1) : 1

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-start gap-3">
        <BarChart3 className="w-6 h-6 text-slate-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">收入分析</h2>
          <p className="text-sm text-slate-500 mt-1">收入管线、趋势与集中度分析</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-slate-400">加载中...</div>
      ) : (
        <>
          {/* Revenue Pipeline (funnel-style horizontal bars) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">收入管线</h3>
            {Array.isArray(pipeline) && pipeline.length > 0 ? (
              <div className="space-y-3">
                {pipeline.map((stage: any, idx: number) => {
                  const amount = parseFloat(stage.amount || stage.value || 0)
                  const pct = (amount / maxPipeline) * 100
                  return (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="w-28 text-sm text-slate-600 text-right shrink-0">{stage.stage || stage.name}</div>
                      <div className="flex-1 bg-slate-100 rounded-full h-8 overflow-hidden">
                        <div
                          className="h-full rounded-full flex items-center px-3 text-xs font-medium text-white"
                          style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        >
                          {fmtMoney(amount)}
                        </div>
                      </div>
                      <div className="w-16 text-xs text-slate-500 shrink-0">{stage.count || '--'} 笔</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <Empty message="暂无管线数据" />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            {/* Revenue Trend */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">收入趋势</h3>
              {Array.isArray(trend) && trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                    <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="收入" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="invoiced" name="已开票" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <Empty message="暂无趋势数据" />
              )}
            </div>

            {/* Concentration Pie */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">收入集中度</h3>
              {Array.isArray(concentration) && concentration.length > 0 ? (
                <div className="flex flex-col gap-4 lg:flex-row">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={concentration}
                        dataKey="amount"
                        nameKey="client_name"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={{ strokeWidth: 1 }}
                      >
                        {concentration.map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 overflow-auto">
                    <table className="w-full min-w-[360px] text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                          <th className="py-2">客户</th>
                          <th className="py-2 text-right">金额</th>
                          <th className="py-2 text-right">占比</th>
                        </tr>
                      </thead>
                      <tbody>
                        {concentration.map((c: any, i: number) => (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="py-2 flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                              {c.client_name || c.name}
                            </td>
                            <td className="py-2 text-right font-medium">{fmtMoney(parseFloat(c.amount || 0))}</td>
                            <td className="py-2 text-right text-slate-500">{c.percentage || '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <Empty message="暂无集中度数据" />
              )}
            </div>
          </div>

          {/* Revenue Recognition Progress */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">收入确认进度</h3>
            {recognition.total_contract_amount ? (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4 mb-4">
                  <StatCard title="合同总额" value={fmtMoney(recognition.total_contract_amount)} icon={<Banknote className="w-5 h-5" />} color="blue" />
                  <StatCard title="已确认" value={fmtMoney(recognition.total_invoiced)} icon={<TrendingUp className="w-5 h-5" />} color="green" />
                  <StatCard title="已回款" value={fmtMoney(recognition.total_received)} icon={<Banknote className="w-5 h-5" />} color="emerald" />
                  <StatCard title="确认率" value={`${recognition.recognition_rate}%`} icon={<Percent className="w-5 h-5" />} color="blue" />
                </div>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                      <th className="py-2">项目</th>
                      <th className="py-2">客户</th>
                      <th className="py-2 text-right">合同额</th>
                      <th className="py-2 text-right">已开票</th>
                      <th className="py-2 text-right">已回款</th>
                      <th className="py-2">开票进度</th>
                      <th className="py-2">回款进度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recognition.projects ?? []).slice(0, 20).map((p: any, i: number) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 font-medium text-slate-700 truncate max-w-[150px]">{p.project}</td>
                        <td className="py-2 text-slate-500 truncate max-w-[100px]">{p.client}</td>
                        <td className="py-2 text-right">{fmtMoney(p.contract_amount)}</td>
                        <td className="py-2 text-right">{fmtMoney(p.invoiced)}</td>
                        <td className="py-2 text-right">{fmtMoney(p.received)}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-2">
                              <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(p.invoice_progress, 100)}%` }} />
                            </div>
                            <span className="text-xs text-slate-500 w-10">{p.invoice_progress}%</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-2">
                              <div className="bg-green-500 h-2 rounded-full" style={{ width: `${Math.min(p.collection_progress, 100)}%` }} />
                            </div>
                            <span className="text-xs text-slate-500 w-10">{p.collection_progress}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </>
            ) : (
              <Empty message="暂无收入确认数据" />
            )}
          </div>

          {/* Revenue Forecast */}
          {forecast.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">收入预测（基于回款计划）</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={forecast}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5, 7) + '月'} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                  <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                  <Bar dataKey="expected" name="预期回款" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}
