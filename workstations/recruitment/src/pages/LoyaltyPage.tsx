import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { loyaltyApi } from '@cn-kis/api-client'
import type { LoyaltyScore } from '@cn-kis/api-client'
import { ErrorAlert } from '../components/ErrorAlert'

type Tab = 'ranking' | 'risk' | 'referrals'

const riskLabels: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险' }
const riskColors: Record<string, string> = { low: 'bg-emerald-100 text-emerald-700', medium: 'bg-amber-100 text-amber-700', high: 'bg-red-100 text-red-700' }

export default function LoyaltyPage() {
  const [activeTab, setActiveTab] = useState<Tab>('ranking')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'ranking', label: '忠诚度排行' },
    { key: 'risk', label: '流失预警' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">受试者忠诚度</h2>
        <p className="text-sm text-slate-500 mt-1">评分排行、流失风险预警、推荐关系管理</p>
      </div>
      <div className="border-b border-slate-200">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`pb-2 text-sm font-medium transition-colors border-b-2 ${activeTab === tab.key ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab.label}</button>
          ))}
        </div>
      </div>
      {activeTab === 'ranking' && <RankingTab />}
      {activeTab === 'risk' && <RiskTab />}
    </div>
  )
}

function RankingTab() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['loyalty', 'ranking'],
    queryFn: () => loyaltyApi.getRanking(50),
  })

  const items: LoyaltyScore[] = data?.data?.items ?? []

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {error && <div className="p-4"><ErrorAlert message="加载失败" onRetry={() => refetch()} /></div>}
      {isLoading ? (
        <div className="p-4 space-y-3">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-400 py-12 text-center">暂无忠诚度数据</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 font-medium text-slate-600">排名</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">受试者ID</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">总评分</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">参与数</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">完成数</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">依从性</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">最后活跃</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">风险</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s, idx) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-500 font-medium">#{idx + 1}</td>
                <td className="px-4 py-3 text-emerald-600 font-medium">#{s.subject_id}</td>
                <td className="px-4 py-3 text-slate-700 font-bold">{s.total_score}</td>
                <td className="px-4 py-3 text-slate-600">{s.participation_count}</td>
                <td className="px-4 py-3 text-slate-600">{s.completion_count}</td>
                <td className="px-4 py-3 text-slate-600">{s.compliance_avg}%</td>
                <td className="px-4 py-3 text-slate-500">{s.last_activity_date || '-'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${riskColors[s.risk_level] || 'bg-slate-100'}`}>{riskLabels[s.risk_level] || s.risk_level}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function RiskTab() {
  const [riskFilter, setRiskFilter] = useState('')

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['loyalty', 'risk', riskFilter],
    queryFn: () => loyaltyApi.listRetentionRisk({ risk_level: riskFilter || undefined }),
  })

  const items: LoyaltyScore[] = data?.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white" title="风险等级">
          <option value="">全部风险等级</option>
          <option value="high">高风险</option>
          <option value="medium">中风险</option>
        </select>
        <span className="text-sm text-slate-400">共 {items.length} 条预警</span>
      </div>

      {error && <ErrorAlert message="加载失败" onRetry={() => refetch()} />}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-slate-400 py-12 text-center">暂无流失预警</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((s) => (
              <div key={s.id} className="p-4 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-slate-700">受试者 #{s.subject_id}</span>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    <span>评分: {s.total_score}</span>
                    <span>依从性: {s.compliance_avg}%</span>
                    <span>最后活跃: {s.last_activity_date || '从未'}</span>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${riskColors[s.risk_level] || 'bg-slate-100'}`}>{riskLabels[s.risk_level]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
