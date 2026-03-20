/**
 * Phase 2：记忆档案 — WorkerMemoryRecord 五层记忆与注入记录
 */
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'

const MEMORY_TYPE_LABEL: Record<string, string> = {
  working: '工作记忆',
  episodic: '情景记忆',
  semantic: '语义记忆',
  knowledge: '知识记忆',
  policy: '策略记忆',
}

export default function MemoryArchivePage() {
  const { data: res } = useQuery({
    queryKey: ['digital-workforce', 'memory-archive', 50],
    queryFn: () => digitalWorkforcePortalApi.getMemoryArchive(50),
  })

  const items = (res as { data?: { items?: Array<{ id: number; worker_code: string; memory_type: string; subject_type: string; subject_key: string; summary: string; importance_score: number; source_task_id: string; created_at: string }> } })?.data?.items ?? []

  return (
    <div data-testid="memory-archive-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">记忆档案</h2>
        <p className="mt-1 text-sm text-slate-500">五层记忆与最近写入记录</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          暂无记忆记录
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Worker</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">类型</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">主体</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">摘要</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">重要度</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">创建时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-700">{row.worker_code}</td>
                  <td className="px-4 py-2">
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {MEMORY_TYPE_LABEL[row.memory_type] ?? row.memory_type}
                    </span>
                  </td>
                  <td className="max-w-[120px] truncate px-4 py-2 text-sm text-slate-600" title={`${row.subject_type}:${row.subject_key}`}>
                    {row.subject_type}:{row.subject_key || '-'}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-sm text-slate-600" title={row.summary}>{row.summary || '-'}</td>
                  <td className="px-4 py-2 text-right text-sm text-slate-600">{row.importance_score}</td>
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
