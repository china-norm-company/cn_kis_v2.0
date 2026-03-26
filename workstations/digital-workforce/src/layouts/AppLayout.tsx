import {
  createWorkstationFeishuConfig,
  FeishuAuthProvider,
  LoginFallback,
  useFeishuContext,
} from '@cn-kis/feishu-sdk'
import {
  Activity,
  BarChart3,
  BookMarked,
  BookOpen,
  Bot,
  Brain,
  Clock,
  Database,
  Eye,
  FileCheck,
  FileStack,
  FileText,
  Film,
  GitBranch,
  Hammer,
  Inbox,
  LayoutDashboard,
  List,
  MessageCircle,
  MessageSquare,
  Network,
  PieChart,
  PlayCircle,
  Radio,
  Sliders,
  Sparkles,
  TrendingUp,
  TowerControl,
  UserCircle,
  Users,
  Wrench,
  type LucideIcon,
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

/** 侧栏导航（扁平列表）；路径与 App.tsx 中 Route 一致 */
const navItems: { path: string; label: string; icon: LucideIcon }[] = [
  { path: '/portal', label: '数字员工门户', icon: Bot },
  { path: '/chat', label: 'AI 对话', icon: MessageCircle },
  { path: '/ops-overview', label: '运行总览', icon: LayoutDashboard },
  { path: '/actions', label: '动作中心', icon: MessageSquare },
  { path: '/replay', label: '执行回放', icon: Film },
  { path: '/policies', label: '策略中心', icon: List },
  { path: '/my-assistants', label: '我的助手', icon: UserCircle },
  { path: '/my-activity', label: '我的动态', icon: Clock },
  { path: '/daily-brief', label: '经营日报', icon: FileStack },
  { path: '/mail-signals', label: '邮件事件', icon: Inbox },
  { path: '/mail-tasks', label: '任务草稿', icon: Sparkles },
  { path: '/analytics', label: '复盘看板', icon: TrendingUp },
  { path: '/proactive-insights', label: '主动洞察', icon: Eye },
  { path: '/proactive-analytics', label: '洞察看板', icon: PieChart },
  { path: '/roster', label: '数字员工花名册', icon: Users },
  { path: '/teams', label: '组织架构', icon: Network },
  { path: '/agents', label: 'Agent 目录', icon: Bot },
  { path: '/matrix', label: '工作台绑定矩阵', icon: Network },
  { path: '/workflows', label: '协作流程定义', icon: Activity },
  { path: '/executions', label: '流程执行实况', icon: PlayCircle },
  { path: '/orchestration-monitor', label: '编排监控', icon: GitBranch },
  { path: '/skills', label: '技能管理', icon: Wrench },
  { path: '/skill-registry', label: '技能注册表', icon: Database },
  { path: '/tools', label: '工具清单', icon: Hammer },
  { path: '/knowledge', label: '知识灌注', icon: BookOpen },
  { path: '/memory', label: '记忆档案', icon: BookMarked },
  { path: '/policy-learning', label: '策略学习', icon: Brain },
  { path: '/behavior', label: '行为策略配置', icon: Sliders },
  { path: '/knowledge-review', label: '知识委员会审核', icon: FileCheck },
  { path: '/performance', label: '绩效仪表盘', icon: BarChart3 },
  { path: '/value', label: '价值核算', icon: TrendingUp },
  { path: '/growth', label: '能力成长曲线', icon: Brain },
  { path: '/audit', label: '行为审计', icon: FileText },
  { path: '/health', label: '通道健康与告警', icon: Radio },
  { path: '/gates', label: '验收门禁', icon: FileCheck },
  { path: '/upgrades', label: '升级管控', icon: TowerControl },
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
