import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { ArrowLeft, Briefcase, Shield, UserCheck, Wrench, Gauge, Target, Activity, Clock, Film, AlertCircle } from 'lucide-react'

function SectionList({
  title,
  items,
  icon,
}: {
  title: string
  items: string[]
  icon: React.ReactNode
}) {
  if (!items.length) return null
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        {icon}
        {title}
      </h3>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">
        {items.map((item) => (
          <li key={item} className="rounded-lg bg-slate-50 px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

const GATE_TYPE_LABELS: Record<string, string> = {
  knowledge: '专业知识',
  scenario: '业务场景',
  long_chain: '长链运营',
  operations: '运营指标',
  readiness: '上线准备度',
}

export default function RoleDetailPage() {
  const { roleCode = '' } = useParams()
  const { data: res, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'role-detail', roleCode],
    queryFn: () => digitalWorkforcePortalApi.getRole(roleCode, true),
    enabled: !!roleCode,
  })
  const { data: portalRes } = useQuery({
    queryKey: ['digital-workforce', 'portal'],
    queryFn: () => digitalWorkforcePortalApi.getPortal(),
    enabled: !!roleCode,
  })
  const { data: valueRes } = useQuery({
    queryKey: ['digital-workforce', 'value-metrics', 'role-detail', roleCode],
    queryFn: () => digitalWorkforcePortalApi.getValueMetrics(30),
    enabled: !!roleCode,
  })
  const { data: replayRunsRes } = useQuery({
    queryKey: ['digital-workforce', 'role-replay-runs', roleCode],
    queryFn: () => digitalWorkforcePortalApi.getReplayRuns({ limit: 5, role_code: roleCode }),
    enabled: !!roleCode,
  })
  const { data: gateRunsRes } = useQuery({
    queryKey: ['digital-workforce', 'role-gate-runs', roleCode],
    queryFn: () => digitalWorkforcePortalApi.getEvidenceGateRuns(5),
    enabled: !!roleCode,
  })

  const role = res?.data?.data
  const portalData = portalRes?.data?.data
  const execution7d = portalData?.execution_7d ?? portalData?.execution_today ?? {}
  const roleValue = valueRes?.data?.data?.by_role?.find((item) => item.role_code === roleCode)
  const replayRuns = replayRunsRes?.data?.data?.items ?? []
  const gateRuns = gateRunsRes?.data?.data?.items ?? []
  const mappedAgentIds = role?.mapped_agent_ids ?? []
  const executionTotal7d = mappedAgentIds.reduce((sum, agentId) => sum + (execution7d[agentId]?.total ?? 0), 0)
  const executionSuccess7d = mappedAgentIds.reduce((sum, agentId) => sum + (execution7d[agentId]?.success ?? 0), 0)
  const executionRate7d = executionTotal7d > 0 ? Math.round((executionSuccess7d / executionTotal7d) * 100) : null

  if (isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
  }

  if (error || !role) {
    return (
      <div className="space-y-4">
        <Link to="/portal" className="inline-flex items-center gap-2 text-primary-600 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          返回数字员工门户
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">岗位详情加载失败或岗位不存在。</div>
      </div>
    )
  }

  const latestGate = gateRuns[0]
  const governanceHint =
    role.automation_level === 'L4'
      ? '该岗位为 L4 人工确认岗，所有高风险动作建议在门禁通过后再执行，并严格按人工确认事项放行。'
      : (role.human_confirmation_points?.length ?? 0) > 0
        ? '该岗位存在人工确认事项，建议在门禁异常或 WARN 时优先复核这些边界动作。'
        : '该岗位当前无显式人工确认事项，仍建议结合门禁状态与回放记录定期复核边界。'

  return (
    <div data-testid="role-detail-page" className="space-y-6">
      <div className="space-y-3">
        <Link to="/portal" className="inline-flex items-center gap-2 text-primary-600 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          返回数字员工门户
        </Link>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
              <Briefcase className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-slate-800">{role.role_name}</h2>
                {!role.enabled && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    已禁用
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-500">{role.role_code}</p>
              {role.role_cluster && <p className="mt-1 text-sm text-slate-400">{role.role_cluster}</p>}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Gauge className="h-3.5 w-3.5" />
                    自动化等级
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800">{role.automation_level || '未设置'}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Target className="h-3.5 w-3.5" />
                    人工替代基准
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800">
                    {role.baseline_manual_minutes ? `${role.baseline_manual_minutes} 分钟/次` : '未设置'}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Wrench className="h-3.5 w-3.5" />
                    映射 Agent
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800">
                    {role.mapped_agent_ids?.length ? role.mapped_agent_ids.join('、') : '—'}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Wrench className="h-3.5 w-3.5" />
                    映射技能
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-800">
                    {role.mapped_skill_ids?.length ? role.mapped_skill_ids.join('、') : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="role-detail-stat-executions">
          <div className="flex items-center gap-2 text-slate-500">
            <Activity className="h-5 w-5" />
            <span className="text-sm">近 7 天执行次数</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{executionTotal7d}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="role-detail-stat-success-rate">
          <div className="flex items-center gap-2 text-slate-500">
            <Shield className="h-5 w-5" />
            <span className="text-sm">近 7 天成功率</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{executionRate7d != null ? `${executionRate7d}%` : '—'}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="role-detail-stat-value">
          <div className="flex items-center gap-2 text-slate-500">
            <Clock className="h-5 w-5" />
            <span className="text-sm">近 30 天节省工时</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{roleValue?.saved_hours_estimate ?? 0}h</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid="role-detail-stat-value-count">
          <div className="flex items-center gap-2 text-slate-500">
            <Target className="h-5 w-5" />
            <span className="text-sm">近 30 天价值归因次数</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{roleValue?.count ?? 0}</p>
        </div>
      </div>

      <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5" data-testid="role-detail-collaboration">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <UserCheck className="h-4 w-4 text-emerald-600" />
          协同关系
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-lg border border-emerald-100 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">服务对象（人类角色）</p>
            <p className="mt-1 text-sm text-slate-800">
              {(role.service_targets || []).length > 0 ? role.service_targets.join('、') : '—'}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">协同方式</p>
            <p className="mt-1 text-sm text-slate-800">
              {role.automation_level === 'L1' && '只读信息辅助：摘要、检索、推荐'}
              {role.automation_level === 'L2' && '助理执行：生成草稿、清单、提醒，人工审定'}
              {role.automation_level === 'L3' && '受控执行：在授权范围内创建任务、推进流程'}
              {role.automation_level === 'L4' && '人工确认：所有关键动作必须人类确认后执行'}
              {!role.automation_level && '未设置'}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">人类保留责任</p>
            <p className="mt-1 text-sm text-slate-800">
              {(role.human_confirmation_points || []).length > 0
                ? role.human_confirmation_points.join('、')
                : '无显式人工确认事项'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionList title="核心场景" items={role.core_scenarios || []} icon={<Briefcase className="h-4 w-4 text-slate-500" />} />
        <SectionList title="关键输入" items={role.input_contract || []} icon={<Wrench className="h-4 w-4 text-slate-500" />} />
        <SectionList title="关键输出" items={role.output_contract || []} icon={<Wrench className="h-4 w-4 text-slate-500" />} />
        <SectionList title="价值指标" items={role.kpi_metrics || []} icon={<Target className="h-4 w-4 text-slate-500" />} />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5" data-testid="role-detail-gate-status">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <AlertCircle className="h-4 w-4 text-slate-500" />
            最近门禁状态
          </h3>
          <Link to="/gates" className="text-sm font-medium text-primary-600 hover:underline">
            前往验收门禁
          </Link>
        </div>
        <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-sm text-violet-800">{governanceHint}</p>
        {latestGate ? (
          <div className="mt-3 space-y-2">
            {gateRuns.slice(0, 3).map((gate) => (
              <div key={gate.id} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-700">
                    {GATE_TYPE_LABELS[gate.gate_type] || gate.gate_type}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-400">
                      {gate.status} · 分数 {gate.score}
                    </span>
                    <Link
                      to={`/gates?gate_id=${gate.id}`}
                      className="text-primary-600 hover:underline"
                    >
                      查看门禁记录
                    </Link>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  范围：{gate.scope || '-'} · {gate.created_at?.slice(0, 19) || '-'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">暂无门禁记录，可前往验收门禁页查看或等待新一轮运行。</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5" data-testid="role-detail-replay-runs">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Film className="h-4 w-4 text-slate-500" />
            最近回放
          </h3>
          <Link
            to={`/replay?role_code=${encodeURIComponent(role.role_code)}`}
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            前往执行回放
          </Link>
        </div>
        {replayRuns.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">暂无该岗位的回放记录</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {replayRuns.map((run) => (
              <li key={run.task_id}>
                <Link
                  to={`/replay/${run.task_id}`}
                  className="block rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-sm text-slate-700">{run.task_id}</span>
                    <span className="text-xs text-slate-400">
                      {run.status} · {run.sub_task_count} 子任务
                      {run.workstation_key ? ` · ${run.workstation_key}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-slate-500">{run.query_snippet ?? run.query}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
