import { useQuery } from '@tanstack/react-query'
import { launchGovernanceApi } from '@cn-kis/api-client'
import { GitBranch } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  ready: '通',
  partial: '半通',
  blocked: '断',
}

export function LaunchLifecyclePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'launch-lifecycle'],
    queryFn: () => launchGovernanceApi.getLifecycle(),
  })

  if (isLoading) {
    return <div className="text-sm text-slate-500 py-12 text-center">加载闭环节点…</div>
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {(error as Error).message || '加载失败'}
      </div>
    )
  }

  const nodes = data?.nodes || []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">最小项目全生命周期闭环</h2>
        <p className="text-sm text-slate-500 mt-1">
          Protocol → 排程发布 → 工单 → 入组 → 现场签到 → 质量/偏差；指标来自生产库实时统计
        </p>
      </div>

      <div className="space-y-3">
        {nodes.map((n) => (
          <div
            key={n.key}
            className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-slate-800">{n.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    n.status === 'ready'
                      ? 'bg-emerald-50 text-emerald-700'
                      : n.status === 'partial'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-red-50 text-red-700'
                  }`}
                >
                  {STATUS_LABEL[n.status] || n.status}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                主责台：{n.primary_workstations.join('、')}
              </div>
            </div>
            <div className="flex gap-6 text-sm">
              <div>
                <div className="text-slate-400 text-xs">累计</div>
                <div className="font-bold text-slate-800">{n.total}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs">近 7 日</div>
                <div className="font-bold text-slate-800">{n.recent_7d}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400">
        验收清单见 <code className="bg-slate-100 px-1 rounded">docs/MINIMAL_PROJECT_LOOP_ACCEPTANCE.md</code>
        ，命令行自检：<code className="bg-slate-100 px-1 rounded">python manage.py check_minimal_project_loop</code>
      </p>
    </div>
  )
}
