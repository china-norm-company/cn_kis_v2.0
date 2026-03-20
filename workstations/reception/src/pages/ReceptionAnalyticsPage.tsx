import { useQuery } from '@tanstack/react-query'
import { executionApi, receptionApi } from '@cn-kis/api-client'
import { Card, StatCard, Empty } from '@cn-kis/ui-kit'

export default function ReceptionAnalyticsPage() {
  const { data: analyticsRes } = useQuery({
    queryKey: ['reception', 'analytics'],
    queryFn: () => receptionApi.analytics(undefined, 14),
    refetchInterval: 60000,
  })
  const { data: insightsRes } = useQuery({
    queryKey: ['reception', 'insights'],
    queryFn: () => receptionApi.insights(undefined, 14),
    refetchInterval: 60000,
  })
  const { data: journeyStatsRes } = useQuery({
    queryKey: ['reception', 'journey-stats'],
    queryFn: () => executionApi.getJourneyStats(),
    refetchInterval: 60000,
  })
  const analytics = analyticsRes?.data
  const insights = insightsRes?.data?.insights || []
  const journey = journeyStatsRes?.data

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-4">
        <StatCard label="签到率" value={`${analytics?.metrics?.sign_in_rate ?? 0}%`} color="green" />
        <StatCard label="缺席率" value={`${analytics?.metrics?.no_show_rate ?? 0}%`} color="red" />
        <StatCard label="平均等待" value={`${analytics?.metrics?.avg_wait_minutes ?? 0} 分`} color="amber" />
        <StatCard label="流程完成率" value={`${analytics?.metrics?.process_completion_rate ?? 0}%`} color="teal" />
        <StatCard label="工单闭环率" value={`${analytics?.metrics?.ticket_closure_rate ?? 0}%`} color="blue" />
        <StatCard label="总预约量" value={analytics?.metrics?.total_appointments ?? 0} color="purple" />
      </div>

      <Card title="趋势（近14天）" variant="bordered">
        {!analytics?.trend?.length ? (
          <Empty title="暂无趋势数据" />
        ) : (
          <div className="space-y-2">
            {analytics.trend.map((item) => (
              <div key={item.date} className="border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <div className="font-medium text-slate-800">{item.date}</div>
                <div className="text-slate-500 break-words">
                  预约 {item.appointments} · 已完成 {item.checked_out} · 缺席 {item.no_show} · 完成率 {item.completion_rate}%
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="智能洞察（建议级）" variant="bordered">
        {insights.length === 0 ? (
          <p className="text-sm text-slate-400">暂无洞察</p>
        ) : (
          <ul className="space-y-2 text-sm text-slate-700 list-disc list-inside">
            {insights.map((text, idx) => (
              <li key={idx}>{text}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="旅程中心概览" variant="bordered">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div className="border rounded-lg p-3">签到总数：{journey?.checkin_count ?? 0}</div>
          <div className="border rounded-lg p-3">签出总数：{journey?.checkout_count ?? 0}</div>
          <div className="border rounded-lg p-3">缺席总数：{journey?.no_show_count ?? 0}</div>
          <div className="border rounded-lg p-3">工单未闭环：{journey?.support_open ?? 0}</div>
          <div className="border rounded-lg p-3">工单已闭环：{journey?.support_closed ?? 0}</div>
          <div className="border rounded-lg p-3">退出受试者：{journey?.withdrawn_subjects ?? 0}</div>
        </div>
      </Card>
    </div>
  )
}
