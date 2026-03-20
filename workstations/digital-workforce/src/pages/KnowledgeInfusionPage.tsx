/**
 * Phase 3：知识灌注 — 知识库条目与可检索验证
 */
import { useQuery } from '@tanstack/react-query'
import { knowledgeApi } from '@cn-kis/api-client'

const PAGE_SIZE = 20

export default function KnowledgeInfusionPage() {
  const { data: listRes } = useQuery({
    queryKey: ['digital-workforce', 'knowledge-entries', 1, PAGE_SIZE],
    queryFn: () => knowledgeApi.listEntries({ page: 1, page_size: PAGE_SIZE }),
  })

  const data = (listRes as { data?: { items?: Array<{ id: number; title: string; entry_type: string; summary: string; create_time: string; status?: string }>; total?: number } })?.data
  const items = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div data-testid="knowledge-infusion-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">知识灌注</h2>
        <p className="mt-1 text-sm text-slate-500">知识库条目列表，新知识可通过创建条目注入并经由混合检索验证</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          暂无知识条目，可通过知识库模块创建条目并注入
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <p className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">共 {total} 条，展示最近 {items.length} 条</p>
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">ID</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">标题</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">类型</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">摘要</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-600">{row.id}</td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-sm font-medium text-slate-800" title={row.title}>{row.title}</td>
                  <td className="px-4 py-2 text-sm text-slate-600">{row.entry_type}</td>
                  <td className="max-w-[240px] truncate px-4 py-2 text-sm text-slate-600" title={row.summary}>{row.summary || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{row.create_time?.slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
