import { Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, ShieldCheck, CalendarDays, Clock, AlertTriangle, ClipboardList } from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('lab-personnel')

const navItems = [
  { path: '/dashboard', label: '管理看板', icon: LayoutDashboard, permissions: ['lab_personnel.dashboard.read'] },
  { path: '/staff', label: '人员档案', icon: Users, permissions: ['lab_personnel.staff.read'] },
  { path: '/qualifications', label: '资质矩阵', icon: ShieldCheck, permissions: ['lab_personnel.qualification.read'] },
  { path: '/schedules', label: '排班管理', icon: CalendarDays, permissions: ['lab_personnel.schedule.read'] },
  { path: '/worktime', label: '工时统计', icon: Clock, permissions: ['lab_personnel.worktime.read'] },
  { path: '/risks', label: '风险预警', icon: AlertTriangle, permissions: ['lab_personnel.risk.read'] },
  { path: '/dispatch', label: '工单派发', icon: ClipboardList, permissions: ['lab_personnel.dispatch.read'] },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('lab-personnel')

  if (mode === 'blank') return []

  return navItems.flatMap((item) => {
    if (mode === 'pilot') {
      const pilotMenus = ctx.profile?.visible_menu_items?.['lab-personnel'] ?? []
      const menuKey = item.path.replace(/^\//, '')
      if (!pilotMenus.includes(menuKey)) return []
    }
    if (!ctx.canSeeMenu('lab-personnel', item.path.replace(/^\//, ''), item.permissions)) return []
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
  if (getWorkstationMode('lab-personnel') === 'blank') return <WorkstationPlaceholder />
  return (
    <MobileWorkstationLayout
      title="共济·人员台"
      logoText="人"
      logoClassName="bg-violet-600"
      navItems={visibleItems}
      mobilePrimaryNavItems={visibleItems.slice(0, 5)}
      userName={user?.name}
      userAvatar={user?.avatar}
      onLogout={logout}
    >
      <Outlet />
    </MobileWorkstationLayout>
  )
}

function PersonnelLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="共济·人员台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载共济·人员台...</div>}
      loginFallback={<PersonnelLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
