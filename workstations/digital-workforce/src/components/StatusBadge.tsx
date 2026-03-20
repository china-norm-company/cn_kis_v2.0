import type { ReactNode } from 'react'

type Tone =
  | 'new'
  | 'parsed'
  | 'linked'
  | 'tasked'
  | 'completed'
  | 'ignored'
  | 'error'
  | 'low'
  | 'medium'
  | 'high'

interface StatusBadgeProps {
  tone: Tone
  children: ReactNode
}

const toneClassMap: Record<Tone, string> = {
  new: 'bg-sky-50 text-sky-700 border-sky-200',
  parsed: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  linked: 'bg-violet-50 text-violet-700 border-violet-200',
  tasked: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ignored: 'bg-slate-100 text-slate-700 border-slate-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClassMap[tone]}`}>
      {children}
    </span>
  )
}
