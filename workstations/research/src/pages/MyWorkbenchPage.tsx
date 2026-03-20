/**
 * 个人工作台首页
 *
 * 研究经理打开系统的第一屏：待办面板 + 日历日程 + 快速操作入口
 * 目标：5 秒内知道今天要做什么
 */
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { SuggestionItem } from '@cn-kis/api-client'
import { ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar } from '@cn-kis/ui-kit'
import type { QuickAction, SuggestionAction } from '@cn-kis/ui-kit'
import { Link } from 'react-router-dom'
import {
  FileSearch, Briefcase, Users, BarChart3,
  GitPullRequest, Building2, TrendingUp, Bot, FileText, ExternalLink,
} from 'lucide-react'
import { TodoPanel } from '../components/TodoPanel'
import { CalendarWidget } from '../components/CalendarWidget'

const QUICK_ACTIONS = [
  { to: '/manager', icon: BarChart3, label: '管理驾驶舱', color: 'bg-blue-50 text-blue-600 hover:bg-blue-100' },
  { to: '/portfolio', icon: Briefcase, label: '项目组合', color: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' },
  { to: '/proposals/create', icon: FileSearch, label: '创建方案', color: 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' },
  { to: '/clients', icon: Building2, label: '我的客户', color: 'bg-amber-50 text-amber-600 hover:bg-amber-100' },
  { to: '/business', icon: TrendingUp, label: '商务管线', color: 'bg-purple-50 text-purple-600 hover:bg-purple-100' },
  { to: '/changes', icon: GitPullRequest, label: '变更管理', color: 'bg-rose-50 text-rose-600 hover:bg-rose-100' },
  { to: '/team', icon: Users, label: '团队全景', color: 'bg-cyan-50 text-cyan-600 hover:bg-cyan-100' },
  { to: '/ai-assistant', icon: Bot, label: 'AI 助手', color: 'bg-violet-50 text-violet-600 hover:bg-violet-100' },
]

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

/** 研究台·数字员工摘要卡：最近方案与协议结果，跳转中书回放 */
function ResearchDigitalWorkforceCard() {
  const { data: runsRes } = useQuery({
    queryKey: ['digital-workforce', 'replay-runs', 'research'],
    queryFn: () => digitalWorkforcePortalApi.getReplayRuns({ workstation_key: 'research', limit: 1 }),
  })
  const run = runsRes?.data?.data?.items?.[0]
  const { data: replayRes } = useQuery({
    queryKey: ['digital-workforce', 'replay', run?.task_id],
    queryFn: () => digitalWorkforcePortalApi.getReplay(run!.task_id),
    enabled: !!run?.task_id,
  })
  const replay = replayRes?.data?.data
  const artifacts = (replay?.structured_artifacts ?? {}) as Record<string, unknown>
  const demandSummary = artifacts.demand_summary as string | undefined
  const gapList = artifacts.gap_list as string[] | undefined
  const solutionDraft = artifacts.solution_draft as string | undefined
  const snippet = solutionDraft ? (solutionDraft.slice(0, 120) + (solutionDraft.length > 120 ? '…' : '')) : ''

  if (!run) return null
  const replayHref = getWorkstationUrl('digital-workforce', `#/replay/${run.task_id}`)
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4" data-testid="research-digital-workforce-card">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <FileText className="h-4 w-4 text-violet-600" />
        方案与协议结果（数字员工）
      </h3>
      <div className="mt-2 space-y-1 text-xs text-slate-600">
        {demandSummary && <p>{demandSummary.slice(0, 100)}{demandSummary.length > 100 ? '…' : ''}</p>}
        {Array.isArray(gapList) && gapList.length > 0 && (
          <p>缺口：{gapList.slice(0, 3).join('、')}{gapList.length > 3 ? ' 等' : ''}</p>
        )}
        {snippet && <p className="text-slate-500">{snippet}</p>}
      </div>
      <a
        href={replayHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-violet-700 hover:underline"
      >
        进入回放 <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

export default function MyWorkbenchPage() {
  const claw = useClawQuickActions('research', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'research'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('research'),
    staleTime: 60_000,
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []
  const handleSuggestionAction = useCallback((item: SuggestionItem, action: SuggestionAction) => {
    if (action.action_id === 'view') {
      window.open(action.endpoint, '_blank')
    } else {
      window.location.href = action.endpoint
    }
  }, [])

  const { data: todoRes, isLoading } = useQuery({
    queryKey: ['dashboard', 'my-todo'],
    queryFn: () => dashboardApi.getMyTodo(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  })

  const todoData = todoRes?.data
  const items = todoData?.items ?? []
  const summary = todoData?.summary ?? {
    approvals: 0,
    overdue_workorders: 0,
    pending_changes: 0,
    upcoming_visits: 0,
    unread_notifications: 0,
    total: 0,
  }

  const scheduleItems = items
    .filter((t) => t.type === 'upcoming_visit')
    .map((t) => ({
      id: t.id,
      title: t.title,
      time: t.detail?.replace('日期: ', '') || '',
      type: 'visit' as const,
    }))

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 md:text-xl">工作台</h2>
        <p className="text-sm text-slate-500 mt-1">
          {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </div>

      <DigitalWorkerSuggestionBar
        items={suggestions}
        loading={suggestionsLoading}
        onAction={handleSuggestionAction}
      />

      <ClawQuickPanel workstationKey="research" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      <ResearchDigitalWorkforceCard />

      <div className="flex flex-wrap gap-2">
        <a
          href={getWorkstationUrl('digital-workforce', '#/portal')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
        >
          <Bot className="h-4 w-4" />
          进入中书·数字员工中心
        </a>
        <a
          href={getWorkstationUrl('digital-workforce', '#/workflows')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <FileSearch className="h-4 w-4" />
          方案与协议（数字员工）
        </a>
      </div>

      {/* Main: Todo + Calendar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
        <div className="lg:col-span-2">
          <TodoPanel items={items} summary={summary} isLoading={isLoading} />
        </div>
        <div>
          <CalendarWidget items={scheduleItems} isLoading={isLoading} />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">快速操作</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className={`flex min-h-11 items-center gap-3 p-3 rounded-lg transition ${action.color}`}
            >
              <action.icon className="w-5 h-5" />
              <span className="text-sm font-medium">{action.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
