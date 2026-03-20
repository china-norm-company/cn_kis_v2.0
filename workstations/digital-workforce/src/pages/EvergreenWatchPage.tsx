/**
 * Phase 3：持续升级哨塔 — EvergreenWatchReport 扫描结果
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'

const WATCH_TYPE_LABEL: Record<string, string> = {
  model: '模型',
  claw: 'Claw',
  practice: '最佳实践',
  industry: '行业',
}

export default function EvergreenWatchPage() {
  const { data: res } = useQuery({
    queryKey: ['digital-workforce', 'evergreen-watch-reports', 50],
    queryFn: () => digitalWorkforcePortalApi.getEvergreenWatchReports(50),
  })

  const items = (res as { data?: { items?: Array<{ id: number; watch_type: string; source_name: string; source_url: string; status: string; headline: string; created_at: string }> } })?.data?.items ?? []

  return (
    <div data-testid="evergreen-watch-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">持续升级哨塔</h2>
        <p className="mt-1 text-sm text-slate-500">EvergreenWatchReport 扫描结果</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">暂无哨塔报告</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">类型</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">来源</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">状态</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">摘要</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50 cursor-pointer">
                  <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-700">
                    {WATCH_TYPE_LABEL[row.watch_type] ?? row.watch_type}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-2 text-sm text-blue-600 hover:underline" title={row.source_name}>
                    <Link to={`/upgrades/${row.id}`}>{row.source_name}</Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{row.status}</span>
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-2 text-sm text-slate-600" title={row.headline}>
                    {row.headline || '-'}
                  </td>
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
