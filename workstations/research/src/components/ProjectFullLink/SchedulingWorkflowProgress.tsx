/**
 * 排程流程进度组件（与 KIS 一致）
 * 展示排程流程的进度和状态，用于项目全链路详情页
 */
import { Check, Clock, X, Circle, ArrowRight } from 'lucide-react'
import type { SchedulingApprovalRecord, SchedulingApprovalNode, SchedulingWorkflowStatus } from '../../lib/schedulerApprovalTypes'
import { SCHEDULING_APPROVAL_NODES } from '../../lib/schedulerApprovalTypes'

export interface SchedulingWorkflowProgressProps {
  status: SchedulingWorkflowStatus
  approvalRecords: SchedulingApprovalRecord[]
  savedAt?: string
}

const formatDateTime = (dateTime: string | undefined): string => {
  if (!dateTime) return ''
  return dateTime.replace('T', ' ').replace(/\.\d{3}Z?$/, '').substring(0, 19)
}

const NODE_ORDER: SchedulingApprovalNode[] = [
  'schedule_submit',
  'resource_review',
  'plan_confirmation',
  'researcher_confirmation',
  'work_order_publish',
]

const NODE_NAME_MAP: Record<SchedulingApprovalNode, string> = {
  schedule_submit: '访视计划提交',
  resource_review: '资源审核',
  plan_confirmation: '排程方案确认',
  researcher_confirmation: '研究员确认',
  work_order_publish: '访视工单发布',
}

function getFlowNodes(
  status: SchedulingWorkflowStatus,
  approvalRecords: SchedulingApprovalRecord[],
  savedAt?: string
): Array<{
  key: SchedulingApprovalNode
  label: string
  status: 'completed' | 'current' | 'pending' | 'rejected'
  operator?: string
  time?: string
}> {
  let currentIndex = -1
  if (status === 'pending_review') currentIndex = 1
  else if (status === 'pending_schedule') currentIndex = 2
  else if (status === 'pending_researcher_confirmation') currentIndex = 3
  else if (status === 'researcher_confirmed') currentIndex = 4
  else if (status === 'scheduled') currentIndex = 4
  else if (status === 'cancelled' || status === 'rejected') currentIndex = -1

  return NODE_ORDER.map((nodeKey, index) => {
    const nodeConfig = SCHEDULING_APPROVAL_NODES[nodeKey]
    const targetNodeName = NODE_NAME_MAP[nodeKey]
    const matchingRecords = approvalRecords.filter((r) => r.nodeName === targetNodeName)
    const record =
      matchingRecords.length > 0
        ? matchingRecords.reduce((latest, current) =>
            current.seq > latest.seq ||
            (current.seq === latest.seq &&
              current.operateDate &&
              latest.operateDate &&
              new Date(current.operateDate) > new Date(latest.operateDate))
              ? current
              : latest
          )
        : undefined

    let nodeStatus: 'completed' | 'current' | 'pending' | 'rejected' = 'pending'
    if (status === 'rejected' || status === 'cancelled') {
      if (record && ['质疑', '退回', '失败'].includes(record.action)) nodeStatus = 'rejected'
      else if (record) nodeStatus = 'completed'
    } else if (record) {
      if (['质疑', '退回', '失败'].includes(record.action)) nodeStatus = 'rejected'
      else nodeStatus = 'completed'
    } else if (index < currentIndex) {
      nodeStatus = 'completed'
    } else if (index === currentIndex) {
      nodeStatus = 'current'
    }

    let operator = record?.operator
    let time = record?.operateDate
    if (nodeStatus === 'completed' && !operator) operator = nodeConfig.operator
    if (nodeStatus === 'completed' && !time && savedAt) {
      const base = new Date(savedAt)
      const offsets: Record<SchedulingApprovalNode, number> = {
        schedule_submit: -4 * 60 * 1000,
        resource_review: -3 * 60 * 1000,
        plan_confirmation: -2 * 60 * 1000,
        researcher_confirmation: -1 * 60 * 1000,
        work_order_publish: 0,
      }
      time = new Date(base.getTime() + (offsets[nodeKey] ?? 0)).toISOString()
    }

    return {
      key: nodeKey,
      label: nodeConfig.label,
      status: nodeStatus,
      operator,
      time,
    }
  })
}

export function SchedulingWorkflowProgress({ status, approvalRecords, savedAt }: SchedulingWorkflowProgressProps) {
  const nodes = getFlowNodes(status, approvalRecords, savedAt)

  const getStatusIcon = (nodeStatus: string) => {
    switch (nodeStatus) {
      case 'completed':
        return (
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
            <Check className="h-5 w-5 text-white" />
          </div>
        )
      case 'current':
        return (
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center animate-pulse">
            <Clock className="h-5 w-5 text-white" />
          </div>
        )
      case 'rejected':
        return (
          <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
            <X className="h-5 w-5 text-white" />
          </div>
        )
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
            <Circle className="h-5 w-5 text-gray-400" />
          </div>
        )
    }
  }

  const getStatusColor = (nodeStatus: string) => {
    switch (nodeStatus) {
      case 'completed':
        return 'text-green-600'
      case 'current':
        return 'text-primary font-medium'
      case 'rejected':
        return 'text-red-600'
      default:
        return 'text-slate-500'
    }
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-slate-600">排程流程进度</h4>
      </div>
      <div className="flex items-start justify-between overflow-x-auto pb-2">
        {nodes.map((node, index) => (
          <div key={node.key} className="flex items-start flex-shrink-0">
            <div className="flex flex-col items-center min-w-[140px] max-w-[160px]">
              {getStatusIcon(node.status)}
              <span className={`text-xs mt-2 whitespace-nowrap font-medium text-center ${getStatusColor(node.status)}`}>
                {node.label}
              </span>
              {node.status === 'completed' && (
                <div className="flex flex-col items-center mt-2 w-full px-1">
                  {node.operator && (
                    <div className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs text-slate-700 mb-1 w-full text-center whitespace-nowrap">
                      {node.operator}
                    </div>
                  )}
                  {node.time && (
                    <span className="text-xs text-slate-500 text-center leading-tight">{formatDateTime(node.time)}</span>
                  )}
                  {!node.operator && !node.time && (
                    <span className="text-xs text-slate-500 mt-1">已完成</span>
                  )}
                </div>
              )}
              {node.status === 'current' && (
                <span className="text-xs text-primary mt-2 font-medium">待处理</span>
              )}
              {node.status === 'rejected' && (
                <div className="flex flex-col items-center mt-2 w-full px-1">
                  {node.operator && (
                    <div className="px-2 py-0.5 bg-red-50 border border-red-300 rounded text-xs text-red-700 mb-1 w-full text-center whitespace-nowrap">
                      {node.operator}
                    </div>
                  )}
                  {node.time && (
                    <span className="text-xs text-red-600 text-center leading-tight">{formatDateTime(node.time)}</span>
                  )}
                  {!node.operator && <span className="text-xs text-red-600 mt-1">已退回</span>}
                </div>
              )}
              {node.status === 'pending' && <div className="h-[60px] mt-2" />}
            </div>
            {index < nodes.length - 1 && (
              <div className="flex items-center mx-2 flex-1 min-w-[40px] pt-4">
                <div
                  className={`h-0.5 flex-1 ${
                    node.status === 'completed'
                      ? 'bg-green-500'
                      : node.status === 'rejected'
                        ? 'bg-red-500'
                        : 'bg-gray-200'
                  }`}
                />
                <ArrowRight
                  className={`h-4 w-4 mx-1 flex-shrink-0 ${
                    node.status === 'completed'
                      ? 'text-green-500'
                      : node.status === 'rejected'
                        ? 'text-red-500'
                        : 'text-gray-300'
                  }`}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
