/**
 * 经营日报 — 编排器每日经营摘要（generate_daily_brief）
 * P1 闭环二：生成后可查看本次执行回放
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { FileText, RefreshCw, ExternalLink } from 'lucide-react'

export default function DailyBriefPage() {
  const [trigger, setTrigger] = useState(0)
  const { data: res, isLoading, isFetching } = useQuery({
    queryKey: ['digital-workforce', 'daily-brief', trigger],
    queryFn: () => digitalWorkforcePortalApi.postDailyBrief({ target_role: 'all' }),
    enabled: trigger > 0,
    staleTime: 60 * 1000,
  })

  const payload = res?.data?.data as Record<string, unknown> | undefined
  const summary = typeof payload?.summary === 'string' ? payload.summary : (typeof payload?.content === 'string' ? payload.content : '')
  const sections = Array.isArray(payload?.sections) ? (payload.sections as Array<{ title?: string; content?: string }>) : []
  const orchestrationRunId = typeof payload?.orchestration_run_id === 'string' ? payload.orchestration_run_id : ''

  return (
    <div data-testid="daily-brief-page" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">经营日报</h2>
          <p className="mt-1 text-sm text-slate-500">由编排器聚合 KPI 与预警生成的每日工作简报</p>
        </div>
        <button
          type="button"
          onClick={() => setTrigger((t) => t + 1)}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          生成日报
        </button>
      </div>

      {isLoading || isFetching ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          {isFetching && !isLoading ? '正在生成...' : '加载中...'}
        </div>
      ) : payload ? (
        <div className="space-y-4">
          {orchestrationRunId && (
            <div className="flex justify-end">
              <Link
                to={`/replay/${orchestrationRunId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
              >
                <ExternalLink className="h-4 w-4" />
                查看本次执行回放
              </Link>
            </div>
          )}
          {summary && (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-2 text-slate-500">
                <FileText className="h-5 w-5" />
                <span className="text-sm font-medium">摘要</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-slate-700">{summary}</p>
            </div>
          )}
          {sections.length > 0 && (
            <div className="space-y-3">
              {sections.map((s: { title?: string; content?: string }, i: number) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-6">
                  <h3 className="text-sm font-semibold text-slate-600">{s.title ?? '未命名'}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-slate-700">{s.content ?? ''}</p>
                </div>
              ))}
            </div>
          )}
          {!summary && sections.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              暂无日报内容，点击「生成日报」获取最新简报。
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          点击「生成日报」获取编排器生成的每日经营摘要。
        </div>
      )}
    </div>
  )
}
