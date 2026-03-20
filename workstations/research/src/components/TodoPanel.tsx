/**
 * 待办面板组件
 *
 * 分组展示（审批/工单/预警/变更/访视），按紧急度排序，点击跳转详情
 */
import { Link } from 'react-router-dom'
import { Badge } from '@cn-kis/ui-kit'
import {
  CheckSquare, AlertTriangle, GitPullRequest,
  CalendarCheck, ChevronRight, Loader2,
} from 'lucide-react'

interface TodoItem {
  id: string
  type: string
  title: string
  detail: string
  entity_id: number
  entity_type: string
  urgency: 'critical' | 'high' | 'medium' | 'low'
  created_at: string | null
  link: string
}

interface TodoSummary {
  approvals: number
  overdue_workorders: number
  pending_changes: number
  upcoming_visits: number
  unread_notifications: number
  total: number
}

interface Props {
  items: TodoItem[]
  summary: TodoSummary
  isLoading?: boolean
}

const TYPE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  approval: { icon: CheckSquare, color: 'text-blue-500', label: '审批' },
  overdue_workorder: { icon: AlertTriangle, color: 'text-red-500', label: '逾期工单' },
  pending_change: { icon: GitPullRequest, color: 'text-purple-500', label: '变更' },
  upcoming_visit: { icon: CalendarCheck, color: 'text-green-500', label: '访视' },
}

const URGENCY_VARIANT: Record<string, 'error' | 'warning' | 'info' | 'default'> = {
  critical: 'error',
  high: 'warning',
  medium: 'info',
  low: 'default',
}

export function TodoPanel({ items, summary, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">加载待办...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-700">今日待办</h3>
        {summary.total > 0 && (
          <Badge variant="error">{summary.total}</Badge>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <SummaryCard label="待审批" count={summary.approvals} icon={CheckSquare} color="blue" />
        <SummaryCard label="逾期工单" count={summary.overdue_workorders} icon={AlertTriangle} color="red" />
        <SummaryCard label="待处理变更" count={summary.pending_changes} icon={GitPullRequest} color="purple" />
        <SummaryCard label="近期访视" count={summary.upcoming_visits} icon={CalendarCheck} color="green" />
      </div>

      {/* Todo list */}
      {items.length === 0 ? (
        <div className="text-center py-6 text-sm text-slate-400">
          暂无待办事项
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {items.map((item) => {
            const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.approval
            const Icon = config.icon
            return (
              <Link
                key={item.id}
                to={item.link}
                className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50/30 transition group"
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${config.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 truncate group-hover:text-blue-600">
                    {item.title}
                  </div>
                  {item.detail && (
                    <div className="text-xs text-slate-400 mt-0.5 truncate">{item.detail}</div>
                  )}
                </div>
                <Badge variant={URGENCY_VARIANT[item.urgency] || 'default'} size="sm">
                  {item.urgency === 'critical' ? '紧急' : item.urgency === 'high' ? '重要' : '普通'}
                </Badge>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 flex-shrink-0" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, count, icon: Icon, color }: {
  label: string; count: number; icon: React.ComponentType<{ className?: string }>; color: string
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
    green: 'bg-green-50 text-green-600 border-green-100',
  }
  return (
    <div className={`rounded-lg border p-3 text-center ${colors[color] || colors.blue}`}>
      <Icon className="w-4 h-4 mx-auto mb-1" />
      <div className="text-lg font-bold">{count}</div>
      <div className="text-[11px] opacity-70">{label}</div>
    </div>
  )
}
