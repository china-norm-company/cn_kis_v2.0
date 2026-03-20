/**
 * 执行回放 — 中书·数字员工中心
 * 编排回放：按工作台/岗位/业务对象过滤；按 action_id 查询动作回放
 */
import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { assistantReplayApi, assistantActionsApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { Card } from '@cn-kis/ui-kit'

type ReplayExecutionRecord = {
  execution_id?: number | string
  result?: {
    status?: string
    run_id?: string
    failed_step?: string
    skills_used?: string[] | string
  }
}

export default function ReplayCenterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const paramActionId = searchParams.get('action_id')
  const paramRoleCode = searchParams.get('role_code')
  const [actionIdInput, setActionIdInput] = useState(paramActionId ?? '')
  const [queriedId, setQueriedId] = useState<number | null>(paramActionId ? parseInt(paramActionId, 10) : null)
  const [filterWorkstation, setFilterWorkstation] = useState('')
  const [filterRole, setFilterRole] = useState(paramRoleCode ?? '')
  const [filterBusinessObject, setFilterBusinessObject] = useState('')

  const { data: replayRunsRes } = useQuery({
    queryKey: ['digital-workforce', 'replay-runs', filterWorkstation, filterRole, filterBusinessObject],
    queryFn: () =>
      digitalWorkforcePortalApi.getReplayRuns({
        limit: 30,
        ...(filterWorkstation ? { workstation_key: filterWorkstation } : {}),
        ...(filterRole ? { role_code: filterRole } : {}),
        ...(filterBusinessObject ? { business_object_type: filterBusinessObject } : {}),
      }),
  })
  const replayRuns = replayRunsRes?.data?.data?.items ?? []
  const { data: portalRes } = useQuery({
    queryKey: ['digital-workforce', 'portal'],
    queryFn: () => digitalWorkforcePortalApi.getPortal(),
  })
  const roles = portalRes?.data?.data?.roles ?? []
  const roleNameMap = Object.fromEntries((portalRes?.data?.data?.roles ?? []).map((role) => [role.role_code, role.role_name]))

  const { data: inboxData } = useQuery({
    queryKey: ['digital-workforce', 'replay-inbox', 'all'],
    queryFn: () => assistantActionsApi.getInbox({ status: 'all' }),
  })
  const recentItems =
    (inboxData as { data?: { items?: Array<{ id: number; title?: string; action_type?: string; status?: string }> } } | undefined)?.data?.items?.slice(0, 20) ?? []

  useEffect(() => {
    if (paramActionId) {
      const id = parseInt(paramActionId, 10)
      if (Number.isFinite(id)) {
        setQueriedId(id)
        setActionIdInput(paramActionId)
      }
    } else {
      setQueriedId(null)
    }
  }, [paramActionId])

  useEffect(() => {
    setFilterRole(paramRoleCode ?? '')
  }, [paramRoleCode])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['digital-workforce', 'replay', queriedId],
    queryFn: () => assistantReplayApi.getByActionId(queriedId!),
    enabled: queriedId != null && Number.isFinite(queriedId),
  })

  const replay = (data as { data?: { ok?: boolean; action?: unknown; executions?: ReplayExecutionRecord[] } } | undefined)?.data
  const executions: ReplayExecutionRecord[] = replay?.executions ?? []
  const action = replay?.action as Record<string, unknown> | undefined

  const handleSearch = () => {
    const id = parseInt(actionIdInput.trim(), 10)
    if (Number.isFinite(id)) setQueriedId(id)
  }

  return (
    <div data-testid="replay-center-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">执行回放</h2>
        <p className="mt-1 text-sm text-slate-500">编排回放可按工作台/岗位/业务对象筛选；按 action_id 查看动作回放</p>
      </div>

      <Card data-testid="replay-runs-section">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">编排回放（按工作台 / 岗位 / 业务对象筛选）</h3>
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            type="text"
            value={filterWorkstation}
            onChange={(e) => setFilterWorkstation(e.target.value)}
            placeholder="工作台 workstation_key"
            className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            aria-label="工作台"
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            aria-label="岗位"
          >
            <option value="">全部岗位</option>
            {roles.map((role) => (
              <option key={role.role_code} value={role.role_code}>
                {role.role_name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={filterBusinessObject}
            onChange={(e) => setFilterBusinessObject(e.target.value)}
            placeholder="业务对象类型"
            className="w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            aria-label="业务对象类型"
          />
        </div>
        {replayRuns.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">暂无编排回放记录，或放宽筛选条件</p>
        ) : (
          <ul className="space-y-2">
            {replayRuns.map((run) => (
              <li key={run.task_id}>
                <div className="rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50">
                  <button
                    type="button"
                    onClick={() => navigate(`/replay/${run.task_id}`)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 text-left text-sm"
                  >
                    <span className="font-mono text-slate-700">{run.task_id}</span>
                    <span className="text-xs text-slate-400">
                      {run.status} · {run.sub_task_count} 子任务
                      {run.workstation_key ? ` · ${run.workstation_key}` : ''}
                      {run.role_code ? ` · ${roleNameMap[run.role_code] || run.role_code}` : ''}
                    </span>
                    <span className="w-full truncate text-slate-500">{run.query_snippet ?? run.query}</span>
                  </button>
                  {run.role_code && (
                    <div className="mt-1 text-xs">
                      <Link to={`/roles/${run.role_code}`} className="text-primary-600 hover:underline">
                        查看岗位详情
                      </Link>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">action_id</label>
          <input
            type="number"
            value={actionIdInput}
            onChange={(e) => setActionIdInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="输入动作 ID"
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={!actionIdInput.trim() || isLoading || isFetching}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isFetching ? '查询中...' : '查询'}
          </button>
        </div>
      </Card>

      {queriedId != null && !Number.isFinite(queriedId) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">请输入有效的 action_id（数字）</div>
      )}

      {queriedId != null && Number.isFinite(queriedId) && (
        <>
          {isLoading || isFetching ? (
            <Card>
              <div className="py-8 text-center text-slate-500">加载回放中...</div>
            </Card>
          ) : !replay?.ok && !replay?.action && executions.length === 0 ? (
            <Card>
              <div className="py-8 text-center text-slate-500">未找到该动作的回放数据</div>
            </Card>
          ) : (
            <div className="space-y-4">
              {action && (
                <Card>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">动作信息</h3>
                  <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <dt className="text-slate-500">action_type</dt>
                    <dd className="text-slate-800">{String(action.action_type ?? '-')}</dd>
                    <dt className="text-slate-500">title</dt>
                    <dd className="text-slate-800">{String(action.title ?? '-')}</dd>
                    <dt className="text-slate-500">status</dt>
                    <dd className="text-slate-800">{String(action.status ?? '-')}</dd>
                    <dt className="text-slate-500">capability_key</dt>
                    <dd className="text-slate-800">{String(action.capability_key ?? '-')}</dd>
                  </dl>
                </Card>
              )}
              <Card>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">执行记录 ({executions.length})</h3>
                {executions.length === 0 ? (
                  <p className="text-sm text-slate-500">暂无执行记录</p>
                ) : (
                  <ul className="space-y-3">
                    {executions.map((exec, idx) => (
                      <li key={idx} className="rounded-lg border border-slate-200 p-3 text-sm">
                        <div className="flex flex-wrap gap-2">
                          <span className="text-slate-500">execution_id:</span>
                          <span className="font-mono">{String(exec.execution_id ?? '-')}</span>
                          {exec.result?.status != null && (
                            <>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-500">status:</span>
                              <span>{exec.result.status}</span>
                            </>
                          )}
                          {exec.result?.run_id != null && (
                            <>
                              <span className="text-slate-400">|</span>
                              <span className="text-slate-500">run_id:</span>
                              <span className="font-mono">{exec.result.run_id}</span>
                            </>
                          )}
                        </div>
                        {exec.result?.failed_step && <p className="mt-2 text-rose-600">失败步骤: {exec.result.failed_step}</p>}
                        {exec.result?.skills_used && (
                          <p className="mt-1 text-slate-600">
                            skills_used:{' '}
                            {Array.isArray(exec.result.skills_used)
                              ? exec.result.skills_used.join(', ')
                              : String(exec.result.skills_used)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}
        </>
      )}

      {queriedId == null && (
        <Card>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">最近动作（可点击查看回放）</h3>
          {recentItems.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">暂无动作记录，请先到动作中心产生动作，或在上方输入 action_id 查询</p>
          ) : (
            <ul className="space-y-2">
              {recentItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/replay?action_id=${item.id}`)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="truncate text-slate-800">
                      #{item.id} {item.title ?? item.action_type ?? '-'}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{item.status ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-400">或在上方输入 action_id 精确查询</p>
        </Card>
      )}
    </div>
  )
}
