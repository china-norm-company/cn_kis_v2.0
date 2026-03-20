import { Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Award, Target, ClipboardCheck, GraduationCap,
  Briefcase, FileArchive, UserPlus, TrendingUp, Wallet, HeartHandshake, Link2, History, UserMinus, type LucideIcon,
} from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('hr')

interface NavItem {
  path: string
  label: string
  icon: LucideIcon
  permissions: string[]
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: '总览',
    items: [
      { path: '/dashboard', label: '人事仪表板', icon: LayoutDashboard, permissions: ['hr.staff.read'] },
    ],
  },
  {
    label: '人员管理',
    items: [
      { path: '/qualifications', label: '资质总览', icon: Award, permissions: ['hr.staff.read'] },
      { path: '/archives', label: '人事档案', icon: FileArchive, permissions: ['hr.staff.read'] },
      { path: '/archive-changes', label: '异动台账', icon: History, permissions: ['hr.staff.read'] },
      { path: '/archive-exits', label: '离职台账', icon: UserMinus, permissions: ['hr.staff.read'] },
    ],
  },
  {
    label: '能力发展',
    items: [
      { path: '/competency', label: '胜任力模型', icon: Target, permissions: ['hr.competency.read'] },
      { path: '/assessment', label: '能力评估', icon: ClipboardCheck, permissions: ['hr.assessment.read'] },
      { path: '/training', label: '培训跟踪', icon: GraduationCap, permissions: ['hr.training.read'] },
    ],
  },
  {
    label: '经营管理',
    items: [
      { path: '/recruitment', label: '招聘管理', icon: UserPlus, permissions: ['hr.staff.read'] },
      { path: '/performance-ops', label: '绩效管理', icon: TrendingUp, permissions: ['hr.staff.read'] },
      { path: '/compensation', label: '薪酬激励', icon: Wallet, permissions: ['hr.staff.read'] },
      { path: '/culture', label: '企业文化', icon: HeartHandshake, permissions: ['hr.staff.read'] },
      { path: '/workload', label: '工作负荷', icon: Briefcase, permissions: ['hr.staff.read'] },
      { path: '/collaboration', label: '跨台协同', icon: Link2, permissions: ['hr.staff.read'] },
    ],
  },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('hr')

  if (mode === 'blank') return []

  return navGroups.flatMap((group) =>
    group.items
      .filter((item) => {
        if (mode === 'pilot') {
          const pilotMenus = ctx.profile?.visible_menu_items?.['hr'] ?? []
          const menuKey = item.path.replace(/^\//, '')
          return pilotMenus.includes(menuKey)
        }
        return ctx.canSeeMenu('hr', item.path.replace(/^\//, ''), item.permissions)
      })
      .map((item) => ({ to: item.path, label: item.label, icon: item.icon })),
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
  const visibleItems = useVisibleNavItems()
  const mode = useFeishuContext().getWorkstationMode('hr')

  if (mode === 'blank') {
    return <WorkstationPlaceholder />
  }

  return (
    <MobileWorkstationLayout
      title="时雨·人事台"
      logoText="雨"
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

function HRLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="时雨·人事台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载时雨·人事台...</div>}
      loginFallback={<HRLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
