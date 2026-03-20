/**
 * 周报父级布局：左侧导航只展示一个「周报」入口，点进后在此用标签切换
 * 子标签：周报填写 | 周报项目管理 | 周报看板
 */
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FileEdit, Briefcase, BarChart3 } from 'lucide-react'

const TABS = [
  { key: 'fill', path: '/weekly', label: '周报填写', icon: FileEdit },
  { key: 'projects', path: '/weekly/projects', label: '周报项目管理', icon: Briefcase },
  { key: 'dashboard', path: '/weekly/dashboard', label: '周报看板', icon: BarChart3 },
] as const

export default function WeeklyLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = location.pathname

  const isActive = (path: string) => {
    if (path === '/weekly') return pathname === '/weekly'
    return pathname.startsWith(path)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {TABS.map(({ path, label, icon: Icon }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
              isActive(path)
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
