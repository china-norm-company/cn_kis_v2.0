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
<<<<<<< HEAD
  Film,
  UserCircle,
  Clock,
  FileStack,
  Network,
  Database,
  Hammer,
  BookMarked,
  GitBranch,
  Inbox,
  Sparkles,
  type LucideIcon,
=======
>>>>>>> origin/main
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

<<<<<<< HEAD
// 信息架构：岗位、治理、价值为主视角；每项带 permissions 供 canSeeMenu 使用
const navGroups: NavGroup[] = [
  {
    label: '运营总览',
    items: [
      { path: '/portal', label: '数字员工门户', icon: Bot, permissions: [] },
      { path: '/ops-overview', label: '运行总览', icon: LayoutDashboard, permissions: [] },
      { path: '/actions', label: '动作中心', icon: MessageSquare, permissions: [] },
      { path: '/replay', label: '执行回放', icon: Film, permissions: [] },
      { path: '/policies', label: '策略中心', icon: List, permissions: [] },
      { path: '/my-assistants', label: '我的助手', icon: UserCircle, permissions: [] },
      { path: '/my-activity', label: '我的动态', icon: Clock, permissions: [] },
      { path: '/daily-brief', label: '经营日报', icon: FileStack, permissions: [] },
    ],
  },
  {
    label: '邮件信号',
    items: [
      { path: '/mail-signals', label: '邮件事件', icon: Inbox, permissions: [] },
      { path: '/mail-tasks', label: '任务草稿', icon: Sparkles, permissions: [] },
    ],
  },
  {
    label: '组织与花名册',
    items: [
      { path: '/roster', label: '数字员工花名册', icon: Users, permissions: [] },
      { path: '/teams', label: '组织架构', icon: Network, permissions: [] },
      { path: '/agents', label: 'Agent 目录', icon: Bot, permissions: ['dashboard.admin.manage'] },
      { path: '/matrix', label: '工作台绑定矩阵', icon: Network, permissions: ['dashboard.admin.manage'] },
    ],
  },
  {
    label: '流程与协作',
    items: [
      { path: '/workflows', label: '协作流程定义', icon: Activity, permissions: ['dashboard.admin.manage'] },
      { path: '/executions', label: '流程执行实况', icon: PlayCircle, permissions: [] },
      { path: '/orchestration-monitor', label: '编排监控', icon: GitBranch, permissions: [] },
    ],
  },
  {
    label: '赋能中心',
    items: [
      { path: '/skills', label: '技能管理', icon: Wrench, permissions: ['dashboard.admin.manage'] },
      { path: '/skill-registry', label: '技能注册表', icon: Database, permissions: [] },
      { path: '/tools', label: '工具清单', icon: Hammer, permissions: [] },
      { path: '/knowledge', label: '知识灌注', icon: BookOpen, permissions: [] },
      { path: '/memory', label: '记忆档案', icon: BookMarked, permissions: [] },
      { path: '/policy-learning', label: '策略学习', icon: Brain, permissions: [] },
      { path: '/behavior', label: '行为策略配置', icon: Sliders, permissions: [] },
      { path: '/knowledge-review', label: '知识委员会审核', icon: FileCheck, permissions: ['dashboard.admin.manage'] },
    ],
  },
  {
    label: '绩效与洞察',
    items: [
      { path: '/performance', label: '绩效仪表盘', icon: BarChart3, permissions: [] },
      { path: '/value', label: '价值核算', icon: TrendingUp, permissions: [] },
      { path: '/growth', label: '能力成长曲线', icon: Brain, permissions: [] },
    ],
  },
  {
    label: '治理与合规',
    items: [
      { path: '/audit', label: '行为审计', icon: FileText, permissions: [] },
      { path: '/health', label: '通道健康与告警', icon: Radio, permissions: [] },
      { path: '/gates', label: '验收门禁', icon: FileCheck, permissions: [] },
      { path: '/upgrades', label: '升级管控', icon: TowerControl, permissions: [] },
    ],
  },
=======
const navItems = [
  { path: '/portal', label: '首页', icon: LayoutDashboard },
  { path: '/mail-signals', label: '邮件事件', icon: Inbox },
  { path: '/mail-tasks', label: '任务草稿', icon: Sparkles },
  { path: '/replay', label: '执行回放', icon: History },
  { path: '/analytics', label: '复盘看板', icon: TrendingUp },
  { path: '/proactive-insights', label: '主动洞察', icon: Eye },
  { path: '/proactive-analytics', label: '洞察看板', icon: PieChart },
>>>>>>> origin/main
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
