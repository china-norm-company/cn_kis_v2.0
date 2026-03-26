/**
 * 绩效仪表盘 — 数字员工维度执行量、成功率、价值指标与观测（延迟/Token/工具调用）
 */
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { BarChart3, TrendingUp, Activity, Target } from 'lucide-react'

export default function PerformancePage() {
  const { data: portalRes, isLoading: portalLoading, error: portalError } = useQuery({
    queryKey: ['digital-workforce', 'portal'],
    queryFn: () => digitalWorkforcePortalApi.getPortal(),
  })
  const { data: valueRes, isLoading: valueLoading, error: valueError } = useQuery({
    queryKey: ['digital-workforce', 'value-metrics', 30],
    queryFn: () => digitalWorkforcePortalApi.getValueMetrics(30),
  })
  const { data: obsRes, isLoading: obsLoading, error: obsError } = useQuery({
    queryKey: ['digital-workforce', 'agent-observability', 7],
    queryFn: () => digitalWorkforcePortalApi.getAgentObservability(7),
  })

  const portal = portalRes?.data.data
  const agents = portal?.agents ?? []
  const execution7d = portal?.execution_7d ?? portal?.execution_today ?? {}
  const value = valueRes?.data.data
  const observability = obsRes?.data.data.items ?? []
  const hasError = portalError || valueError || obsError
  const roleKpiStats = (value as any)?.by_role_kpi as Array<{
    role_code: string
    role_name: string
    kpis: Record<string, string | number>
  }> | undefined

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-800">绩效仪表盘</h2>
        <p className="mt-1 text-sm text-slate-500">数字员工执行量、成功率与价值估算</p>
      </div>

      {hasError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          部分指标加载失败，请稍后刷新重试。
        </div>
      )}

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          <TrendingUp className="h-4 w-4" />
          价值概览（近 30 天）
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">技能执行总量</p>
            <p className="text-2xl font-semibold text-slate-800">{valueLoading ? '...' : value?.skill_execution_total ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">成功次数</p>
            <p className="text-2xl font-semibold text-slate-800">{valueLoading ? '...' : value?.skill_execution_success ?? 0}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-500">预估节省工时（小时）</p>
            <p className="text-2xl font-semibold text-slate-800">{valueLoading ? '...' : value?.saved_hours_estimate ?? 0}</p>
          </div>
        </div>
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          <Activity className="h-4 w-4" />
          观测指标（近 7 天）
        </h3>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden mb-6">
          {obsLoading ? (
            <div className="p-6 text-center text-slate-500">加载中...</div>
          ) : observability.length === 0 ? (
            <div className="p-6 text-center text-slate-500">暂无观测数据</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">Agent</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">调用次数</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">平均延迟(ms)</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">Token 总量</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">工具调用次数</th>
                </tr>
              </thead>
              <tbody>
                {observability.map((row) => (
                  <tr key={row.agent_id} className="border-b border-slate-100">
                    <td className="py-3 px-4 font-mono">{row.agent_id}</td>
                    <td className="py-3 px-4 text-right">{row.total}</td>
                    <td className="py-3 px-4 text-right">{row.avg_duration_ms}</td>
                    <td className="py-3 px-4 text-right">{row.total_tokens}</td>
                    <td className="py-3 px-4 text-right">{row.tool_calls_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          <BarChart3 className="h-4 w-4" />
          数字员工 7 日执行
        </h3>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {portalLoading ? (
            <div className="p-8 text-center text-slate-500">加载中...</div>
          ) : agents.length === 0 ? (
            <div className="p-8 text-center text-slate-500">暂无执行统计数据</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">数字员工</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">执行次数</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">成功</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">成功率</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => {
                  const stat = execution7d[a.agent_id] ?? { total: 0, success: 0 }
                  const rate = stat.total > 0 ? Math.round((stat.success / stat.total) * 100) : null
                  return (
                    <tr key={a.agent_id} className="border-b border-slate-100">
                      <td className="py-3 px-4">{a.name}</td>
                      <td className="py-3 px-4 text-right">{stat.total}</td>
                      <td className="py-3 px-4 text-right">{stat.success}</td>
                      <td className="py-3 px-4 text-right">{rate != null ? `${rate}%` : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 岗位 KPI 报表 */}
      {(roleKpiStats ?? []).length > 0 && (
        <section data-testid="role-kpi-report">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
            <Target className="h-4 w-4" />
            岗位 KPI 报表（近 30 天）
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(roleKpiStats ?? []).map((item) => {
              const kpiLabels: Record<string, string> = {}
              ;(((item.kpis.kpi_labels as unknown) as string[]) ?? []).forEach((label) => {
                const [key, desc] = label.split('=')
                if (key && desc) kpiLabels[key] = desc
              })
              const displayKpis = Object.entries(item.kpis).filter(([k]) => k !== 'kpi_labels')
              return (
                <div key={item.role_code} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-medium text-slate-500 mb-3">{item.role_name}</p>
                  <div className="space-y-2">
                    {displayKpis.map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">{kpiLabels[key] ?? key}</span>
                        <span className="text-sm font-semibold text-slate-800">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
