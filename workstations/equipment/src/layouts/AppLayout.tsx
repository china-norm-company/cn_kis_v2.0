import { Outlet } from 'react-router-dom'
import { LayoutDashboard, Monitor, CalendarClock, Wrench, ClipboardList, FlaskConical, ScanLine, Radar } from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig, getWorkstationUrl } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('equipment')

const navItems = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard, permissions: ['resource.equipment.read'] },
  { path: '/scan', label: '扫码使用', icon: ScanLine, permissions: ['resource.equipment.read'] },
  { path: '/ledger', label: '设备台账', icon: Monitor, permissions: ['resource.equipment.read'] },
  { path: '/calibration', label: '校准计划', icon: CalendarClock, permissions: ['resource.calibration.read'] },
  { path: '/maintenance', label: '维护工单', icon: Wrench, permissions: ['resource.maintenance.read'] },
  { path: '/usage', label: '使用记录', icon: ClipboardList, permissions: ['resource.equipment.read'] },
  { path: '/detection-methods', label: '检测方法', icon: FlaskConical, permissions: ['resource.method.read'] },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('equipment')

  if (mode === 'blank') return []

  return navItems.flatMap((item) => {
    if (mode === 'pilot') {
      const pilotMenus = ctx.profile?.visible_menu_items?.['equipment'] ?? []
      const menuKey = item.path.replace(/^\//, '')
      if (!pilotMenus.includes(menuKey)) return []
    }
    if (!ctx.canSeeMenu('equipment', item.path.replace(/^\//, ''), item.permissions)) return []
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
  if (getWorkstationMode('equipment') === 'blank') return <WorkstationPlaceholder />
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
      title="器衡·设备台"
      logoText="机"
      logoClassName="bg-cyan-600"
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

function EquipmentLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="器衡·设备台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载器衡·设备台...</div>}
      loginFallback={<EquipmentLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
