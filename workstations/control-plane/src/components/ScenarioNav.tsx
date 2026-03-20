import { Link } from 'react-router-dom'
import { Layers } from 'lucide-react'
import type { ScenarioSummary } from '@/api/controlPlane'

interface ScenarioNavProps {
  scenarios?: ScenarioSummary[]
  loading?: boolean
}

export function ScenarioNav({ scenarios = [], loading }: ScenarioNavProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
        <Layers className="h-4 w-4" />
        场景
      </div>
      {loading ? (
        <div className="text-xs text-slate-400">加载中...</div>
      ) : (
        <nav className="flex flex-wrap gap-2">
          <Link
            to="/today-ops"
            className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            今日运行
          </Link>
          <Link
            to="/scenarios"
            className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
          >
            场景中心
          </Link>
          {scenarios.slice(0, 5).map((s) => (
            <Link
              key={s.id}
              to={`/scenarios?scene=${s.id}`}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-sm ring-1 ${
                s.status === 'ready'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                  : 'bg-amber-50 text-amber-700 ring-amber-200'
              }`}
            >
              {s.name}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}
