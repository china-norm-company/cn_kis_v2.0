import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Badge, Empty } from '@cn-kis/ui-kit'
import { AlertTriangle, Clock } from 'lucide-react'

const SEVERITY_MAP: Record<string, { label: string; variant: 'error' | 'warning' | 'info' }> = {
  critical: { label: '严重', variant: 'error' },
  major: { label: '重大', variant: 'error' },
  minor: { label: '轻微', variant: 'warning' },
  observation: { label: '观察', variant: 'info' },
}

export function ExceptionListPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['evaluator', 'exceptions'],
    queryFn: () => api.get<any>('/evaluator/my-workorders', {
      params: { page_size: 100 },
    }),
  })

  const workOrders = (data as any)?.data?.items ?? []
  const hasWorkOrders = workOrders.length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">异常管理</h2>
        <span className="text-xs text-slate-400">
          基于工单的异常记录
        </span>
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium text-amber-800">异常上报说明</div>
            <div className="text-xs text-amber-600 mt-1">
              在工单执行过程中发现异常，可通过「执行页面」的异常上报功能记录。
              所有异常记录将自动关联到对应工单，并通知质量台跟踪。
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">加载中...</div>
      ) : !hasWorkOrders ? (
        <Empty message="暂无工单及异常记录" />
      ) : (
        <div className="space-y-3">
          {workOrders.filter((wo: any) => wo.status === 'paused' || wo.status === 'exception').map((wo: any) => (
            <div key={wo.id} className="rounded-xl bg-white border border-red-100 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{wo.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{wo.create_time?.slice(0, 10)}</span>
                  </div>
                </div>
                <Badge variant="error">异常</Badge>
              </div>
            </div>
          ))}
          {workOrders.filter((wo: any) => wo.status === 'paused' || wo.status === 'exception').length === 0 && (
            <div className="text-center py-8 text-sm text-slate-400">暂无异常工单，运行正常</div>
          )}
        </div>
      )}
    </div>
  )
}
