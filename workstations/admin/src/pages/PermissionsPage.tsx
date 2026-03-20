import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { identityApi } from '@cn-kis/api-client'
import { Shield, Search, ChevronDown } from 'lucide-react'

interface RoleItem {
  name: string
  display_name: string
  level: number
  category: string
  description: string
  is_system: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  system: '系统角色',
  project: '项目角色',
  workstation: '工作台角色',
}

export function PermissionsPage() {
  const [expandedRole, setExpandedRole] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'roles-full'],
    queryFn: () => identityApi.listRoles(),
  })

  const roles: RoleItem[] = (data as any)?.data ?? []
  const filtered = roles.filter(
    (r) => !search || r.display_name.includes(search) || r.name.includes(search),
  )

  const grouped = filtered.reduce<Record<string, RoleItem[]>>((acc, r) => {
    const cat = r.category || 'system'
    ;(acc[cat] ??= []).push(r)
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">权限管理</h2>
        <span className="text-sm text-slate-400">共 {roles.length} 个角色</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索角色名称..."
          className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2.5 text-sm focus:border-primary-300 focus:ring-1 focus:ring-primary-200 outline-none"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">加载中...</div>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="rounded-xl border border-slate-200 bg-white">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-600">
                {CATEGORY_LABELS[category] || category}
                <span className="ml-2 text-xs font-normal text-slate-400">{items.length} 个</span>
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {items.map((role) => (
                <div key={role.name}>
                  <div
                    onClick={() => setExpandedRole(expandedRole === role.name ? null : role.name)}
                    className="flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-slate-50"
                  >
                    <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-700">{role.display_name}</div>
                      <div className="text-xs text-slate-400">{role.name} · Level {role.level}</div>
                    </div>
                    {role.is_system && (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-600">系统</span>
                    )}
                    <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform ${expandedRole === role.name ? 'rotate-180' : ''}`} />
                  </div>
                  {expandedRole === role.name && role.description && (
                    <div className="px-5 pb-3 pl-12 text-xs text-slate-500 bg-slate-50">
                      {role.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
