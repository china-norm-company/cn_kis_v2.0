import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Shield, Key, Activity, BarChart3,
  Clock, Cpu, Lock, LogOut, Radar, Monitor, Sliders,
  MessageSquare, Settings,
} from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig, getWorkstationUrl } from '@cn-kis/feishu-sdk'
import { usePageTracking } from '@cn-kis/api-client'

const FEISHU_CONFIG = createWorkstationFeishuConfig('governance')

const navGroups = [
  {
    label: '概览',
    items: [
      { path: '/dashboard', label: '管理驾驶舱', icon: LayoutDashboard, permissions: ['system.role.manage'] },
    ],
  },
  {
    label: '用户与权限',
    items: [
      { path: '/users', label: '用户档案', icon: Users, permissions: ['system.account.manage'] },
      { path: '/roles', label: '角色与权限', icon: Shield, permissions: ['system.role.manage'] },
      { path: '/permissions', label: '权限矩阵', icon: Lock, permissions: ['system.role.manage'] },
      { path: '/sessions', label: 'Token & 会话', icon: Key, permissions: ['system.account.manage'] },
    ],
  },
  {
    label: '行为监控',
    items: [
      { path: '/activity', label: '登录活动', icon: Clock, permissions: ['system.account.manage'] },
      { path: '/feature-usage', label: '功能使用分析', icon: BarChart3, permissions: ['system.role.manage'] },
      { path: '/ai-usage', label: 'AI 消耗统计', icon: Cpu, permissions: ['system.role.manage'] },
    ],
  },
  {
    label: '审计',
    items: [
      { path: '/audit', label: '安全审计日志', icon: Activity, permissions: ['system.role.manage'] },
    ],
  },
  {
    label: '系统运维',
    items: [
      { path: '/workstations', label: '工作台总览', icon: Monitor, permissions: ['system.role.manage'] },
      { path: '/pilot-config', label: '试点用户配置', icon: Sliders, permissions: ['system.role.manage'] },
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
          (item) => canSeeMenu('governance', item.path.replace(/^\//, ''), item.permissions),
        )
        if (visible.length === 0) return null
        return (
          <div key={group.label} className="mb-3">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {group.label}
            </div>
            {visible.map((item) => (
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
            ))}
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
  usePageTracking('governance')
  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col">
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-slate-200">
          <div className="w-7 h-7 rounded-lg bg-stone-700 text-white text-xs font-bold flex items-center justify-center shrink-0">
            鸣
          </div>
          <span className="text-sm font-semibold text-slate-700">鹿鸣·治理台</span>
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

function GovernanceLoginFallback() {
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
      loginFallback={<GovernanceLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
