import { Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Building2, TrendingUp, Kanban, Headphones,
  BarChart3, type LucideIcon, AlertTriangle, ShoppingBag,
  Lightbulb, FileText, Star, ClipboardCheck, Beaker, Newspaper,
} from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('crm')

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
      { path: '/dashboard', label: '管理驾驶舱', icon: LayoutDashboard, permissions: ['crm.client.read'] },
    ],
  },
  {
    label: '客户管理',
    items: [
      { path: '/clients', label: '客户组合', icon: Building2, permissions: ['crm.client.read'] },
      { path: '/product-lines', label: '产品矩阵', icon: ShoppingBag, permissions: ['crm.client.read'] },
    ],
  },
  {
    label: '商机管理',
    items: [
      { path: '/opportunities', label: '管道总览', icon: TrendingUp, permissions: ['crm.opportunity.read'] },
      { path: '/opportunities/kanban', label: '管道看板', icon: Kanban, permissions: ['crm.opportunity.read'] },
    ],
  },
  {
    label: '客户赋能',
    items: [
      { path: '/insights', label: '价值洞察', icon: Lightbulb, permissions: ['crm.client.read'] },
      { path: '/briefs', label: '客户简报', icon: FileText, permissions: ['crm.client.read'] },
      { path: '/market-trends', label: '市场趋势', icon: Newspaper, permissions: ['crm.client.read'] },
    ],
  },
  {
    label: '监控预警',
    items: [
      { path: '/alerts', label: '预警中心', icon: AlertTriangle, permissions: ['crm.client.read'] },
      { path: '/surveys', label: '满意度追踪', icon: ClipboardCheck, permissions: ['crm.client.read'] },
      { path: '/milestones', label: '合作里程碑', icon: Star, permissions: ['crm.client.read'] },
    ],
  },
  {
    label: '知识引擎',
    items: [
      { path: '/claim-trends', label: '宣称趋势', icon: Beaker, permissions: ['crm.client.read'] },
      { path: '/sales-report', label: '分析报表', icon: BarChart3, permissions: ['crm.opportunity.read'] },
    ],
  },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('crm')

  if (mode === 'blank') return []

  return navGroups.flatMap((group) =>
    group.items
      .filter((item) => {
        if (mode === 'pilot') {
          const pilotMenus = ctx.profile?.visible_menu_items?.['crm'] ?? []
          const menuKey = item.path.replace(/^\//, '')
          return pilotMenus.includes(menuKey)
        }
        return ctx.canSeeMenu('crm', item.path.replace(/^\//, ''), item.permissions)
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
  const mode = useFeishuContext().getWorkstationMode('crm')

  if (mode === 'blank') {
    return <WorkstationPlaceholder />
  }

  return (
    <MobileWorkstationLayout
      title="进思·客户台"
      logoText="思"
      logoClassName="bg-rose-600"
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

function CRMLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="进思·客户台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载进思·客户台...</div>}
      loginFallback={<CRMLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
