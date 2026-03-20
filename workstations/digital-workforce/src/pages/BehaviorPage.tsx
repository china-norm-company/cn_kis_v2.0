/**
 * 行为策略配置 — WorkerPolicyUpdate 按数字员工分组 + 偏好配置（自动执行/审批模式等）
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { assistantPreferencesApi, type AssistantPreferenceValue } from '@cn-kis/api-client'
import { Sliders, Loader2 } from 'lucide-react'

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  evaluating: '评测中',
  active: '生效中',
  retired: '已退役',
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

export default function BehaviorPage() {
  const queryClient = useQueryClient()
  const { data: policyRes, isLoading: loadingPolicy, error: policyError } = useQuery({
    queryKey: ['digital-workforce', 'policy-learning', 50],
    queryFn: () => digitalWorkforcePortalApi.getPolicyLearning(50),
  })
  const { data: prefRes, isLoading: loadingPref } = useQuery({
    queryKey: ['assistant', 'preferences'],
    queryFn: () => assistantPreferencesApi.getPreferences(),
  })

  const items = policyRes?.data.data.items ?? []
  const byWorker: Record<string, PolicyItem[]> = {}
  for (const row of items) {
    const w = row.worker_code || 'unknown'
    if (!byWorker[w]) byWorker[w] = []
    byWorker[w].push(row)
  }

  const prefValue = (prefRes?.data as { value?: AssistantPreferenceValue })?.value ?? {}
  const [autoExecute, setAutoExecute] = useState(false)
  const [maxRisk, setMaxRisk] = useState<string>('medium')
  const [approvalMode, setApprovalMode] = useState<string>('graded')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setAutoExecute(prefValue.route_governance_auto_execute_enabled ?? false)
    setMaxRisk(prefValue.route_governance_auto_execute_max_risk ?? 'medium')
    setApprovalMode(prefValue.route_governance_auto_execute_approval_mode ?? 'graded')
  }, [prefValue.route_governance_auto_execute_enabled, prefValue.route_governance_auto_execute_max_risk, prefValue.route_governance_auto_execute_approval_mode])

  const saveMu = useMutation({
    mutationFn: (value: AssistantPreferenceValue) => assistantPreferencesApi.savePreferences(value),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assistant', 'preferences'] }),
  })

  const handleSavePref = () => {
    setSaving(true)
    saveMu.mutate(
      {
        ...prefValue,
        route_governance_auto_execute_enabled: autoExecute,
        route_governance_auto_execute_max_risk: maxRisk as 'low' | 'medium' | 'high',
        route_governance_auto_execute_approval_mode: approvalMode as 'graded' | 'direct',
      },
      { onSettled: () => setSaving(false) }
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-800">行为策略配置</h2>
        <p className="mt-1 text-sm text-slate-500">
          策略学习记录与个人偏好（自动执行、审批模式、风险阈值）
        </p>
      </div>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">
          <Sliders className="h-4 w-4" />
          偏好配置
        </h3>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          {loadingPref ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>加载中...</span>
            </div>
          ) : (
            <div className="space-y-4 max-w-md">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autoExecute}
                  onChange={(e) => setAutoExecute(e.target.checked)}
                  aria-label="允许自动执行"
                />
                <span className="text-sm text-slate-700">允许自动执行（低风险动作无需确认）</span>
              </label>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">自动执行最高风险等级</label>
                <select
                  value={maxRisk}
                  onChange={(e) => setMaxRisk(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  aria-label="最高风险等级"
                >
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">审批模式</label>
                <select
                  value={approvalMode}
                  onChange={(e) => setApprovalMode(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  aria-label="审批模式"
                >
                  <option value="graded">graded（分级）</option>
                  <option value="direct">direct（直接）</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleSavePref}
                disabled={saving}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                保存偏好
              </button>
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 mb-3">策略学习记录（按数字员工）</h3>
        {loadingPolicy ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
        ) : policyError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center text-red-700">策略学习记录加载失败</div>
        ) : Object.keys(byWorker).length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            暂无策略学习记录
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(byWorker).map(([worker, rows]) => (
              <div key={worker} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 font-mono text-sm text-slate-700 border-b border-slate-200">
                  {worker}
                </div>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">策略</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">状态</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">Replay 分</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">结果/根因</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">创建时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="max-w-[140px] truncate px-4 py-2 text-slate-700" title={row.policy_key}>
                          {row.policy_key}
                        </td>
                        <td className="px-4 py-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                            {STATUS_LABEL[row.status] ?? row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right text-slate-600">
                          {(row.replay_score * 100).toFixed(0)}%
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-2 text-xs text-slate-600">
                          {row.outcome || row.root_cause || '-'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                          {row.created_at?.slice(0, 19)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
