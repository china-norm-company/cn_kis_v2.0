import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Database, GitBranch, Activity, Shield,
  HardDrive, BookOpen, Network, LogOut, Radar,
} from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig, getWorkstationUrl } from '@cn-kis/feishu-sdk'

const FEISHU_CONFIG = createWorkstationFeishuConfig('data-platform')

const navGroups = [
  {
    label: '概览',
    items: [
      { path: '/dashboard', label: '数据全景', icon: LayoutDashboard, permissions: ['system.role.manage'] },
    ],
  },
  {
    label: '数据资产',
    items: [
      { path: '/catalog', label: '数据目录', icon: Database, permissions: ['system.role.manage'] },
      { path: '/lineage', label: '数据血缘图谱', icon: GitBranch, permissions: ['system.role.manage'] },
      { path: '/knowledge', label: '知识库资产', icon: BookOpen, permissions: ['system.role.manage'] },
    ],
  },
  {
    label: '运行监控',
    items: [
      { path: '/pipelines', label: 'Pipeline 健康', icon: Activity, permissions: ['system.role.manage'] },
      { path: '/quality', label: '数据质量', icon: Shield, permissions: ['system.role.manage'] },
      { path: '/topology', label: '数据关系拓扑', icon: Network, permissions: ['system.role.manage'] },
    ],
  },
  {
    label: '存储管理',
    items: [
      { path: '/storage', label: '存储容量规划', icon: HardDrive, permissions: ['system.role.manage'] },
      { path: '/backup', label: '备份与恢复', icon: HardDrive, permissions: ['system.role.manage'] },
    ],
  },
]

function SidebarNav() {
  const { canSeeMenu } = useFeishuContext()
  return (
    <nav className="flex flex-col gap-1 px-3 py-4 overflow-y-auto flex-1">
      {navGroups.map((group) => {
        const visible = group.items.filter(
          (item) => canSeeMenu('data-platform', item.path.replace(/^\//, ''), item.permissions),
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
      <h1 className="text-base font-semibold text-slate-800">洞明·数据台</h1>
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
            <div className="w-8 h-8 rounded-lg bg-purple-700 text-white flex items-center justify-center text-sm font-bold">
              洞
            </div>
            <span className="text-sm font-semibold text-slate-700">洞明·数据台</span>
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

function DataPlatformLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="洞明·数据台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={
        <div className="flex items-center justify-center h-screen text-slate-500">正在加载洞明·数据台...</div>
      }
      loginFallback={<DataPlatformLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
