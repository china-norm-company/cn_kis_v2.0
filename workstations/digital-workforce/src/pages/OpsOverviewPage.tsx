/**
 * 运行总览 — 中书·数字员工中心
 * 与 admin AiOpsOverviewPage 功能等价：今日运行量、成功率、路径治理告警
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { assistantGovernanceApi } from '@cn-kis/api-client'
import { BarChart3, Activity, AlertTriangle, CheckCircle } from 'lucide-react'

export default function OpsOverviewPage() {
  const { data: overviewRes, isLoading: overviewLoading } = useQuery({
    queryKey: ['digital-workforce', 'manager-overview', 7],
    queryFn: () => assistantGovernanceApi.getManagerOverview({ days: 7 }),
  })
  const { data: metricsRes, isLoading: metricsLoading } = useQuery({
    queryKey: ['digital-workforce', 'assistant-metrics', 30],
    queryFn: () => assistantGovernanceApi.getMetrics({ days: 30 }),
  })

  const overview = (overviewRes as { data?: Record<string, unknown> } | undefined)?.data
  const metrics = (metricsRes as { data?: Record<string, unknown> } | undefined)?.data
  const isLoading = overviewLoading || metricsLoading

  const routeAlert = overview?.route_governance_preset_alert as
    | { enabled?: boolean; level?: string; message?: string }
    | undefined
  const routeTrend = overview?.route_governance_preset_trend as
    | { applied_7d?: number; applied_30d?: number; window_days?: number }
    | undefined
  const presetCoverage = overview?.route_governance_preset_coverage as
    | { coverage_rate?: number; enabled_accounts?: number; total_accounts?: number }
    | undefined

  return (
    <div data-testid="ops-overview-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">运行总览</h2>
        <p className="mt-1 text-sm text-slate-500">今日运行量、成功率、通道健康与路径治理告警（系统视角）</p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {typeof metrics?.adoption_rate === 'number' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm">采纳率</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {((metrics.adoption_rate as number) * 100).toFixed(1)}%
              </p>
            </div>
          )}
          {typeof metrics?.automation_success_rate === 'number' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <Activity className="h-5 w-5" />
                <span className="text-sm">自动化成功率</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {((metrics.automation_success_rate as number) * 100).toFixed(1)}%
              </p>
            </div>
          )}
          {typeof presetCoverage?.coverage_rate === 'number' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <BarChart3 className="h-5 w-5" />
                <span className="text-sm">路径治理覆盖率</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {(presetCoverage.coverage_rate * 100).toFixed(1)}%
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {presetCoverage.enabled_accounts}/{presetCoverage.total_accounts} 账号
              </p>
            </div>
          )}
          {routeTrend && (routeTrend.applied_7d != null || routeTrend.applied_30d != null) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <Activity className="h-5 w-5" />
                <span className="text-sm">路径应用量</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">{routeTrend.applied_7d ?? 0} / 7天</p>
              <p className="mt-1 text-xs text-slate-400">30天: {routeTrend.applied_30d ?? 0}</p>
            </div>
          )}
        </div>
      )}

      {routeAlert?.enabled && routeAlert?.message && (
        <div
          data-testid="ops-overview-alert"
          className={`rounded-xl border p-4 ${
            routeAlert.level === 'critical'
              ? 'border-red-200 bg-red-50 text-red-800'
              : routeAlert.level === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-slate-50 text-slate-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span className="font-medium">路径治理告警</span>
          </div>
          <p className="mt-2 text-sm">{routeAlert.message}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link to="/actions" data-testid="ops-overview-alert-actions-link" className="rounded-lg bg-white/70 px-4 py-2 text-sm font-medium hover:bg-white">
              查看动作中心
            </Link>
            <Link to="/policies" data-testid="ops-overview-alert-policies-link" className="rounded-lg border border-current/20 px-4 py-2 text-sm font-medium hover:bg-white/40">
              调整策略
            </Link>
          </div>
        </div>
      )}

      {!isLoading && !overview?.route_governance_preset_alert && !metrics?.adoption_rate && !presetCoverage?.coverage_rate && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <p className="mb-4 text-slate-500">暂无运营数据</p>
          <p className="mb-4 text-sm text-slate-400">
            请确认后端接口已返回数据，或检查当前账号权限。
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/actions" data-testid="ops-overview-empty-actions-link" className="rounded-lg bg-primary-100 px-4 py-2 text-sm font-medium text-primary-700 hover:bg-primary-200">
              前往动作中心
            </Link>
            <Link to="/policies" data-testid="ops-overview-empty-policies-link" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              策略中心
            </Link>
            <Link to="/portal" data-testid="ops-overview-empty-portal-link" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              数字员工门户
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
