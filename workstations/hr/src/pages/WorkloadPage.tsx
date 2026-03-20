import { useQuery } from '@tanstack/react-query'
import { Card } from '@cn-kis/ui-kit'
import { api } from '@cn-kis/api-client'
import { Briefcase, Users } from 'lucide-react'

interface WorkloadItem {
  staff_id: number
  staff_name: string
  position: string
  active_projects: number
  current_hours: number
  max_hours: number
}

interface WorkloadResponse {
  items: WorkloadItem[]
}

function getWorkloadColor(pct: number): string {
  if (pct < 60) return 'bg-emerald-500'
  if (pct <= 85) return 'bg-amber-500'
  return 'bg-red-500'
}

export function WorkloadPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['hr-workload'],
    queryFn: () => api.get<WorkloadResponse>('/hr/workload'),
  })

  const items = data?.data?.items ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Briefcase className="w-7 h-7" />
          工作负荷看板
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          查看团队成员当前工作负荷与项目参与情况
        </p>
      </div>

      {isLoading ? (
        <div className="text-slate-500">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => {
            const pct = item.max_hours > 0 ? (item.current_hours / item.max_hours) * 100 : 0
            const barColor = getWorkloadColor(pct)
            return (
              <Card key={item.staff_id}>
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-slate-400" />
                    <div>
                      <div className="font-semibold text-slate-800">{item.staff_name}</div>
                      <div className="text-sm text-slate-500">{item.position || '-'}</div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600">工时负荷</span>
                      <span className="font-medium text-slate-800">
                        {item.current_hours}h / {item.max_hours}h
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-sm text-slate-600">
                    在研项目: <strong className="text-slate-800">{item.active_projects}</strong> 个
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <Card>
          <div className="p-8 text-center text-slate-500">暂无工作负荷数据</div>
        </Card>
      )}
    </div>
  )
}
