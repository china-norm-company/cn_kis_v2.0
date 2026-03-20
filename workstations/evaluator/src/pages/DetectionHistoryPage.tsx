import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Empty } from '@cn-kis/ui-kit'
import { Microscope, Calendar, ChevronDown } from 'lucide-react'

export function DetectionHistoryPage() {
  const [days, setDays] = useState(30)

  const { data, isLoading } = useQuery({
    queryKey: ['evaluator', 'detections', days],
    queryFn: () => api.get<any>('/evaluator/my-workorders', {
      params: { status: 'completed', page_size: 50 },
    }),
  })

  const items = (data as any)?.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">检测记录</h2>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="时间范围"
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600"
        >
          <option value={7}>近 7 天</option>
          <option value={30}>近 30 天</option>
          <option value={90}>近 90 天</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">加载中...</div>
      ) : items.length === 0 ? (
        <Empty message="暂无检测记录" />
      ) : (
        <div className="space-y-3">
          {items.map((wo: any) => (
            <div key={wo.id} className="rounded-xl bg-white border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                  <Microscope className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{wo.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <Calendar className="w-3 h-3" />
                    <span>{wo.scheduled_date || wo.create_time?.slice(0, 10)}</span>
                  </div>
                  {wo.enrollment__protocol__title && (
                    <div className="text-xs text-slate-500 mt-1 truncate">
                      方案：{wo.enrollment__protocol__title}
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  已完成
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
