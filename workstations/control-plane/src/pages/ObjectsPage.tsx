import { useQuery } from '@tanstack/react-query'
import { Activity, Brain, Cloud, Database, FlaskConical, GitBranch, Layers, MapPin, Printer, Search, Server, Shield, Users, Wifi } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { controlPlaneApi } from '@/api/controlPlane'
import { QueryError, QueryLoading } from '@/components/QueryState'
import { StatusBadge } from '@/components/StatusBadge'

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType }> = {
  'network-security': { label: '网络与安全', icon: Shield },
  'compute-virtualization': { label: '计算与虚拟化', icon: Server },
  'storage-database': { label: '存储与数据', icon: Database },
  'application-service': { label: '业务与接入', icon: Activity },
  'identity-collaboration': { label: '身份与协同', icon: Users },
  'domain-cloud-entry': { label: '域名与云', icon: Cloud },
  'ai-model-resource': { label: 'AI与模型', icon: Brain },
  'endpoint-output': { label: '终端与输出', icon: Printer },
  'lab-instrument': { label: '实验室仪器', icon: FlaskConical },
  'saas-production': { label: 'SaaS生产系统', icon: Layers },
  'iot-environment': { label: 'IoT与环境', icon: Wifi },
  'facility-space': { label: '场地与设施', icon: MapPin },
}

export function ObjectsPage() {
  const [keyword, setKeyword] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [strategyFilter, setStrategyFilter] = useState('all')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const { data, isLoading, error } = useQuery({
    queryKey: ['control-plane', 'objects'],
    queryFn: controlPlaneApi.getObjects,
  })

  const filteredObjects = useMemo(() => {
    if (!data) return []
    const normalizedKeyword = keyword.trim().toLowerCase()
    return data.filter((item) => {
      const category = String(item.extra?.management_category_id ?? '')
      const strategy = String(item.extra?.probe_strategy ?? '')
      const owner = String(item.owner ?? '')
      const matchesKeyword = !normalizedKeyword || [item.name, item.assetCode, item.location, item.zone, item.type, item.subtype]
        .join(' ')
        .toLowerCase()
        .includes(normalizedKeyword)
      const matchesCategory = categoryFilter === 'all' || category === categoryFilter
      const matchesStrategy = strategyFilter === 'all' || strategy === strategyFilter
      const matchesOwner = ownerFilter === 'all' || owner === ownerFilter
      return matchesKeyword && matchesCategory && matchesStrategy && matchesOwner
    })
  }, [categoryFilter, data, keyword, strategyFilter, ownerFilter])

  const ownerOptions = useMemo(() => {
    if (!data) return []
    const seen = new Set<string>()
    return data
      .map((item) => String(item.owner ?? ''))
      .filter((o) => {
        if (!o || seen.has(o)) return false
        seen.add(o)
        return true
      })
      .sort()
      .map((id) => ({ id, label: id }))
  }, [data])

  const strategyOptions = useMemo(() => {
    if (!data) return []
    const strategyLabelMap: Record<string, string> = {
      integrated_live: '已接实时采集',
      edge_agent_required: '需边缘采集器',
      direct_public_probe: '可直接公网探测',
      config_audit: '配置巡检型资源',
    }
    const seen = new Set<string>()
    return data
      .map((item) => String(item.extra?.probe_strategy ?? ''))
      .filter((item) => {
        if (!item || seen.has(item)) return false
        seen.add(item)
        return true
      })
      .map((id) => ({ id, label: strategyLabelMap[id] ?? id }))
  }, [data])

  const categoryCounts = useMemo(() => {
    if (!data) return {} as Record<string, { total: number; active: number; warning: number; offline: number }>
    const counts: Record<string, { total: number; active: number; warning: number; offline: number }> = {}
    for (const item of data) {
      const catId = String(item.extra?.management_category_id ?? 'other')
      if (!counts[catId]) counts[catId] = { total: 0, active: 0, warning: 0, offline: 0 }
      counts[catId].total++
      if (item.status === 'active') counts[catId].active++
      else if (item.status === 'warning') counts[catId].warning++
      else if (item.status === 'offline') counts[catId].offline++
    }
    return counts
  }, [data])

  if (isLoading) {
    return <QueryLoading loadingText="正在加载对象列表..." />
  }

  if (error || !data) {
    return <QueryError error={error} />
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">对象中心</h1>
            <Link
              to="/dependencies"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <GitBranch className="h-3.5 w-3.5" />
              依赖与拓扑
            </Link>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            统一管理全部生产性资源 — 网络、计算、存储、应用、身份、域名/云、AI/模型、终端/输出，支持按类别、策略与责任域治理。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${categoryFilter === 'all' ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            全部 ({data.length})
          </button>
          {Object.entries(CATEGORY_META).map(([catId, meta]) => {
            const count = categoryCounts[catId]?.total ?? 0
            if (count === 0) return null
            const Icon = meta.icon
            return (
              <button
                key={catId}
                type="button"
                onClick={() => setCategoryFilter(catId)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${categoryFilter === catId ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label} ({count})
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索名称、编号、区域"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-primary-300 focus:ring-4 focus:ring-primary-50"
            />
          </div>
          <select
            value={strategyFilter}
            onChange={(event) => setStrategyFilter(event.target.value)}
            className="h-11 min-w-[140px] rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-primary-300 focus:ring-4 focus:ring-primary-50"
          >
            <option value="all">全部接入策略</option>
            {strategyOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
            className="h-11 min-w-[120px] rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-primary-300 focus:ring-4 focus:ring-primary-50"
            aria-label="责任域"
          >
            <option value="all">全部责任域</option>
            {ownerOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1220px] w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-600">
                <th className="px-4 py-3 font-medium">对象</th>
                <th className="px-4 py-3 font-medium">类型</th>
                <th className="px-4 py-3 font-medium">治理分类</th>
                <th className="px-4 py-3 font-medium">位置</th>
                <th className="px-4 py-3 font-medium">接入策略</th>
                <th className="px-4 py-3 font-medium">巡检结果</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">风险</th>
                <th className="px-4 py-3 font-medium">责任人</th>
                <th className="px-4 py-3 font-medium">最近观测</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredObjects.length > 0 ? (
                filteredObjects.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/objects/${item.id}`} className="block">
                        <div className="font-medium text-slate-900 hover:text-primary-600">{item.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.assetCode}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{String(item.extra?.management_category ?? '未分类')}</div>
                      <div className="mt-1 text-xs text-slate-400">{String(item.extra?.management_tier ?? 'S3')} · {item.subtype || item.type}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{item.location}</div>
                      <div className="mt-1 text-xs text-slate-400">{item.zone}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{probeStrategyLabel(String(item.extra?.probe_strategy ?? ''))}</div>
                      <div className="mt-1 text-xs text-slate-400">{String(item.extra?.collector_mode ?? '待定义')}</div>
                    </td>
                    <td className="px-4 py-3">
                      {item.extra?.governance_check_status ? (
                        <StatusBadge tone={governanceCheckTone(String(item.extra.governance_check_status))}>
                          {item.extra.governance_check_status === 'healthy'
                            ? '健康'
                            : item.extra.governance_check_status === 'warning'
                              ? '待完善'
                              : '异常'}
                        </StatusBadge>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={item.status}>
                        {item.status === 'active' ? '正常' : item.status === 'warning' ? '预警' : '离线'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={item.riskLevel}>
                        {item.riskLevel === 'high' ? '高' : item.riskLevel === 'medium' ? '中' : '低'}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.owner}</td>
                    <td className="px-4 py-3 text-slate-600">{item.lastSeenAt || '待接入'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                    当前没有匹配对象。若刚完成登录但列表为空，通常说明后端尚未接入对应数据源，或资源注册表尚未覆盖该类资产。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function probeStrategyLabel(strategy: string): string {
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
      return strategy || '待定义'
  }
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
