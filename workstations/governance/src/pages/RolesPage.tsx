import { useState, useEffect } from 'react'
import { Shield, Users, RefreshCw, ChevronRight } from 'lucide-react'
import { iamApi } from '@cn-kis/api-client'

// 后端 /auth/roles/list 返回字段：name, display_name, level, category, description, is_system
interface RoleItem {
  name: string
  display_name: string
  level: number
  category: string
  description: string
  is_system: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  management: '管理层', technical: '技术层', operation: '运营层',
  support: '职能层', external: '外部访问',
}

const LEVEL_LABELS: Record<number, string> = {
  10: 'L10 系统最高权限', 8: 'L8 总监/总经理', 6: 'L6 部门经理',
  5: 'L5 主管/高级专员', 4: 'L4 专员/助理', 3: 'L3 执行人员',
  1: 'L1 只读/外部',
}

export function RolesPage() {
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<RoleItem | null>(null)

  const fetchRoles = () => {
    setLoading(true)
    setError(null)
    iamApi.listRoles()
      .then((res: any) => {
        // /auth/roles/list 返回 data 是直接数组，非 items 包装
        const rawData = res?.data
        const list: RoleItem[] = Array.isArray(rawData) ? rawData : (rawData?.items ?? [])
        setRoles(list)
      })
      .catch(() => setError('角色列表加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchRoles() }, [])

  // 按 category 分组
  const grouped = roles.reduce((acc: Record<string, RoleItem[]>, r) => {
    const cat = r.category || '其他'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(r)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">角色管理</h2>
          <p className="text-sm text-slate-500 mt-1">系统角色定义，共 {roles.length} 个角色（5个权限层级）</p>
        </div>
        <button onClick={fetchRoles} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" />
          刷新
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* 左列：角色列表 */}
        <div className="col-span-1 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <p className="text-sm font-medium text-slate-700">角色列表</p>
          </div>
          {loading ? (
            <div className="p-4 text-center text-slate-400 text-sm animate-pulse">加载中…</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {Object.entries(grouped)
                .sort(([a], [b]) => {
                  const order = ['management', 'technical', 'operation', 'support', 'external']
                  return order.indexOf(a) - order.indexOf(b)
                })
                .map(([cat, catRoles]) => (
                <div key={cat}>
                  <div className="px-4 py-2 bg-slate-50 text-xs font-medium text-slate-500 uppercase tracking-wide">
                    {CATEGORY_LABELS[cat] || cat}
                  </div>
                  {catRoles
                    .sort((a, b) => b.level - a.level)
                    .map((r) => (
                    <button
                      key={r.name}
                      onClick={() => setSelected(r)}
                      className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors ${
                        selected?.name === r.name ? 'bg-blue-50 border-r-2 border-blue-500' : ''
                      }`}
                    >
                      <Shield className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{r.display_name}</p>
                        <p className="text-xs text-slate-400 font-mono">{r.name}</p>
                      </div>
                      <span className="text-xs text-slate-300 shrink-0">L{r.level}</span>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：角色详情 */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200">
          {selected ? (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Shield className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold text-slate-800">{selected.display_name}</h3>
                    {selected.is_system && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">系统内置</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 font-mono">{selected.name}</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <dt className="text-xs text-slate-400 mb-1">权限层级</dt>
                  <dd className="text-sm font-semibold text-slate-800">
                    {LEVEL_LABELS[selected.level] || `L${selected.level}`}
                  </dd>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <dt className="text-xs text-slate-400 mb-1">角色分类</dt>
                  <dd className="text-sm font-medium text-slate-800">
                    {CATEGORY_LABELS[selected.category] || selected.category}
                  </dd>
                </div>
              </dl>

              {selected.description && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <p className="text-xs text-slate-400 mb-1">职责描述</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{selected.description}</p>
                </div>
              )}

              <div className="bg-blue-50 rounded-lg p-4 flex items-start gap-2">
                <Users className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-700">
                  <p className="font-medium mb-1">查看此角色的持有人</p>
                  <p>前往「用户档案」页面，系统会在每个账号的角色列表中标注其角色。</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center py-20 text-slate-400">
              <div className="text-center">
                <Shield className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                <p className="text-sm">从左侧选择一个角色查看详情</p>
                <p className="text-xs mt-1 text-slate-300">共 35 种角色，覆盖 L1–L10 五个权限层级</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
