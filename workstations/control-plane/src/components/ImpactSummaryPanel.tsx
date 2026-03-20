import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import type { EventImpact } from '@/api/controlPlane'

interface ImpactSummaryPanelProps {
  impact: EventImpact | null
  loading?: boolean
}

export function ImpactSummaryPanel({ impact, loading }: ImpactSummaryPanelProps) {
  if (loading) return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">加载中...</div>
  if (!impact) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800">
        <AlertTriangle className="h-4 w-4" />
        业务影响
      </div>
      <div className="space-y-2 text-xs text-amber-900">
        <p>影响等级：{impact.impactLevel === 'high' ? '高' : '中'}</p>
        {impact.affectedScenarios.length > 0 && (
          <p>受影响场景：{impact.affectedScenarios.map((s) => s.name).join('、')}</p>
        )}
        {impact.recommendation && <p className="text-amber-700">{impact.recommendation}</p>}
        {impact.sourceObjectId && (
          <Link to={`/objects/${impact.sourceObjectId}`} className="text-primary-600 hover:underline">
            查看来源对象
          </Link>
        )}
      </div>
    </div>
  )
}
