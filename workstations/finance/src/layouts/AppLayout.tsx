import { Outlet } from 'react-router-dom'
import {
  Calculator, FileText, Receipt, LayoutDashboard,
  TrendingUp, ClipboardList, Wallet, Coins, PiggyBank,
  BarChart3, PieChart, ArrowLeftRight, Clock, Shield, Gauge, FileCheck,
  DollarSign,
  type LucideIcon,
} from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('finance')

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
      { path: '/dashboard', label: '财务仪表板', icon: LayoutDashboard, permissions: ['finance.quote.read'] },
    ],
  },
  {
    label: '收入管理',
    items: [
      { path: '/quotes', label: '报价管理', icon: Calculator, permissions: ['finance.quote.read'] },
      { path: '/contracts', label: '合同管理', icon: FileText, permissions: ['finance.contract.read'] },
      { path: '/invoices', label: '发票管理', icon: Receipt, permissions: ['finance.invoice.read'] },
    ],
  },
  {
    label: '支出管理',
    items: [
      { path: '/payables', label: '应付管理', icon: Wallet, permissions: ['finance.payable.read'] },
      { path: '/expenses', label: '费用报销', icon: Receipt, permissions: ['finance.expense.read'] },
      { path: '/costs', label: '成本记录', icon: Coins, permissions: ['finance.cost.read'] },
    ],
  },
  {
    label: '预算管理',
    items: [
      { path: '/budgets', label: '预算管理', icon: PiggyBank, permissions: ['finance.budget.read'] },
    ],
  },
  {
    label: '受试者礼金',
    items: [
      { path: '/stipend-pay', label: '礼金发放', icon: DollarSign, permissions: ['finance.stipend.write'] },
    ],
  },
  {
    label: '财务分析',
    items: [
      { path: '/profit-analysis', label: '利润分析', icon: TrendingUp, permissions: ['finance.report.read'] },
      { path: '/revenue-analysis', label: '收入分析', icon: BarChart3, permissions: ['finance.report.read'] },
      { path: '/cost-analysis', label: '成本分析', icon: PieChart, permissions: ['finance.report.read'] },
      { path: '/cashflow', label: '现金流', icon: ArrowLeftRight, permissions: ['finance.report.read'] },
      { path: '/ar-aging', label: '应收账龄', icon: Clock, permissions: ['finance.report.read'] },
      { path: '/risk-dashboard', label: '风险分析', icon: Shield, permissions: ['finance.report.read'] },
      { path: '/efficiency', label: '运营效率', icon: Gauge, permissions: ['finance.report.read'] },
      { path: '/settlement', label: '项目决算', icon: FileCheck, permissions: ['finance.report.read'] },
      { path: '/reports', label: '财务报表', icon: ClipboardList, permissions: ['finance.report.read'] },
    ],
  },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('finance')

  if (mode === 'blank') return []

  return navGroups.flatMap((group) =>
    group.items
      .filter((item) => {
        if (mode === 'pilot') {
          const pilotMenus = ctx.profile?.visible_menu_items?.['finance'] ?? []
          const menuKey = item.path.replace(/^\//, '')
          return pilotMenus.includes(menuKey)
        }
        return ctx.canSeeMenu('finance', item.path.replace(/^\//, ''), item.permissions)
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
  const mode = useFeishuContext().getWorkstationMode('finance')

  if (mode === 'blank') {
    return <WorkstationPlaceholder />
  }

  return (
    <MobileWorkstationLayout
      title="管仲·财务台"
      logoText="仲"
      logoClassName="bg-primary-600"
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

function FinanceLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="管仲·财务台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载管仲·财务台...</div>}
      loginFallback={<FinanceLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
