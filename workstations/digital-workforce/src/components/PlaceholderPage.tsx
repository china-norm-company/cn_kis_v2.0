import type { ReactNode } from 'react'

interface PlaceholderPageProps {
  title: string
  description?: string
  icon?: ReactNode
}

export function PlaceholderPage({ title, description, icon }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-12 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      <p className="text-xs text-slate-400">该能力按中书·智能台 Phase 1 规划建设中</p>
    </div>
  )
}
