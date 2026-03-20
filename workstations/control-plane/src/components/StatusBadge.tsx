import type { ReactNode } from 'react'
import type { EventSeverity, EventStatus, ManagedObjectStatus, TicketStatus } from '@/types'

interface StatusBadgeProps {
  tone: ManagedObjectStatus | EventSeverity | EventStatus | TicketStatus | 'high' | 'medium' | 'low'
  children: ReactNode
}

const toneClassMap: Record<StatusBadgeProps['tone'], string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  offline: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-slate-100 text-slate-700 border-slate-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  critical: 'bg-rose-50 text-rose-700 border-rose-200',
  new: 'bg-sky-50 text-sky-700 border-sky-200',
  investigating: 'bg-violet-50 text-violet-700 border-violet-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  todo: 'bg-slate-100 text-slate-700 border-slate-200',
  processing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClassMap[tone]}`}>
      {children}
    </span>
  )
}
