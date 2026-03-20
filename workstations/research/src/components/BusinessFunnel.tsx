/**
 * 商务漏斗组件
 *
 * 可视化展示商机→报价→合同→回款各阶段数量和金额
 */
import { TrendingUp, Target, FileText, CheckCircle, Banknote } from 'lucide-react'

export function formatAmount(value: number): string {
  if (value >= 10000) return `¥${(value / 10000).toFixed(1)}万`
  return `¥${value.toLocaleString()}`
}

export const FUNNEL_STAGES = [
  { key: 'opportunities', label: '商机', icon: Target, color: 'bg-blue-500' },
  { key: 'quotes', label: '报价', icon: FileText, color: 'bg-indigo-500' },
  { key: 'contracts', label: '合同', icon: CheckCircle, color: 'bg-emerald-500' },
  { key: 'payments', label: '回款', icon: Banknote, color: 'bg-amber-500' },
] as const

export interface FunnelData {
  opportunities: { count: number; amount: number }
  quotes: { count: number; amount: number }
  contracts: { count: number; amount: number }
  payments: { count: number; amount: number }
}

interface BusinessFunnelProps {
  funnel: FunnelData | undefined
  isLoading?: boolean
}

export function BusinessFunnel({ funnel, isLoading }: BusinessFunnelProps) {
  const maxAmount = funnel
    ? Math.max(
        funnel.opportunities.amount,
        funnel.quotes.amount,
        funnel.contracts.amount,
        funnel.payments.amount,
        1,
      )
    : 1

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-slate-400" />
        商务漏斗
      </h3>
      {isLoading ? (
        <div className="py-8 text-center text-sm text-slate-400">加载中...</div>
      ) : (
        <div className="space-y-3">
          {FUNNEL_STAGES.map((stage) => {
            const data = funnel?.[stage.key] ?? { count: 0, amount: 0 }
            const widthPct = maxAmount > 0 ? Math.max((data.amount / maxAmount) * 100, 8) : 8
            return (
              <div key={stage.key} className="flex items-center gap-4">
                <div className="w-16 text-right text-sm font-medium text-slate-600">{stage.label}</div>
                <div className="flex-1">
                  <div
                    className={`${stage.color} h-10 rounded-lg flex items-center px-4 transition-all`}
                    style={{ width: `${widthPct}%` }}
                  >
                    <span className="text-sm font-semibold text-white whitespace-nowrap">
                      {data.count} 项 · {formatAmount(data.amount)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
