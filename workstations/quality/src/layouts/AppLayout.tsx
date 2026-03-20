import { Outlet } from 'react-router-dom'
import { LayoutDashboard, AlertTriangle, ShieldCheck, FileSearch, BookOpen, MessageSquare, ClipboardCheck, GitBranch, FileText, BarChart3 } from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('quality')

const navItems = [
  { path: '/dashboard', label: '质量概览', icon: LayoutDashboard, permissions: ['quality.deviation.read'] },
  { path: '/deviations', label: '偏差管理', icon: AlertTriangle, permissions: ['quality.deviation.read'] },
  { path: '/capa', label: 'CAPA跟踪', icon: ShieldCheck, permissions: ['quality.capa.read'] },
  { path: '/changes', label: '变更控制', icon: GitBranch, permissions: ['quality.change.read'] },
  { path: '/queries', label: '数据质疑', icon: MessageSquare, permissions: ['edc.record.read'] },
  { path: '/audit-management', label: '审计管理', icon: ClipboardCheck, permissions: ['quality.audit.read'] },
  { path: '/audit-logs', label: '审计日志', icon: FileSearch, permissions: ['system.audit.read'] },
  { path: '/sop', label: 'SOP管理', icon: BookOpen, permissions: ['quality.sop.read'] },
  { path: '/report', label: '质量报告', icon: FileText, permissions: ['quality.deviation.read'] },
  { path: '/analytics', label: '质量分析', icon: BarChart3, permissions: ['quality.deviation.read'] },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('quality')

  if (mode === 'blank') return []

  return navItems.filter((item) => {
    const menuKey = item.path.replace(/^\//, '')
    if (mode === 'pilot') {
      const pilotMenus = ctx.profile?.visible_menu_items?.['quality'] ?? []
      return pilotMenus.includes(menuKey)
    }
    return ctx.canSeeMenu('quality', menuKey, item.permissions)
  }).map((item) => ({ to: item.path, label: item.label, icon: item.icon }))
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
  const mode = useFeishuContext().getWorkstationMode('quality')

  if (mode === 'blank') {
    return <WorkstationPlaceholder />
  }

  return (
    <MobileWorkstationLayout
      title="怀瑾·质量台"
      logoText="质"
      logoClassName="bg-amber-600"
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

function QualityLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="怀瑾·质量台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex items-center justify-center h-screen text-slate-500">正在加载怀瑾·质量台...</div>}
      loginFallback={<QualityLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
