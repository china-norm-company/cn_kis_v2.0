import { Outlet } from 'react-router-dom'
import { LayoutDashboard, Building2, CalendarCheck, Thermometer, Settings, AlertOctagon, SprayCan, Radar } from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig, getWorkstationUrl } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('facility')

const navItems = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard, permissions: ['resource.venue.read'] },
  { path: '/venues', label: '场地列表', icon: Building2, permissions: ['resource.venue.read'] },
  { path: '/reservations', label: '场地预约', icon: CalendarCheck, permissions: ['resource.venue.read'] },
  { path: '/environment', label: '环境监控', icon: Thermometer, permissions: ['resource.environment.read'] },
  { path: '/environment/settings', label: '监控设置', icon: Settings, permissions: ['resource.environment.write'] },
  { path: '/incidents', label: '不合规事件', icon: AlertOctagon, permissions: ['resource.environment.write'] },
  { path: '/cleaning', label: '清洁记录', icon: SprayCan, permissions: ['resource.venue.write'] },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('facility')

  if (mode === 'blank') return []

  return navItems.flatMap((item) => {
    if (mode === 'pilot') {
      const pilotMenus = ctx.profile?.visible_menu_items?.['facility'] ?? []
      const menuKey = item.path.replace(/^\//, '')
      if (!pilotMenus.includes(menuKey)) return []
    }
    if (!ctx.canSeeMenu('facility', item.path.replace(/^\//, ''), item.permissions)) return []
    return [{ to: item.path, label: item.label, icon: item.icon }]
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
  if (getWorkstationMode('facility') === 'blank') return <WorkstationPlaceholder />
  const controlPlaneEntry = (
    <a
      href={getWorkstationUrl('control-plane')}
      className="hidden md:inline-flex min-h-10 items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
    >
      <Radar className="h-4 w-4" />
      <span>统一平台</span>
    </a>
  )
  return (
    <MobileWorkstationLayout
      title="坤元·设施台"
      logoText="环"
      logoClassName="bg-emerald-600"
      navItems={visibleItems}
      mobilePrimaryNavItems={visibleItems.slice(0, 5)}
      userName={user?.name}
      userAvatar={user?.avatar}
      onLogout={logout}
      headerExtra={controlPlaneEntry}
    >
      <Outlet />
    </MobileWorkstationLayout>
  )
}

function FacilityLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="坤元·设施台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载坤元·设施台...</div>}
      loginFallback={<FacilityLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
