import { Outlet } from 'react-router-dom'
import {
  FileText,
  CalendarCheck,
  Users,
  BarChart3,
  LayoutDashboard,
  Bot,
  Briefcase,
  ClipboardCheck,
  FileSearch,
  FolderArchive,
  UsersRound,
  BookOpen,
  Home,
  Building2,
  TrendingUp,
  GitPullRequest,
  SendHorizonal,
  Link2,
  CalendarDays,
  Banknote,
  CheckSquare,
} from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'
import { NotificationBell } from '../components/NotificationBell'
import { canAccessPerformanceSettlement } from '../permissions/performanceSettlementAccess'

const FEISHU_CONFIG = createWorkstationFeishuConfig('research')

/**
 * 研究经理工作台导航 — 全生命周期视图
 *
 * 管理中心：驾驶舱 + 项目组合
 * 项目生命周期：可行性评估 → 方案准备 → 协议管理 → 结项管理
 * 执行管理：访视 + 受试者
 * 团队与知识：团队全景 + 知识库 + AI 助手
 */

interface NavSection {
  title: string
  items: NavItem[]
}

interface NavItem {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  permissions: string[]
  indent?: boolean
}

const navSections: NavSection[] = [
  {
    title: '工作台',
    items: [
      { to: '/workbench', icon: Home, label: '我的工作台', permissions: [] },
      { to: '/weekly', icon: CalendarDays, label: '周报', permissions: [] },
    ],
  },
  {
    title: '管理中心',
    items: [
      { to: '/manager', icon: LayoutDashboard, label: '管理驾驶舱', permissions: ['dashboard.overview.read'] },
      { to: '/portfolio', icon: Briefcase, label: '项目组合', permissions: ['dashboard.overview.read'] },
    ],
  },
  {
    title: '客户与商务',
    items: [
      { to: '/clients', icon: Building2, label: '我的客户', permissions: [] },
      { to: '/business', icon: TrendingUp, label: '商务管线', permissions: ['dashboard.overview.read'] },
    ],
  },
  {
    title: '项目生命周期',
    items: [
      { to: '/feasibility', icon: ClipboardCheck, label: '可行性评估', permissions: ['feasibility.assessment.read'] },
      { to: '/proposals', icon: FileSearch, label: '方案准备', permissions: ['proposal.proposal.read'] },
      { to: '/protocol-qc', icon: CheckSquare, label: '方案质量检查', permissions: ['proposal.proposal.read'], indent: true },
      { to: '/project-full-link', icon: Link2, label: '项目全链路', permissions: ['protocol.protocol.read'] },
      { to: '/protocols', icon: FileText, label: '我的协议', permissions: ['protocol.protocol.read'] },
      { to: '/closeout', icon: FolderArchive, label: '结项管理', permissions: ['closeout.closeout.read'] },
      { to: '/closeout/settlement', icon: Banknote, label: '绩效结算', permissions: ['closeout.closeout.read'], indent: true },
    ],
  },
  {
    title: '变更与协调',
    items: [
      { to: '/changes', icon: GitPullRequest, label: '变更管理', permissions: [] },
      { to: '/tasks', icon: SendHorizonal, label: '任务委派', permissions: [] },
    ],
  },
  {
    title: '执行管理',
    items: [
      { to: '/visits', icon: CalendarCheck, label: '我的访视', permissions: ['visit.plan.read'] },
      { to: '/subjects', icon: Users, label: '我的受试者', permissions: ['subject.subject.read'] },
    ],
  },
  {
    title: '团队与知识',
    items: [
      { to: '/team', icon: UsersRound, label: '团队全景', permissions: ['dashboard.overview.read'] },
      { to: '/knowledge', icon: BookOpen, label: '知识库', permissions: [] },
      { to: '/ai-assistant', icon: Bot, label: 'AI 助手', permissions: [] },
      { to: '/overview', icon: BarChart3, label: '研究概览', permissions: ['protocol.protocol.read'] },
    ],
  },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('research')

  if (mode === 'blank') return []

  return navSections.flatMap((section) =>
    section.items
      .filter((item) => {
        const isSettlement = item.to === '/closeout/settlement'
        const canAccessSettlement = isSettlement ? canAccessPerformanceSettlement(ctx) : true
        // 绩效结算：仅白名单/管理员可见
        if (isSettlement && !canAccessSettlement) return false
        if (mode === 'pilot') {
          const pilotMenus = ctx.profile?.visible_menu_items?.['research'] ?? []
          const menuKey = item.to.replace(/^\//, '')
          // pilot 模式下：绩效结算只要访问判定通过就显示（不再依赖 menu 映射）
          if (isSettlement && canAccessSettlement) {
            return true
          }
          return pilotMenus.includes(menuKey)
        }
        return ctx.canSeeMenu('research', item.to.replace(/^\//, ''), item.permissions)
      })
      .map((item) => ({ to: item.to, label: item.label, icon: item.icon, indent: item.indent })),
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
  const mode = useFeishuContext().getWorkstationMode('research')

  if (mode === 'blank') {
    return <WorkstationPlaceholder />
  }

  return (
    <MobileWorkstationLayout
      title="采苓·研究台"
      logoText="研"
      logoClassName="bg-emerald-600"
      navItems={visibleItems}
      mobilePrimaryNavItems={visibleItems.slice(0, 5)}
      userName={user?.name}
      userAvatar={user?.avatar}
      onLogout={logout}
      headerExtra={<NotificationBell />}
    >
      <Outlet />
    </MobileWorkstationLayout>
  )
}

function ResearchLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="采苓·研究台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={
        <div className="flex items-center justify-center h-screen text-slate-500">
          正在加载采苓·研究台...
        </div>
      }
      loginFallback={<ResearchLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
