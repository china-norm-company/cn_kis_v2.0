import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { DataTable, Empty } from '@cn-kis/ui-kit'
import { Clock } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

const BUCKET_KEYS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'] as const
const BUCKET_LABELS: Record<string, string> = {
  current: '当期',
  d1_30: '1-30天',
  d31_60: '31-60天',
  d61_90: '61-90天',
  d90_plus: '90天+',
}
const BUCKET_COLORS: Record<string, string> = {
  current: '#3b82f6',
  d1_30: '#10b981',
  d31_60: '#f59e0b',
  d61_90: '#f97316',
  d90_plus: '#ef4444',
}

function fmtMoney(v: number) {
  return `¥${(v / 10000).toFixed(2)}万`
}

export function ARAgingPage() {
  const { data: agingRes, isLoading } = useQuery({
    queryKey: ['finance', 'ar-aging'],
    queryFn: () => api.get<any>('/finance/ar-aging'),
  })

  const rawData = agingRes?.data
  const clients: any[] = rawData?.clients ?? rawData?.items ?? []

  const chartData = clients.map((c: any) => ({
    name: c.client_name || c.name || '未知',
    当期: parseFloat(c.current || 0),
    '1-30天': parseFloat(c.d1_30 || c['1_30'] || 0),
    '31-60天': parseFloat(c.d31_60 || c['31_60'] || 0),
    '61-90天': parseFloat(c.d61_90 || c['61_90'] || 0),
    '90天+': parseFloat(c.d90_plus || c['90_plus'] || 0),
  }))

  const summaryData = BUCKET_KEYS.map((key) => ({
    name: BUCKET_LABELS[key],
    value: clients.reduce((sum: number, c: any) => sum + parseFloat(c[key] || 0), 0),
  }))

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-start gap-3">
        <Clock className="w-6 h-6 text-slate-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">应收账龄分析</h2>
          <p className="text-sm text-slate-500 mt-1">按客户和账龄区间分析应收款</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-slate-400">加载中...</div>
      ) : clients.length > 0 ? (
        <>
          {/* Stacked Bar Chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">账龄分布</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="当期" stackId="aging" fill={BUCKET_COLORS.current} />
                <Bar dataKey="1-30天" stackId="aging" fill={BUCKET_COLORS.d1_30} />
                <Bar dataKey="31-60天" stackId="aging" fill={BUCKET_COLORS.d31_60} />
                <Bar dataKey="61-90天" stackId="aging" fill={BUCKET_COLORS.d61_90} />
                <Bar dataKey="90天+" stackId="aging" fill={BUCKET_COLORS.d90_plus} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Row */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {summaryData.map((d) => (
              <div key={d.name} className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                <div className="text-xs text-slate-500 mb-1">{d.name}</div>
                <div className="text-lg font-semibold text-slate-800">{fmtMoney(d.value)}</div>
              </div>
            ))}
          </div>

          {/* Detail Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">客户账龄明细</h3>
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <DataTable
                  columns={[
                    { key: 'client_name', title: '客户', render: (r: any) => r.client_name || r.name },
                    { key: 'current', title: '当期', render: (r: any) => fmtMoney(parseFloat(r.current || 0)) },
                    { key: 'd1_30', title: '1-30天', render: (r: any) => fmtMoney(parseFloat(r.d1_30 || r['1_30'] || 0)) },
                    { key: 'd31_60', title: '31-60天', render: (r: any) => fmtMoney(parseFloat(r.d31_60 || r['31_60'] || 0)) },
                    { key: 'd61_90', title: '61-90天', render: (r: any) => fmtMoney(parseFloat(r.d61_90 || r['61_90'] || 0)) },
                    { key: 'd90_plus', title: '90天+', render: (r: any) => {
                      const v = parseFloat(r.d90_plus || r['90_plus'] || 0)
                      return <span className={v > 0 ? 'text-red-600 font-medium' : ''}>{fmtMoney(v)}</span>
                    }},
                    { key: 'total', title: '合计', render: (r: any) => {
                      const total = BUCKET_KEYS.reduce((s, k) => s + parseFloat(r[k] || 0), 0)
                      return <span className="font-semibold">{fmtMoney(total)}</span>
                    }},
                  ]}
                  data={clients}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 p-12">
          <Empty message="暂无应收账龄数据" />
        </div>
      )}
    </div>
  )
}
