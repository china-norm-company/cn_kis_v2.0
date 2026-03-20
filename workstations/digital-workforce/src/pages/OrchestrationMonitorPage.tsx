/**
 * Phase 2：编排监控 — OrchestrationRun 列表与子任务概览
 */
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'

export default function OrchestrationMonitorPage() {
  const { data: res } = useQuery({
    queryKey: ['digital-workforce', 'orchestration-history', 50],
    queryFn: () => digitalWorkforcePortalApi.getOrchestrationHistory(50),
  })

  const items = (res as { data?: { items?: Array<{ task_id: string; query: string; status: string; sub_task_count: number; duration_ms: number | null; created_at: string }> } })?.data?.items ?? []

  return (
    <div data-testid="orchestration-monitor-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">编排监控</h2>
        <p className="mt-1 text-sm text-slate-500">最近编排执行记录与子任务分解概览</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          暂无编排执行记录
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">任务 ID</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">查询</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">状态</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">子任务数</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">耗时(ms)</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((row) => (
                <tr key={row.task_id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-700">{row.task_id.slice(0, 12)}…</td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-sm text-slate-600" title={row.query}>{row.query}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{row.status}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-slate-600">{row.sub_task_count}</td>
                  <td className="px-4 py-2 text-right text-sm text-slate-600">{row.duration_ms ?? '-'}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{row.created_at?.slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
