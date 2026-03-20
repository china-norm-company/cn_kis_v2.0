import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import { ArrowDownRight, ArrowUpRight, RefreshCw, Clock, AlertTriangle } from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

function fmtDays(v: number | undefined) {
  return v != null ? `${v.toFixed(0)} 天` : '--'
}

function fmtMoney(v: number) {
  return `¥${(v / 10000).toFixed(1)}万`
}

export function CashFlowPage() {
  const { data: cycleRes, isLoading: cycleLoading } = useQuery({
    queryKey: ['finance', 'cashflow', 'cycle'],
    queryFn: () => api.get<any>('/finance/analytics/cashflow/cycle'),
  })

  const { data: forecastRes, isLoading: forecastLoading } = useQuery({
    queryKey: ['finance', 'cashflow', 'forecast'],
    queryFn: () => api.get<any>('/finance/analytics/cashflow/forecast'),
  })

  const { data: waterfallRes } = useQuery({
    queryKey: ['finance', 'cashflow', 'waterfall'],
    queryFn: () => api.get<any>('/finance/analytics/cashflow/waterfall'),
  })

  const { data: matchingRes } = useQuery({
    queryKey: ['finance', 'cashflow', 'ar-ap-matching'],
    queryFn: () => api.get<any>('/finance/analytics/cashflow/ar-ap-matching'),
  })

  const cycle = cycleRes?.data
  const forecast = forecastRes?.data?.forecast ?? []
  const waterfall = waterfallRes?.data?.waterfall ?? []
  const matching = matchingRes?.data ?? {}
  const matchingData = matching.matching ?? []
  const hasGap = matching.has_gap

  const latestNet = forecast.length > 0 ? forecast[forecast.length - 1]?.cumulative ?? 0 : 0
  const isHealthy = latestNet >= 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-800">现金流分析</h2>
        <p className="text-sm text-slate-500 mt-1">DSO/DPO/CCC 指标、现金流预测与应收应付配比</p>
      </div>

      {/* Cycle KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <StatCard
          title="DSO (应收周转天数)"
          value={fmtDays(cycle?.dso)}
          icon={<ArrowDownRight className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="DPO (应付周转天数)"
          value={fmtDays(cycle?.dpo)}
          icon={<ArrowUpRight className="w-5 h-5" />}
          color="amber"
        />
        <StatCard
          title="CCC (现金转换周期)"
          value={fmtDays(cycle?.ccc)}
          icon={<RefreshCw className="w-5 h-5" />}
          color={cycle?.ccc != null && cycle.ccc > 90 ? 'red' : 'green'}
        />
        <StatCard
          title="应收余额"
          value={cycle?.ar_outstanding != null ? fmtMoney(cycle.ar_outstanding) : '--'}
          icon={<ArrowDownRight className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="应付余额"
          value={cycle?.ap_outstanding != null ? fmtMoney(cycle.ap_outstanding) : '--'}
          icon={<ArrowUpRight className="w-5 h-5" />}
          color="red"
        />
      </div>

      {/* Health Alert */}
      {hasGap && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-amber-50 border-amber-200 text-amber-700">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm font-medium">
            资金缺口预警：{matching.gap_months?.join(', ')} 存在应付大于应收的情况
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Cash Flow Forecast */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">现金流预测</h3>
          {forecastLoading || cycleLoading ? (
            <div className="flex justify-center py-12 text-slate-400">加载中...</div>
          ) : forecast.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={forecast}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5, 7) + '月'} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                <Legend />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="3 3" />
                <Line type="monotone" dataKey="inflow" name="预计流入" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="outflow" name="预计流出" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="cumulative" name="累计净额" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty message="暂无现金流预测数据" />
          )}
        </div>

        {/* Waterfall Chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">现金流月度瀑布</h3>
          {waterfall.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={waterfall}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5, 7) + '月'} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="inflow" name="流入" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="outflow" name="流出" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="balance" name="余额" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty message="暂无瀑布数据" />
          )}
        </div>
      </div>

      {/* AR/AP Matching */}
      {matchingData.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">应收应付到期配比</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={matchingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} tickFormatter={(v) => v?.slice(5, 7) + '月'} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
              <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
              <Legend />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="ar_due" name="应收到期" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ap_due" name="应付到期" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
