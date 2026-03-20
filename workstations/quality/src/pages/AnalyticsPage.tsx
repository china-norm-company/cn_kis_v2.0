import { useQuery } from '@tanstack/react-query'
import { Card, StatCard, Button, Badge } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp, AlertTriangle, ShieldCheck, BookOpen, Download,
} from 'lucide-react'

interface ManagementReviewData {
  deviation_trend: { month: string; count: number }[]
  deviation_categories: { category: string; count: number }[]
  capa_closure_rates: { month: string; total: number; closed: number; on_time: number; on_time_rate: number }[]
  deviation_recurrence: { category: string; count: number; is_recurring: boolean }[]
  sop_review: { total: number; on_track: number; overdue: number; rate: number }
  summary: {
    total_deviations: number; open_deviations: number;
    total_capas: number; closed_capas: number; effective_sops: number;
  }
}

const COLORS = ['#3b82f6', '#ef4444', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['quality-analytics'],
    queryFn: () => api.get<ManagementReviewData>('/quality/analytics/management-review'),
  })

  const review = data?.data

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">正在加载分析数据...</div>
  }

  if (!review) return null

  const { summary } = review
  const capaClosureRate = summary.total_capas > 0
    ? Math.round(summary.closed_capas / summary.total_capas * 100)
    : 100

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-slate-800 md:text-2xl">质量分析</h1>
        <Button
          className="min-h-11"
          variant="secondary"
          icon={<Download className="w-4 h-4" />}
          onClick={() => {
            const blob = new Blob([JSON.stringify(review, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `management-review-${new Date().toISOString().slice(0, 10)}.json`
            a.click()
            URL.revokeObjectURL(url)
          }}
        >
          导出管理评审数据
        </Button>
      </div>

      {/* KPI 概览 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 md:gap-4">
        <StatCard title="偏差总数" value={summary.total_deviations} icon={<AlertTriangle className="w-6 h-6" />} color="red" />
        <StatCard title="开放偏差" value={summary.open_deviations} icon={<AlertTriangle className="w-6 h-6" />} color="amber" />
        <StatCard title="CAPA 关闭率" value={`${capaClosureRate}%`} icon={<ShieldCheck className="w-6 h-6" />} color="green" />
        <StatCard title="生效 SOP" value={summary.effective_sops} icon={<BookOpen className="w-6 h-6" />} color="blue" />
        <StatCard title="SOP 审查率" value={`${review.sop_review.rate}%`} icon={<TrendingUp className="w-6 h-6" />} color="green" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        {/* 偏差月度趋势 */}
        <Card>
          <div className="p-4 md:p-5">
            <h2 className="text-base font-semibold text-slate-700 mb-4">偏差月度趋势（近12个月）</h2>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={review.deviation_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} name="偏差数" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 偏差分类占比 */}
        <Card>
          <div className="p-4 md:p-5">
            <h2 className="text-base font-semibold text-slate-700 mb-4">偏差分类分布</h2>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={review.deviation_categories}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ category, count }) => `${category}: ${count}`}
                >
                  {review.deviation_categories.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* CAPA 按时关闭率 */}
        <Card>
          <div className="p-4 md:p-5">
            <h2 className="text-base font-semibold text-slate-700 mb-4">CAPA 按时关闭率趋势</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={review.capa_closure_rates}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#94a3b8" name="总数" />
                <Bar dataKey="on_time" fill="#10b981" name="按时关闭" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* 偏差复发分析 */}
        <Card>
          <div className="p-4 md:p-5">
            <h2 className="text-base font-semibold text-slate-700 mb-4">偏差复发分析（近6个月）</h2>
            {review.deviation_recurrence.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12">未发现复发偏差</p>
            ) : (
              <div className="space-y-2">
                {review.deviation_recurrence.map((item, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${item.is_recurring ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{item.category}</p>
                      <p className="text-xs text-slate-500">{item.count} 次出现</p>
                    </div>
                    {item.is_recurring && (
                      <Badge variant="error">需关注</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* SOP 审查完成率 */}
      <Card>
        <div className="p-4 md:p-5">
          <h2 className="text-base font-semibold text-slate-700 mb-4">SOP 定期审查完成率</h2>
          <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3 sm:gap-6">
            <div>
              <p className="text-3xl font-bold text-slate-800">{review.sop_review.total}</p>
              <p className="text-sm text-slate-500">生效 SOP 总数</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-green-600">{review.sop_review.on_track}</p>
              <p className="text-sm text-slate-500">审查在期</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-red-600">{review.sop_review.overdue}</p>
              <p className="text-sm text-slate-500">审查超期</p>
            </div>
          </div>
          <div className="mt-4 w-full h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all"
              style={{ width: `${review.sop_review.rate}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 text-center mt-2">审查完成率: {review.sop_review.rate}%</p>
        </div>
      </Card>
    </div>
  )
}
