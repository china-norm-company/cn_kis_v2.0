/**
 * 排程流程进度类型定义（与 KIS 一致）
 * 用于项目全链路详情页排程流程进度展示
 */
export interface SchedulingApprovalRecord {
  id: string
  seq: number
  nodeName: string
  operator: string
  operatorId: string
  operateDate: string
  action: string
  comment?: string
  metadata?: Record<string, unknown>
}

export type SchedulingApprovalNode =
  | 'schedule_submit'
  | 'resource_review'
  | 'plan_confirmation'
  | 'researcher_confirmation'
  | 'work_order_publish'

export const SCHEDULING_APPROVAL_NODES: Record<
  SchedulingApprovalNode,
  { key: SchedulingApprovalNode; label: string; operator: string }
> = {
  schedule_submit: { key: 'schedule_submit', label: '访视计划提交', operator: '研究员' },
  resource_review: { key: 'resource_review', label: '资源审核', operator: '排程专员' },
  plan_confirmation: { key: 'plan_confirmation', label: '排程方案确认', operator: '排程专员' },
  researcher_confirmation: { key: 'researcher_confirmation', label: '研究员确认', operator: '研究员' },
  work_order_publish: { key: 'work_order_publish', label: '访视工单发布', operator: '系统' },
}

export type SchedulingWorkflowStatus =
  | 'pending_review'
  | 'pending_schedule'
  | 'pending_researcher_confirmation'
  | 'researcher_confirmed'
  | 'scheduled'
  | 'cancelled'
  | 'rejected'
