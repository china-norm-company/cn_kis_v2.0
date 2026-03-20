import {
  createWorkstationFeishuConfig,
  FeishuAuthProvider,
  LoginFallback,
  useFeishuContext,
} from '@cn-kis/feishu-sdk'
import {
  Activity,
  Bot,
  BookOpen,
  CalendarCheck,
  FileSearch,
  GitBranch,
  HeartPulse,
  Layers,
  LayoutDashboard,
  ListTodo,
  Network,
  Server,
  ShieldAlert,
  Siren,
  Waypoints,
} from 'lucide-react'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'
import { Link, Outlet } from 'react-router-dom'
import { useApiInit } from '@/hooks/useApiInit'
import { RoleWorkspaceSwitcher } from '@/components/RoleWorkspaceSwitcher'

const FEISHU_CONFIG = createWorkstationFeishuConfig('control-plane')

/** 在 Provider 内初始化 API 客户端，401/403 时触发登出以显示登录页 */
function ApiClientInit() {
  const { logout } = useFeishuContext()
  useApiInit({ onUnauthorized: logout })
  return null
}

// 一级核心入口（保留）+ 新增入口；降级页置于末尾
const navItems = [
  { path: '/dashboard', label: '总控台', icon: LayoutDashboard, permissions: ['control.dashboard.read'] },
  { path: '/today-ops', label: '今日运行', icon: CalendarCheck, permissions: ['control.dashboard.read'] },
  { path: '/scenarios', label: '场景中心', icon: Layers, permissions: ['control.dashboard.read'] },
  { path: '/resource-health', label: '资源健康', icon: HeartPulse, permissions: ['control.dashboard.read'] },
  { path: '/objects', label: '对象中心', icon: Server, permissions: ['control.object.read'] },
  { path: '/events', label: '事件中心', icon: Siren, permissions: ['control.event.read'] },
  { path: '/tickets', label: '工单中心', icon: ListTodo, permissions: ['control.ticket.read'] },
  { path: '/dependencies', label: '依赖与拓扑', icon: GitBranch, permissions: ['control.dashboard.read'] },
  { path: '/audit', label: '变更与审计', icon: FileSearch, permissions: ['control.dashboard.read'] },
  { path: '/agents', label: '智能体中心', icon: Bot, permissions: ['control.dashboard.read'] },
  { path: '/standards', label: '接入与标准', icon: BookOpen, permissions: ['control.dashboard.read'] },
  { path: '/blueprint', label: '治理蓝图', icon: Waypoints, permissions: ['control.dashboard.read'], secondary: true },
  { path: '/network', label: '网络概览', icon: Network, permissions: ['control.network.read'], secondary: true },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('control-plane')

  if (mode === 'blank') return []

  const filtered = navItems.filter((item) => {
    const menuKey = item.path.replace(/^\//, '')
    if (ctx.isAdmin) return true
    if (mode === 'pilot') {
      const pilotMenus = ctx.profile?.visible_menu_items?.['control-plane'] ?? []
      return pilotMenus.length === 0 || pilotMenus.includes(menuKey)
    }
    return ctx.canSeeMenu('control-plane', menuKey, item.permissions)
  })

  const result = filtered.map((item) => ({ to: item.path, label: item.label, icon: item.icon }))
  if (result.length === 0 && !ctx.profileLoading && ctx.profile) {
    return navItems.map((item) => ({ to: item.path, label: item.label, icon: item.icon }))
  }
  return result
}

function LayoutContent() {
  const { user, logout } = useFeishuContext()
  const visibleItems = useVisibleNavItems()
  const headerStatus = (
    <div className="hidden items-center gap-3 md:flex">
      <RoleWorkspaceSwitcher />
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
        <ShieldAlert className="h-3.5 w-3.5" />
        真实设备数据 · SSH 采集
      </div>
      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
        <Activity className="h-3.5 w-3.5" />
        数据已接入
      </div>
    </div>
  )

  return (
    <MobileWorkstationLayout
      title="天工·资源统一智能化管理平台"
      logoText="天"
      logoClassName="bg-primary-600"
      navItems={visibleItems}
      mobilePrimaryNavItems={visibleItems.slice(0, 5)}
      userName={user?.name}
      userAvatar={user?.avatar}
      onLogout={logout}
      headerExtra={headerStatus}
    >
      <Outlet />
    </MobileWorkstationLayout>
  )
}

function ControlPlaneLoginFallback() {
  const { login } = useFeishuContext()
  return (
    <div className="flex flex-col items-center gap-4">
      <LoginFallback title="天工·资源统一智能化管理平台" onLogin={login} />
      <Link
        to="/dev-inject-token"
        className="text-sm text-slate-500 underline hover:text-primary-600"
      >
        使用火山云 Token 联调（不部署时测试）
      </Link>
    </div>
  )
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex h-screen items-center justify-center text-slate-500">正在加载天工·资源统一智能化管理平台...</div>}
      loginFallback={<ControlPlaneLoginFallback />}
    >
      <ApiClientInit />
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
