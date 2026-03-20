import { Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, LayoutGrid,
  Shield, Bell, AlertTriangle, CheckSquare,
  BarChart3, type LucideIcon,
} from 'lucide-react'
import {
  FeishuAuthProvider,
  useFeishuContext,
  LoginFallback,
  createWorkstationFeishuConfig,
} from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('secretary')

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
  permissions?: string[]
  alwaysVisible?: boolean
}

interface NavGroup {
  label: string
  items: NavItem[]
  adminOnly?: boolean
}

const navGroups: NavGroup[] = [
  {
    label: '门户',
    items: [
      { to: '/portal', icon: LayoutGrid, label: '工作台门户', alwaysVisible: true },
      { to: '/dashboard', icon: LayoutDashboard, label: '信息总览', permissions: ['dashboard.overview.read', 'dashboard.stats.read'] },
    ],
  },
  {
    label: '工作中心',
    items: [
      { to: '/todo', icon: CheckSquare, label: '统一待办', alwaysVisible: true },
      { to: '/notifications', icon: Bell, label: '通知中心', alwaysVisible: true },
      { to: '/alerts', icon: AlertTriangle, label: '预警中心', permissions: ['dashboard.stats.read'] },
    ],
  },
  {
    label: '管理视图',
    items: [
      { to: '/manager', icon: BarChart3, label: '管理驾驶舱', permissions: ['dashboard.overview.read'] },
    ],
  },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('secretary')

  // blank 模式：不显示任何菜单，页面将显示占位内容
  if (mode === 'blank') return []

  return navGroups.flatMap((group) =>
    group.items
      .filter((item) => {
        const menuKey = item.to.replace(/^\//, '')
        // 管理员在任意模式下均按 full 逻辑展示全部有权限的菜单，不受 pilot 白名单限制
        if (ctx.isAdmin) {
          if (item.alwaysVisible) return true
          if (item.permissions?.length) return ctx.canSeeMenu('secretary', menuKey, item.permissions)
          return true
        }
        // pilot 模式：只显示后端 enabled_menus 中的菜单
        if (mode === 'pilot') {
          const pilotMenus = ctx.profile?.visible_menu_items?.['secretary'] ?? []
          return pilotMenus.includes(menuKey)
        }
        // full 模式（默认）：原有逻辑
        if (item.alwaysVisible) return true
        if (item.permissions?.length) {
          return ctx.canSeeMenu('secretary', menuKey, item.permissions)
        }
        return true
      })
      .map((item) => ({ to: item.to, label: item.label, icon: item.icon })),
  )
}

function RoleBadge() {
  const { profile } = useFeishuContext()
  if (!profile?.roles?.length) return null
  const primaryRole = profile.roles.reduce((a: any, b: any) => a.level >= b.level ? a : b)
  return (
    <div className="mx-3 mb-4 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Shield className="w-3.5 h-3.5" />
        <span>{primaryRole.display_name}</span>
      </div>
    </div>
  )
}

function WorkstationPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-50 text-slate-500">
      <div className="text-5xl mb-4">🔧</div>
      <h2 className="text-xl font-semibold text-slate-700 mb-2">功能建设中</h2>
      <p className="text-sm text-slate-400 text-center max-w-xs">
        该工作台正在为您定制专属功能，即将开放，敬请期待。
      </p>
    </div>
  )
}

function LayoutContent() {
  const { user, logout } = useFeishuContext()
  const location = useLocation()
  const visibleItems = useVisibleNavItems()
  const { getWorkstationMode } = useFeishuContext()
  const mode = getWorkstationMode('secretary')
  const isChatRoute = location.pathname === '/chat'

  // blank 模式：显示占位页，不渲染导航
  if (mode === 'blank') {
    return <WorkstationPlaceholder />
  }

  return (
    <MobileWorkstationLayout
      title="子衿·秘书台"
      logoText="衿"
      navItems={visibleItems}
      mobilePrimaryNavItems={visibleItems.slice(0, 5)}
      userName={user?.name}
      userAvatar={user?.avatar}
      onLogout={logout}
      sidebarFooter={<RoleBadge />}
      contentClassName={isChatRoute ? 'min-h-0 overflow-hidden' : undefined}
    >
      <Outlet />
    </MobileWorkstationLayout>
  )
}

function SecretaryLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="子衿·秘书台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载秘书台...</div>}
      loginFallback={<SecretaryLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
