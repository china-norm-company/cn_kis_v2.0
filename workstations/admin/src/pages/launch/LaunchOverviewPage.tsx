import { useQuery } from '@tanstack/react-query'
import { launchGovernanceApi } from '@cn-kis/api-client'
import { Activity, BarChart3, Lightbulb, Target } from 'lucide-react'

export function LaunchOverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'launch-overview'],
    queryFn: () => launchGovernanceApi.getOverview(),
  })

  if (isLoading) {
    return <div className="text-sm text-slate-500 py-12 text-center">加载上线治理总览…</div>
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {(error as Error).message || '加载失败'}
      </div>
    )
  }

  const adoption = (data?.adoption as Record<string, unknown>) || {}
  const stage = (data?.current_stage as Record<string, string>) || {}
  const gov = (data?.governance_counts as Record<string, number>) || {}
  const actions = (data?.recommended_actions as Array<Record<string, unknown>>) || []
  const insights = (data?.pending_insights as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">V2 上线治理总览</h2>
        <p className="text-sm text-slate-500 mt-1">CN KIS V2.0 · 公司级上线实施与最小闭环推进</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Target className="w-4 h-4 text-amber-600" />
          当前阶段
        </div>
        <p className="text-sm text-slate-800 font-medium">{stage.label}</p>
        <p className="text-sm text-slate-600">{stage.summary}</p>
        <p className="text-sm text-primary-700">{stage.today_focus}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">上线成熟度</div>
          <div className="text-lg font-bold text-slate-800 mt-1">
            {String(adoption.maturity_label || '—')}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">7 日活跃账号</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{Number(adoption.wau_7d ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">L2 业务动作总计</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{Number(adoption.l2_actions_total ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">开放缺口 / 阻塞闭环</div>
          <div className="text-lg font-bold text-slate-800 mt-1">
            {gov.open_gaps ?? 0} / {gov.blocking_gaps ?? 0}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            推荐行动（系统脉搏）
          </div>
          <ul className="space-y-2 text-sm text-slate-600">
            {actions.length === 0 ? (
              <li className="text-slate-400">暂无</li>
            ) : (
              actions.slice(0, 6).map((a, i) => (
                <li key={i} className="border-b border-slate-50 pb-2 last:border-0">
                  <span className="font-medium text-slate-800">{String(a.action || '')}</span>
                  <div className="text-xs text-slate-400 mt-0.5">{String(a.reason || '')}</div>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
            <Activity className="w-4 h-4 text-violet-500" />
            待处理洞察（草稿）
          </div>
          <ul className="space-y-2 text-sm text-slate-600">
            {insights.length === 0 ? (
              <li className="text-slate-400">暂无</li>
            ) : (
              insights.slice(0, 6).map((it) => (
                <li key={String(it.id)} className="border-b border-slate-50 pb-2 last:border-0">
                  <span className="font-medium text-slate-800">{String(it.title || '')}</span>
                  <div className="text-xs text-slate-400 mt-0.5">
                    待处理 {String(it.days_pending ?? '')} 天
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-500 flex gap-2">
        <BarChart3 className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          监控口径见仓库文档 <code className="bg-white px-1 rounded">docs/GOVERNANCE_MONITORING_RUNBOOK.md</code>
          ；与飞书开发群、用户反馈群、GitHub、system-pulse 对齐使用。
        </div>
      </div>
    </div>
  )
}
