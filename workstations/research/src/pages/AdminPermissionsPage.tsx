/**
 * 权限管理页 — 管理员专属
 * 从方案检查台 menu-config API 获取所有登录过的用户，
 * 管理员可勾选每人可见的菜单模块，保存后立即对该用户生效。
 */
import { useState, useEffect, useCallback } from 'react'
import { useFeishuContext } from '@cn-kis/feishu-sdk'
import { Shield, Users, Check, X, RotateCcw, Save, ChevronDown, ChevronUp, RefreshCw, Wifi } from 'lucide-react'

// 方案检查台 menu-config API 地址
// 通过研究台后端 /api/v1/menu-config/ 代理转发到 Flask，
// 避免飞书 webview 对 /protocol-qc/ 路径的请求拦截
const API_BASE = '/api/v1/menu-config'

// 菜单 key 的中文标签
const MENU_LABELS: Record<string, string> = {
  'workbench': '我的工作台',
  'manager': '管理驾驶舱',
  'portfolio': '项目组合',
  'clients': '我的客户',
  'business': '商务管线',
  'feasibility': '可行性评估',
  'proposals': '方案准备',
  'proposals/quality-check': '方案质量检查',
  'protocols': '我的协议',
  'closeout': '结项管理',
  'closeout/settlement': '绩效结算',
  'changes': '变更管理',
  'tasks': '任务委派',
  'visits': '我的访视',
  'subjects': '我的受试者',
  'team': '团队全景',
  'knowledge': '知识库',
  'ai-assistant': 'AI 助手',
  'overview': '研究概览',
}

// 菜单分组（与侧边栏结构对应）
const MENU_GROUPS = [
  { label: '工作台', keys: ['workbench'] },
  { label: '管理中心', keys: ['manager', 'portfolio'] },
  { label: '客户与商务', keys: ['clients', 'business'] },
  { label: '项目生命周期', keys: ['feasibility', 'proposals', 'proposals/quality-check', 'protocols', 'closeout', 'closeout/settlement'] },
  { label: '变更与协调', keys: ['changes', 'tasks'] },
  { label: '执行管理', keys: ['visits', 'subjects'] },
  { label: '团队与知识', keys: ['team', 'knowledge', 'ai-assistant', 'overview'] },
]

interface UserConfig {
  username: string
  display_name: string
  avatar: string
  last_seen: string
  menus: string[]
  from_feishu?: boolean
  department?: string
  email?: string
}

interface UserRowProps {
  user: UserConfig
  allMenuKeys: string[]
  token: string | null
  onSaved: (username: string, menus: string[]) => void
}

function formatTime(iso: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  } catch {
    return iso
  }
}

function UserRow({ user, allMenuKeys, token, onSaved }: UserRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [selectedMenus, setSelectedMenus] = useState<Set<string>>(new Set(user.menus))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  const toggle = (key: string) => {
    setSelectedMenus((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
    setDirty(true)
    setSaved(false)
  }

  const selectAll = () => {
    setSelectedMenus(new Set(allMenuKeys))
    setDirty(true)
    setSaved(false)
  }

  const clearAll = () => {
    setSelectedMenus(new Set())
    setDirty(true)
    setSaved(false)
  }

  const reset = () => {
    setSelectedMenus(new Set(user.menus))
    setDirty(false)
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`${API_BASE}/user`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ username: user.username, menus: Array.from(selectedMenus) }),
      })
      if (!res.ok) throw new Error('保存失败')
      setSaved(true)
      setDirty(false)
      onSaved(user.username, Array.from(selectedMenus))
    } catch {
      alert('保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = selectedMenus.size
  const totalCount = allMenuKeys.length

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* 用户行头部 */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* 头像 */}
        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold text-sm flex-shrink-0 overflow-hidden">
          {user.avatar
            ? <img src={user.avatar} alt="" className="w-full h-full object-cover" />
            : (user.display_name?.[0] || user.username?.[0] || '?')}
        </div>
        {/* 名称 */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-slate-800 truncate">
            {user.display_name || user.username}
          </div>
          <div className="text-xs text-slate-400 truncate">
            {user.username} · 最后登录 {formatTime(user.last_seen)}
          </div>
        </div>
        {/* 权限摘要 */}
        <div className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
          dirty ? 'bg-amber-100 text-amber-700' :
          saved ? 'bg-green-100 text-green-700' :
          'bg-slate-100 text-slate-500'
        }`}>
          {dirty ? '未保存' : saved ? '已保存' : `${selectedCount}/${totalCount} 个模块`}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>

      {/* 展开的菜单勾选区 */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50">
          {/* 操作按钮 */}
          <div className="flex items-center gap-2 mb-4">
            <button onClick={selectAll} className="text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
              全选
            </button>
            <button onClick={clearAll} className="text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-red-400 hover:text-red-600 transition-colors">
              清空
            </button>
            {dirty && (
              <button onClick={reset} className="text-xs px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-700 transition-colors flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> 重置
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={save}
              disabled={saving || !dirty}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors ${
                dirty
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>

          {/* 分组菜单 */}
          <div className="space-y-3">
            {MENU_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{group.label}</div>
                <div className="flex flex-wrap gap-1.5">
                  {group.keys.filter((k) => allMenuKeys.includes(k)).map((key) => {
                    const checked = selectedMenus.has(key)
                    return (
                      <button
                        key={key}
                        onClick={() => toggle(key)}
                        className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                          checked
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-medium'
                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {checked
                          ? <Check className="w-3 h-3" />
                          : <X className="w-3 h-3 opacity-40" />}
                        {MENU_LABELS[key] || key}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminPermissionsPage() {
  const ctx = useFeishuContext()
  const [users, setUsers] = useState<UserConfig[]>([])
  const [allMenuKeys, setAllMenuKeys] = useState<string[]>([])
  const [defaults, setDefaults] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [defaultsDirty, setDefaultsDirty] = useState(false)
  const [defaultsMenus, setDefaultsMenus] = useState<Set<string>>(new Set())
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [feishuConnected, setFeishuConnected] = useState(false)
  const [syncingFeishu, setSyncingFeishu] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const getHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {}
    const t = ctx.token
    if (t && t !== 'dev-bypass-token') headers['Authorization'] = `Bearer ${t}`
    return headers
  }, [ctx.token])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/users`, { headers: getHeaders() })
      if (!res.ok) {
        if (res.status === 403) throw new Error('仅管理员可访问此页面')
        throw new Error(`请求失败 (${res.status})`)
      }
      const data = await res.json()
      // 按 display_name 去重：同名用户优先保留 from_feishu=true 的记录
      const rawUsers: UserConfig[] = data.users || []
      const deduped = new Map<string, UserConfig>()
      for (const u of rawUsers) {
        const key = u.display_name || u.username
        const existing = deduped.get(key)
        if (!existing || (!existing.from_feishu && u.from_feishu)) {
          // 飞书记录优先；合并本地记录的 last_seen（飞书记录没有）
          deduped.set(key, {
            ...u,
            last_seen: u.last_seen || existing?.last_seen || '',
          })
        }
      }
      setUsers(Array.from(deduped.values()))
      setAllMenuKeys(data.all_menu_keys || [])
      setDefaults(data.defaults || [])
      setDefaultsMenus(new Set(data.defaults || []))
      setFeishuConnected(!!data.feishu_connected)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '加载失败'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [getHeaders])

  useEffect(() => {
    // 延迟 300ms 等 token 就绪，失败后 1s 自动重试一次
    const t1 = setTimeout(() => {
      fetchData().catch(() => {
        setTimeout(() => fetchData(), 1000)
      })
    }, 300)
    return () => clearTimeout(t1)
  }, [fetchData])

  const handleUserSaved = (username: string, menus: string[]) => {
    setUsers((prev) => prev.map((u) => u.username === username ? { ...u, menus } : u))
  }

  const saveDefaults = async () => {
    setSavingDefaults(true)
    try {
      const res = await fetch(`${API_BASE}/defaults`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getHeaders() },
        body: JSON.stringify({ menus: Array.from(defaultsMenus) }),
      })
      if (!res.ok) throw new Error('保存失败')
      setDefaults(Array.from(defaultsMenus))
      setDefaultsDirty(false)
    } catch {
      alert('保存失败，请重试')
    } finally {
      setSavingDefaults(false)
    }
  }

  const syncFeishu = async () => {
    setSyncingFeishu(true)
    setSyncMsg('')
    try {
      const res = await fetch(`${API_BASE}/sync-feishu`, {
        method: 'POST',
        headers: getHeaders(),
      })
      const data = await res.json()
      if (data.ok) {
        setSyncMsg(`已同步 ${data.count} 名成员`)
        // 刷新用户列表
        await fetchData()
      } else {
        setSyncMsg(data.msg || '同步失败')
      }
    } catch {
      setSyncMsg('同步请求失败，请检查网络')
    } finally {
      setSyncingFeishu(false)
      setTimeout(() => setSyncMsg(''), 4000)
    }
  }

  const toggleDefault = (key: string) => {
    setDefaultsMenus((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
    setDefaultsDirty(true)
  }

  if (!ctx.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-500 gap-3">
        <Shield className="w-10 h-10 text-slate-300" />
        <p className="text-sm font-medium">仅管理员可访问此页面</p>
      </div>
    )
  }

  return (
    <div className="p-4 pb-10 max-w-3xl mx-auto">
      {/* 页头 */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-800">权限管理</h1>
          <p className="text-xs text-slate-400">配置每位用户在研究台可见的功能模块</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* 飞书同步状态 */}
          <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg ${feishuConnected ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 bg-slate-100'}`}>
            <Wifi className="w-3 h-3" />
            {feishuConnected ? '飞书已连接' : '飞书未连接'}
          </div>
          {/* 同步飞书按钮 */}
          <button
            onClick={syncFeishu}
            disabled={syncingFeishu}
            title="从飞书通讯录同步最新成员列表"
            className="text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-600 hover:bg-emerald-50 transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            {syncingFeishu
              ? <div className="w-3 h-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
            同步飞书
          </button>
          {/* 刷新按钮 */}
          <button
            onClick={fetchData}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> 刷新
          </button>
        </div>
      </div>

      {/* 同步反馈消息 */}
      {syncMsg && (
        <div className={`mb-4 rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 ${
          syncMsg.includes('失败') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}>
          {syncMsg}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-3">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">加载中…</span>
          <span className="text-xs text-slate-300">首次加载需从飞书同步通讯录，约 10-15 秒</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 mb-4 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            onClick={fetchData}
            className="text-xs px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 flex items-center gap-1 flex-shrink-0"
          >
            <RotateCcw className="w-3 h-3" /> 重试
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* 新用户默认权限 */}
          <div className="mb-6 border border-slate-200 rounded-xl bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
                <Users className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-slate-700">新用户默认可见模块</span>
              <span className="text-xs text-slate-400">（首次登录时自动应用）</span>
              <div className="flex-1" />
              {defaultsDirty && (
                <button
                  onClick={saveDefaults}
                  disabled={savingDefaults}
                  className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 flex items-center gap-1.5"
                >
                  {savingDefaults
                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Save className="w-3 h-3" />}
                  保存默认
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allMenuKeys.map((key) => {
                const checked = defaultsMenus.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggleDefault(key)}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                      checked
                        ? 'bg-blue-50 border-blue-300 text-blue-700 font-medium'
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {checked ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 opacity-40" />}
                    {MENU_LABELS[key] || key}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 用户列表 */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">用户权限</span>
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{users.length} 人</span>
            {feishuConnected && (
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">来自飞书通讯录</span>
            )}
          </div>

          {users.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无用户记录</p>
              <p className="text-xs mt-1">
                {feishuConnected ? '飞书通讯录为空，请检查授权范围' : '用户登录研究台后会自动出现在此列表'}
              </p>
              <button
                onClick={syncFeishu}
                disabled={syncingFeishu}
                className="mt-3 text-xs px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> 立即同步飞书通讯录
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <UserRow
                  key={user.username}
                  user={user}
                  allMenuKeys={allMenuKeys}
                  token={ctx.token}
                  onSaved={handleUserSaved}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
