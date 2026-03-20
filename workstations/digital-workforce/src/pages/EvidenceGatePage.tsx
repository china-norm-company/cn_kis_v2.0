/**
 * Phase 3：验收门禁 — EvidenceGateRun 运行结果
 */
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react'

const GATE_TYPE_LABEL: Record<string, string> = {
  knowledge: '专业知识',
  scenario: '业务场景',
  long_chain: '长链运营',
  operations: '运营指标',
  readiness: '上线准备度',
}

export default function EvidenceGatePage() {
  const [searchParams] = useSearchParams()
  const selectedGateId = searchParams.get('gate_id')
  const { data: res } = useQuery({
    queryKey: ['digital-workforce', 'evidence-gate-runs', 50],
    queryFn: () => digitalWorkforcePortalApi.getEvidenceGateRuns(50),
  })
  const { data: portalRes } = useQuery({
    queryKey: ['digital-workforce', 'portal'],
    queryFn: () => digitalWorkforcePortalApi.getPortal(),
  })

  const items = (res as { data?: { data?: { items?: Array<{ id: number; gate_type: string; scope: string; status: string; score: number; created_at: string }> } } })?.data?.data?.items ?? []
  const roles = portalRes?.data?.data?.roles ?? []
  const sensitiveRoles = roles.filter((role) => role.automation_level === 'L4' || (role.human_confirmation_points?.length ?? 0) > 0)

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'passed') return <CheckCircle className="h-4 w-4 text-emerald-500" />
    if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />
    return <AlertCircle className="h-4 w-4 text-amber-500" />
  }

  return (
    <div data-testid="evidence-gate-page" className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">验收门禁</h2>
        <p className="mt-1 text-sm text-slate-500">EvidenceGateRun 门禁运行结果</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to="/positions"
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          前往岗位与分工
        </Link>
        <Link
          to="/replay"
          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          前往执行回放
        </Link>
      </div>
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
        当门禁阻断高风险动作时，可结合岗位说明书核对该岗位的自动化等级、人工确认事项与最近回放记录，确认是否需要调整岗位边界或技能授权。
      </div>
      {selectedGateId && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          当前正在查看门禁记录 `#{selectedGateId}`，已在下方表格中高亮。
        </div>
      )}
      {sensitiveRoles.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5" data-testid="evidence-sensitive-roles">
          <h3 className="text-sm font-semibold text-amber-800">重点治理岗位</h3>
          <p className="mt-1 text-sm text-amber-700">
            以下岗位为 L4 人工确认岗，或定义了人工确认事项，建议在门禁告警、阻断或边界复核时优先检查。
          </p>
          <ul className="mt-3 space-y-2">
            {sensitiveRoles.slice(0, 6).map((role) => (
              <li key={role.role_code} className="rounded-lg border border-amber-200 bg-white px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{role.role_name}</p>
                    <p className="text-xs text-slate-500">
                      {role.role_code}
                      {role.automation_level ? ` · ${role.automation_level}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link to={`/roles/${role.role_code}`} className="text-primary-600 hover:underline">
                      查看岗位详情
                    </Link>
                    <Link to={`/replay?role_code=${encodeURIComponent(role.role_code)}`} className="text-primary-600 hover:underline">
                      查看该岗位回放
                    </Link>
                  </div>
                </div>
                {(role.human_confirmation_points?.length ?? 0) > 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    人工确认事项：{role.human_confirmation_points.join('、')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">暂无门禁运行记录</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">类型</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">范围</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">状态</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-slate-600">得分</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-slate-600">时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((row) => (
                <tr
                  key={row.id}
                  data-testid={String(row.id) === selectedGateId ? 'selected-gate-row' : undefined}
                  className={String(row.id) === selectedGateId ? 'bg-blue-50' : 'hover:bg-slate-50'}
                >
                  <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-700">
                    {GATE_TYPE_LABEL[row.gate_type] ?? row.gate_type}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-600">{row.scope || '-'}</td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-1">
                      <StatusIcon status={row.status} />
                      <span className="text-sm">{row.status}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-slate-600">{row.score}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{row.created_at?.slice(0, 19)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* L2 真实验收结论卡片 */}
      <L2EvalVerdictCard />
    </div>
  )
}


function L2EvalVerdictCard() {
  const { data: res } = useQuery({
    queryKey: ['digital-workforce', 'l2-eval-latest'],
    queryFn: () => digitalWorkforcePortalApi.getL2EvalLatest(),
  })

  const verdict = (res as { data?: { verdict?: string; run_id?: string | null; passed?: boolean; pass_rate?: number; total?: number; decision_reason?: string; available?: boolean; by_batch?: Record<string, unknown> } })?.data

  if (!verdict) return null

  const verdictColor = verdict.verdict === '可试点' ? 'border-green-200 bg-green-50' : verdict.verdict === '禁止上线' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'
  const verdictTextColor = verdict.verdict === '可试点' ? 'text-green-700' : verdict.verdict === '禁止上线' ? 'text-red-700' : 'text-amber-700'

  return (
    <div data-testid="l2-eval-verdict-card" className={`rounded-xl border p-5 ${verdictColor}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">L2 真实验收结论</h3>
        <span className={`rounded-full px-3 py-0.5 text-sm font-bold ${verdictTextColor}`}>
          {verdict.verdict}
        </span>
      </div>
      {verdict.available ? (
        <div className="mt-3 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-semibold text-slate-800">{((verdict.pass_rate ?? 0) * 100).toFixed(0)}%</p>
            <p className="text-xs text-slate-500 mt-1">通过率</p>
          </div>
          <div>
            <p className="text-2xl font-semibold text-slate-800">{verdict.total ?? 0}</p>
            <p className="text-xs text-slate-500 mt-1">总场景数</p>
          </div>
          <div>
            <p className="text-sm text-slate-600 mt-1">{verdict.run_id?.slice(0, 15) ?? '-'}</p>
            <p className="text-xs text-slate-500 mt-1">Run ID</p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{verdict.decision_reason}</p>
      )}
    </div>
  )
}
