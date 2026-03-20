import { Link } from 'react-router-dom'
import { GitBranch } from 'lucide-react'
import type { ObjectDependencies } from '@/api/controlPlane'

interface DependencyContextPanelProps {
  dependencies: ObjectDependencies | null
  objectId: string | null
  loading?: boolean
}

export function DependencyContextPanel({ dependencies, objectId, loading }: DependencyContextPanelProps) {
  if (loading) return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">加载中...</div>
  if (!dependencies || !objectId) return null

  const { dependsOn, dependedBy } = dependencies
  const hasAny = dependsOn.length > 0 || dependedBy.length > 0
  if (!hasAny) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
        <GitBranch className="h-4 w-4" />
        依赖关系
      </div>
      <div className="space-y-3 text-xs">
        {dependsOn.length > 0 && (
          <div>
            <div className="text-slate-500">依赖</div>
            <ul className="mt-1 space-y-1">
              {dependsOn.map((o) => (
                <li key={o.id}>
                  <Link to={`/objects/${o.id}`} className="text-primary-600 hover:underline">
                    {o.name || o.id}
                  </Link>
                  <span className="ml-1 text-slate-400">{o.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {dependedBy.length > 0 && (
          <div>
            <div className="text-slate-500">被依赖</div>
            <ul className="mt-1 space-y-1">
              {dependedBy.map((o) => (
                <li key={o.id}>
                  <Link to={`/objects/${o.id}`} className="text-primary-600 hover:underline">
                    {o.name || o.id}
                  </Link>
                  <span className="ml-1 text-slate-400">{o.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
