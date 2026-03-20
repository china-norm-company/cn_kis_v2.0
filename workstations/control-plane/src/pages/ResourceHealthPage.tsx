import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Cloud,
  Database,
  Globe,
  Printer,
  Server,
  Shield,
  Users,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { controlPlaneApi } from '@/api/controlPlane'
import type { ResourceHealthCategory } from '@/api/controlPlane'
import { QueryLoading, QueryError } from '@/components/QueryState'
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
  globe: Globe,
}

function HealthBadge({ health }: { health: string }) {
  if (health === 'healthy') return <StatusBadge tone="active">健康</StatusBadge>
  if (health === 'warning') return <StatusBadge tone="warning">告警</StatusBadge>
  if (health === 'critical') return <StatusBadge tone="critical">异常</StatusBadge>
  return <StatusBadge tone="info">未知</StatusBadge>
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: 'bg-emerald-500',
    healthy: 'bg-emerald-500',
    token_valid: 'bg-emerald-500',
    reachable: 'bg-blue-500',
    registered: 'bg-slate-400',
    warning: 'bg-amber-500',
    cert_expiring: 'bg-amber-500',
    cert_invalid: 'bg-red-500',
    offline: 'bg-red-500',
    unconfigured: 'bg-slate-300',
  }
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[status] ?? 'bg-slate-300'}`} />
}

function CategoryCard({ category }: { category: ResourceHealthCategory }) {
  const Icon = CATEGORY_ICONS[category.icon] ?? Server

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
          <Icon className="h-5 w-5 text-slate-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-900">{category.name}</h3>
            <HealthBadge health={category.health} />
          </div>
          <div className="mt-0.5 flex gap-3 text-xs text-slate-500">
            <span>{category.total} 个资源</span>
            {category.online > 0 && <span className="text-emerald-600">{category.online} 在线</span>}
            {category.warning > 0 && <span className="text-amber-600">{category.warning} 告警</span>}
            {category.offline > 0 && <span className="text-red-600">{category.offline} 离线</span>}
          </div>
        </div>
      </div>
      <div className="divide-y divide-slate-50">
        {category.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <StatusDot status={item.status} />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-slate-800">{item.name}</div>
              <div className="truncate text-xs text-slate-400">{item.location}</div>
            </div>
            <span className="shrink-0 text-xs text-slate-400">{item.status}</span>
          </div>
        ))}
        {category.items.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">暂无资源数据</div>
        )}
      </div>
    </div>
  )
}

export function ResourceHealthPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['resource-health'],
    queryFn: () => controlPlaneApi.getResourceHealth(),
    refetchInterval: 60_000,
  })

  const depQuery = useQuery({
    queryKey: ['dependency-check'],
    queryFn: () => controlPlaneApi.getDependencyCheck(),
  })

  if (isLoading) return <QueryLoading loadingText="正在加载资源健康概览..." />
  if (error) return <QueryError error={error} />
  if (!data) return null

  const depData = depQuery.data

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Global Summary */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5">
        <h1 className="text-lg font-bold text-slate-900">统一资源健康概览</h1>
        <p className="mt-1 text-sm text-slate-500">
          覆盖全部生产性资源 — 物理设备、云服务、域名、大模型、身份认证、存储
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
            <div className="text-2xl font-bold text-slate-900">{data.totalResources}</div>
            <div className="text-xs text-slate-500">总资源数</div>
          </div>
          <div className="rounded-lg bg-emerald-50 p-3 shadow-sm ring-1 ring-emerald-100">
            <div className="flex items-center gap-1.5 text-2xl font-bold text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              {data.healthyCount}
            </div>
            <div className="text-xs text-emerald-600">健康/在线</div>
          </div>
          <div className="rounded-lg bg-red-50 p-3 shadow-sm ring-1 ring-red-100">
            <div className="flex items-center gap-1.5 text-2xl font-bold text-red-700">
              <XCircle className="h-5 w-5" />
              {data.problemCount}
            </div>
            <div className="text-xs text-red-600">异常/离线</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 shadow-sm ring-1 ring-slate-100">
            <div className="text-2xl font-bold text-slate-700">{data.categories.length}</div>
            <div className="text-xs text-slate-500">资源类别</div>
          </div>
        </div>
        {data.collectedAt && (
          <div className="mt-3 text-xs text-slate-400">最近采集: {data.collectedAt}</div>
        )}
      </div>

      {/* Dependency Self-Check */}
      {depData && (
        <div className={`rounded-xl border p-4 ${depData.allOk ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center gap-2">
            {depData.allOk ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            )}
            <h2 className="font-semibold text-slate-900">
              平台依赖自检 — {depData.allOk ? '全部就绪' : `${depData.errorCount + depData.missingCount} 项异常`}
            </h2>
          </div>
          <div className="mt-3 space-y-1.5">
            {depData.checks.map((check) => (
              <div key={check.id} className="flex items-center gap-2 text-sm">
                {check.status === 'ok' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : check.status === 'error' ? (
                  <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                ) : (
                  <WifiOff className="h-4 w-4 shrink-0 text-slate-400" />
                )}
                <span className="font-medium text-slate-700">{check.name}</span>
                <span className="text-xs text-slate-400">{check.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.categories.map((cat) => (
          <CategoryCard key={cat.id} category={cat} />
        ))}
      </div>
    </div>
  )
}
