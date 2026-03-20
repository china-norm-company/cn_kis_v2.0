/**
 * 流程执行实况 — 近期执行任务与编排记录（轮询/列表）+ 协作 DAG
 */
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { PlayCircle, Activity } from 'lucide-react'
import CollaborationDag from '../components/CollaborationDag'

export default function ExecutionsPage() {
  const { data: activityRes, isLoading: activityLoading, error: activityError } = useQuery({
    queryKey: ['digital-workforce', 'my-activity', 80],
    queryFn: () => digitalWorkforcePortalApi.getMyActivity(80),
  })
  const { data: orchRes, isLoading: orchLoading, error: orchError } = useQuery({
    queryKey: ['digital-workforce', 'orchestration-history', 50],
    queryFn: () => digitalWorkforcePortalApi.getOrchestrationHistory(50),
  })

  const activityItems = activityRes?.data.data.items ?? []
  const orchItems = orchRes?.data.data.items ?? []

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-800">流程执行实况</h2>
        <p className="mt-1 text-sm text-slate-500">近期执行任务与编排记录</p>
      </div>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          <Activity className="h-4 w-4" />
          我的执行任务
        </h3>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {activityLoading ? (
            <div className="p-8 text-center text-slate-500">加载中...</div>
          ) : activityError ? (
            <div className="p-8 text-center text-red-600">执行任务加载失败，请稍后重试</div>
          ) : activityItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500">暂无执行记录</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {activityItems.slice(0, 30).map((t) => (
                <li key={t.task_id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <span className="font-medium text-slate-800">{t.name || t.task_id}</span>
                    <span className="ml-2 text-slate-500">{t.runtime_type}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">{t.status}</span>
                    <span className="text-xs text-slate-400">{t.created_at?.slice(0, 19)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          <PlayCircle className="h-4 w-4" />
          编排执行历史
        </h3>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          {orchLoading ? (
            <div className="p-8 text-center text-slate-500">加载中...</div>
          ) : orchError ? (
            <div className="p-8 text-center text-red-600">编排记录加载失败，请稍后重试</div>
          ) : orchItems.length === 0 ? (
            <div className="p-8 text-center text-slate-500">暂无编排记录</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-3 px-4 font-medium text-slate-700">任务 ID</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">查询</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">状态</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">子任务数</th>
                  <th className="text-right py-3 px-4 font-medium text-slate-700">耗时(ms)</th>
                  <th className="text-left py-3 px-4 font-medium text-slate-700">时间</th>
                </tr>
              </thead>
              <tbody>
                {orchItems.map((row) => (
                  <tr key={row.task_id} className="border-b border-slate-100">
                    <td className="py-3 px-4 font-mono text-xs">{row.task_id}</td>
                    <td className="max-w-xs truncate py-3 px-4" title={row.query}>
                      {row.query}
                    </td>
                    <td className="py-3 px-4">{row.status}</td>
                    <td className="py-3 px-4 text-right">{row.sub_task_count}</td>
                    <td className="py-3 px-4 text-right">{row.duration_ms ?? '-'}</td>
                    <td className="py-3 px-4 text-slate-500">{row.created_at?.slice(0, 19)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">协作可视化</h3>
        <CollaborationDag />
      </section>
    </div>
  )
}
