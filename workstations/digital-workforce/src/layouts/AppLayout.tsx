import {
  createWorkstationFeishuConfig,
  FeishuAuthProvider,
  LoginFallback,
  useFeishuContext,
} from '@cn-kis/feishu-sdk'
import {
  Bot,
  Eye,
  History,
  Inbox,
  LayoutDashboard,
  PieChart,
  Sparkles,
  TrendingUp,
  MessageSquare,
  BookOpen,
  Brain,
} from 'lucide-react'
import { Link, Outlet } from 'react-router-dom'
import { MobileWorkstationLayout, type MobileWorkstationNavItem } from '@cn-kis/ui-kit'
import { useApiInit } from '@/hooks/useApiInit'

const FEISHU_CONFIG = createWorkstationFeishuConfig('digital-workforce')

function ApiClientInit() {
  const { logout } = useFeishuContext()
  useApiInit({ onUnauthorized: logout })
  return null
}

const navItems = [
  { path: '/portal', label: '首页', icon: LayoutDashboard },
  { path: '/mail-signals', label: '邮件事件', icon: Inbox },
  { path: '/mail-tasks', label: '任务草稿', icon: Sparkles },
  { path: '/replay', label: '执行回放', icon: History },
  { path: '/daily-brief', label: '经营日报', icon: TrendingUp },
  { path: '/analytics', label: '复盘看板', icon: PieChart },
  { path: '/proactive-insights', label: '主动洞察', icon: Eye },
  { path: '/proactive-analytics', label: '洞察看板', icon: Brain },
  { path: '/chat', label: 'AI 对话', icon: MessageSquare },
  { path: '/knowledge', label: '知识灌注', icon: BookOpen },
]

function useVisibleNavItems(): MobileWorkstationNavItem[] {
  return navItems.map((item) => ({ to: item.path, label: item.label, icon: item.icon }))
}

function LayoutContent() {
  const { user, logout } = useFeishuContext()
  const visibleItems = useVisibleNavItems()

  return (
    <MobileWorkstationLayout
      title="中书·智能台"
      logoText="中"
      logoClassName="bg-primary-600"
      navItems={visibleItems}
      mobilePrimaryNavItems={visibleItems}
      userName={user?.name}
      userAvatar={user?.avatar}
      onLogout={logout}
      headerExtra={(
        <div className="hidden items-center gap-3 md:flex">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
            <Bot className="h-3.5 w-3.5" />
            邮件信号编排 · Phase 1
          </div>
        </div>
      )}
    >
      <Outlet />
    </MobileWorkstationLayout>
  )
}

function DigitalWorkforceLoginFallback() {
  const { login } = useFeishuContext()
  return (
    <div className="flex flex-col items-center gap-4">
      <LoginFallback title="中书·智能台" onLogin={login} />
      <Link
        to="/dev-inject-token"
        className="text-sm text-slate-500 underline hover:text-primary-600"
      >
        使用联调 Token 进入
      </Link>
    </div>
  )
}

export function AppLayout() {
  return (
    <FeishuAuthProvider
      config={FEISHU_CONFIG}
      loadingFallback={<div className="flex h-screen items-center justify-center text-slate-500">正在加载中书·智能台...</div>}
      loginFallback={<DigitalWorkforceLoginFallback />}
    >
      <ApiClientInit />
      <LayoutContent />
    </FeishuAuthProvider>
  )
}
