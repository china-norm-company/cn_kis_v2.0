import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import { Banknote, TrendingUp, TrendingDown, Percent, AlertTriangle } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine, ScatterChart, Scatter,
  ZAxis,
} from 'recharts'

const COLORS = { green: '#10b981', red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6' }

function fmtWan(v: number) {
  return `¥${(v / 10000).toFixed(1)}万`
}

export function ProfitAnalysisPage() {
  const [selectedProtocol, setSelectedProtocol] = useState<number | null>(null)
  const [tab, setTab] = useState<'project' | 'ranking' | 'client' | 'contribution'>('ranking')

  const { data: protocolsRes } = useQuery({
    queryKey: ['protocols-for-profit'],
    queryFn: () => api.get<any>('/protocol/list', { params: { page: 1, page_size: 100 } }),
  })

  const { data: rankingRes } = useQuery({
    queryKey: ['finance', 'profit', 'ranking'],
    queryFn: () => api.get<any>('/finance/analytics/profit/ranking'),
  })

  const { data: clientRes } = useQuery({
    queryKey: ['finance', 'profit', 'by-client'],
    queryFn: () => api.get<any>('/finance/analytics/profit/by-client'),
  })

  const { data: cmRes } = useQuery({
    queryKey: ['finance', 'profit', 'contribution'],
    queryFn: () => api.get<any>('/finance/analytics/profit/contribution'),
  })

  const { data: estRes } = useQuery({
    queryKey: ['finance', 'profit', 'estimate-accuracy'],
    queryFn: () => api.get<any>('/finance/analytics/profit/estimate-accuracy'),
  })

  const protocols = protocolsRes?.data?.items ?? []
  const ranking = rankingRes?.data ?? {}
  const clientData = clientRes?.data ?? {}
  const cmData = cmRes?.data ?? {}
  const estData = estRes?.data ?? {}

  const profitMutation = useMutation({
    mutationFn: (protocolId: number) =>
      api.post<any>(`/finance/profit-analysis/generate/${protocolId}`, {}),
  })

  const handleGenerate = () => {
    if (selectedProtocol) profitMutation.mutate(selectedProtocol)
  }

  const profit = profitMutation.data?.data

  const tabs = [
    { key: 'ranking', label: '项目排行' },
    { key: 'client', label: '客户分析' },
    { key: 'contribution', label: '贡献边际' },
    { key: 'project', label: '单项目分析' },
  ] as const

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">盈利分析</h2>
        <p className="text-sm text-slate-500 mt-1">项目排行、客户盈利、贡献边际与估算准确度</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
        <StatCard
          title="平均毛利率"
          value={ranking.average_margin != null ? `${ranking.average_margin}%` : '--'}
          icon={<Percent className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="亏损项目"
          value={ranking.loss_count ?? 0}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="red"
          footer={<span className="text-xs text-slate-400">毛利率 &lt; 0%</span>}
        />
        <StatCard
          title="低毛利项目"
          value={ranking.low_margin_count ?? 0}
          icon={<TrendingDown className="w-5 h-5" />}
          color="amber"
          footer={<span className="text-xs text-slate-400">毛利率 &lt; 15%</span>}
        />
        <StatCard
          title="估算准确率"
          value={estData.total_projects ? `${((estData.accurate_count ?? 0) / estData.total_projects * 100).toFixed(0)}%` : '--'}
          icon={<TrendingUp className="w-5 h-5" />}
          color="green"
          footer={<span className="text-xs text-slate-400">偏差 ≤5% 的项目</span>}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex overflow-x-auto border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`shrink-0 min-h-11 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'ranking' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">项目毛利率排行</h3>
          {(ranking.rankings ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(300, (ranking.rankings?.length ?? 0) * 32)}>
              <BarChart data={ranking.rankings} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="project" tick={{ fontSize: 10 }} width={120} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <ReferenceLine x={ranking.average_margin} stroke="#94a3b8" strokeDasharray="5 5" label="平均" />
                <ReferenceLine x={15} stroke="#f59e0b" strokeDasharray="3 3" label="预警线" />
                <Bar dataKey="gross_margin" name="毛利率" radius={[0, 4, 4, 0]}>
                  {(ranking.rankings ?? []).map((r: any, i: number) => (
                    <Cell key={i} fill={r.is_loss ? COLORS.red : r.gross_margin < 15 ? COLORS.amber : COLORS.green} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty message="暂无排行数据" />
          )}
        </div>
      )}

      {tab === 'client' && (
        <div className="space-y-6">
          {/* Client Scatter (Value Matrix) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">客户价值矩阵</h3>
            {(clientData.clients ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <ScatterChart margin={{ bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" dataKey="revenue" name="收入" tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`}
                    label={{ value: '收入规模', position: 'insideBottom', offset: -10, fontSize: 11 }}
                  />
                  <YAxis type="number" dataKey="margin" name="毛利率" tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                    label={{ value: '毛利率', angle: -90, position: 'insideLeft', fontSize: 11 }}
                  />
                  <ZAxis type="number" dataKey="project_count" range={[40, 200]} name="项目数" />
                  <Tooltip
                    formatter={(v: number, name: string) =>
                      name === '收入' ? fmtWan(v) : name === '毛利率' ? `${v}%` : v
                    }
                    labelFormatter={() => ''}
                    content={({ payload }) => {
                      if (!payload?.length) return null
                      const d = payload[0]?.payload
                      return (
                        <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-lg text-sm">
                          <div className="font-semibold text-slate-700">{d?.client}</div>
                          <div>收入: {fmtWan(d?.revenue)}</div>
                          <div>毛利率: {d?.margin}%</div>
                          <div>项目数: {d?.project_count}</div>
                        </div>
                      )
                    }}
                  />
                  <Scatter data={clientData.clients} fill="#3b82f6" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <Empty message="暂无客户数据" />
            )}
          </div>

          {/* Client Detail Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">客户盈利明细</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="py-2">客户</th>
                  <th className="py-2 text-right">收入</th>
                  <th className="py-2 text-right">成本</th>
                  <th className="py-2 text-right">毛利</th>
                  <th className="py-2 text-right">毛利率</th>
                  <th className="py-2 text-right">项目数</th>
                </tr>
              </thead>
              <tbody>
                {(clientData.clients ?? []).map((c: any, i: number) => (
                  <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-2 font-medium text-slate-700">{c.client}</td>
                    <td className="py-2 text-right">{fmtWan(c.revenue)}</td>
                    <td className="py-2 text-right">{fmtWan(c.cost)}</td>
                    <td className="py-2 text-right font-medium" style={{ color: c.profit >= 0 ? COLORS.green : COLORS.red }}>
                      {fmtWan(c.profit)}
                    </td>
                    <td className="py-2 text-right">
                      <Badge variant={c.margin < 0 ? 'error' : c.margin < 15 ? 'warning' : 'success'}>
                        {c.margin}%
                      </Badge>
                    </td>
                    <td className="py-2 text-right text-slate-500">{c.project_count}</td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'contribution' && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">贡献边际分析</h3>
          {cmData.summary && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4 mb-6">
              <StatCard title="总收入" value={fmtWan(cmData.summary.total_revenue)} icon={<Banknote className="w-5 h-5" />} color="blue" />
              <StatCard title="直接成本" value={fmtWan(cmData.summary.total_direct_cost)} icon={<TrendingDown className="w-5 h-5" />} color="red" />
              <StatCard title="贡献边际" value={fmtWan(cmData.summary.total_contribution)} icon={<TrendingUp className="w-5 h-5" />} color="green" />
              <StatCard title="边际率" value={`${cmData.summary.overall_cm_rate}%`} icon={<Percent className="w-5 h-5" />} color="emerald" />
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="py-2">项目</th>
                <th className="py-2 text-right">收入</th>
                <th className="py-2 text-right">直接成本</th>
                <th className="py-2 text-right">贡献边际</th>
                <th className="py-2 text-right">边际率</th>
                <th className="py-2 text-right">净利润</th>
              </tr>
            </thead>
            <tbody>
              {(cmData.projects ?? []).map((p: any, i: number) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-2 font-medium text-slate-700">{p.project}</td>
                  <td className="py-2 text-right">{fmtWan(p.revenue)}</td>
                  <td className="py-2 text-right">{fmtWan(p.direct_cost)}</td>
                  <td className="py-2 text-right font-medium text-green-600">{fmtWan(p.contribution_margin)}</td>
                  <td className="py-2 text-right">{p.cm_rate}%</td>
                  <td className="py-2 text-right" style={{ color: p.net_profit >= 0 ? COLORS.green : COLORS.red }}>
                    {fmtWan(p.net_profit)}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'project' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={selectedProtocol ?? ''}
                onChange={(e) => setSelectedProtocol(Number(e.target.value) || null)}
                className="flex-1 min-h-11 px-4 py-2.5 border border-slate-200 rounded-lg text-sm"
                title="选择项目"
              >
                <option value="">选择项目...</option>
                {protocols.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.title} ({p.code || p.id})</option>
                ))}
              </select>
              <button
                onClick={handleGenerate}
                disabled={!selectedProtocol || profitMutation.isPending}
                className="min-h-11 px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {profitMutation.isPending ? '分析中...' : '生成分析'}
              </button>
            </div>
          </div>

          {profit ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
              <StatCard title="合同金额" value={`¥${profit.contract_amount}`} icon={<Banknote className="w-5 h-5" />} color="blue" />
              <StatCard title="总成本" value={`¥${profit.total_cost}`} icon={<TrendingDown className="w-5 h-5" />} color="red" />
              <StatCard title="毛利润" value={`¥${profit.gross_profit}`} icon={<TrendingUp className="w-5 h-5" />} color="green" />
              <StatCard title="毛利率" value={`${profit.gross_margin}%`} icon={<Percent className="w-5 h-5" />} color="emerald" />
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-12">
              <Empty message='选择项目并点击「生成分析」' />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
