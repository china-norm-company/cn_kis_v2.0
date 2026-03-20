import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Link2, Layers, MapPin, ShieldAlert } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'
import { DependencyContextPanel } from '@/components/DependencyContextPanel'
import { UnifiedActionPanel } from '@/components/UnifiedActionPanel'

export function ObjectDetailPage() {
  const { objectId = '' } = useParams()
  const objectQuery = useQuery({
    queryKey: ['control-plane', 'object', objectId],
    queryFn: () => controlPlaneApi.getObject(objectId),
    enabled: !!objectId,
  })
  const eventsQuery = useQuery({
    queryKey: ['control-plane', 'object-events', objectId],
    queryFn: () => controlPlaneApi.getObjectEvents(objectId),
    enabled: !!objectId,
  })
  const depsQuery = useQuery({
    queryKey: ['control-plane', 'object-dependencies', objectId],
    queryFn: () => controlPlaneApi.getObjectDependencies(objectId),
    enabled: !!objectId,
  })

  if (objectQuery.isLoading || eventsQuery.isLoading) {
    return <QueryLoading loadingText="正在加载对象详情..." />
  }

  if (objectQuery.error || eventsQuery.error) {
    return <QueryError error={objectQuery.error || eventsQuery.error} />
  }

  const objectItem = objectQuery.data
  const relatedEvents = eventsQuery.data ?? []
  const metadataEntries = Object.entries(objectItem?.extra ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
  const metadataLabelMap: Record<string, string> = {
    source: '来源',
    monitoring_status: '监控接入状态',
    credential_ref: '凭据引用',
    login_user: '登录用户',
    management_category: '治理分类',
    management_category_id: '治理分类编码',
    management_tier: '管理层级',
    service_level: '服务等级',
    probe_strategy: '接入策略',
    collector_mode: '采集方式',
    governance_mode: '治理方式',
    recommended_metrics: '建议指标',
    governance_check_status: '最近巡检结果',
    governance_check_detail: '巡检说明',
    governance_check_action_hint: '处置建议',
    governance_check_category: '巡检类型',
    governance_check_at: '巡检时间',
  }
  const hasGovernanceCheck =
    objectItem?.extra &&
    typeof objectItem.extra.governance_check_status === 'string' &&
    objectItem.extra.governance_check_status !== ''

  if (!objectItem) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
        未找到对象，请先从对象中心进入。
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/objects" className="inline-flex items-center gap-2 text-sm font-medium text-primary-600">
        <ArrowLeft className="h-4 w-4" />
        返回对象中心
      </Link>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{objectItem.name}</h1>
              <StatusBadge tone={objectItem.status}>
                {objectItem.status === 'active' ? '正常' : objectItem.status === 'warning' ? '预警' : '离线'}
              </StatusBadge>
              <StatusBadge tone={objectItem.riskLevel}>
                风险{objectItem.riskLevel === 'high' ? '高' : objectItem.riskLevel === 'medium' ? '中' : '低'}
              </StatusBadge>
            </div>
            <div className="text-sm text-slate-500">
              {objectItem.assetCode} · {objectItem.type} / {objectItem.subtype}
            </div>
            <p className="max-w-3xl text-sm leading-6 text-slate-600">{objectItem.summary}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div>责任团队：{objectItem.owner}</div>
            <div className="mt-2">最近观测：{objectItem.lastSeenAt}</div>
          </div>
        </div>
      </section>

      {/* 依赖关系与统一操作 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <DependencyContextPanel
          dependencies={depsQuery.data ?? null}
          objectId={objectItem.id}
          loading={depsQuery.isLoading}
        />
        <UnifiedActionPanel
          title="操作"
          actions={
            <Link
              to="/resource-health"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              资源健康
            </Link>
          }
        >
          <p className="text-xs text-slate-500">查看资源健康与依赖自检；关联事件见下方列表。</p>
        </UnifiedActionPanel>
      </div>

      {hasGovernanceCheck && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">最近治理巡检</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge tone={governanceCheckTone(String(objectItem.extra?.governance_check_status))}>
              {objectItem.extra?.governance_check_status === 'healthy'
                ? '健康'
                : objectItem.extra?.governance_check_status === 'warning'
                  ? '待完善'
                  : '异常'}
            </StatusBadge>
            <span className="text-sm text-slate-500">
              {String(objectItem.extra?.governance_check_category ?? '')}
              {objectItem.extra?.governance_check_at
                ? ` · ${String(objectItem.extra.governance_check_at)}`
                : ''}
            </span>
          </div>
          {objectItem.extra?.governance_check_detail && (
            <p className="mt-2 text-sm text-slate-600">{String(objectItem.extra.governance_check_detail)}</p>
          )}
          {objectItem.extra?.governance_check_action_hint && (
            <p className="mt-2 text-sm text-primary-700">{String(objectItem.extra.governance_check_action_hint)}</p>
          )}
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">对象概览</h2>
          <div className="mt-4 space-y-4 text-sm text-slate-600">
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <div className="font-medium text-slate-900">位置与网络域</div>
                <div className="mt-1">
                  {objectItem.location} · {objectItem.zone}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <Link2 className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <div className="font-medium text-slate-900">依赖关系</div>
                <div className="mt-1">
                  左侧依赖关系面板展示该对象依赖的资源及依赖本对象的资源，便于分析影响链。
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <Layers className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <div className="font-medium text-slate-900">影响场景</div>
                <div className="mt-1">
                  <Link to="/scenarios" className="text-primary-600 hover:underline">场景中心</Link>
                  {' '}可查看该对象所属资源类别参与的业务场景就绪情况。
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 text-slate-400" />
              <div>
                <div className="font-medium text-slate-900">当前实现边界</div>
                <div className="mt-1">先提供对象级总览、纳管元数据和关联事件，不直接做高风险控制动作或暴露明文密码。</div>
              </div>
            </div>
            {metadataEntries.length > 0 && (
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="font-medium text-slate-900">纳管元数据</div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {metadataEntries.map(([key, value]) => (
                    <div key={key}>
                      <div className="text-xs uppercase tracking-wide text-slate-400">{metadataLabelMap[key] ?? key}</div>
                      <div className="mt-1 break-all text-sm text-slate-700">
                        {typeof value === 'string'
                          ? value
                          : typeof value === 'number' || typeof value === 'boolean'
                            ? String(value)
                            : JSON.stringify(value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">关联事件</h2>
            <div className="text-sm text-slate-500">{relatedEvents.length} 条</div>
          </div>
          <div className="mt-4 space-y-3">
            {relatedEvents.map((item) => (
              <Link
                key={item.id}
                to={`/events/${item.id}`}
                className="block rounded-xl border border-slate-200 p-4 transition hover:border-primary-200 hover:bg-primary-50/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-slate-900">{item.title}</div>
                  <StatusBadge tone={item.severity}>
                    {item.severity === 'critical' ? '严重' : item.severity === 'high' ? '高' : item.severity === 'medium' ? '中' : '信息'}
                  </StatusBadge>
                </div>
                <div className="mt-2 text-sm text-slate-500">
                  {item.category} · {item.detectedAt}
                </div>
                <div className="mt-2 text-sm text-slate-600">{item.summary}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function governanceCheckTone(status: string): 'active' | 'warning' | 'offline' {
  switch (status) {
    case 'healthy':
      return 'active'
    case 'warning':
      return 'warning'
    case 'error':
      return 'offline'
    default:
      return 'warning'
  }
}
