import { type ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { LayoutDashboard, Monitor, Route, BarChart3, CalendarPlus, QrCode, ScanLine, Calendar } from 'lucide-react'
import { FeishuAuthProvider, LoginFallback, useFeishuContext, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

export const FEISHU_CONFIG = createWorkstationFeishuConfig('reception')

const navItems = [
  { to: '/dashboard', label: '接待看板', icon: LayoutDashboard },
  { to: '/appointments', label: '预约管理', icon: CalendarPlus },
  { to: '/schedule', label: '我的排程', icon: Calendar },
  { to: '/scan', label: '扫码签到', icon: ScanLine },
  { to: '/station-qr', label: '场所码', icon: QrCode },
  { to: '/journey', label: '受试者轨迹', icon: Route },
  { to: '/analytics', label: '全景分析', icon: BarChart3 },
  { to: '/display', label: '大屏投影', icon: Monitor },
]

export function ReceptionLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="和序·接待台" onLogin={login} />
}

export function ReceptionAuthGuard({ children }: { children: ReactNode }) {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载和序·接待台...</div>}
      loginFallback={<ReceptionLoginFallback />}
    >
      {children}
    </FeishuAuthProvider>
  )
}

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('reception')

  if (mode === 'blank') return []

  return navItems.flatMap((item) => {
    if (mode === 'pilot') {
      const pilotMenus = ctx.profile?.visible_menu_items?.['reception'] ?? []
      const menuKey = (item.to ?? '').replace(/^\//, '')
      if (!pilotMenus.includes(menuKey)) return []
    }
    return [item]
  })
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
  const { user, logout, getWorkstationMode } = useFeishuContext()
  const visibleItems = useVisibleNavItems()
  if (getWorkstationMode('reception') === 'blank') return <WorkstationPlaceholder />
  return (
    <MobileWorkstationLayout
      title="和序·接待台"
      logoText="接"
      logoClassName="bg-emerald-600"
      navItems={visibleItems}
      mobilePrimaryNavItems={visibleItems.slice(0, 4)}
      userName={user?.name}
      userAvatar={user?.avatar}
      onLogout={logout}
    >
      <Outlet />
    </MobileWorkstationLayout>
  )
}

export function AppLayout() {
  return (
    <ReceptionAuthGuard>
      <LayoutContent />
    </ReceptionAuthGuard>
  )
}
