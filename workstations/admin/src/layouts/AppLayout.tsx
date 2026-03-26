import { Outlet, NavLink } from 'react-router-dom'
import { LayoutDashboard, Shield, Users, Lock, FileText, Monitor, Key, Settings, MessageSquare, LogOut, Sliders, ExternalLink, Radar, Rocket } from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig, getWorkstationUrl } from '@cn-kis/feishu-sdk'

const FEISHU_CONFIG = createWorkstationFeishuConfig('admin')

const navGroups = [
  {
    label: '概览',
    items: [
      { path: '/dashboard', label: '系统概览', icon: LayoutDashboard, permissions: ['system.role.manage'] },
    ],
  },
  {
    label: '身份与权限',
    items: [
      { path: '/accounts', label: '账号管理', icon: Users, permissions: ['system.account.manage'] },
      { path: '/roles', label: '角色管理', icon: Shield, permissions: ['system.role.manage'] },
      { path: '/permissions', label: '权限管理', icon: Lock, permissions: ['system.role.manage'] },
      { path: '/sessions', label: '会话管理', icon: Key, permissions: ['system.account.manage'] },
    ],
  },
  {
    label: '上线治理',
    items: [
      { path: '/launch/overview', label: '上线总览', icon: Rocket, permissions: ['system.role.manage'] },
      { path: '/launch/lifecycle', label: '最小闭环', icon: Rocket, permissions: ['system.role.manage'] },
      { path: '/launch/workstations', label: '19 台地图', icon: Rocket, permissions: ['system.role.manage'] },
      { path: '/launch/gaps', label: '缺口池', icon: Rocket, permissions: ['system.role.manage'] },
      { path: '/launch/goals', label: '目标节奏', icon: Rocket, permissions: ['system.role.manage'] },
    ],
  },
  {
    label: '系统运维',
    items: [
      { path: '/workstations', label: '工作台总览', icon: Monitor, permissions: ['system.role.manage'] },
      { path: '/pilot-config', label: '试点用户配置', icon: Sliders, permissions: ['system.role.manage'] },
      { path: '/audit', label: '审计日志', icon: FileText, permissions: ['system.role.manage'] },
    ],
  },
  {
    label: '数字员工',
    items: [
      { path: '/digital-workforce', label: '数字员工中心', icon: ExternalLink, externalHref: 'WORKSTATION:digital-workforce#/portal', permissions: ['system.role.manage'] as string[] },
    ],
  },
  {
    label: '集成与配置',
    items: [
      { path: '/feishu', label: '飞书集成', icon: MessageSquare, permissions: ['system.role.manage'] },
      { path: '/config', label: '系统配置', icon: Settings, permissions: ['system.role.manage'] },
    ],
  },
]


function SidebarNav() {
  const { canSeeMenu } = useFeishuContext()
  return (
    <nav className="flex flex-col gap-1 px-3 py-4 overflow-y-auto flex-1">
      {navGroups.map((group) => {
        const visible = group.items.filter(
          (item) => canSeeMenu('admin', item.path.replace(/^\//, ''), item.permissions),
        )
        if (visible.length === 0) return null
        return (
          <div key={group.label} className="mb-3">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </div>
            {visible.map((item) => {
              const ext = (item as { externalHref?: string }).externalHref
              if (ext) {
                const href = ext.startsWith('WORKSTATION:')
                  ? (() => {
                      const [key, hash] = ext.slice('WORKSTATION:'.length).split('#')
                      return getWorkstationUrl(key, hash ? `#${hash}` : undefined)
                    })()
                  : ext
                return (
                  <a
                    key={item.path || item.label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                  >
                    <item.icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </a>
                )
              }
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`
                  }
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}

function UserHeader() {
  const { user, logout } = useFeishuContext()
  return (
    <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6">
      <h1 className="text-base font-semibold text-slate-800">鹿鸣·治理台</h1>
      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">
                {user.name?.charAt(0)}
              </div>
            )}
            <span className="text-sm text-slate-600">{user.name}</span>
          </div>
        )}
        <a
          href={getWorkstationUrl('control-plane')}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        >
          <Radar className="w-4 h-4" />
          <span>统一平台</span>
        </a>
        <button
          onClick={logout}
          className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
          title="退出登录"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}

function LayoutContent() {
  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-700 text-white flex items-center justify-center text-sm font-bold">
              御
            </div>
            <span className="text-sm font-semibold text-slate-700">鹿鸣·治理台</span>
          </div>
        </div>
        <SidebarNav />
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <UserHeader />
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function AdminLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="鹿鸣·治理台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
          loadingFallback={
            <div className="flex items-center justify-center h-screen text-slate-500">正在加载鹿鸣·治理台...</div>
          }
      loginFallback={<AdminLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
