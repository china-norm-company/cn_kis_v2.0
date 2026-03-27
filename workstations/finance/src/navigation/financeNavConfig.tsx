import {
  Calculator, FileText, Receipt, LayoutDashboard,
  TrendingUp, ClipboardList, Wallet, Coins, PiggyBank,
  BarChart3, PieChart, ArrowLeftRight, Clock, Shield, Gauge, FileCheck,
  DollarSign,
  type LucideIcon,
} from 'lucide-react'
import type { AuthProfile } from '@cn-kis/feishu-sdk'

export interface FinanceNavItem {
  path: string
  label: string
  icon: LucideIcon
  permissions: string[]
}

export interface FinanceNavGroup {
  label: string
  items: FinanceNavItem[]
}

/** 与侧栏顺序一致：首个可见路由即进入财务台时的默认落地页 */
export const financeNavGroups: FinanceNavGroup[] = [
  {
    label: '总览',
    items: [
      // 须与 backend GET /finance/dashboard 的 @require_permission('finance.report.read') 一致，否则仅报价权限用户会被导到仪表板后 403，甚至触发全局登出
      { path: '/dashboard', label: '财务仪表板', icon: LayoutDashboard, permissions: ['finance.report.read'] },
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

type CanSeeMenuFn = (workbench: string, menuKey: string, permissions?: string[]) => boolean

/**
 * 进入财务台根路径时的默认跳转目标，与侧栏「第一个可见菜单」一致：
 * - 有仪表板权限 → /dashboard
 * - 仅有发票等权限 → 首个有权的页面（如 /invoices）
 */
export function getDefaultFinanceLandingPath(
  mode: string,
  profile: AuthProfile | null | undefined,
  canSeeMenu: CanSeeMenuFn,
): string {
  if (mode === 'blank') return '/dashboard'

  for (const group of financeNavGroups) {
    for (const item of group.items) {
      const menuKey = item.path.replace(/^\//, '')
      const visible =
        mode === 'pilot'
          ? (profile?.visible_menu_items?.['finance'] ?? []).includes(menuKey)
          : canSeeMenu('finance', menuKey, item.permissions)
      if (visible) return item.path
    }
  }
  // 无任何菜单命中时勿默认 /dashboard（易与报表权限不一致）；发票页更常见且权限独立
  return '/invoices'
}
