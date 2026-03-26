import { Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderKanban,
  CalendarClock,
  CalendarCheck,
  Users,
  ClipboardList,
  GitBranch,
  Database,
  FlaskConical,
  BarChart3,
  FileSignature,
} from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'
import { ThemeProvider } from '../contexts/ThemeContext'
import { ThemeToggle } from '../components/ThemeToggle'

const FEISHU_CONFIG = createWorkstationFeishuConfig('execution')

/**
 * 项目执行台导航
 *
 * 与研究台的区别：
 * - 研究台：研究者视角，聚焦自己参与的少量项目
 * - 执行台：项目管理视角，管理所有项目的执行过程
 *
 * 核心功能：
 * 1. 执行仪表盘：全局项目状态概览、关键指标、预警
 * 2. 项目管理：上传执行订单、资源需求
 * 3. 排程管理：所有项目的访视排程与资源调配
 * 4. 访视管理：所有项目的访视执行跟踪
 * 5. 受试者管理：全局受试者入组/随访/脱落管理
 * 6. 工单管理：创建/分发/跟踪/关闭工单
 * 7. 变更管理：协议变更、方案偏差升级
 * 8. EDC数据采集：电子数据采集、录入、核查
 * 9. LIMS对接：人机料法环管理（人员/仪器/物料/方法/环境）
 */
const navItems: Array<{
  to: string
  icon: typeof LayoutDashboard
  label: string
  permissions: string[]
}> = [
  { to: '/dashboard', icon: LayoutDashboard, label: '仪表盘', permissions: ['dashboard.stats.read'] },
  { to: '/project-management', icon: FolderKanban, label: '项目管理', permissions: ['visit.plan.read'] },
  { to: '/scheduling', icon: CalendarClock, label: '排程管理', permissions: ['visit.plan.read'] },
  { to: '/visits', icon: CalendarCheck, label: '访视管理', permissions: ['visit.plan.read'] },
  { to: '/subjects', icon: Users, label: '受试者', permissions: ['subject.subject.read'] },
  { to: '/consent', icon: FileSignature, label: '知情管理', permissions: ['subject.subject.read'] },
  { to: '/workorders', icon: ClipboardList, label: '工单管理', permissions: ['workorder.workorder.read'] },
  { to: '/changes', icon: GitBranch, label: '变更管理', permissions: ['protocol.protocol.read'] },
  { to: '/edc', icon: Database, label: 'EDC采集', permissions: ['edc.crf.read'] },
  { to: '/lims', icon: FlaskConical, label: 'LIMS', permissions: ['edc.crf.read'] },
  { to: '/analytics', icon: BarChart3, label: '分析报表', permissions: ['workorder.workorder.read'] },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('execution')

  if (mode === 'blank') return []

  return navItems
    .filter((item) => {
      const menuKey = item.to.replace(/^\//, '')
      if (mode === 'pilot') {
        const pilotMenus = ctx.profile?.visible_menu_items?.['execution'] ?? []
        return pilotMenus.includes(menuKey)
      }
      return ctx.canSeeMenu('execution', menuKey, item.permissions)
    })
    .map((item) => ({ to: item.to, label: item.label, icon: item.icon }))
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
  const mode = useFeishuContext().getWorkstationMode('execution')

  if (mode === 'blank') {
    return <WorkstationPlaceholder />
  }

  return (
    <MobileWorkstationLayout
      title="维周·执行台"
      logoText="执"
      logoClassName="bg-indigo-600"
      navItems={visibleItems}
      mobilePrimaryNavItems={visibleItems.slice(0, 5)}
      userName={user?.name}
      userAvatar={user?.avatar}
      onLogout={logout}
      headerExtra={<ThemeToggle />}
    >
      <Outlet />
    </MobileWorkstationLayout>
  )
}

function ExecutionLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="维周·执行台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={
        <div className="flex items-center justify-center h-screen text-slate-500">
          正在加载维周·执行台...
        </div>
      }
      loginFallback={<ExecutionLoginFallback />}
    >
      <ThemeProvider>
        <LayoutContent />
      </ThemeProvider>
    </FeishuAuthProvider>
  )
}
