import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart2, TrendingUp } from 'lucide-react'
import { mailSignalsApi } from '@/api/mailSignals'
import { QueryError, QueryLoading } from '@/components/QueryState'

const TASK_KEY_LABELS: Record<string, string> = {
  market_trend_brief: '品类趋势简报',
  competitive_intel_brief: '竞品情报简报',
  claim_strategy_brief: '宣称策略建议',
  opportunity_draft: '商机草稿',
  client_profile_update: '客户画像更新',
  research_context_sync: '研究上下文同步',
  client_risk_alert: '客户风险提醒',
  followup_action_draft: '跟进动作草稿',
}

const SIGNAL_TYPE_LABELS: Record<string, string> = {
  inquiry: '询价/合作意向',
  project_followup: '项目执行沟通',
  competitor_pressure: '竞品/市场压力',
  complaint: '投诉/强负反馈',
  relationship_signal: '关系变化信号',
  unknown: '未分类',
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-800">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  )
}

export function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['digital-workforce', 'mail-analytics', days],
    queryFn: () => mailSignalsApi.getAnalytics(days),
    refetchInterval: 60000,
  })

  if (isLoading) return <QueryLoading loadingText="正在加载复盘看板..." />
  if (error) return <QueryError error={error} />
  if (!data) return <QueryError error={new Error('数据加载失败')} />

  const { signals, tasks, phase2_specialist, opportunity_contribution, feedback } = data

  return (
    <div className="space-y-6">
      <section className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary-50 p-3 text-primary-600">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">复盘看板</h1>
            <p className="mt-1 text-sm text-slate-500">
              邮件信号处理与建议采纳效果统计（Phase 5）
              {isFetching && <span className="ml-2 text-primary-500">更新中…</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">时间范围：</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700"
            aria-label="时间范围选择"
            data-testid="select-analytics-days"
          >
            <option value={7}>近 7 天</option>
            <option value={30}>近 30 天</option>
            <option value={90}>近 90 天</option>
          </select>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="邮件事件总数" value={signals.total} />
        <StatCard label="任务草稿总数" value={tasks.total} />
        <StatCard
          label="建议采纳率"
          value={`${tasks.adoption_rate_pct}%`}
          sub={`采纳 ${tasks.adopted} / 拒绝 ${tasks.rejected}`}
        />
        <StatCard
          label="商机关联贡献"
          value={opportunity_contribution.tasks_linked_to_opportunity}
          sub="关联到商机推进的任务数"
        />
        <StatCard
          label="报告复用率"
          value={`${feedback.report_reuse_rate_pct}%`}
          sub={`反馈记录 ${feedback.total_records}`}
        />
        <StatCard
          label="客户满意度"
          value={feedback.customer_satisfaction_avg ?? '-'}
          sub={`客户反馈 ${feedback.customer_records}`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <BarChart2 className="h-4 w-4 text-indigo-500" />
            Phase 2 专项分析采纳率
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-2xl font-semibold text-slate-800">{phase2_specialist.total}</div>
              <div className="mt-1 text-xs text-slate-500">专项任务总数</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-emerald-600">{phase2_specialist.adopted}</div>
              <div className="mt-1 text-xs text-slate-500">已采纳</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-primary-600">{phase2_specialist.adoption_rate_pct}%</div>
              <div className="mt-1 text-xs text-slate-500">专项采纳率</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="text-sm font-semibold text-slate-700">邮件类型分布</div>
          {signals.by_type.length === 0 ? (
            <div className="text-xs text-slate-400">暂无数据</div>
          ) : (
            <div className="space-y-2">
              {signals.by_type.map((item) => (
                <div key={item.mail_signal_type} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    {SIGNAL_TYPE_LABELS[item.mail_signal_type] ?? item.mail_signal_type}
                  </span>
                  <span className="font-medium text-slate-800">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="text-sm font-semibold text-slate-700">任务草稿类型分布</div>
        {tasks.by_task_key.length === 0 ? (
          <div className="text-xs text-slate-400">暂无数据</div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {tasks.by_task_key.map((item) => (
              <div key={item.task_key} className="rounded-xl bg-slate-50 p-3">
                <div className="text-xs text-slate-500 truncate">
                  {TASK_KEY_LABELS[item.task_key] ?? item.task_key}
                </div>
                <div className="mt-1 text-xl font-semibold text-slate-800">{item.count}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <div className="text-sm font-semibold text-slate-700">任务执行状态</div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-3">
            <div className="text-xs text-emerald-600">已采纳</div>
            <div className="mt-1 text-xl font-semibold text-emerald-700">{tasks.adopted}</div>
          </div>
          <div className="rounded-xl bg-red-50 p-3">
            <div className="text-xs text-red-500">未采纳</div>
            <div className="mt-1 text-xl font-semibold text-red-600">{tasks.rejected}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs text-slate-500">已执行</div>
            <div className="mt-1 text-xl font-semibold text-slate-700">{tasks.executed}</div>
          </div>
        </div>
      </section>
    </div>
  )
}
