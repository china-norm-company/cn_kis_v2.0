/**
 * 工作动态 — 我的 Agent 今日执行记录（UnifiedExecutionTask 时间线）
 */
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { CheckCircle, XCircle, Clock } from 'lucide-react'

const STATUS_LABELS: Record<string, string> = {
  succeeded: '成功',
  success: '成功',
  failed: '失败',
  running: '进行中',
  pending: '待执行',
  suggested: '已建议',
  approved: '已批准',
  cancelled: '已取消',
  partial: '部分成功',
}

function StatusIcon({ status }: { status: string }) {
  const s = (status || '').toLowerCase()
  if (s === 'succeeded' || s === 'success') return <CheckCircle className="h-4 w-4 text-emerald-500" />
  if (s === 'failed' || s === 'cancelled') return <XCircle className="h-4 w-4 text-red-500" />
  return <Clock className="h-4 w-4 text-slate-400" />
}

export default function MyActivityPage() {
  const { data: res, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'my-activity'],
    queryFn: () => digitalWorkforcePortalApi.getMyActivity(50),
  })

  const items = res?.data?.data?.items ?? []

  if (error) {
    return (
      <div data-testid="my-activity-page" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p>加载失败，请稍后重试。</p>
      </div>
    )
  }

  return (
    <div data-testid="my-activity-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">工作动态</h2>
        <p className="mt-1 text-sm text-slate-500">我的数字员工近期执行任务时间线</p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          暂无执行记录。
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li
              key={t.task_id}
              data-testid="my-activity-item"
              className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4"
            >
              <StatusIcon status={t.status} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">{t.name}</p>
                <p className="text-xs text-slate-500">
                  {t.agent_or_target} · {t.runtime_type}
                  {t.created_at && ` · ${new Date(t.created_at).toLocaleString('zh-CN')}`}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                {STATUS_LABELS[t.status] ?? t.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
