/**
 * 排程管理 API 模块
 *
 * 对应后端：/api/v1/scheduling/
 */
import { api } from '../client'
import type {
  ApiListResponse,
  SchedulePlan,
  ScheduleSlot,
  SchedulePlanCreateIn,
  SlotUpdateIn,
  ScheduleMilestone,
  SchedulePrediction,
} from '../types'

export const schedulingApi = {
  /** 排程计划列表（分页 + 筛选） */
  listPlans(params?: {
    status?: string
    visit_plan_id?: number
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<SchedulePlan>['data']>('/scheduling/plans/list', { params })
  },

  /** 创建排程计划 */
  createPlan(data: SchedulePlanCreateIn) {
    return api.post<SchedulePlan>('/scheduling/plans/create', data)
  },

  /** 获取排程详情（含时间槽） */
  getPlan(planId: number) {
    return api.get<SchedulePlan & { slots: ScheduleSlot[] }>(`/scheduling/plans/${planId}`)
  },

  /** 生成时间槽 */
  generateSlots(planId: number, data?: { default_start_time?: string; default_end_time?: string }) {
    return api.post<ScheduleSlot[]>(`/scheduling/plans/${planId}/generate`, data ?? {})
  },

  /** 冲突检测 */
  detectConflicts(planId: number) {
    return api.get<Array<{
      type: string
      severity: string
      slot_id: number
      conflict_with_slot_id?: number
      resource_item_id?: number
      message: string
    }>>(`/scheduling/plans/${planId}/conflicts`)
  },

  /** 发布排程 */
  publishPlan(planId: number) {
    return api.post<SchedulePlan>(`/scheduling/plans/${planId}/publish`)
  },

  /** 按日期范围查询时间槽 */
  listSlots(params?: {
    start_date?: string
    end_date?: string
    assigned_to_id?: number
    plan_id?: number
    status?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<ScheduleSlot>['data']>('/scheduling/slots', { params })
  },

  /** 更新时间槽 */
  updateSlot(slotId: number, data: SlotUpdateIn) {
    return api.put<ScheduleSlot>(`/scheduling/slots/${slotId}`, data)
  },

  /** 添加里程碑 */
  addMilestone(planId: number, data: { milestone_type: string; name: string; target_date: string; notes?: string }) {
    return api.post<{ id: number; name: string; target_date: string }>(
      `/scheduling/plans/${planId}/milestones/create`, data,
    )
  },

  /** 里程碑列表 */
  listMilestones(planId: number) {
    return api.get<{ items: ScheduleMilestone[] }>(`/scheduling/plans/${planId}/milestones`)
  },

  /** S5-1: 跨项目排程概览 */
  crossProjectOverview() {
    return api.get<{
      plans: Array<{
        plan_id: number
        plan_name: string
        status: string
        start_date: string
        end_date: string
        protocol_title: string
        total_slots: number
        completed_slots: number
        conflict_slots: number
        completion_rate: number
      }>
      total_plans: number
      total_conflicts: number
    }>('/scheduling/cross-project-overview')
  },

  /** 排程进度预测 */
  predictProgress(planId: number) {
    return api.get<SchedulePrediction>(`/scheduling/plans/${planId}/predict`)
  },
}
