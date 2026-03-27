import { Outlet } from 'react-router-dom'
import { useState, useEffect } from 'react'
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
  CalendarDays,
  Banknote,
  ShieldCheck,
  Settings,
  Layers,
  NotebookPen,
  Database,
  BarChart2,
  FileSpreadsheet,
  ScrollText,
  PenLine,
  FlaskConical,
  ScanSearch,
} from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem, type MobileWorkstationNavSection } from '@cn-kis/ui-kit'
import { NotificationBell } from '../components/NotificationBell'

const FEISHU_CONFIG = createWorkstationFeishuConfig('research')

// 方案检查台 menu-config API 地址
const _rawQcUrlLayout = (import.meta.env.VITE_PROTOCOL_QC_URL as string)?.replace(/\/$/, '') || ''
// 通过研究台后端代理，避免飞书 webview 拦截对 /protocol-qc/ 的请求
const MENU_CONFIG_API = '/api/v1/menu-config/ping'

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
  adminOnly?: boolean
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
      { to: '/proposal-design', icon: PenLine, label: '方案设计准备', permissions: [] },
      { to: '/protocols', icon: FileText, label: '我的协议', permissions: ['protocol.protocol.read'] },
    ],
  },
  {
    title: '项目生命周期',
    items: [
      { to: '/trial-initiation', icon: FlaskConical, label: '项目全链路', permissions: ['feasibility.assessment.read'] },
      { to: '/feasibility', icon: ClipboardCheck, label: '可行性评估', permissions: ['feasibility.assessment.read'] },
      { to: '/proposals', icon: FileSearch, label: '试验方案准备', permissions: ['proposal.proposal.read'] },
      { to: '/proposals/quality-check', icon: ShieldCheck, label: '方案质量检查', permissions: ['proposal.proposal.read'] },
      { to: '/image-analysis/face', icon: ScanSearch, label: '脸部图像分析', permissions: ['protocol.protocol.read'] },
      { to: '/image-analysis/lip', icon: ScanSearch, label: '唇部图像分析', permissions: ['protocol.protocol.read'] },
      { to: '/image-analysis/lip/scaliness', icon: Layers, label: '唇部脱屑标记分析', permissions: [], indent: true },
      { to: '/image-analysis/hand', icon: ScanSearch, label: '手部图像分析', permissions: ['protocol.protocol.read'] },
      { to: '/image-analysis/other', icon: ScanSearch, label: '其他部位图像分析', permissions: ['protocol.protocol.read'] },
      { to: '/data-statistics', icon: BarChart2, label: '数据统计分析', permissions: ['protocol.protocol.read'] },
      { to: '/data-report-preparation', icon: FileSpreadsheet, label: '数据报告准备', permissions: ['protocol.protocol.read'] },
      { to: '/trial-report-preparation', icon: ScrollText, label: '试验报告准备', permissions: ['protocol.protocol.read'] },
      { to: '/closeout', icon: FolderArchive, label: '结项管理', permissions: ['closeout.closeout.read'] },
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
      { to: '/diary', icon: NotebookPen, label: '日记管理', permissions: ['subject.subject.read'] },
      { to: '/data-collection-monitor', icon: Database, label: '数据采集监察', permissions: ['subject.subject.read'] },
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
  {
    title: '系统管理',
    items: [
      { to: '/admin/permissions', icon: Settings, label: '权限管理', permissions: [], adminOnly: true },
    ],
  },
]

// 菜单 key → route path 的映射（与 ALL_MENU_KEYS 保持一致）
const MENU_KEY_TO_PATH: Record<string, string> = {
  'workbench': '/workbench',
  'manager': '/manager',
  'portfolio': '/portfolio',
  'clients': '/clients',
  'business': '/business',
  'feasibility': '/feasibility',
  'proposals': '/proposals',
  'proposals/quality-check': '/proposals/quality-check',
  'protocols': '/protocols',
  'trial-initiation': '/trial-initiation',
  'image-analysis': '/image-analysis',
  'image-analysis/face': '/image-analysis/face',
  'image-analysis/lip': '/image-analysis/lip',
  'image-analysis/lip/scaliness': '/image-analysis/lip/scaliness',
  'image-analysis/hand': '/image-analysis/hand',
  'image-analysis/other': '/image-analysis/other',
  'data-statistics': '/data-statistics',
  'data-report-preparation': '/data-report-preparation',
  'trial-report-preparation': '/trial-report-preparation',
  'closeout': '/closeout',
  'closeout/settlement': '/closeout/settlement',
  'changes': '/changes',
  'tasks': '/tasks',
  'visits': '/visits',
  'subjects': '/subjects',
  'diary': '/diary',
  'data-collection-monitor': '/data-collection-monitor',
  'proposal-design': '/proposal-design',
  'team': '/team',
  'knowledge': '/knowledge',
  'ai-assistant': '/ai-assistant',
  'overview': '/overview',
  'admin/permissions': '/admin/permissions',
}

/**
 * 从方案检查台 menu-config API 获取当前用户的菜单权限。
 * 同时上报 display_name / avatar，使管理员看板能识别用户。
 * 返回该用户可见的菜单 path 集合，null 表示未获取到（降级为显示全部）。
 */
function useMenuPermissions(username: string | null | undefined, displayName?: string, avatar?: string) {
  const [allowedPaths, setAllowedPaths] = useState<Set<string> | null>(null)

  useEffect(() => {
    if (!username) return
    const params = new URLSearchParams({ username })
    if (displayName) params.set('display_name', displayName)
    if (avatar) params.set('avatar', avatar)
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null
    fetch(`${MENU_CONFIG_API}?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.menus) return
        const paths = new Set<string>(
          (data.menus as string[]).map((key) => MENU_KEY_TO_PATH[key] || `/${key}`)
        )
        setAllowedPaths(paths)
      })
      .catch(() => {
        // 网络失败时降级为全显示（宽松策略）
      })
  }, [username, displayName, avatar])

  return allowedPaths
}

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('research')
  const username = ctx.profile?.username || ctx.user?.name || null
  const displayName = ctx.profile?.display_name || ctx.user?.name || ''
  const avatar = ctx.profile?.avatar || ctx.user?.avatar || ''
  const allowedPaths = useMenuPermissions(username, displayName, avatar)

  if (mode === 'blank') return []

  return navSections.flatMap((section) =>
    section.items
      .filter((item) => {
        if (item.adminOnly && !ctx.isAdmin) return false
        // 管理员专属菜单（如权限管理）始终对 admin/superadmin 显示，不依赖 pilot 列表
        if (item.adminOnly && ctx.isAdmin) return true

        const isSettlement = item.to === '/closeout/settlement'
        const canAccessSettlement = isSettlement ? canAccessPerformanceSettlement(ctx) : true
        if (isSettlement && !canAccessSettlement) return false

        if (allowedPaths !== null && !item.adminOnly) {
          if (!ctx.isAdmin && !allowedPaths.has(item.to)) return false
        }

        const menuKey = item.to.replace(/^\//, '')
        // 仅 pilot 模式下用 menu-config 结果过滤；研究员在研究台始终按权限显示全部菜单
        const roleNames = (ctx.profile?.roles || []).map((r: { name?: string; code?: string }) => r?.name || r?.code).filter(Boolean) as string[]
        if (mode === 'pilot' && !roleNames.includes('researcher')) {
          const pilotMenus = ctx.profile?.visible_menu_items?.['research'] ?? []
          if (isSettlement && canAccessSettlement) return true
          return pilotMenus.includes(menuKey)
        }
        return ctx.canSeeMenu('research', menuKey, item.permissions)
      })
      .map((item) => ({ to: item.to, label: item.label, icon: item.icon, indent: item.indent })),
  )
}

function useVisibleNavSections(): MobileWorkstationNavSection[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('research')
  const username = ctx.profile?.username || ctx.user?.name || null
  const displayName = ctx.profile?.display_name || ctx.user?.name || ''
  const avatar = ctx.profile?.avatar || ctx.user?.avatar || ''
  const allowedPaths = useMenuPermissions(username, displayName, avatar)

  if (mode === 'blank') return []

  const filterItem = (item: NavItem) => {
    if (item.adminOnly && !ctx.isAdmin) return false
    if (item.adminOnly && ctx.isAdmin) return true

    const isSettlement = item.to === '/closeout/settlement'
    const canAccessSettlement = isSettlement ? canAccessPerformanceSettlement(ctx) : true
    if (isSettlement && !canAccessSettlement) return false

    if (allowedPaths !== null && !item.adminOnly) {
      if (!ctx.isAdmin && !allowedPaths.has(item.to)) return false
    }

    const menuKey = item.to.replace(/^\//, '')
    const roleNames = (ctx.profile?.roles || []).map((r: { name?: string; code?: string }) => r?.name || r?.code).filter(Boolean) as string[]
    if (mode === 'pilot' && !roleNames.includes('researcher')) {
      const pilotMenus = ctx.profile?.visible_menu_items?.['research'] ?? []
      if (isSettlement && canAccessSettlement) return true
      return pilotMenus.includes(menuKey)
    }
    return ctx.canSeeMenu('research', menuKey, item.permissions)
  }

  return navSections
    .map((section) => ({
      title: section.title,
      items: section.items
        .filter(filterItem)
        .map((item) => ({ to: item.to, label: item.label, icon: item.icon, indent: item.indent })),
    }))
    .filter((section) => section.items.length > 0)
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
  const visibleSections = useVisibleNavSections()
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
      navSections={visibleSections}
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
