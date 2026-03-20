/**
 * 客户-项目时间线组件
 *
 * 展示该客户所有项目的生命周期进度
 */
import { Badge } from '@cn-kis/ui-kit'
import { Briefcase, Calendar, CheckCircle, Clock, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

interface ProjectItem {
  id: number
  title: string
  code: string
  status: string
  start_date?: string
  end_date?: string
  progress?: number
}

interface Props {
  projects: ProjectItem[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  active: { label: '进行中', color: 'bg-blue-100 text-blue-700', icon: Clock },
  completed: { label: '已完成', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  planning: { label: '规划中', color: 'bg-amber-100 text-amber-700', icon: Calendar },
  suspended: { label: '暂停', color: 'bg-red-100 text-red-700', icon: AlertCircle },
}

export function ClientProjectTimeline({ projects }: Props) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-slate-400">暂无关联项目</div>
    )
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-2 bottom-2 w-px bg-slate-200" />
      <div className="space-y-4">
        {projects.map((p) => {
          const config = STATUS_CONFIG[p.status] || STATUS_CONFIG.active
          const Icon = config.icon
          return (
            <Link
              key={p.id}
              to={`/projects/${p.id}/dashboard`}
              className="flex items-start gap-4 relative group"
            >
              <div className="relative z-10 w-8 h-8 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center flex-shrink-0 group-hover:border-blue-300">
                <Briefcase className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500" />
              </div>
              <div className="flex-1 bg-white rounded-lg border border-slate-100 p-3 group-hover:border-blue-200 group-hover:shadow-sm transition">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600">{p.title}</span>
                  <span className={`text-[11px] px-1.5 py-0.5 rounded ${config.color}`}>{config.label}</span>
                </div>
                {p.code && <div className="text-xs text-slate-400 mt-0.5">{p.code}</div>}
                {(p.start_date || p.end_date) && (
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {p.start_date || '?'} ~ {p.end_date || '进行中'}
                  </div>
                )}
                {p.progress != null && (
                  <div className="mt-2">
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${p.progress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
