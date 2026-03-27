import { Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  ClipboardList,
  UserPlus,
  Microscope,
  Filter,
  UserCheck,
  Users,
  CalendarCheck,
  CalendarPlus,
  Activity,
  Wallet,
  MessageSquare,
  FileText,
  Heart,
  BarChart3,
  FileSpreadsheet,
  CreditCard,
} from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('recruitment')

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: '招募看板', permissions: ['subject.recruitment.read'] },
  { to: '/plans', icon: ClipboardList, label: '计划管理', permissions: ['subject.recruitment.read'] },
  { to: '/registrations', icon: UserPlus, label: '报名管理', permissions: ['subject.recruitment.read'] },
  { to: '/pre-screening', icon: Microscope, label: '初筛管理', permissions: ['subject.recruitment.read'] },
  { to: '/screening', icon: Filter, label: '筛选管理', permissions: ['subject.recruitment.read'] },
  { to: '/enrollment', icon: UserCheck, label: '入组确认', permissions: ['subject.recruitment.read'] },
  { to: '/subjects', icon: Users, label: '受试者管理', permissions: ['subject.subject.read'] },
  { to: '/appointments', icon: CalendarPlus, label: '预约管理', permissions: ['subject.subject.read'] },
  { to: '/checkin', icon: CalendarCheck, label: '签到管理', permissions: ['subject.subject.read'] },
  { to: '/compliance', icon: Activity, label: '依从性管理', permissions: ['subject.subject.read'] },
  { to: '/payments', icon: Wallet, label: '礼金管理', permissions: ['subject.subject.read'] },
  { to: '/support', icon: MessageSquare, label: '客服工单', permissions: ['subject.recruitment.read'] },
  { to: '/questionnaires', icon: FileText, label: '问卷管理', permissions: ['subject.recruitment.read'] },
  { to: '/loyalty', icon: Heart, label: '忠诚度', permissions: ['subject.subject.read'] },
  { to: '/channel-analytics', icon: BarChart3, label: '渠道分析', permissions: ['subject.recruitment.read'] },
  { to: '/nas-review', icon: FileSpreadsheet, label: 'NAS待审核', permissions: ['subject.subject.read'] },
  { to: '/nas-payments', icon: CreditCard, label: 'NAS礼金汇总', permissions: ['subject.subject.read'] },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('recruitment')

  if (mode === 'blank') return []

  return navItems.filter((item) => {
    const menuKey = item.to.replace(/^\//, '')
    if (mode === 'pilot') {
      const pilotMenus = ctx.profile?.visible_menu_items?.['recruitment'] ?? []
      return pilotMenus.includes(menuKey)
    }
    return ctx.canSeeMenu('recruitment', menuKey, item.permissions)
  }).map((item) => ({ to: item.to, label: item.label, icon: item.icon }))
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
  const mode = useFeishuContext().getWorkstationMode('recruitment')

  if (mode === 'blank') {
    return <WorkstationPlaceholder />
  }

  return (
    <MobileWorkstationLayout
      title="招招·招募台"
      logoText="招"
      logoClassName="bg-emerald-600"
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

function RecruitmentLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="招招·招募台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={
        <div className="flex items-center justify-center h-screen text-slate-500">
          正在加载招招·招募台...
        </div>
      }
      loginFallback={<RecruitmentLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
