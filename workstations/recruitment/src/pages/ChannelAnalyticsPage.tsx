import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { recruitmentApi } from '@cn-kis/api-client'
import { ErrorAlert } from '../components/ErrorAlert'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
const channelTypeLabels: Record<string, string> = { online: '线上', offline: '线下', referral: '转介', social_media: '社交媒体' }

interface ChannelItem {
  id: number; name: string; channel_type: string
  plan_id: number; plan_title: string
  registered_count: number; screened_count: number; enrolled_count: number
  screening_rate: number; enrollment_rate: number; overall_rate: number
  cost: string
}

export default function ChannelAnalyticsPage() {
  const [filterType, setFilterType] = useState<string>('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['recruitment', 'channel-analytics'],
    queryFn: async () => {
      const res = await recruitmentApi.getChannelAnalytics()
      return res?.data?.items ?? []
    },
  })

  const allChannels: ChannelItem[] = data ?? []
  const channels = filterType ? allChannels.filter((c) => c.channel_type === filterType) : allChannels

  const typeDistribution = Object.entries(
    allChannels.reduce<Record<string, number>>((acc, ch) => {
      const type = channelTypeLabels[ch.channel_type] || ch.channel_type
      acc[type] = (acc[type] || 0) + ch.enrolled_count
      return acc
    }, {}),
  ).map(([name, value]) => ({ name, value }))

  const barData = channels.map((ch) => ({
    name: ch.name.length > 8 ? ch.name.slice(0, 8) + '...' : ch.name,
    fullName: ch.name,
    报名: ch.registered_count,
    筛选: ch.screened_count,
    入组: ch.enrolled_count,
  }))

  const uniqueTypes = [...new Set(allChannels.map((c) => c.channel_type))]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">渠道效果分析</h2>
          <p className="text-sm text-slate-500 mt-1">跨计划维度的渠道效果对比，帮助优化投放策略</p>
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          title="渠道类型筛选"
        >
          <option value="">全部类型</option>
          {uniqueTypes.map((t) => <option key={t} value={t}>{channelTypeLabels[t] || t}</option>)}
        </select>
      </div>

      {error && <ErrorAlert message={(error as Error).message} onRetry={() => refetch()} />}

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="h-64 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
        </div>
      ) : channels.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-sm text-slate-400">
          暂无渠道数据，请先在招募计划中添加渠道
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <SummaryCard label="总渠道数" value={channels.length} color="text-blue-600" />
            <SummaryCard label="总报名数" value={channels.reduce((s, c) => s + c.registered_count, 0)} color="text-sky-600" />
            <SummaryCard label="总入组数" value={channels.reduce((s, c) => s + c.enrolled_count, 0)} color="text-emerald-600" />
            <SummaryCard
              label="平均转化率"
              value={`${channels.length > 0 ? (channels.reduce((s, c) => s + c.overall_rate, 0) / channels.length).toFixed(1) : 0}%`}
              color="text-violet-600"
              isText
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">渠道转化对比</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} barGap={2}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''} />
                  <Bar dataKey="报名" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="筛选" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="入组" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">入组来源分布</h3>
              {typeDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={typeDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {typeDistribution.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm text-slate-400 py-12 text-center">暂无数据</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-700">渠道明细</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">渠道名称</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">类型</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">所属计划</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">报名</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">筛选</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">入组</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">筛选率</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">入组率</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">总转化</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">成本</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch) => (
                  <tr key={ch.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-700 font-medium">{ch.name}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{channelTypeLabels[ch.channel_type] || ch.channel_type}</span></td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{ch.plan_title || '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{ch.registered_count}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{ch.screened_count}</td>
                    <td className="px-4 py-3 text-right text-emerald-600 font-medium">{ch.enrolled_count}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{ch.screening_rate}%</td>
                    <td className="px-4 py-3 text-right text-slate-600">{ch.enrollment_rate}%</td>
                    <td className="px-4 py-3 text-right font-medium text-violet-600">{ch.overall_rate}%</td>
                    <td className="px-4 py-3 text-right text-slate-500">¥{ch.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color, isText }: { label: string; value: number | string; color: string; isText?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{isText ? value : value}</p>
    </div>
  )
}
