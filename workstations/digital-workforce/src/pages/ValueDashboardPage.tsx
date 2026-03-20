/**
 * 价值看板 — 本月执行总次数、预估节省人工小时数
 * 汇总卡片 + 按岗位 / 工作台 / 业务对象聚合展示
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { digitalWorkforcePortalApi } from '@cn-kis/api-client'
import type {
  ValueMetricsByRoleItem,
  ValueMetricsByWorkstationItem,
  ValueMetricsByBusinessObjectItem,
} from '@cn-kis/api-client'
import { BarChart3, Clock, Zap, TrendingUp, User, LayoutGrid, FileType, BookOpen } from 'lucide-react'

function AggregationBlock<T extends { count: number; saved_hours_estimate: number }>({
  title,
  icon: Icon,
  items,
  nameKey,
  renderName,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  items: T[]
  nameKey: keyof T
  renderName?: (item: T) => React.ReactNode
}) {
  if (!items?.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid={`value-aggregation-${String(nameKey)}`}>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <Icon className="h-4 w-4" />
          {title}
        </h3>
        <p className="mt-2 text-sm text-slate-400">暂无数据</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5" data-testid={`value-aggregation-${String(nameKey)}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-600">
        <Icon className="h-4 w-4" />
        {title}
      </h3>
      <ul className="mt-3 space-y-2">
        {items.slice(0, 10).map((item, i) => (
          <li key={i} className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">
              {renderName ? renderName(item) : String(item[nameKey])}
            </span>
            <span className="text-slate-500">
              {item.count} 次 · 节省 {item.saved_hours_estimate}h
            </span>
          </li>
        ))}
      </ul>
      {items.length > 10 && (
        <p className="mt-2 text-xs text-slate-400">共 {items.length} 项，仅展示前 10</p>
      )}
    </div>
  )
}

export default function ValueDashboardPage() {
  const { data: res, isLoading, error } = useQuery({
    queryKey: ['digital-workforce', 'value-metrics', 30],
    queryFn: () => digitalWorkforcePortalApi.getValueMetrics(30),
  })
  const { data: portalRes } = useQuery({
    queryKey: ['digital-workforce', 'portal'],
    queryFn: () => digitalWorkforcePortalApi.getPortal(),
  })

  const data = res?.data?.data
  const byRole = (data?.by_role ?? []) as ValueMetricsByRoleItem[]
  const byWorkstation = (data?.by_workstation ?? []) as ValueMetricsByWorkstationItem[]
  const byBusinessObject = (data?.by_business_object_type ?? []) as ValueMetricsByBusinessObjectItem[]
  const roles = portalRes?.data?.data?.roles ?? []
  const roleNameMap = Object.fromEntries(roles.map((role) => [role.role_code, role.role_name]))
  const knowledgeDeposit = (data as any)?.knowledge_deposit as {
    total_deposited: number
    pending_review: number
    published: number
    by_source: Array<{ source_type: string; count: number }>
  } | undefined

  if (error) {
    return (
      <div data-testid="value-dashboard-page" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p>加载失败，请稍后重试。</p>
      </div>
    )
  }

  return (
    <div data-testid="value-dashboard-page" className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-slate-800">价值看板</h2>
        <p className="mt-1 text-sm text-slate-500">数字员工替代人工的量化价值（基于技能执行与治理指标）</p>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">加载中...</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-slate-500">
                <Zap className="h-5 w-5" />
                <span className="text-sm">近 30 天技能执行总次数</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">{data?.skill_execution_total ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-slate-500">
                <BarChart3 className="h-5 w-5" />
                <span className="text-sm">成功执行次数</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">{data?.skill_execution_success ?? 0}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-slate-500">
                <Clock className="h-5 w-5" />
                <span className="text-sm">预估节省人工（小时）</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-emerald-600">{data?.saved_hours_estimate ?? 0}</p>
              <p className="mt-1 text-xs text-slate-400">
                按每次成功执行 ≈ {data?.baseline_minutes_per_skill_run ?? 5} 分钟折算
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-slate-500">
                <TrendingUp className="h-5 w-5" />
                <span className="text-sm">治理事件类型数</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-800">
                {data?.governance_summary ? Object.keys(data.governance_summary).length : 0}
              </p>
            </div>
          </div>

          {/* 知识工厂成果卡片 */}
          {knowledgeDeposit && (
            <div data-testid="knowledge-deposit-card" className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen className="h-5 w-5 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-700">知识工厂成果（近 30 天）</h3>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-semibold text-slate-800">{knowledgeDeposit.total_deposited}</p>
                  <p className="text-xs text-slate-500 mt-1">沉淀总数</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-semibold text-amber-600">{knowledgeDeposit.pending_review}</p>
                  <p className="text-xs text-slate-500 mt-1">待审核</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-semibold text-green-600">{knowledgeDeposit.published}</p>
                  <p className="text-xs text-slate-500 mt-1">已发布</p>
                </div>
              </div>
              {(knowledgeDeposit.by_source ?? []).length > 0 && (
                <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
                  {knowledgeDeposit.by_source.map((s) => {
                    const sourceLabels: Record<string, string> = {
                      project_retrospective: '项目复盘',
                      evergreen_watch: '升级哨塔',
                      digital_worker_asset: '资产库',
                    }
                    return (
                      <li key={s.source_type} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">{sourceLabels[s.source_type] ?? s.source_type}</span>
                        <span className="font-medium text-slate-800">{s.count} 条</span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
            <AggregationBlock
              title="按岗位"
              icon={User}
              items={byRole}
              nameKey="role_code"
              renderName={(item) => (
                <Link to={`/roles/${item.role_code}`} className="text-primary-600 hover:underline">
                  {roleNameMap[item.role_code] || item.role_code}
                </Link>
              )}
            />
            <AggregationBlock
              title="按工作台"
              icon={LayoutGrid}
              items={byWorkstation}
              nameKey="workstation_key"
              renderName={(item) => {
                const wsLabels: Record<string, string> = {
                  secretary: '秘书台', research: '研究台', quality: '质量台', finance: '财务台',
                  execution: '执行台', hr: '人事台', crm: '客户台', recruitment: '招募台',
                  equipment: '设备台', material: '物料台', facility: '设施台', evaluator: '评估台',
                  'lab-personnel': '人员台', ethics: '伦理台', reception: '接待台',
                  'digital-workforce': '中书',
                }
                return <span className="font-medium text-slate-700">{wsLabels[item.workstation_key] || item.workstation_key}</span>
              }}
            />
            <AggregationBlock
              title="按业务对象类型"
              icon={FileType}
              items={byBusinessObject}
              nameKey="business_object_type"
              renderName={(item) => {
                const objLabels: Record<string, string> = {
                  opportunity: '商机', project: '项目', workorder: '工单', report: '报告',
                  protocol: '协议', deviation: '偏差', client: '客户',
                }
                return <span className="font-medium text-slate-700">{objLabels[item.business_object_type] || item.business_object_type}</span>
              }}
            />
          </div>

          {/* KPI 趋势摘要 */}
          <KPITrendSummaryBlock />
        </>
      )}
    </div>
  )
}


function KPITrendSummaryBlock() {
  const { data: res } = useQuery({
    queryKey: ['digital-workforce', 'kpi-trend-summary'],
    queryFn: () => digitalWorkforcePortalApi.getKpiTrendSummary(),
  })
  const summaries = ((res as { data?: { summaries?: Array<{ role_code: string; role_name: string; recent_7d_executions: number; prev_7d_executions: number; delta: number; trend: string }> } })?.data?.summaries ?? [])
    .filter((s) => s.recent_7d_executions > 0 || s.prev_7d_executions > 0)

  if (!summaries.length) return null

  return (
    <div data-testid="kpi-trend-summary" className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <TrendingUp className="h-4 w-4" />
        岗位 KPI 周环比
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => (
          <div key={s.role_code} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-slate-700">{s.role_name || s.role_code}</p>
              <p className="text-xs text-slate-400">近 7 天: {s.recent_7d_executions} 次</p>
            </div>
            <span className={`text-sm font-semibold ${s.trend === 'up' ? 'text-green-600' : s.trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
              {s.trend === 'up' ? `+${s.delta}` : s.trend === 'down' ? `${s.delta}` : '持平'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
