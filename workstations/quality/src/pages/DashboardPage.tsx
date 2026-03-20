import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, StatCard, Badge, ClawQuickPanel, useClawQuickActions, DigitalWorkerSuggestionBar } from '@cn-kis/ui-kit'
import type { QuickAction, SuggestionAction } from '@cn-kis/ui-kit'
import { api, clawRegistryApi, digitalWorkforcePortalApi } from '@cn-kis/api-client'
import { getWorkstationUrl } from '@cn-kis/feishu-sdk'
import type { SuggestionItem } from '@cn-kis/api-client'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ShieldCheck, BookOpen, MessageSquare,
  Clock, ArrowRight, Bot, ExternalLink,
} from 'lucide-react'

interface DashboardData {
  stats: {
    open_deviations: number
    overdue_capas: number
    sops_due_review: number
    weekly_queries: number
  }
  todos: {
    type: string
    urgency: 'high' | 'medium' | 'low'
    title: string
    link: string
    due_date: string
  }[]
  recent_events: {
    type: string
    title: string
    status: string
    time: string
    link: string
  }[]
}

const urgencyColors: Record<string, string> = {
  high: 'bg-red-50 border-red-200 text-red-800',
  medium: 'bg-amber-50 border-amber-200 text-amber-800',
  low: 'bg-blue-50 border-blue-200 text-blue-800',
}

const urgencyLabels: Record<string, string> = {
  high: '紧急',
  medium: '一般',
  low: '普通',
}

const eventTypeIcons: Record<string, typeof AlertTriangle> = {
  deviation: AlertTriangle,
  capa: ShieldCheck,
}

const clawFetcher = (key: string) => clawRegistryApi.getByWorkstation(key)

/** 质量台·数字员工摘要卡：最近偏差/CAPA 相关回放 */
function QualityDigitalWorkforceCard() {
  const { data: runsRes } = useQuery({
    queryKey: ['digital-workforce', 'replay-runs', 'quality'],
    queryFn: () => digitalWorkforcePortalApi.getReplayRuns({ workstation_key: 'quality', limit: 1 }),
  })
  const run = runsRes?.data?.data?.items?.[0]
  if (!run) return null
  const replayHref = getWorkstationUrl('digital-workforce', `#/replay/${run.task_id}`)
  const snippet = run.query_snippet ?? (run.query?.slice(0, 60) + (run.query?.length > 60 ? '…' : ''))
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4" data-testid="quality-digital-workforce-card">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <ShieldCheck className="h-4 w-4 text-amber-600" />
        偏差/CAPA 建议（数字员工）
      </h3>
      <p className="mt-2 text-xs text-slate-600">{snippet || '最近一次执行'}</p>
      <div className="mt-2 flex items-center gap-2">
        <Badge variant={run.status === 'success' ? 'success' : 'warning'}>{run.status}</Badge>
        <a href={replayHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:underline">
          进入回放 <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()
  const claw = useClawQuickActions('quality', clawFetcher)
  const handleClawAction = useCallback((a: QuickAction) => {
    const params = new URLSearchParams({
      skill: a.skill,
      ...(a.script && { script: a.script }),
      action: a.id,
    })
    window.open(getWorkstationUrl('digital-workforce', `#/chat?${params.toString()}`), '_blank')
  }, [])

  const { data: suggestionsRes, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['digital-workforce', 'suggestions', 'quality'],
    queryFn: () => digitalWorkforcePortalApi.getSuggestions('quality'),
    staleTime: 60_000,
  })
  const suggestions = suggestionsRes?.data?.data?.items ?? []
  const handleSuggestionAction = useCallback((item: SuggestionItem, action: SuggestionAction) => {
    if (action.action_id === 'view') {
      window.open(action.endpoint, '_blank')
    } else if (action.action_id === 'create_capa') {
      navigate(action.endpoint.replace('/api/v1/quality', ''))
    } else {
      window.location.href = action.endpoint
    }
  }, [navigate])

  const { data, isLoading } = useQuery({
    queryKey: ['quality-dashboard'],
    queryFn: () => api.get<DashboardData>('/quality/dashboard'),
    refetchInterval: 60_000,
  })

  const dashboard = data?.data
  const stats = dashboard?.stats
  const todos = dashboard?.todos ?? []
  const events = dashboard?.recent_events ?? []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Clock className="w-5 h-5 animate-spin mr-2" /> 正在加载仪表盘...
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-lg font-bold text-slate-800 md:text-2xl">质量管理概览</h1>

      <DigitalWorkerSuggestionBar
        items={suggestions}
        loading={suggestionsLoading}
        onAction={handleSuggestionAction}
      />

      <ClawQuickPanel workstationKey="quality" actions={claw.actions} loading={claw.loading} error={claw.error} onAction={handleClawAction} compact />

      <QualityDigitalWorkforceCard />

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
          href={getWorkstationUrl('digital-workforce', '#/gates')}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ShieldCheck className="h-4 w-4" />
          偏差与 CAPA（门禁回放）
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="开放偏差"
          value={stats?.open_deviations ?? 0}
          icon={<AlertTriangle className="w-6 h-6" />}
          color="red"
        />
        <StatCard
          title="超期 CAPA"
          value={stats?.overdue_capas ?? 0}
          icon={<ShieldCheck className="w-6 h-6" />}
          color="amber"
        />
        <StatCard
          title="待审查 SOP"
          value={stats?.sops_due_review ?? 0}
          icon={<BookOpen className="w-6 h-6" />}
          color="blue"
        />
        <StatCard
          title="本周质疑"
          value={stats?.weekly_queries ?? 0}
          icon={<MessageSquare className="w-6 h-6" />}
          color="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 md:gap-6">
        {/* 待办事项 */}
        <Card>
          <div className="p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">待办事项</h2>
            {todos.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">暂无待办事项</p>
            ) : (
              <div className="space-y-2">
                {todos.map((todo, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-shadow ${urgencyColors[todo.urgency]}`}
                    onClick={() => navigate(todo.link)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{todo.title}</p>
                      <p className="text-xs opacity-70 mt-0.5">到期: {todo.due_date}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <Badge variant={todo.urgency === 'high' ? 'error' : todo.urgency === 'medium' ? 'warning' : 'info'}>
                        {urgencyLabels[todo.urgency]}
                      </Badge>
                      <ArrowRight className="w-4 h-4 opacity-50" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* 最近质量事件 */}
        <Card>
          <div className="p-5">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">最近质量事件</h2>
            {events.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">暂无事件记录</p>
            ) : (
              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />
                <div className="space-y-4">
                  {events.map((event, i) => {
                    const Icon = eventTypeIcons[event.type] ?? AlertTriangle
                    return (
                      <div
                        key={i}
                        className="relative pl-10 cursor-pointer group"
                        onClick={() => navigate(event.link)}
                      >
                        <div className="absolute left-2 top-1 w-5 h-5 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center">
                          <Icon className="w-3 h-3 text-slate-500" />
                        </div>
                        <div className="bg-white border border-slate-200 rounded-lg p-3 group-hover:shadow-sm transition-shadow">
                          <p className="text-sm font-medium text-slate-700">{event.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="default">{event.status}</Badge>
                            <span className="text-xs text-slate-400">
                              {event.time ? new Date(event.time).toLocaleString('zh-CN') : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
