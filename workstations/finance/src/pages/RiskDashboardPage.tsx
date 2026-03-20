import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { StatCard, Badge, Empty } from '@cn-kis/ui-kit'
import {
  Shield, AlertTriangle, DollarSign, TrendingDown, AlertCircle,
} from 'lucide-react'

function fmtMoney(v: number) {
  return `¥${(v / 10000).toFixed(2)}万`
}

const RISK_LEVEL_MAP: Record<string, { color: string; variant: 'error' | 'warning' | 'default' }> = {
  high: { color: 'text-red-600', variant: 'error' },
  medium: { color: 'text-amber-600', variant: 'warning' },
  low: { color: 'text-slate-600', variant: 'default' },
}

export function RiskDashboardPage() {
  const { data: riskRes, isLoading } = useQuery({
    queryKey: ['finance', 'risk', 'dashboard'],
    queryFn: () => api.get<any>('/finance/analytics/risk/dashboard'),
  })

  const data = riskRes?.data
  const summary = data?.summary ?? data ?? {}
  const budgetOverruns: any[] = data?.budget_overruns ?? data?.overruns ?? []
  const revenueRisks: any[] = data?.revenue_at_risk ?? data?.revenue_risks ?? []

  return (
    <div className="space-y-5 md:space-y-6">
      <div className="flex items-start gap-3">
        <Shield className="w-6 h-6 text-slate-400" />
        <div>
          <h2 className="text-lg font-semibold text-slate-800 md:text-xl">风险分析</h2>
          <p className="text-sm text-slate-500 mt-1">财务风险概览与预警</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-slate-400">加载中...</div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 md:gap-4">
            <StatCard
              title="风险敞口总额"
              value={fmtMoney(summary.total_risk_amount || 0)}
              icon={<DollarSign className="w-5 h-5" />}
              color="red"
            />
            <StatCard
              title="高风险项目数"
              value={summary.high_risk_count ?? 0}
              icon={<AlertTriangle className="w-5 h-5" />}
              color="red"
            />
            <StatCard
              title="中风险项目数"
              value={summary.medium_risk_count ?? 0}
              icon={<AlertCircle className="w-5 h-5" />}
              color="amber"
            />
            <StatCard
              title="逾期应收总额"
              value={fmtMoney(summary.overdue_ar_amount || 0)}
              icon={<TrendingDown className="w-5 h-5" />}
              color="amber"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            {/* Budget Overrun Risks */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">预算超支风险</h3>
              {budgetOverruns.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {budgetOverruns.map((item: any, idx: number) => {
                    const level = RISK_LEVEL_MAP[item.risk_level] || RISK_LEVEL_MAP.low
                    return (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                        <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${level.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800 truncate">{item.project_name || item.name}</span>
                            <Badge variant={level.variant}>{item.risk_level || '未知'}</Badge>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            预算: {fmtMoney(item.budget_amount || 0)} / 实际: {fmtMoney(item.actual_amount || 0)}
                          </div>
                          <div className="text-xs text-red-500 mt-0.5">
                            超支: {fmtMoney((item.actual_amount || 0) - (item.budget_amount || 0))}
                            ({item.overrun_rate || item.variance_pct || '--'})
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty message="暂无预算超支项目" />
              )}
            </div>

            {/* Revenue at Risk */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5">
              <h3 className="text-sm font-semibold text-slate-700 mb-4">收入风险</h3>
              {revenueRisks.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {revenueRisks.map((item: any, idx: number) => {
                    const level = RISK_LEVEL_MAP[item.risk_level] || RISK_LEVEL_MAP.low
                    return (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50">
                        <DollarSign className={`w-4 h-4 mt-0.5 shrink-0 ${level.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800 truncate">{item.project_name || item.client_name || item.name}</span>
                            <Badge variant={level.variant}>{item.risk_level || '未知'}</Badge>
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            风险金额: <span className="font-medium text-red-500">{fmtMoney(item.amount || item.at_risk_amount || 0)}</span>
                          </div>
                          {item.reason && (
                            <div className="text-xs text-slate-400 mt-0.5">{item.reason}</div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty message="暂无收入风险项目" />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
