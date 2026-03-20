/**
 * 能力成长曲线 — WorkerPolicyUpdate 时间轴 + 记忆增长趋势
 */
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { Brain } from 'lucide-react'

export default function GrowthPage() {
  const { data: policyRes, isLoading: policyLoading, error: policyError } = useQuery({
    queryKey: ['digital-workforce', 'policy-learning', 100],
    queryFn: () => digitalWorkforcePortalApi.getPolicyLearning(100),
  })
  const { data: memoryRes, isLoading: memoryLoading, error: memoryError } = useQuery({
    queryKey: ['digital-workforce', 'memory-archive', 100],
    queryFn: () => digitalWorkforcePortalApi.getMemoryArchive(100),
  })

  const policyItems = policyRes?.data.data.items ?? []
  const memoryItems = memoryRes?.data.data.items ?? []
  const hasError = policyError || memoryError

  const policyByMonth: Record<string, number> = {}
  for (const row of policyItems) {
    const month = row.created_at?.slice(0, 7) ?? 'unknown'
    policyByMonth[month] = (policyByMonth[month] ?? 0) + 1
  }
  const memoryByMonth: Record<string, number> = {}
  for (const row of memoryItems) {
    const month = row.created_at?.slice(0, 7) ?? 'unknown'
    memoryByMonth[month] = (memoryByMonth[month] ?? 0) + 1
  }
  const months = Array.from(new Set([...Object.keys(policyByMonth), ...Object.keys(memoryByMonth)])).sort()

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-800">能力成长曲线</h2>
        <p className="mt-1 text-sm text-slate-500">策略升级与记忆增长趋势</p>
      </div>

      {hasError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          部分成长数据加载失败，请稍后重试。
        </div>
      )}

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          <Brain className="h-4 w-4" />
          月度趋势
        </h3>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {policyLoading || memoryLoading ? (
            <div className="p-8 text-center text-slate-500">加载中...</div>
          ) : months.length === 0 ? (
            <div className="p-8 text-center text-slate-500">暂无趋势数据</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">月份</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">策略升级数</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">记忆记录数</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => (
                  <tr key={m} className="border-b border-slate-100">
                    <td className="py-3 px-4">{m}</td>
                    <td className="py-3 px-4 text-right">{policyByMonth[m] ?? 0}</td>
                    <td className="py-3 px-4 text-right">{memoryByMonth[m] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">最近策略升级</h3>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {policyLoading ? (
            <div className="p-8 text-center text-slate-500">加载中...</div>
          ) : policyItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500">暂无策略升级记录</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {policyItems.slice(0, 20).map((row, i) => (
                <li key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="font-mono text-slate-600">{row.worker_code}</span>
                  <span className="max-w-[200px] truncate text-slate-800">{row.policy_key}</span>
                  <span className="text-slate-500">{(row.replay_score * 100).toFixed(0)}%</span>
                  <span className="text-xs text-slate-400">{row.created_at?.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
