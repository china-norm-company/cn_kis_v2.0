import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts'
import type { WorkTimeSummaryItem, CapacityForecast } from '@cn-kis/api-client'

interface WorktimeBarChartProps {
  summaries: WorkTimeSummaryItem[]
}

export function WorktimeBarChart({ summaries }: WorktimeBarChartProps) {
  const data = summaries.map(s => ({
    name: s.staff_name,
    工单: Number(s.workorder_hours),
    培训: Number(s.training_hours),
    其他: Number(s.other_hours),
    total: Number(s.total_hours),
  }))

  if (data.length === 0) {
    return <div className="text-center text-slate-400 py-8">暂无工时数据</div>
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4" data-chart="worktime-bar">
      <h4 className="text-sm font-medium text-slate-700 mb-3">团队工时分布</h4>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} label={{ value: '工时(h)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="工单" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
          <Bar dataKey="培训" stackId="a" fill="#3b82f6" />
          <Bar dataKey="其他" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

interface UtilizationTrendProps {
  data: Array<{ week: string; rate: number }>
}

export function UtilizationTrendChart({ data }: UtilizationTrendProps) {
  const chartData = data.map(d => ({
    week: d.week,
    利用率: Math.round(d.rate * 100),
  }))

  if (chartData.length === 0) {
    return <div className="text-center text-slate-400 py-8">暂无利用率趋势数据</div>
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4" data-chart="utilization-trend">
      <h4 className="text-sm font-medium text-slate-700 mb-3">利用率趋势（近8周）</h4>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="week" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} label={{ value: '%', position: 'insideLeft', style: { fontSize: 12 } }} />
          <Tooltip formatter={(value: number) => [`${value}%`, '利用率']} />
          <Line type="monotone" dataKey="利用率" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

interface CapacityCompareChartProps {
  forecast: CapacityForecast | undefined
}

export function CapacityCompareChart({ forecast }: CapacityCompareChartProps) {
  const data = forecast?.weeks?.map(w => ({
    week: w.week_start.slice(5),
    可用: w.available_hours,
    需求: w.projected_demand,
    缺口: w.gap > 0 ? w.gap : 0,
  })) ?? []

  if (data.length === 0) {
    return <div className="text-center text-slate-400 py-8">暂无产能预测数据</div>
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4" data-chart="capacity-compare">
      <h4 className="text-sm font-medium text-slate-700 mb-3">产能需求 vs 可用对比</h4>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="week" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} label={{ value: '工时(h)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="可用" fill="#22c55e" radius={[4, 4, 0, 0]} />
          <Bar dataKey="需求" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          <Bar dataKey="缺口" fill="#ef4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
