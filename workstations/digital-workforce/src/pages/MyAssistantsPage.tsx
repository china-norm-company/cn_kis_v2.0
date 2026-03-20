/**
 * 我的助手列表 — 当前用户工作台绑定的 Agent，含 7 天任务数，可快速进入对话
 */
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import { Users, MessageSquare, Activity } from 'lucide-react'

export default function MyAssistantsPage() {
  const { data: res, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'my-assistants'],
    queryFn: () => digitalWorkforcePortalApi.getMyAssistants(),
  })

  const assistants = res?.data?.data?.assistants ?? []

  if (error) {
    return (
      <div data-testid="my-assistants-page" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p>加载失败，请稍后重试。</p>
      </div>
    )
  }

  return (
    <div data-testid="my-assistants-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">我的助手列表</h2>
        <p className="mt-1 text-sm text-slate-500">当前账号在工作台绑定的数字员工，最近 7 天为我完成的任务数</p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
      ) : assistants.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          暂无绑定的助手，请确认工作台配置或联系管理员。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assistants.map((a) => (
            <div
              key={a.agent_id}
              data-testid="my-assistant-card"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{a.name}</p>
                    <p className="text-xs text-slate-500">{a.agent_id}</p>
                  </div>
                </div>
              </div>
              {Array.isArray(a.capabilities) && a.capabilities.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.capabilities.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between">
                <span className="flex items-center gap-1 text-sm text-slate-600">
                  <Activity className="h-4 w-4" />
                  近 7 天完成 {a.tasks_last_7_days} 项
                </span>
                <a
                  href={getWorkstationUrl('digital-workforce', `#/chat?agent=${encodeURIComponent(a.agent_id)}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 hover:bg-violet-100"
                >
                  <MessageSquare className="h-4 w-4" />
                  去对话
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
