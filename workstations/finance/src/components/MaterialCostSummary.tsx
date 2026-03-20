/**
 * 物料成本概览 — M4 跨工作台集成
 *
 * 财务台展示物料入库/领用成本及最近交易
 */
import { useQuery } from '@tanstack/react-query'
import { materialApi } from '@cn-kis/api-client'
import { DollarSign, TrendingUp, Package } from 'lucide-react'

interface MaterialCostSummaryProps {
  projectCode?: string
}

export function MaterialCostSummary({ projectCode }: MaterialCostSummaryProps) {
  const { data: transactionsData } = useQuery({
    queryKey: ['material', 'consumable-transactions', 'costs', projectCode],
    queryFn: () => materialApi.listConsumableTransactions({ page_size: 200 }),
  })
  const transactions = (transactionsData as any)?.data?.items ?? []

  const inboundItems = transactions.filter((t: any) => t.transaction_type === 'inbound')
  const issueItems = transactions.filter((t: any) => t.transaction_type === 'issue')

  const inboundCost = inboundItems.reduce((sum: number, t: any) => sum + (t.total_cost || 0), 0)
  const issuedCost = issueItems.reduce((sum: number, t: any) => sum + (t.total_cost || 0), 0)
  const totalCost = inboundCost + issuedCost

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
        <DollarSign className="w-4 h-4" />物料成本概览
      </h3>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-xs text-blue-600 flex items-center gap-1"><Package className="w-3 h-3" />入库成本</div>
          <div className="text-lg font-bold text-blue-800 mt-1">¥{inboundCost.toLocaleString()}</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-4">
          <div className="text-xs text-amber-600 flex items-center gap-1"><TrendingUp className="w-3 h-3" />领用成本</div>
          <div className="text-lg font-bold text-amber-800 mt-1">¥{issuedCost.toLocaleString()}</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="text-xs text-slate-600">总成本</div>
          <div className="text-lg font-bold text-slate-800 mt-1">¥{totalCost.toLocaleString()}</div>
        </div>
      </div>

      {transactions.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-slate-500 mb-2">最近交易</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 border-b">
                <th className="text-left py-1">耗材</th>
                <th className="text-left py-1">类型</th>
                <th className="text-right py-1">数量</th>
                <th className="text-right py-1">金额</th>
              </tr>
            </thead>
            <tbody>
              {transactions.slice(0, 5).map((t: any) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-1">{t.consumable_name || t.item_name}</td>
                  <td className="py-1">{t.transaction_type === 'inbound' ? '入库' : '领用'}</td>
                  <td className="py-1 text-right">{t.quantity}</td>
                  <td className="py-1 text-right">¥{(t.total_cost || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
