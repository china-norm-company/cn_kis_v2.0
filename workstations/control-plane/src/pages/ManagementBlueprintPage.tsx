import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BrainCircuit, Boxes, Cpu, Globe, LockKeyhole, Network, RefreshCw, ServerCog } from 'lucide-react'
import { Link } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

const capabilityIcons = [
  { title: '前端统一入口', icon: Boxes },
  { title: '后端统一接入', icon: ServerCog },
  { title: '运营治理闭环', icon: Network },
  { title: '智能规则与自动化', icon: BrainCircuit },
]

export function ManagementBlueprintPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['control-plane', 'management-blueprint'],
    queryFn: controlPlaneApi.getManagementBlueprint,
  })
  const refreshChecksMutation = useMutation({
    mutationFn: () => controlPlaneApi.refreshRuntimeChecks(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['control-plane', 'management-blueprint'] })
      queryClient.invalidateQueries({ queryKey: ['control-plane', 'dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['control-plane', 'objects'] })
    },
  })

  if (isLoading) {
    return <QueryLoading loadingText="正在加载统一治理蓝图..." />
  }

  if (error || !data) {
    return <QueryError error={error} />
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-primary-950 via-slate-900 to-slate-900 p-6 text-white">
        <div className="space-y-3">
          <div className="text-sm text-primary-100">统一管理方法论</div>
          <h1 className="text-2xl font-semibold">{data.vision.title}</h1>
          <p className="max-w-4xl text-sm leading-6 text-slate-200">{data.vision.summary}</p>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Boxes className="h-4 w-4" />
              前端统一价值
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              {data.vision.frontendValue.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Cpu className="h-4 w-4" />
              后端统一价值
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              {data.vision.backendValue.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <LockKeyhole className="h-4 w-4" />
              管理统一价值
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              {data.vision.managementValue.map((item) => (
                <div key={item}>{item}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {capabilityIcons.map((item) => (
          <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="rounded-xl bg-primary-50 p-3 text-primary-600 w-fit">
              <item.icon className="h-5 w-5" />
            </div>
            <div className="mt-4 text-base font-semibold text-slate-900">{item.title}</div>
            <div className="mt-2 text-sm text-slate-500">
              不是把资源堆在一起，而是把查看、接入、告警、工单、自动化做成同一条治理链。
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">运行态接入策略</h2>
              <p className="mt-1 text-sm text-slate-500">
                每种资源不只是分类，还会进入统一的接入策略：直接探测、配置巡检、边缘采集或已接实时链路。
              </p>
              {data.runtime.lastCheckAt && (
                <p className="mt-1 text-xs text-slate-400">上次巡检：{data.runtime.lastCheckAt}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => refreshChecksMutation.mutate()}
              disabled={refreshChecksMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshChecksMutation.isPending ? 'animate-spin' : ''}`} />
              刷新巡检
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {data.runtime.strategySummary.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div className="text-sm font-medium text-slate-700">{item.name}</div>
                <div className="text-lg font-semibold text-slate-900">{item.count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">统一治理巡检结果</h2>
              <p className="mt-1 text-sm text-slate-500">把公网拨测、飞书配置巡检和内部资源接入策略放进同一张运行视图。</p>
              {data.runtime.lastCheckAt && (
                <p className="mt-1 text-xs text-slate-400">巡检时间：{data.runtime.lastCheckAt}</p>
              )}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {data.runtime.checks.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-slate-900">{item.title}</div>
                      <StatusBadge tone={runtimeStatusTone(item.status)}>
                        {item.status === 'healthy' ? '健康' : item.status === 'warning' ? '待完善' : '异常'}
                      </StatusBadge>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{item.category} · {item.strategy}</div>
                  </div>
                  <div className="text-xs text-slate-500">{item.location}</div>
                </div>
                <div className="mt-2 text-sm text-slate-600">{item.detail}</div>
                <div className="mt-2 text-xs text-primary-700">{item.actionHint}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        {data.categories.map((category) => (
          <div key={category.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-slate-900">{category.name}</h2>
                  <StatusBadge tone={category.highRiskCount > 0 ? 'warning' : 'active'}>
                    {category.resourceCount} 个资源
                  </StatusBadge>
                  <StatusBadge tone={category.pendingMonitoringCount > 0 ? 'high' : 'medium'}>
                    待接监控 {category.pendingMonitoringCount}
                  </StatusBadge>
                </div>
                <p className="max-w-3xl text-sm leading-6 text-slate-600">{category.goal}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-sm lg:min-w-[280px]">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-slate-400">资源数</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{category.resourceCount}</div>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <div className="text-amber-700">高风险</div>
                  <div className="mt-1 text-lg font-semibold text-amber-900">{category.highRiskCount}</div>
                </div>
                <div className="rounded-xl bg-rose-50 p-3">
                  <div className="text-rose-700">待纳管</div>
                  <div className="mt-1 text-lg font-semibold text-rose-900">{category.pendingMonitoringCount}</div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="font-medium text-slate-900">前端管理方式</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {category.frontendModules.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="font-medium text-slate-900">后端接入方式</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {category.backendCapabilities.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="font-medium text-slate-900">管理闭环方式</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {category.managementMode.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="font-medium text-slate-900">智能化能力</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  {category.smartActions.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <Globe className="h-4 w-4 text-primary-600" />
                  关键指标
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {category.metrics.map((item) => (
                    <span key={item} className="rounded-full bg-primary-50 px-3 py-1 text-xs text-primary-700">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-slate-900">已归类资源样本</div>
                  <Link to="/objects" className="text-sm font-medium text-primary-600">
                    查看全部对象
                  </Link>
                </div>
                <div className="mt-3 space-y-2">
                  {category.resources.map((resource) => (
                    <Link
                      key={resource.id}
                      to={`/objects/${resource.id}`}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm hover:bg-primary-50"
                    >
                      <div>
                        <div className="font-medium text-slate-900">{resource.name}</div>
                        <div className="text-xs text-slate-500">{resource.location} · {resource.assetCode}</div>
                      </div>
                      <StatusBadge tone={resource.riskLevel}>
                        {resource.riskLevel === 'high' ? '高风险' : resource.riskLevel === 'medium' ? '中风险' : '低风险'}
                      </StatusBadge>
                    </Link>
                  ))}
                  {category.resources.length === 0 && (
                    <div className="rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
                      当前分类下暂无资源样本。
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

function runtimeStatusTone(status: 'healthy' | 'warning' | 'error'): 'active' | 'warning' | 'offline' {
  switch (status) {
    case 'healthy':
      return 'active'
    case 'warning':
      return 'warning'
    case 'error':
      return 'offline'
  }
}
