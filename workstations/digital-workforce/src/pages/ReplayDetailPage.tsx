/**
 * 回放详情 — 编排运行 + 子任务 + 结构化产物（P1 闭环回放）+ 断点恢复
 */
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { ArrowLeft, FileText, Layers, CheckCircle, XCircle, Briefcase, FolderOpen, Target, RefreshCw } from 'lucide-react'

export default function ReplayDetailPage() {
  const { taskId } = useParams<{ taskId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: res, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'replay', taskId],
    queryFn: () => digitalWorkforcePortalApi.getReplay(taskId!),
    enabled: !!taskId,
  })
  const { data: portalRes } = useQuery({
    queryKey: ['digital-workforce', 'portal'],
    queryFn: () => digitalWorkforcePortalApi.getPortal(),
    enabled: !!taskId,
  })

  const resumeMut = useMutation({
    mutationFn: (tid: string) => digitalWorkforcePortalApi.resumeOrchestration(tid),
    onSuccess: (result: { data?: { data?: { new_task_id?: string } } }) => {
      const newTaskId = result?.data?.data?.new_task_id
      queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'replay-runs'] })
      if (newTaskId) navigate(`/replay/${encodeURIComponent(newTaskId)}`)
    },
  })

  const data = res?.data?.data
  const roles = portalRes?.data?.data?.roles ?? []
  const roleNameMap = Object.fromEntries(roles.map((role) => [role.role_code, role.role_name]))
  if (!taskId) {
    return (
      <div data-testid="replay-detail-page" className="space-y-6">
        <p className="text-slate-600">缺少运行 ID</p>
        <Link to="/replay" className="text-primary-600 hover:underline">返回执行回放</Link>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div data-testid="replay-detail-page" className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div data-testid="replay-detail-page" className="space-y-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
          {error ? '加载失败' : '运行记录不存在'}
        </div>
        <Link to="/replay" className="text-primary-600 hover:underline">返回执行回放</Link>
      </div>
    )
  }

  const artifacts = (data.structured_artifacts || {}) as Record<string, unknown>
  const hasArtifacts = artifacts && Object.keys(artifacts).length > 0

  return (
    <div data-testid="replay-detail-page" className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/replay"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          返回执行回放
        </Link>
      </div>

      <div>
        <h2 className="text-xl font-bold text-slate-800">回放详情</h2>
        <p className="mt-1 text-sm text-slate-500">
          {data.task_id} · {data.status} · {data.sub_task_count} 个子任务 · {data.duration_ms}ms
        </p>
        {(data.status === 'failed' || data.status === 'partial') && (
          <div className="mt-3">
            <button
              disabled={resumeMut.isPending}
              onClick={() => taskId && resumeMut.mutate(taskId)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${resumeMut.isPending ? 'animate-spin' : ''}`} />
              {resumeMut.isPending ? '恢复中...' : '恢复执行（断点续跑）'}
            </button>
            {resumeMut.isError && (
              <p className="mt-1 text-xs text-red-500">恢复失败，请重试</p>
            )}
          </div>
        )}
      </div>

      {(data.role_code || data.workstation_key || data.business_object_type || data.business_object_id) && (
        <div className="rounded-xl border border-slate-200 bg-white p-6" data-testid="replay-governance-block">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600">岗位 / 工作台 / 业务对象</h3>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {data.role_code && (
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-slate-500">岗位</span>
                <Link to={`/roles/${data.role_code}`} className="text-primary-600 hover:underline">
                  {roleNameMap[data.role_code] || data.role_code}
                </Link>
              </div>
            )}
            {data.domain_code && (
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-slate-500">领域</span>
                <span className="text-slate-800">{data.domain_code}</span>
              </div>
            )}
            {data.workstation_key && (
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-slate-500">工作台</span>
                <span className="text-slate-800">{data.workstation_key}</span>
              </div>
            )}
            {(data.business_object_type || data.business_object_id) && (
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="text-slate-500">业务对象</span>
                <span className="text-slate-800">
                  {data.business_object_type || '—'}
                  {data.business_object_id ? ` / ${data.business_object_id}` : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <FileText className="h-4 w-4" />
          原始请求
        </h3>
        <p className="mt-2 whitespace-pre-wrap text-slate-700">{data.query}</p>
      </div>

      {data.aggregated_output && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600">聚合输出</h3>
          <p className="mt-2 whitespace-pre-wrap text-slate-700">{data.aggregated_output}</p>
        </div>
      )}

      {hasArtifacts && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600">结构化产物</h3>
          <div className="mt-3 space-y-2 text-sm">
            {!!artifacts.demand_summary && (
              <div>
                <span className="font-medium text-slate-500">需求摘要：</span>
                <span className="text-slate-700">{String(artifacts.demand_summary)}</span>
              </div>
            )}
            {Array.isArray(artifacts.gap_list) && (artifacts.gap_list as string[]).length > 0 && (
              <div>
                <span className="font-medium text-slate-500">缺口清单：</span>
                <ul className="mt-1 list-inside list-disc text-slate-700">
                  {(artifacts.gap_list as string[]).map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
            {!!artifacts.solution_draft && (
              <div>
                <span className="font-medium text-slate-500">方案初稿：</span>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{String(artifacts.solution_draft)}</p>
              </div>
            )}
            {Array.isArray(artifacts.quote_inputs) && (artifacts.quote_inputs as string[]).length > 0 && (
              <div>
                <span className="font-medium text-slate-500">报价输入项：</span>
                <ul className="mt-1 list-inside list-disc text-slate-700">
                  {(artifacts.quote_inputs as string[]).map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <h3 className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
          <Layers className="h-4 w-4" />
          子任务
        </h3>
        <ul className="divide-y divide-slate-100">
          {(data.sub_tasks || []).map((st: { index: number; domain: string; agent_id: string; status: string; output: string; duration_ms: number }) => (
            <li key={st.index} className="px-4 py-3">
              <div className="flex items-center gap-2">
                {st.status === 'success' ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="font-mono text-slate-600">
                  [{st.index}] {st.domain} / {st.agent_id}
                </span>
                <span className="text-slate-400">{st.duration_ms}ms</span>
              </div>
              {st.output && (
                <p className="mt-2 truncate text-sm text-slate-500 max-w-2xl">{st.output.slice(0, 200)}…</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
