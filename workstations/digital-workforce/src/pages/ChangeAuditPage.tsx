/**
 * Phase 3：变更审计 — 策略与治理阈值变更历史
 */
import { useQuery } from '@tanstack/react-query'
import { assistantGovernanceApi } from '@cn-kis/api-client'
import { FileText, User } from 'lucide-react'

export default function ChangeAuditPage() {
  const { data: overviewRes } = useQuery({
    queryKey: ['digital-workforce', 'change-audit-overview', 30, 30],
    queryFn: () =>
      assistantGovernanceApi.getManagerOverview({
        threshold_timeline_days: 30,
        threshold_timeline_limit: 30,
      }),
  })

  const data = ((overviewRes as unknown) as { data?: Record<string, unknown> } | undefined)?.data
  const summary = data?.route_governance_threshold_change_summary as
    | { total_changes?: number; operators_count?: number; top_changed_fields?: Array<{ field: string; count: number }> }
    | undefined
  const timeline = data?.route_governance_threshold_change_timeline as
    | { items?: Array<{ at: string; operator_name: string; description: string; changed_fields?: string[] }> }
    | undefined
  const items = timeline?.items ?? []

  return (
    <div data-testid="change-audit-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">变更审计</h2>
        <p className="mt-1 text-sm text-slate-500">路径治理阈值变更历史与操作人统计</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-600">
            <FileText className="h-4 w-4" />
            <span className="text-sm font-medium">变更总数</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-slate-800">{summary?.total_changes ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-600">
            <User className="h-4 w-4" />
            <span className="text-sm font-medium">操作人数</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-slate-800">{summary?.operators_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-sm font-medium text-slate-600">高频变更字段</span>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
            {(summary?.top_changed_fields ?? []).slice(0, 3).map((t) => (
              <li key={t.field}>{t.field}: {t.count} 次</li>
            ))}
            {(!summary?.top_changed_fields || summary.top_changed_fields.length === 0) && <li>暂无</li>}
          </ul>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-slate-700">变更时间线</h3>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">暂无变更记录</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {items.map((item, i) => (
              <li key={i} className="flex flex-wrap gap-x-4 gap-y-1 border-b border-slate-100 pb-2 last:border-0">
                <span className="text-xs text-slate-500">{item.at?.slice(0, 19)}</span>
                <span className="text-sm text-slate-700">{item.operator_name || '未知'}</span>
                <span className="text-sm text-slate-600">{item.description || '-'}</span>
                {(item.changed_fields?.length ?? 0) > 0 && (
                  <span className="text-xs text-slate-500">字段: {item.changed_fields?.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
