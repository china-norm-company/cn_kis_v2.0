/**
 * 动作卡片 — 数字员工动作中心 / AI 运营动作列表共享展示组件
 * 仅负责展示，操作按钮由父级通过 children 传入
 */
import { Card } from './Card'
import { Badge, type BadgeVariant } from './Badge'

export interface ActionCardItem {
  id: number
  title?: string
  description?: string
  status?: string
  risk_level?: string
  action_type?: string
  target_system?: string
  can_delegate_to_claw?: boolean
  priority_score?: number | string
  capability_key?: string
  executor?: string
  operator_mode?: string
  reason?: string
  recommended_route?: string
  recommended_reason?: string
  next_actions?: string[]
  context_coverage?: { score?: number; missing_items?: string[]; staleness_seconds?: number | null }
  minimum_context_requirements?: string[]
  required_vs_granted_scopes?: { missing?: string[] }
  expected_skills?: string[]
  latest_execution?: {
    result?: { run_id?: string; failed_step?: string; channel?: string }
  }
}

function riskToVariant(level?: string): BadgeVariant {
  if (level === 'high') return 'error'
  if (level === 'medium') return 'warning'
  return 'default'
}

export interface ActionCardProps {
  item: ActionCardItem
  /** 卡片头部可选内容（如秘书台批量选择复选框） */
  headerExtra?: React.ReactNode
  children?: React.ReactNode
}

export function ActionCard({ item, headerExtra, children }: ActionCardProps) {
  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {headerExtra}
          <Badge variant={riskToVariant(item.risk_level)} size="sm">
            {item.risk_level ?? '-'}
          </Badge>
          <Badge variant="default" size="sm">
            {item.status ?? '-'}
          </Badge>
          {item.can_delegate_to_claw && (
            <Badge variant="success" size="sm">
              可交付 Kimi Claw
            </Badge>
          )}
          <Badge variant="default" size="sm">
            {item.target_system ?? 'cn_kis'}
          </Badge>
          <span className="text-xs text-slate-500">{item.action_type ?? ''}</span>
          {item.priority_score != null && (
            <span className="text-xs text-slate-500">优先级: {item.priority_score}</span>
          )}
        </div>
        <div>
          <p className="font-medium text-slate-800">{item.title ?? '-'}</p>
          <p className="text-sm text-slate-600 mt-1">{item.description ?? ''}</p>
          {item.capability_key && (
            <p className="text-xs text-slate-500 mt-1">
              能力: {item.capability_key} · 执行器: {item.executor ?? '-'} · 模式: {item.operator_mode ?? '-'}
            </p>
          )}
          {item.reason && <p className="text-xs text-slate-500 mt-1">原因: {item.reason}</p>}
          {item.recommended_route && (
            <p className="text-xs text-indigo-600 mt-1">
              推荐路径: {item.recommended_route}
              {item.recommended_reason ? ` · ${item.recommended_reason}` : ''}
            </p>
          )}
          {(item.next_actions?.length ?? 0) > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              建议动作: {(item.next_actions ?? []).slice(0, 3).join('；')}
            </p>
          )}
          {item.latest_execution?.result?.run_id && (
            <p className="text-xs text-emerald-600 mt-1">
              回执: {item.latest_execution.result.channel ?? 'unknown'} / run_id={item.latest_execution.result.run_id}
            </p>
          )}
          {item.context_coverage != null && (
            <p className="text-xs text-slate-500 mt-1">
              上下文覆盖率: {item.context_coverage.score ?? '-'}%
              {item.context_coverage.staleness_seconds != null
                ? ` · 新鲜度: ${item.context_coverage.staleness_seconds}s`
                : ''}
            </p>
          )}
          {(item.minimum_context_requirements?.length ?? 0) > 0 && (
            <p className="text-xs text-slate-500 mt-1">
              最低上下文要求: {(item.minimum_context_requirements ?? []).join('，')}
            </p>
          )}
          {(item.required_vs_granted_scopes?.missing?.length ?? 0) > 0 && (
            <p className="text-xs text-rose-600 mt-1">
              缺少Scopes: {(item.required_vs_granted_scopes?.missing ?? []).join('，')}
            </p>
          )}
          {(item.expected_skills?.length ?? 0) > 0 && (
            <p className="text-xs text-indigo-600 mt-1">
              预期Skills: {(item.expected_skills ?? []).join('，')}
            </p>
          )}
          {item.latest_execution?.result?.failed_step && (
            <p className="text-xs text-rose-600 mt-1">
              {item.capability_key ? '最近失败步骤' : '失败步骤'}: {item.latest_execution.result.failed_step}
            </p>
          )}
        </div>
        {children != null && <div className="flex gap-2 flex-wrap">{children}</div>}
      </div>
    </Card>
  )
}
