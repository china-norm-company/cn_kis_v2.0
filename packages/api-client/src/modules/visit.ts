/**
 * 访视管理 API 模块
 *
 * 对应后端：/api/v1/visit/
 */
import { api } from '../client'
import type {
  ApiListResponse,
  VisitPlan,
  VisitNode,
  VisitActivity,
} from '../types'

export const visitApi = {
  // ===== 访视计划 =====

  /** 访视计划列表 */
  listPlans(params?: {
    protocol_id?: number; status?: string;
    page?: number; page_size?: number
  }) {
    return api.get<ApiListResponse<VisitPlan>['data']>('/visit/plans', { params })
  },

  /** 访视计划详情 */
  getPlan(id: number) {
    return api.get<VisitPlan>(`/visit/plans/${id}`)
  },

  /** 创建访视计划 */
  createPlan(data: { protocol_id: number; name: string; description?: string }) {
    return api.post<VisitPlan>('/visit/plans/create', data)
  },

  // ===== 访视节点 =====

  /** 访视节点列表 */
  listNodes(planId: number) {
    return api.get<VisitNode[]>(`/visit/plans/${planId}/nodes`)
  },

  /** 创建访视节点 */
  createNode(planId: number, data: {
    name: string; baseline_day: number; window_before?: number; window_after?: number
  }) {
    return api.post<VisitNode>(`/visit/plans/${planId}/nodes/create`, data)
  },

  // ===== 访视活动 =====

  /** 访视活动列表 */
  listActivities(nodeId: number) {
    return api.get<VisitActivity[]>(`/visit/nodes/${nodeId}/activities`)
  },

  /** 创建访视活动 */
  createActivity(nodeId: number, data: {
    name: string; activity_type: string; description?: string;
    is_required?: boolean; activity_template_id?: number
  }) {
    return api.post<VisitActivity>(`/visit/nodes/${nodeId}/activities/create`, data)
  },

  // ===== AI 自动生成 =====

  /** 从协议自动生成访视计划 */
  autoGenerate(protocolId: number) {
    return api.post(`/visit/plans/auto-generate`, { protocol_id: protocolId })
  },

  /** 资源需求汇总 */
  getResourceDemand(planId: number) {
    return api.get(`/visit/plans/${planId}/resource-demand`)
  },

  /** 合规性检查 */
  checkCompliance(planId: number) {
    return api.get(`/visit/plans/${planId}/compliance`)
  },

  /** 访视执行列表（执行视角） */
  executionList(params?: {
    protocol_id?: number
    status?: string
    page?: number
    page_size?: number
  }) {
    return api.get<{
      items: Array<{
        id: number
        plan_id: number
        protocol_id: number | null
        protocol_title: string
        name: string
        code: string
        baseline_day: number
        window_before: number
        window_after: number
        order: number
        slot_status: string
        slot_date: string | null
        workorder_total: number
        workorder_completed: number
        completion_rate: number
      }>
      total: number
      page: number
      page_size: number
    }>('/visit/execution-list', { params })
  },

  /** 访视窗口期告警 */
  windowAlerts() {
    return api.get<{
      items: Array<{
        slot_id: number
        visit_node_id: number
        visit_node_name: string
        plan_name: string
        scheduled_date: string
        window_start: string
        window_end: string
        days_remaining: number
        severity: 'overdue' | 'critical' | 'warning'
        status: string
      }>
      total: number
    }>('/visit/window-alerts')
  },
}
