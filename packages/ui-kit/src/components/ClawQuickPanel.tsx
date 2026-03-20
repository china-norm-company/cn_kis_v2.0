/**
 * ClawQuickPanel — Claw 技能快捷操作面板
 *
 * 所有工作台共享的 AI 快捷操作入口。
 * 从 Claw 注册表获取当前工作台可用的技能和快捷操作，
 * 展示为可点击的操作卡片网格。
 *
 * 配套 Hook: useClawQuickActions(key, fetcher)
 */
import { useState, useEffect } from 'react'
import {
  Zap, Loader2, AlertCircle,
  Newspaper, Activity, Search, AlertTriangle, FileText,
  FileSearch, BarChart, Send, Calendar, Shield, Clipboard,
  User, Clock, Eye, TrendingUp, UserCheck, Cpu, Download,
  Edit, Award, BookOpen, CheckSquare, LogIn, Thermometer,
} from 'lucide-react'

export interface QuickAction {
  id: string
  label: string
  skill: string
  script: string | null
  icon: string
}

const INLINE_SKILLS = new Set([
  'protocol-parser',
  'protocol-to-startup-pack',
  'crf-validator',
  'visit-scheduler',
  'workorder-automation',
  'auto-quotation',
  'efficacy-report-generator',
  'multi-domain-alert',
])

export interface ClawQuickPanelProps {
  workstationKey: string
  actions: QuickAction[]
  loading?: boolean
  error?: string | null
  onAction: (action: QuickAction) => void
  onInlineAction?: (action: QuickAction) => void
  title?: string
  compact?: boolean
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  newspaper: Newspaper,
  activity: Activity,
  search: Search,
  'alert-triangle': AlertTriangle,
  'file-text': FileText,
  'file-search': FileSearch,
  'bar-chart': BarChart,
  send: Send,
  calendar: Calendar,
  shield: Shield,
  clipboard: Clipboard,
  user: User,
  clock: Clock,
  eye: Eye,
  'trending-up': TrendingUp,
  'user-check': UserCheck,
  cpu: Cpu,
  download: Download,
  edit: Edit,
  award: Award,
  'book-open': BookOpen,
  'check-square': CheckSquare,
  'log-in': LogIn,
  thermometer: Thermometer,
  'alert-circle': AlertCircle,
}

function ActionIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] || Zap
  return <Icon className={className} />
}

export function ClawQuickPanel({
  actions,
  loading = false,
  error = null,
  onAction,
  onInlineAction,
  title = 'AI 快捷操作',
  compact = false,
}: ClawQuickPanelProps) {
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">加载 AI 能力...</span>
        </div>
      </div>
    )
  }

  // 有 error 时不再展示红框，仅不渲染该区域（保留原实现作注释便于恢复）
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    )
  }
  // if (error) return null

  if (!actions.length) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 md:px-6">
        <Zap className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
          {actions.length}
        </span>
      </div>
      <div
        className={
          compact
            ? 'grid grid-cols-2 gap-2 p-3 md:grid-cols-3'
            : 'grid grid-cols-2 gap-3 p-4 md:grid-cols-3 lg:grid-cols-4'
        }
      >
        {actions.map((action) => {
          const isInline = INLINE_SKILLS.has(action.skill) && !!onInlineAction
          return (
            <button
              key={action.id}
              onClick={() => isInline ? onInlineAction!(action) : onAction(action)}
              className={`group flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-all hover:shadow-sm active:scale-[0.98] md:gap-3 md:px-4 md:py-3 ${
                isInline
                  ? 'border-violet-200 bg-violet-50 hover:border-violet-300 hover:bg-violet-100'
                  : 'border-slate-100 bg-slate-50 hover:border-blue-200 hover:bg-blue-50'
              }`}
            >
              <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg shadow-sm transition-colors ${
                isInline ? 'bg-violet-100 group-hover:bg-violet-200' : 'bg-white group-hover:bg-blue-100'
              }`}>
                <ActionIcon
                  name={action.icon}
                  className={`h-4 w-4 transition-colors ${isInline ? 'text-violet-600' : 'text-slate-500 group-hover:text-blue-600'}`}
                />
              </div>
              <div className="min-w-0">
                <div className={`truncate text-sm font-medium ${isInline ? 'text-violet-700' : 'text-slate-700 group-hover:text-blue-700'}`}>
                  {action.label}
                </div>
                {!compact && (
                  <div className="truncate text-xs text-slate-400">
                    {isInline ? '页内执行' : action.skill}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 通用 Hook：获取指定工作台的 Claw 快捷操作。
 * fetcher 由调用方注入（如 clawRegistryApi.getByWorkstation），
 * 使本 Hook 不依赖 @cn-kis/api-client。
 */
export function useClawQuickActions(
  workstationKey: string,
  fetcher: (key: string) => Promise<{ data?: { quick_actions?: QuickAction[] } }>,
) {
  const [actions, setActions] = useState<QuickAction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetcher(workstationKey)
      .then((res) => {
        if (!cancelled) {
          setActions(res.data?.quick_actions ?? [])
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [workstationKey, fetcher])

  return { actions, loading, error }
}
