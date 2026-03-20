/**
 * ApprovalTimeline - 审批进度时间线组件
 */
import { clsx } from 'clsx'
import { Check, Clock, X, User } from 'lucide-react'

export interface ApprovalStep {
  step_number: number
  title: string
  approver_name?: string
  status: 'pending' | 'approved' | 'rejected' | 'current'
  comment?: string
  completed_at?: string
}

export interface ApprovalTimelineProps {
  steps: ApprovalStep[]
  className?: string
}

const statusConfig = {
  approved: { icon: Check, bg: 'bg-emerald-500', text: 'text-emerald-600', label: '已通过' },
  rejected: { icon: X, bg: 'bg-red-500', text: 'text-red-600', label: '已拒绝' },
  current: { icon: Clock, bg: 'bg-blue-500', text: 'text-blue-600', label: '审批中' },
  pending: { icon: Clock, bg: 'bg-slate-300', text: 'text-slate-400', label: '待审批' },
}

export function ApprovalTimeline({ steps, className }: ApprovalTimelineProps) {
  if (!steps || steps.length === 0) {
    return (
      <div className="text-sm text-slate-400 py-4 text-center">
        暂无审批流程信息
      </div>
    )
  }

  return (
    <div className={clsx('relative', className)}>
      {steps.map((step, idx) => {
        const config = statusConfig[step.status]
        const Icon = config.icon
        const isLast = idx === steps.length - 1

        return (
          <div key={step.step_number} className="flex gap-4 pb-6 last:pb-0">
            {/* Timeline connector */}
            <div className="flex flex-col items-center">
              <div className={clsx(
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                config.bg, 'text-white'
              )}>
                <Icon className="w-4 h-4" />
              </div>
              {!isLast && (
                <div className={clsx(
                  'w-0.5 flex-1 mt-1',
                  step.status === 'approved' ? 'bg-emerald-300' : 'bg-slate-200'
                )} />
              )}
            </div>

            {/* Step content */}
            <div className="flex-1 pb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-slate-800">{step.title}</span>
                <span className={clsx('text-xs', config.text)}>{config.label}</span>
              </div>
              {step.approver_name && (
                <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                  <User className="w-3 h-3" />
                  <span>{step.approver_name}</span>
                </div>
              )}
              {step.comment && (
                <div className="mt-1 text-xs text-slate-500 bg-slate-50 rounded px-2 py-1">
                  {step.comment}
                </div>
              )}
              {step.completed_at && (
                <div className="mt-1 text-xs text-slate-400">{step.completed_at}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
