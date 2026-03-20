/**
 * Phase 3：Replay 评测 — 动作执行回放与 LLM 评分
 */
import { useQuery } from '@tanstack/react-query'
import { assistantActionsApi, assistantReplayApi } from '@cn-kis/api-client'
import { Play, Loader2 } from 'lucide-react'
import { useState } from 'react'

export default function ReplayEvalPage() {
  const [replayActionId, setReplayActionId] = useState<number | null>(null)

  const { data: inboxRes } = useQuery({
    queryKey: ['digital-workforce', 'replay-inbox'],
    queryFn: () => assistantActionsApi.getInbox({}),
  })

  const { data: replayRes, isLoading: replayLoading } = useQuery({
    queryKey: ['digital-workforce', 'replay-detail', replayActionId],
    queryFn: () => assistantReplayApi.getByActionId(replayActionId!),
    enabled: replayActionId != null,
  })

  const items = (inboxRes as { data?: { items?: Array<{ id: number; title: string; status: string; action_type: string }> } })?.data?.items ?? []
  const replay = replayRes as { data?: { ok?: boolean; action?: { id: number; title: string }; executions?: Array<{ execution_id: number; result?: { status?: string; run_id?: string } }> } } | undefined

  return (
    <div data-testid="replay-eval-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Replay 评测</h2>
        <p className="mt-1 text-sm text-slate-500">从动作箱选择动作查看执行回放与结果</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">最近动作</h3>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">暂无动作</p>
          ) : (
            <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto">
              {items.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{a.title || `#${a.id}`}</p>
                    <p className="text-xs text-slate-500">{a.action_type} · {a.status}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplayActionId(a.id)}
                    className="ml-2 inline-flex items-center gap-1 rounded bg-violet-600 px-2 py-1 text-xs font-medium text-white hover:bg-violet-700"
                  >
                    <Play className="h-3 w-3" />
                    查看回放
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">回放详情</h3>
          {replayActionId == null ? (
            <p className="mt-2 text-sm text-slate-500">请从左侧选择动作查看回放</p>
          ) : replayLoading ? (
            <div className="mt-4 flex items-center justify-center gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>加载中…</span>
            </div>
          ) : replay?.data?.ok ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-medium text-slate-800">{replay.data.action?.title ?? `动作 #${replayActionId}`}</p>
              <p className="text-xs text-slate-500">执行次数: {replay.data.executions?.length ?? 0}</p>
              <ul className="max-h-64 space-y-1 overflow-y-auto text-xs text-slate-600">
                {(replay.data.executions ?? []).map((ex) => (
                  <li key={ex.execution_id} className="rounded bg-slate-50 px-2 py-1">
                    执行 #{ex.execution_id} · 状态: {ex.result?.status ?? '-'} · run_id: {ex.result?.run_id ?? '-'}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">无法加载回放或该动作无回放数据</p>
          )}
        </div>
      </div>
    </div>
  )
}
