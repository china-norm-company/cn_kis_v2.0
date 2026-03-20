import { Outlet } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Award, MessageSquare,
  Eye, BookOpen, ClipboardCheck, Mail, GraduationCap,
} from 'lucide-react'
import { FeishuAuthProvider, useFeishuContext, LoginFallback, createWorkstationFeishuConfig } from '@cn-kis/feishu-sdk'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('ethics')

const navItems = [
  { path: '/dashboard', label: '管理看板', icon: LayoutDashboard },
  { path: '/applications', label: '伦理申请', icon: FileText },
  { path: '/approvals', label: '伦理批件', icon: Award },
  { path: '/review-opinions', label: '审查意见', icon: MessageSquare },
  { path: '/supervisions', label: '伦理监督', icon: Eye },
  { path: '/regulations', label: '法规跟踪', icon: BookOpen },
  { path: '/compliance', label: '合规检查', icon: ClipboardCheck },
  { path: '/correspondences', label: '监管沟通', icon: Mail },
  { path: '/trainings', label: '合规培训', icon: GraduationCap },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  const ctx = useFeishuContext()
  const mode = ctx.getWorkstationMode('ethics')

  if (mode === 'blank') return []

  return navItems.flatMap((item) => {
    if (mode === 'pilot') {
      const pilotMenus = ctx.profile?.visible_menu_items?.['ethics'] ?? []
      const menuKey = item.path.replace(/^\//, '')
      if (!pilotMenus.includes(menuKey)) return []
    }
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
  if (getWorkstationMode('ethics') === 'blank') return <WorkstationPlaceholder />
  return (
    <MobileWorkstationLayout
      title="御史·伦理台"
      logoText="御"
      logoClassName="bg-indigo-600"
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

function EthicsLoginFallback() {
  const { login } = useFeishuContext()
  return <LoginFallback title="御史·伦理台" onLogin={login} />
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={
        <div className="flex items-center justify-center h-screen text-slate-500">
          正在加载御史·伦理台...
        </div>
      }
      loginFallback={<EthicsLoginFallback />}
    >
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
