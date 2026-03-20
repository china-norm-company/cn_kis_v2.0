/**
 * Phase 3：路径治理 — 预设、阈值、覆盖率与趋势
 */
import { useQuery } from '@tanstack/react-query'
import { assistantGovernanceApi } from '@cn-kis/api-client'
import { Shield, TrendingUp, AlertTriangle } from 'lucide-react'

export default function RouteGovernancePage() {
  const { data: overviewRes } = useQuery({
    queryKey: ['digital-workforce', 'route-governance-overview', 30, 20],
    queryFn: () =>
      assistantGovernanceApi.getManagerOverview({
        preset_trend_days: 30,
        threshold_timeline_days: 30,
        threshold_timeline_limit: 20,
      }),
  })
  const { data: presetsRes } = useQuery({
    queryKey: ['digital-workforce', 'route-governance-presets'],
    queryFn: () => assistantGovernanceApi.getPresets(),
  })
  const { data: thresholdsRes } = useQuery({
    queryKey: ['digital-workforce', 'route-governance-thresholds'],
    queryFn: () => assistantGovernanceApi.getThresholds(),
  })

  const data = (overviewRes as { data?: Record<string, unknown> })?.data
  const coverage = data?.route_governance_preset_coverage as
    | { total_accounts?: number; enabled_accounts?: number; coverage_rate?: number; approval_modes?: { graded?: number; direct?: number } }
    | undefined
  const trend = data?.route_governance_preset_trend as
    | { applied_7d?: number; applied_30d?: number; daily_window?: Array<{ date: string; applied: number }> }
    | undefined
  const alert = data?.route_governance_preset_alert as
    | { enabled?: boolean; level?: string; message?: string; thresholds?: { coverage_rate_min?: number; applied_7d_min?: number } }
    | undefined
  const presets = (presetsRes as { data?: { items?: Array<{ preset_id: string; label: string; recommended: boolean }> } })?.data?.items ?? []
  const thresholds = (thresholdsRes as { data?: { thresholds?: Record<string, unknown> } })?.data?.thresholds ?? {}

  return (
    <div data-testid="route-governance-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">路径治理</h2>
        <p className="mt-1 text-sm text-slate-500">预设覆盖率、应用趋势与阈值配置</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-600">
            <Shield className="h-4 w-4" />
            <span className="text-sm font-medium">覆盖率</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-slate-800">
            {coverage != null ? `${((coverage.coverage_rate ?? 0) * 100).toFixed(1)}%` : '-'}
          </p>
          <p className="text-xs text-slate-500">
            {coverage?.enabled_accounts ?? 0} / {coverage?.total_accounts ?? 0} 账号已启用
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-600">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm font-medium">近 7 天应用</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-slate-800">{trend?.applied_7d ?? 0}</p>
          <p className="text-xs text-slate-500">近 30 天 {trend?.applied_30d ?? 0} 次</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-600">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">告警</span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-800">{alert?.enabled ? alert?.level ?? 'warning' : '正常'}</p>
          <p className="text-xs text-slate-500 truncate" title={alert?.message}>{alert?.message || '-'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-sm font-medium text-slate-600">审批模式</span>
          <p className="mt-1 text-sm text-slate-800">
            分级 {coverage?.approval_modes?.graded ?? 0} / 直接 {coverage?.approval_modes?.direct ?? 0}
          </p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">角色预设</h3>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            {presets.length === 0 ? (
              <li>暂无预设</li>
            ) : (
              presets.map((p) => (
                <li key={p.preset_id}>
                  {p.label}
                  {p.recommended && <span className="ml-1 text-xs text-amber-600">推荐</span>}
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">当前阈值</h3>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
            {Object.keys(thresholds).length === 0 ? '暂无' : JSON.stringify(thresholds, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
