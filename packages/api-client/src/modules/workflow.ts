/**
 * 工作流/变更管理 API 模块
 *
 * 对应后端：/api/v1/workflow/
 */
import { api } from '../client'
import type {
  ApiListResponse,
  WorkflowInstance,
  ChangeCreateIn,
  ImpactAnalysis,
} from '../types'

export const workflowApi = {
  /** 发起变更 */
  createChange(data: ChangeCreateIn) {
    return api.post<{ id: number; status: string }>('/workflow/changes/create', data)
  },

  /** 变更列表 */
  listChanges(params?: {
    business_type?: string
    status?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<WorkflowInstance>['data']>('/workflow/changes/list', { params })
  },

  /** 变更影响分析 */
  getImpact(instanceId: number) {
    return api.get<ImpactAnalysis>(`/workflow/changes/${instanceId}/impact`)
  },

  /** 审批实例详情 */
  getInstance(instanceId: number) {
    return api.get<WorkflowInstance>(`/workflow/instances/${instanceId}`)
  },

  /** 审批通过 */
  approve(instanceId: number, comment?: string) {
    return api.post<WorkflowInstance>(`/workflow/instances/${instanceId}/approve`, { comment: comment || '' })
  },

  /** 审批驳回 */
  reject(instanceId: number, comment?: string) {
    return api.post<WorkflowInstance>(`/workflow/instances/${instanceId}/reject`, { comment: comment || '' })
  },
}
