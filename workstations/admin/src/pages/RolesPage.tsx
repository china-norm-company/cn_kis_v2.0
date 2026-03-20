import { useQuery } from '@tanstack/react-query'
import { api } from '@cn-kis/api-client'
import { Shield } from 'lucide-react'

interface Role {
  name: string
  display_name: string
  level: number
  category: string
  description: string
  is_system: boolean
}

export function RolesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['auth', 'roles'],
    queryFn: async () => {
      const res = await api.get<Role[]>('/auth/roles/list')
      if (res.code !== 200 || !res.data) throw new Error(res.msg || '获取角色列表失败')
      return res.data as unknown as Role[]
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        加载角色列表中...
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3">
        {error instanceof Error ? error.message : '加载失败'}
      </div>
    )
  }

  const roles = Array.isArray(data) ? data : []

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="w-5 h-5 text-slate-600" />
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">角色列表</h2>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        系统预置角色与数据作用域说明见文档。分配/移除角色请前往「账号管理」。
      </p>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-700">角色名</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">显示名</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">级别</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">分类</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">说明</th>
              <th className="text-left px-4 py-3 font-medium text-slate-700">系统</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {roles.map((r) => (
              <tr key={r.name} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-slate-600">{r.name}</td>
                <td className="px-4 py-3 text-slate-800">{r.display_name}</td>
                <td className="px-4 py-3 text-slate-600">L{r.level}</td>
                <td className="px-4 py-3 text-slate-600">{r.category}</td>
                <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{r.description}</td>
                <td className="px-4 py-3">{r.is_system ? '是' : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
