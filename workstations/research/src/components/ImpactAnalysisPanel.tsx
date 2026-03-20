/**
 * 变更影响分析面板
 *
 * 展示受影响工单/排程/成本 + 分析摘要 + 建议措施
 */
import { Empty } from '@cn-kis/ui-kit'
import { Loader2, CheckCircle } from 'lucide-react'

export interface ImpactData {
  affected_workorders?: number
  affected_schedules?: number
  cost_impact?: number | string
  summary?: string
  recommendations?: string | string[]
}

interface ImpactAnalysisPanelProps {
  impact?: ImpactData | null
  isLoading?: boolean
}

export function ImpactAnalysisPanel({ impact, isLoading }: ImpactAnalysisPanelProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        分析中...
      </div>
    )
  }

  if (!impact) {
    return <Empty description="暂无影响分析数据" />
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-blue-700">{impact.affected_workorders ?? 0}</div>
          <div className="text-xs text-blue-600">受影响工单</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-amber-700">{impact.affected_schedules ?? 0}</div>
          <div className="text-xs text-amber-600">受影响排程</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-lg font-bold text-purple-700">
            {impact.cost_impact ? `¥${impact.cost_impact}` : '-'}
          </div>
          <div className="text-xs text-purple-600">成本影响</div>
        </div>
      </div>
      {impact.summary && (
        <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700">
          {impact.summary}
        </div>
      )}
      {impact.recommendations && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">建议措施</h4>
          <ul className="space-y-1 text-sm text-slate-600">
            {(Array.isArray(impact.recommendations) ? impact.recommendations : [impact.recommendations]).map(
              (r: string, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  {r}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
