import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { evaluatorApi } from '@cn-kis/api-client'
import { Badge, Empty, LimsSourceBadge, isLimsImported, getLimsBatchNo } from '@cn-kis/ui-kit'
import { ClipboardList, ChevronRight, Filter } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待接受' },
  { value: 'accepted', label: '已接受' },
  { value: 'in_progress', label: '执行中' },
  { value: 'completed', label: '已完成' },
  { value: 'paused', label: '已暂停' },
]

const STATUS_COLORS: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  pending: 'warning',
  accepted: 'info',
  in_progress: 'info',
  completed: 'success',
  paused: 'error',
}

export function WorkOrderListPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['evaluator', 'workorders', status],
    queryFn: () => evaluatorApi.myWorkorders({ status: status || undefined, page_size: 50 }),
  })

  const items = (data as any)?.data?.items ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">我的工单</h2>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Filter className="w-3 h-3" />
          <span>共 {(data as any)?.data?.total ?? 0} 条</span>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatus(opt.value)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              status === opt.value
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">加载中...</div>
      ) : items.length === 0 ? (
        <Empty message="暂无工单" />
      ) : (
        <div className="space-y-2">
          {items.map((wo: any) => (
            <div
              key={wo.id}
              onClick={() => navigate(`/execute/${wo.id}`)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 active:bg-slate-50 cursor-pointer"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                <ClipboardList className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-800 truncate">{wo.title}</span>
                  {isLimsImported(wo) && (
                    <LimsSourceBadge compact showTooltip batchNo={getLimsBatchNo(wo)} />
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {wo.scheduled_date || wo.create_time?.slice(0, 10)}
                </div>
              </div>
              <Badge variant={STATUS_COLORS[wo.status] || 'default'}>
                {STATUS_OPTIONS.find((o) => o.value === wo.status)?.label ?? wo.status}
              </Badge>
              <ChevronRight className="w-4 h-4 text-slate-300" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
