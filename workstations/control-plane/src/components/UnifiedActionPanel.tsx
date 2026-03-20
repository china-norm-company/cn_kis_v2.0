import { type ReactNode } from 'react'

interface UnifiedActionPanelProps {
  title?: string
  children?: ReactNode
  /** 认领、分派、创建工单等动作占位 */
  actions?: ReactNode
}

export function UnifiedActionPanel({ title = '操作', children, actions }: UnifiedActionPanelProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{title}</span>
        {actions}
      </div>
      {children ?? <p className="text-xs text-slate-400">认领 / 分派 / 创建工单 等动作将在此展开</p>}
    </div>
  )
}
