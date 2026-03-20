/**
 * Phase 2：策略学习 — WorkerPolicyUpdate 学习记录 + 治理操作
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  evaluating: '评测中',
  active: '生效中',
  retired: '已退役',
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  evaluating: 'bg-amber-100 text-amber-700',
  active: 'bg-green-100 text-green-700',
  retired: 'bg-red-50 text-red-500',
}

type PolicyItem = {
  id: number
  worker_code: string
  domain_code: string
  policy_key: string
  outcome: string
  root_cause: string
  better_policy: string
  replay_score: number
  status: string
  created_at: string
  activated_at: string | null
}

export default function PolicyLearningPage() {
  const queryClient = useQueryClient()

  const { data: res, isLoading } = useQuery({
    queryKey: ['digital-workforce', 'policy-learning', 50],
    queryFn: () => digitalWorkforcePortalApi.getPolicyLearning(50),
  })

  const items: PolicyItem[] = (res as { data?: { items?: PolicyItem[] } })?.data?.items ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['digital-workforce', 'policy-learning'] })

  const activateMut = useMutation({
    mutationFn: (id: number) => digitalWorkforcePortalApi.activatePolicyLearning(id),
    onSuccess: invalidate,
  })

  const retireMut = useMutation({
    mutationFn: (id: number) => digitalWorkforcePortalApi.retirePolicyLearning(id, '手动退役'),
    onSuccess: invalidate,
  })

  const rollbackMut = useMutation({
    mutationFn: (id: number) => digitalWorkforcePortalApi.rollbackPolicyLearning(id, '手动回滚'),
    onSuccess: invalidate,
  })

  const submitEvalMut = useMutation({
    mutationFn: (id: number) => digitalWorkforcePortalApi.submitPolicyForEvaluation(id),
    onSuccess: invalidate,
  })

  const approveMut = useMutation({
    mutationFn: (id: number) => digitalWorkforcePortalApi.approvePolicyEvaluation(id),
    onSuccess: invalidate,
  })

  const rejectMut = useMutation({
    mutationFn: (id: number) => digitalWorkforcePortalApi.rejectPolicyEvaluation(id, '审批驳回'),
    onSuccess: invalidate,
  })

  const isPending = activateMut.isPending || retireMut.isPending || rollbackMut.isPending || submitEvalMut.isPending || approveMut.isPending || rejectMut.isPending

  return (
    <div data-testid="policy-learning-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">策略学习</h2>
        <p className="mt-1 text-sm text-slate-500">学习闭环生成的策略升级记录 · 完整审批流：草稿 {'→'} 评测 {'→'} 生效</p>
      </div>

      {/* 策略审批流程说明 */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-3">
        <div className="flex items-center gap-3 text-sm text-blue-800">
          <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium">草稿</span>
          <span className="text-blue-400">-&gt;</span>
          <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-medium">评测中</span>
          <span className="text-blue-400">-&gt;</span>
          <span className="rounded bg-green-200 px-2 py-0.5 text-xs font-medium">生效中</span>
          <span className="ml-2 text-xs text-blue-500">| 可随时退役或回滚</span>
        </div>
      </div>

      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">加载中…</div>
      )}

      {!isLoading && items.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          暂无策略学习记录
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">Worker</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">策略</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">状态</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">Replay 分</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">结果/根因</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">创建时间</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-700">{row.worker_code}</td>
                  <td className="max-w-[120px] truncate px-4 py-2 text-sm text-slate-700" title={row.policy_key}>{row.policy_key}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status] ?? 'bg-slate-100 text-slate-700'}`}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-slate-600">{(row.replay_score * 100).toFixed(0)}%</td>
                  <td className="max-w-[180px] truncate px-4 py-2 text-xs text-slate-600" title={`${row.outcome || ''} / ${row.root_cause || ''}`}>
                    {row.outcome || row.root_cause || '-'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{row.created_at?.slice(0, 19)}</td>
                  <td className="whitespace-nowrap px-4 py-2">
                    <div className="flex gap-1">
                      {row.status === 'draft' && (
                        <button
                          disabled={isPending}
                          onClick={() => submitEvalMut.mutate(row.id)}
                          className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          提交评测
                        </button>
                      )}
                      {row.status === 'evaluating' && (
                        <>
                          <button
                            disabled={isPending}
                            onClick={() => approveMut.mutate(row.id)}
                            className="rounded bg-green-600 px-2 py-0.5 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            批准
                          </button>
                          <button
                            disabled={isPending}
                            onClick={() => rejectMut.mutate(row.id)}
                            className="rounded bg-red-500 px-2 py-0.5 text-xs text-white hover:bg-red-600 disabled:opacity-50"
                          >
                            驳回
                          </button>
                        </>
                      )}
                      {row.status === 'active' && (
                        <>
                          <button
                            disabled={isPending}
                            onClick={() => retireMut.mutate(row.id)}
                            className="rounded bg-slate-500 px-2 py-0.5 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
                          >
                            退役
                          </button>
                          <button
                            disabled={isPending}
                            onClick={() => rollbackMut.mutate(row.id)}
                            className="rounded bg-amber-500 px-2 py-0.5 text-xs text-white hover:bg-amber-600 disabled:opacity-50"
                          >
                            回滚
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
