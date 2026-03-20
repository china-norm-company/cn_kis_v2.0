/**
 * Phase 2：工具清单 — Agent 可调用的 Tool 定义
 */
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { Wrench } from 'lucide-react'

export default function ToolsPage() {
  const { data: res, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'tools'],
    queryFn: () => digitalWorkforcePortalApi.getTools(),
  })

  const tools = (res?.data?.data?.tools ?? []) as Array<{ name: string; description: string }>

  if (error) {
    return (
      <div data-testid="tools-page" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p>加载失败</p>
      </div>
    )
  }

  return (
    <div data-testid="tools-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">工具清单</h2>
        <p className="mt-1 text-sm text-slate-500">Agent 可调用的工具名称与说明（共 {tools.length} 个）</p>
      </div>
      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
      ) : tools.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">暂无工具数据</div>
      ) : (
        <ul className="space-y-2">
          {tools.map((t) => (
            <li
              key={t.name}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                <Wrench className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-mono font-medium text-slate-800">{t.name}</p>
                {t.description && <p className="mt-1 text-sm text-slate-600">{t.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
