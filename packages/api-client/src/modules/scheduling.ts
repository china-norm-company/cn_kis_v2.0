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

/** 执行订单结构化摘要（供其他工作台只读接口使用） */
export interface ExecutionOrderSummaryItem {
  id: number
  project_code: string
  project_name: string
  group: string
  sample_size: string
  backup_sample_size: string
  visit_timepoints: string
  execution_period: string
  business_type: string
  client: string
  create_time: string
}

/** 执行订单整份详情（供其他工作台只读）：与详情页字段一致 */
export interface ExecutionOrderFullDetailItem {
  id: number
  create_time: string
  /** 所有表头→值（不含内部表），与详情页各模块字段对应 */
  fields: Record<string, unknown>
  equipment_table: Record<string, unknown>[]
  evaluation_table: Record<string, unknown>[]
  auxiliary_table: Record<string, unknown>[]
  consumable_table: Record<string, unknown>[]
}

/** 实验室排期单行（实验室项目运营安排模板解析结果，过渡功能） */
export interface LabScheduleRow {
  group?: string
  equipment_code?: string
  equipment?: string
  date?: string
  protocol_code?: string
  sample_size?: string | number
  person_role?: string
  room?: string
  day_group?: string
  [key: string]: unknown
}

/** 人员日历：某日一行 = 一人 + 一台设备 + 样本量（同人不同设备多行） */
export interface PersonCalendarDayEntry {
  person_role: string
  equipment: string
  sample_size: number
}

export const schedulingApi = {
  /** [仅DEBUG] 清空全部排程计划并可选重置已审批资源需求 */
  clearAllPlans(alsoResetApprovedDemands = true) {
    return api.post<{ deleted: number; detail: Record<string, number>; resource_demands_reset: number }>(
      '/scheduling/clear-demo-plans',
      undefined,
      { params: { also_reset_approved_demands: alsoResetApprovedDemands } },
    )
  },

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

  /** 获取最新时间线上传数据（执行台列表/甘特图用） */
  getTimelineUpload() {
    return api.get<{ items: Record<string, unknown>[] }>('/scheduling/timeline-upload')
  },

  /** 保存时间线上传数据（创建排程确认上传后调用） */
  saveTimelineUpload(rows: Record<string, unknown>[]) {
    return api.post<{ id: number; count: number }>('/scheduling/timeline-upload', { rows })
  },

  /** 发布一条时间线记录，对应排程计划一条记录 */
  publishTimelineRow(row: Record<string, unknown>) {
    return api.post<{ id: number }>('/scheduling/timeline-publish', { row })
  },

  /** 获取已发布的时间线记录（用于排程计划/时间槽列表） */
  getTimelinePublished() {
    return api.get<{ items: Array<Record<string, unknown>> }>('/scheduling/timeline-published')
  },

  /** 线下排程计划更新（仅数据来源=线下）：保存流程后更新 visit_blocks 或整份 snapshot */
  updateTimelinePublished(planId: number, payload: { visit_blocks?: Array<Record<string, unknown>>; snapshot?: Record<string, unknown> }) {
    return api.patch<{ id: number }>(`/scheduling/timeline-published/${planId}`, payload)
  },

  /** 时间槽详情（项目字段 + 行政/评估/技术排期，用于详情页） */
  getTimelinePublishedDetail(planId: number) {
    return api.get<{
      id: number
      snapshot: Record<string, unknown>
      create_time: string
      timeline_schedule_id: number | null
      order: { id: number; headers: string[]; rows: unknown[] } | null
      schedule: {
        id: number
        execution_order_id: number
        supervisor: string
        research_group: string
        t0_date: string | null
        split_days: number
        status: string
        admin_published: boolean
        eval_published: boolean
        tech_published: boolean
        payload: Record<string, unknown>
      } | null
    }>(`/scheduling/timeline-published/${planId}`)
  },

  /** 上传测试执行订单（解析结果展示在资源需求 Tab，并生成待排程任务） */
  saveExecutionOrder(payload: { headers: string[]; rows: unknown[] }) {
    return api.post<{ id: number; count: number }>('/scheduling/execution-order', payload)
  },

  /** 获取最新执行订单解析结果（排程待办等用） */
  getExecutionOrder() {
    return api.get<{ id?: number; headers: string[]; rows: unknown[] }>('/scheduling/execution-order')
  },

  /** 执行订单列表（资源需求 Tab 展示多条，每条上传为一行） */
  getExecutionOrders() {
    return api.get<{ items: Array<{ id: number; headers: string[]; rows: unknown[] }> }>('/scheduling/execution-orders')
  },

  /** 按 id 获取单条执行订单（详情页用） */
  getExecutionOrderById(id: number) {
    return api.get<{ id: number; headers: string[]; rows: unknown[] }>(`/scheduling/execution-order/${id}`)
  },

  /** 执行订单结构化列表（供其他工作台只读，字段：id, project_code, project_name, group, sample_size, backup_sample_size, visit_timepoints, execution_period, business_type, client, create_time） */
  getExecutionOrdersSummary() {
    return api.get<{ items: ExecutionOrderSummaryItem[] }>('/scheduling/execution-orders-summary')
  },

  /** 单条执行订单结构化摘要（供其他工作台只读） */
  getExecutionOrderSummary(id: number) {
    return api.get<ExecutionOrderSummaryItem>(`/scheduling/execution-order/${id}/summary`)
  },

  /** 单条执行订单整份详情（供其他工作台只读）：fields + equipment_table、evaluation_table、auxiliary_table、consumable_table */
  getExecutionOrderFullDetail(id: number) {
    return api.get<ExecutionOrderFullDetailItem>(`/scheduling/execution-order/${id}/full-detail`)
  },

  /** 更新单条执行订单（详情页编辑后保存） */
  updateExecutionOrder(id: number, payload: { headers: string[]; rows: unknown[] }) {
    return api.patch<{ id: number; count: number }>(`/scheduling/execution-order/${id}`, payload)
  },

  /** 执行订单待排程列表（用于排程计划列表合并展示） */
  getExecutionOrderPending() {
    return api.get<{ items: Array<Record<string, unknown>> }>('/scheduling/execution-order-pending')
  },

  /** 实验室排期整月数据（单次请求，用于接待台日历） */
  getLabScheduleByMonth(params: { year_month: string; person_role?: string }) {
    return api.get<{
      items: LabScheduleRow[]
      total: number
      source_file_name: string
    }>('/scheduling/lab-schedule/month', { params })
  },

  /** 人员日历：月视图汇总 + 明细行（导出按设备分行，不合并） */
  getLabSchedulePersonCalendar(params: {
    year_month: string
    person_role?: string
    equipment?: string
    all_data?: boolean
  }) {
    return api.get<{
      calendar_by_date: Record<string, PersonCalendarDayEntry[]>
      detail_rows: LabScheduleRow[]
      source_file_name: string
      filter_options: { person_roles: string[]; equipments: string[] }
    }>('/scheduling/lab-schedule/person-calendar', { params })
  },

  /** 实验室排期列表（分页+筛选，首页返回 filter_options 供前端下拉） */
  getLabScheduleList(params?: {
    page?: number
    page_size?: number
    person_role?: string
    equipment?: string
    date_filter?: string
  }) {
    return api.get<{
      items: LabScheduleRow[]
      total: number
      source_file_name: string
      filter_options?: { person_roles: string[]; equipments: string[] }
    }>('/scheduling/lab-schedule/list', {
      params: params
        ? {
            page: params.page,
            page_size: params.page_size,
            person_role: params.person_role,
            equipment: params.equipment,
            date_filter: params.date_filter,
          }
        : undefined,
    })
  },

  /** 上传实验室排期（实验室项目运营安排解析结果） */
  uploadLabSchedule(items: LabScheduleRow[], source_file_name?: string) {
    return api.post<{ count: number }>('/scheduling/lab-schedule/upload', { items, source_file_name: source_file_name ?? '' })
  },

  /** 清空实验室排期数据 */
  clearLabSchedule() {
    return api.post<{ deleted: number }>('/scheduling/lab-schedule/clear')
  },

  /** AI 解析评估计划表格块（锚点截取后的二维数组），失败时前端回退规则解析 */
  parseEvaluationBlock(block: string[][]) {
    return api.post<{ evaluationTable: Array<Record<string, string>> }>('/scheduling/parse-evaluation-block', {
      block,
    })
  },

  /** 排程核心：获取（无则创建草稿） */
  getScheduleCore(orderId: number) {
    return api.get<{
      id: number
      execution_order_id: number
      supervisor: string
      research_group: string
      t0_date: string | null
      split_days: number
      status: string
      admin_published: boolean
      eval_published: boolean
      tech_published: boolean
      post_publish_edit_count?: number
      payload: Record<string, unknown>
    }>(`/scheduling/execution-order/${orderId}/schedule-core`)
  },

  /** 排程核心：更新（时间线或 payload） */
  updateScheduleCore(
    orderId: number,
    payload: {
      supervisor?: string
      research_group?: string
      t0_date?: string | null
      split_days?: number
      payload?: Record<string, unknown>
    },
  ) {
    return api.patch<{
      id: number
      admin_published?: boolean
      eval_published?: boolean
      tech_published?: boolean
      status?: string
    }>(`/scheduling/execution-order/${orderId}/schedule-core`, payload)
  },

  /** 排程核心：发布时间线 */
  publishScheduleTimeline(orderId: number) {
    return api.post<{ status: string }>(`/scheduling/execution-order/${orderId}/schedule-core/publish-timeline`)
  },

  /** 排程核心：发布行政排程 */
  publishScheduleAdmin(orderId: number) {
    return api.post<{ admin_published: boolean; status: string }>(
      `/scheduling/execution-order/${orderId}/schedule-core/publish-admin`,
    )
  },

  /** 排程核心：发布评估排程 */
  publishScheduleEval(orderId: number) {
    return api.post<{ eval_published: boolean; status: string }>(
      `/scheduling/execution-order/${orderId}/schedule-core/publish-eval`,
    )
  },

  /** 排程核心：发布技术排程 */
  publishScheduleTech(orderId: number) {
    return api.post<{ tech_published: boolean; status: string }>(
      `/scheduling/execution-order/${orderId}/schedule-core/publish-tech`,
    )
  },

  /** 排程全部完成后：撤回再编辑（合计最多 3 次） */
  withdrawSchedulePersonnelForReedit(orderId: number) {
    return api.post<{ post_publish_edit_count: number; status: string }>(
      `/scheduling/execution-order/${orderId}/schedule-core/personnel-withdraw`,
    )
  },
}
