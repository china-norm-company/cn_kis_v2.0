import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { evaluatorApi } from '@cn-kis/api-client'
import { Empty } from '@cn-kis/ui-kit'
import { History, CheckCircle2, Calendar } from 'lucide-react'

export function HistoryPage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['evaluator', 'history', page],
    queryFn: () => evaluatorApi.myWorkorders({ status: 'completed', page, page_size: 20 }),
  })

  const items = (data as any)?.data?.items ?? []
  const total = (data as any)?.data?.total ?? 0
  const totalPages = Math.ceil(total / 20)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">执行历史</h2>
        <span className="text-xs text-slate-400">共 {total} 条记录</span>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">加载中...</div>
      ) : items.length === 0 ? (
        <Empty message="暂无历史记录" />
      ) : (
        <>
          <div className="space-y-2">
            {items.map((wo: any) => (
              <div key={wo.id} className="flex items-center gap-3 rounded-xl bg-white border border-slate-200 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate">{wo.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <Calendar className="w-3 h-3" />
                    <span>{wo.scheduled_date || wo.create_time?.slice(0, 10)}</span>
                    {wo.work_order_type && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{wo.work_order_type}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-600 bg-slate-100 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-xs text-slate-400">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg px-3 py-1.5 text-xs text-slate-600 bg-slate-100 disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
