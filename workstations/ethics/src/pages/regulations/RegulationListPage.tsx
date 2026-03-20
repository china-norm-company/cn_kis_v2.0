import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ethicsApi } from '@/services/ethicsApi'

const IMPACT_COLORS: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-emerald-100 text-emerald-700',
}

export function RegulationListPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['ethics', 'regulations', page],
    queryFn: () => ethicsApi.getRegulations({ page, page_size: 20 }),
  })

  const items = data?.data?.items ?? []
  const total = data?.data?.total ?? 0

  return (
    <div className="space-y-4 md:space-y-5">
      <h2 className="text-lg font-semibold text-slate-800 md:text-xl">法规跟踪</h2>

      <div className="bg-white rounded-lg border border-slate-200">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-400">加载中...</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">暂无数据</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase">
                <th className="px-4 py-3">法规名称</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">发布日期</th>
                <th className="px-4 py-3">影响级别</th>
                <th className="px-4 py-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm font-medium text-slate-700">{item.title}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.regulation_type_display || item.regulation_type}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.publish_date ? new Date(item.publish_date).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded-full font-medium ${IMPACT_COLORS[item.impact_level] || 'bg-slate-100'}`}>
                      {item.impact_level_display || item.impact_level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{item.status_display || item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {total > 20 && (
        <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="min-h-10 px-3 py-1.5 text-sm rounded border border-slate-200 disabled:opacity-50" title="上一页">上一页</button>
          <span className="px-3 py-1.5 text-sm text-slate-600">第 {page} 页 / 共 {Math.ceil(total / 20)} 页</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(total / 20)} className="min-h-10 px-3 py-1.5 text-sm rounded border border-slate-200 disabled:opacity-50" title="下一页">下一页</button>
        </div>
      )}
    </div>
  )
}
