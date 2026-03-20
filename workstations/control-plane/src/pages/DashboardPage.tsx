import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity,
  ArrowRight,
  Boxes,
  Brain,
  CheckCircle2,
  CircleAlert,
  ClipboardList,
  Cloud,
  Database,
  HeartPulse,
  Network,
  Printer,
  RefreshCw,
  Server,
  ServerCog,
  Shield,
  Users,
  XCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import type { ResourceHealthCategory } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  shield: Shield,
  server: Server,
  database: Database,
  printer: Printer,
  cloud: Cloud,
  users: Users,
  brain: Brain,
  activity: Activity,
}

function CategoryHealthMini({ cat }: { cat: ResourceHealthCategory }) {
  const Icon = CATEGORY_ICONS[cat.icon] ?? Server
  const healthColor = cat.health === 'healthy' ? 'border-emerald-200 bg-emerald-50' : cat.health === 'critical' ? 'border-red-200 bg-red-50' : cat.health === 'warning' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'

  return (
    <div className={`rounded-xl border p-3 ${healthColor}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-600" />
        <span className="text-sm font-medium text-slate-800">{cat.name}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-xl font-bold text-slate-900">{cat.online}</span>
        <span className="text-xs text-slate-500">/ {cat.total} 在线</span>
        {cat.offline > 0 && <span className="text-xs font-medium text-red-600">{cat.offline} 离线</span>}
        {cat.warning > 0 && <span className="text-xs font-medium text-amber-600">{cat.warning} 告警</span>}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['control-plane', 'dashboard-summary'],
    queryFn: controlPlaneApi.getDashboardSummary,
  })
  const blueprintQuery = useQuery({
    queryKey: ['control-plane', 'management-blueprint'],
    queryFn: controlPlaneApi.getManagementBlueprint,
  })
  const healthQuery = useQuery({
    queryKey: ['resource-health'],
    queryFn: () => controlPlaneApi.getResourceHealth(),
    refetchInterval: 60_000,
  })
  const depQuery = useQuery({
    queryKey: ['dependency-check'],
    queryFn: () => controlPlaneApi.getDependencyCheck(),
  })
  const refreshChecksMutation = useMutation({
    mutationFn: () => controlPlaneApi.refreshRuntimeChecks(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['control-plane', 'management-blueprint'] })
      queryClient.invalidateQueries({ queryKey: ['control-plane', 'dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['control-plane', 'objects'] })
    },
  })

  if (isLoading || blueprintQuery.isLoading) {
    return <QueryLoading loadingText="正在加载控制台总览..." />
  }

  if (error || !data || blueprintQuery.error || !blueprintQuery.data) {
    return <QueryError error={error || blueprintQuery.error} />
  }

  const runtimeSummary = blueprintQuery.data.runtime.strategySummary

  const summaryCards = [
    {
      title: '纳管对象',
      value: String(data.objectCount),
      hint: '含边缘采集与场地环境',
      icon: Boxes,
    },
    {
      title: '未闭环事件',
      value: String(data.openEventCount),
      hint: '待跟进异常',
      icon: CircleAlert,
    },
    {
      title: '处理中工单',
      value: String(data.processingTicketCount),
      hint: '事件驱动闭环',
      icon: ClipboardList,
    },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-2">
            <div className="text-sm text-slate-300">统一管理平台 · 实时数据</div>
            <h1 className="text-2xl font-semibold">网络设备、环境设施、云与 AI 资源统一纳管</h1>
            <p className="text-sm leading-6 text-slate-300">
              当前数据由实时采集链路与资源注册表共同组成：核心交换机（SSH 快照）、防火墙/无线 AC（LLDP 发现）、场地环境、边缘采集主机，以及已登记待接入的一线硬件、云服务、飞书应用和大模型资源。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm lg:min-w-[320px]">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-slate-300">核心域</div>
              <div className="mt-1 font-medium">网络 / 计算 / 存储</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="text-slate-300">行业域</div>
              <div className="mt-1 font-medium">房间 / 环境 / 边缘采集</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((item) => (
          <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-slate-500">{item.title}</div>
                <div className="mt-2 text-3xl font-semibold text-slate-900">{item.value}</div>
                <div className="mt-1 text-sm text-slate-500">{item.hint}</div>
              </div>
              <div className="rounded-xl bg-primary-50 p-3 text-primary-600">
                <item.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </section>

      {healthQuery.data && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-slate-900">资源健康总览</h2>
            </div>
            <Link to="/resource-health" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600">
              详细视图
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mb-4 grid grid-cols-4 gap-3 rounded-xl bg-slate-50 p-3 text-center text-sm">
            <div>
              <div className="text-2xl font-bold text-slate-900">{healthQuery.data.totalResources}</div>
              <div className="text-slate-500">总资源</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">{healthQuery.data.healthyCount}</div>
              <div className="text-slate-500">在线</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-600">{healthQuery.data.categories.reduce((s, c) => s + c.warning, 0)}</div>
              <div className="text-slate-500">告警</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{healthQuery.data.problemCount}</div>
              <div className="text-slate-500">异常</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {healthQuery.data.categories.map((cat) => (
              <CategoryHealthMini key={cat.id} cat={cat} />
            ))}
          </div>
        </section>
      )}

      {depQuery.data && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-900">平台依赖自检</h2>
            <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${depQuery.data.allOk ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
              {depQuery.data.allOk ? '全部正常' : `${depQuery.data.errorCount + depQuery.data.missingCount} 项异常`}
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {depQuery.data.checks.map((item) => (
              <div key={item.id} className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm ${item.status === 'ok' ? 'border-emerald-100 bg-emerald-50/50' : 'border-red-100 bg-red-50/50'}`}>
                {item.status === 'ok' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                <span className="text-slate-700">{item.name}</span>
                {item.status !== 'ok' && item.message && <span className="ml-auto truncate text-xs text-red-600">{item.message}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">接入策略概览</h2>
            <p className="mt-1 text-sm text-slate-500">统一回答“这个资源现在该怎么纳管”。</p>
            {blueprintQuery.data?.runtime?.lastCheckAt && (
              <p className="mt-1 text-xs text-slate-400">上次巡检：{blueprintQuery.data.runtime.lastCheckAt}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshChecksMutation.mutate()}
              disabled={refreshChecksMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshChecksMutation.isPending ? 'animate-spin' : ''}`} />
              刷新巡检
            </button>
            <Link to="/blueprint" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600">
              查看运行态治理
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {runtimeSummary.map((item) => (
            <div key={item.id} className="rounded-xl bg-slate-50 p-4">
              <div className="text-sm text-slate-500">{runtimeStrategyLabel(item.id)}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">{item.count}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">统一治理蓝图</h2>
            <p className="mt-1 text-sm text-slate-500">
              把硬件、云服务、身份应用、模型资源按统一分类治理，而不是分散在多个系统里各自维护。
            </p>
          </div>
          <Link to="/blueprint" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600">
            查看分类治理方案
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">重点风险对象</h2>
              <p className="text-sm text-slate-500">先把高风险对象收敛成可跟踪列表</p>
            </div>
            <Link to="/objects" className="inline-flex items-center gap-1 text-sm font-medium text-primary-600">
              查看对象中心
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {data.highRiskObjects.length > 0 ? (
              data.highRiskObjects.map((item) => (
                <Link
                  key={item.id}
                  to={`/objects/${item.id}`}
                  className="block rounded-xl border border-slate-200 p-4 transition hover:border-primary-200 hover:bg-primary-50/30"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-slate-900">{item.name}</div>
                        <StatusBadge tone={item.status}>
                          {item.status === 'offline' ? '离线' : item.status === 'warning' ? '预警' : '正常'}
                        </StatusBadge>
                      </div>
                      <div className="text-sm text-slate-500">
                        {item.location} · {item.zone} · {item.assetCode}
                      </div>
                      <div className="text-sm text-slate-600">{item.summary}</div>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <ServerCog className="h-4 w-4" />
                      最近观测 {item.lastSeenAt || '待接入'}
                    </div>
                  </div>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                当前没有高风险对象。若你刚完成登录但数据较少，通常是因为该类资源尚未接入实时监控或对象注册表还未覆盖对应资产。
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <CircleAlert className="h-5 w-5 text-rose-500" />
              <h2 className="text-lg font-semibold text-slate-900">最新事件</h2>
            </div>
            <div className="space-y-3">
              {data.openEvents.length > 0 ? (
                data.openEvents.map((item) => (
                  <Link key={item.id} to={`/events/${item.id}`} className="block rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-slate-900">{item.title}</div>
                      <StatusBadge tone={item.severity}>
                        {item.severity === 'critical' ? '严重' : item.severity === 'high' ? '高' : '中'}
                      </StatusBadge>
                    </div>
                    <div className="mt-2 text-sm text-slate-500">{item.location} · {item.detectedAt}</div>
                    <div className="mt-2 text-sm text-slate-600">{item.summary}</div>
                  </Link>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                  当前没有事件。建议优先接入实时监控、日志、资源注册表覆盖缺口巡检和告警规则。
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Network className="h-5 w-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-slate-900">当前能力与后续规划</h2>
            </div>
            <div className="mb-3 text-sm font-medium text-slate-700">已具备</div>
            <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-slate-600">
              <li>8 大类生产资源统一纳管：网络、计算、存储、应用、身份、域名/云、AI/模型、终端/输出</li>
              <li>实时采集链路：Ping、SSH、TCP、SSL 证书、DNS、HTTP(S)、数据库连接检测</li>
              <li>全局资源健康总览与分类健康指标仪表盘</li>
              <li>平台依赖自检：核心服务可用性自动验证</li>
              <li>对象 / 事件 / 工单统一模型与全链路关联跳转</li>
              <li>治理蓝图八类分类与运行态接入策略展示</li>
            </ul>
            <div className="mb-3 text-sm font-medium text-slate-700">下一步</div>
            <ol className="space-y-2 text-sm text-slate-600">
              <li>1. 定时采集调度：每 5 分钟自动刷新资源状态快照</li>
              <li>2. 异常自动告警：资源状态变化触发事件并联动工单</li>
              <li>3. 工单状态流转与责任人分派 API</li>
              <li>4. 资源趋势分析：历史状态追踪与可用性 SLA 报告</li>
            </ol>
          </div>
        </div>
      </section>
    </div>
  )
}

function runtimeStrategyLabel(strategy: string): string {
  switch (strategy) {
    case 'integrated_live':
      return '已接实时采集'
    case 'edge_agent_required':
      return '需边缘采集器'
    case 'direct_public_probe':
      return '可直接公网探测'
    case 'config_audit':
      return '配置巡检型资源'
    default:
      return strategy
  }
}
