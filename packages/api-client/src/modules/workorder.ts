/**
 * 工单管理 API 模块
 *
 * 对应后端：/api/v1/workorder/
 */
import { api } from '../client'
import type {
  ApiListResponse,
  WorkOrder,
  WorkOrderCreateIn,
  WorkOrderStats,
  WorkOrderQualityAudit,
} from '../types'

export const workorderApi = {
  /** 工单列表（分页 + 筛选） */
  list(params?: {
    enrollment_id?: number
    visit_node_id?: number
    assigned_to?: number
    status?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiListResponse<WorkOrder>['data']>('/workorder/list', { params })
  },

  /** 获取当前用户今日工单 */
  myToday() {
    return api.get<WorkOrder[]>('/workorder/my-today')
  },

  /** 工单统计 */
  stats(params?: { enrollment_id?: number; assigned_to?: number }) {
    return api.get<WorkOrderStats>('/workorder/stats', { params })
  },

  /** 工单详情 */
  get(id: number) {
    return api.get<WorkOrder>(`/workorder/${id}`)
  },

  /** 创建工单 */
  create(data: WorkOrderCreateIn) {
    return api.post<{ id: number; title: string; status: string }>('/workorder/create', data)
  },

  /** 分配工单 */
  assign(id: number, data: { assigned_to: number; due_date?: string }) {
    return api.post<{ id: number; assigned_to: number; due_date: string | null }>(
      `/workorder/${id}/assign`, data,
    )
  },

  /** 开始处理 */
  start(id: number) {
    return api.post<WorkOrder>(`/workorder/${id}/start`)
  },

  /** 完成工单 */
  complete(id: number) {
    return api.post<WorkOrder>(`/workorder/${id}/complete`)
  },

  /** 批准工单 */
  approve(id: number) {
    return api.post<WorkOrder>(`/workorder/${id}/approve`)
  },

  /** 拒绝工单 */
  reject(id: number) {
    return api.post<WorkOrder>(`/workorder/${id}/reject`)
  },

  /** 取消工单 */
  cancel(id: number) {
    return api.post<WorkOrder>(`/workorder/${id}/cancel`)
  },

  /** 自动生成工单（从排程计划） */
  generate(schedulePlanId: number) {
    return api.post<{ count: number; work_order_ids: number[] }>(
      '/workorder/generate', { schedule_plan_id: schedulePlanId },
    )
  },

  /** 批量自动分配 */
  autoAssignBatch(workOrderIds: number[]) {
    return api.post('/workorder/auto-assign', { work_order_ids: workOrderIds })
  },

  /** 单个工单自动分配 */
  autoAssign(id: number) {
    return api.post<WorkOrder>(`/workorder/${id}/auto-assign`)
  },

  /** 手动分配 */
  manualAssign(id: number, userId: number) {
    return api.post<WorkOrder>(`/workorder/${id}/manual-assign`, { user_id: userId })
  },

  /** 获取工单质量审计记录 */
  getQualityAudit(id: number) {
    return api.get<WorkOrderQualityAudit[]>(`/workorder/${id}/quality-audits`)
  },

  /** S5-4: 生成进展报告 */
  generateProgressReport(protocolId: number, reportDate?: string) {
    const params = reportDate ? { report_date: reportDate } : {}
    return api.get<{
      protocol_id: number
      report_date: string
      generated_at: string
      workorder_summary: {
        today_total: number
        today_completed: number
        today_in_progress: number
        today_completion_rate: number
        overall_total: number
        overall_completed: number
        overall_completion_rate: number
        overdue_count: number
      }
      exceptions: Array<{
        id: number
        type: string
        severity: string
        description: string
        status: string
        work_order_id: number
      }>
      sample_status: Record<string, number>
      tomorrow_preview: {
        date: string
        total_scheduled: number
        subjects_count: number
      }
      highlights: string[]
      issues: string[]
    }>(`/workorder/progress-report/${protocolId}`, { params })
  },

  /** S5-4: 发送进展报告到飞书 */
  sendProgressReport(protocolId: number, data: {
    report_date?: string
    chat_id?: string
    open_id?: string
  }) {
    return api.post(`/workorder/progress-report/${protocolId}/send`, data)
  },

  /** P4-3: 工单评论列表 */
  listComments(workOrderId: number) {
    return api.get<Array<{
      id: number
      work_order_id: number
      author_id: number
      author_name: string
      content: string
      create_time: string
    }>>(`/workorder/${workOrderId}/comments`)
  },

  /** P4-3: 添加工单评论 */
  addComment(workOrderId: number, data: { content: string }) {
    return api.post<{
      id: number
      work_order_id: number
      author_id: number
      author_name: string
      content: string
      create_time: string
    }>(`/workorder/${workOrderId}/comments`, data)
  },

  /** P3-4: 告警配置列表 */
  alertConfigs() {
    return api.get<Array<{
      id: number
      alert_type: string
      threshold: number
      level: string
      is_enabled: boolean
    }>>('/workorder/alert-configs')
  },

  /** P3-4: 创建告警配置 */
  createAlertConfig(data: { alert_type: string; threshold: number; level: string; is_enabled?: boolean }) {
    return api.post<{ id: number }>('/workorder/alert-configs', data)
  },

  /** P4-4: 自动通报配置 */
  autoReportConfig(protocolId: number, data: { enabled: boolean }) {
    return api.put<{ protocol_id: number; enabled: boolean }>(
      `/workorder/auto-report-config/${protocolId}`, data,
    )
  },

  /** P2-3: 提交审批 */
  submitForReview(workOrderId: number) {
    return api.post<{ id: number; status: string }>(`/workorder/${workOrderId}/review`)
  },

  /** S5-3: 获取项目执行上下文 */
  getProjectContext(protocolId: number) {
    return api.get<{
      id: number
      protocol_id: number
      key_requirements: Array<{ category: string; content: string; priority: string }>
      special_notes: string
      execution_guidelines: Record<string, string>
      updated_by: number | null
      update_time: string
      decision_logs: Array<{
        id: number
        decision_type: string
        scope: string
        title: string
        description: string
        rationale: string
        impact: string
        outcome: string
        decided_by: number
        decision_time: string
      }>
      change_responses: Array<{
        id: number
        change_source: string
        change_description: string
        impact_assessment: string
        response_actions: Array<{ action: string; assignee_id: number; deadline: string; status: string }>
        status: string
        received_at: string
      }>
    } | null>(`/workorder/project-context/${protocolId}`)
  },

  /** S5-3: 创建/更新项目执行上下文 */
  upsertProjectContext(protocolId: number, data: {
    key_requirements?: Array<{ category: string; content: string; priority: string }>
    special_notes?: string
    execution_guidelines?: Record<string, string>
  }) {
    return api.post<{ id: number; protocol_id: number }>(
      `/workorder/project-context/${protocolId}`, data,
    )
  },

  /** S5-3: 添加CRC决策日志 */
  addDecisionLog(protocolId: number, data: {
    work_order_id?: number
    decision_type: string
    scope?: string
    title: string
    description: string
    rationale?: string
    impact?: string
  }) {
    return api.post<{ id: number; title: string }>(
      `/workorder/project-context/${protocolId}/decisions`, data,
    )
  },

  /** S5-3: 添加变更响应 */
  addChangeResponse(protocolId: number, data: {
    change_source: string
    change_description: string
    impact_assessment?: string
    response_actions?: Array<{ action: string; assignee_id: number; deadline: string; status: string }>
  }) {
    return api.post<{ id: number; status: string }>(
      `/workorder/project-context/${protocolId}/change-responses`, data,
    )
  },

  /** S5-1: CRC主管仪表盘 */
  crcDashboard() {
    return api.get<{
      project_progress: Array<{
        protocol_id: number
        protocol_title: string
        total: number
        completed: number
        in_progress: number
        pending: number
        overdue: number
        completion_rate: number
      }>
      crc_workload: Array<{
        user_id: number
        user_name: string
        active_count: number
        project_count: number
        overdue_count: number
        today_count: number
      }>
      pending_decisions: Array<{
        type: string
        id: number
        title: string
        description: string
        work_order_id: number
        work_order_title: string
        severity: string
        created_at: string
      }>
      risk_alerts: Array<{
        type: string
        level: string
        message: string
        count: number
      }>
      summary: {
        total_work_orders: number
        today_scheduled: number
        active_work_orders: number
        completed_today: number
      }
    }>('/workorder/crc-dashboard')
  },

  /** S5-1: CRC协调员仪表盘 */
  crcMyDashboard() {
    return api.get<{
      my_projects: Array<{
        protocol_id: number
        protocol_title: string
        total: number
        completed: number
        in_progress: number
        pending: number
        completion_rate: number
      }>
      today_timeline: Array<{
        id: number
        title: string
        status: string
        scheduled_date: string | null
        due_date: string | null
        start_time?: string | null
        end_time?: string | null
        work_order_type: string
        protocol_id?: number
        protocol_title?: string
        subject_name?: string
        visit_node_name?: string
      }>
      my_stats: {
        total_active: number
        today_scheduled: number
        today_completed: number
        week_completed: number
        overdue: number
      }
      recent_exceptions: Array<{
        id: number
        work_order_id: number
        exception_type: string
        severity: string
        status: string
        description: string
        created_at: string
      }>
    }>('/workorder/crc-my-dashboard')
  },

  /** S5-1: 排程专员仪表盘 */
  schedulerDashboard() {
    return api.get<{
      pending_assignment: {
        total: number
        items: Array<{
          id: number
          title: string
          scheduled_date: string | null
          due_date: string | null
          work_order_type: string
        }>
      }
      resource_overview: {
        equipment: { total: number; active: number; calibration_due: number }
        personnel: { total: number; on_duty: number }
        venue: { total: number; available: number }
      }
      conflict_warnings: Array<{
        slot_id: number
        plan_id: number
        plan_name: string
        visit_node_name: string
        scheduled_date: string
        conflict_reason: string
      }>
      weekly_capacity: {
        week_start: string
        week_end: string
        total_scheduled: number
        total_completed: number
        daily: Array<{ date: string; total: number; completed: number }>
      }
    }>('/workorder/scheduler-dashboard')
  },

  /** P2-2: 确认SOP已阅读 */
  confirmSop(workOrderId: number) {
    return api.post<{ id: number; sop_confirmed: boolean }>(
      `/workorder/${workOrderId}/confirm-sop`,
    )
  },

  /** P3.3: 获取工单检查清单 */
  getChecklists(workOrderId: number) {
    return api.get<Array<{
      id: number
      sequence: number
      item_text: string
      is_mandatory: boolean
      is_checked: boolean
      checked_at: string | null
      checked_by: number | null
    }>>(`/workorder/${workOrderId}/checklists`)
  },

  /** P3.3: 勾选/取消检查项 */
  toggleChecklist(workOrderId: number, checklistId: number, data: { is_checked: boolean }) {
    return api.post<{ id: number; is_checked: boolean; checked_at: string | null }>(
      `/workorder/${workOrderId}/checklists/${checklistId}/toggle`, data,
    )
  },

  /** S5-5: KPI绩效指标 */
  analyticsKpi(params?: {
    date_from?: string
    date_to?: string
    protocol_id?: number
    assigned_to?: number
  }) {
    return api.get<{
      on_time_completion_rate: number
      quality_audit_pass_rate: number
      exception_rate: number
      equipment_utilization: number
      avg_workorders_per_person: number
      avg_turnaround_hours: number | null
      details: {
        total_workorders: number
        completed_workorders: number
        on_time_completed: number
        total_audits: number
        passed_audits: number
        total_exceptions: number
        total_equipment: number
        assignee_count: number
      }
    }>('/workorder/analytics/kpi', { params })
  },

  /** P4.4: 分析概览 */
  analyticsSummary(params?: {
    date_from?: string
    date_to?: string
    protocol_id?: number
    assigned_to?: number
  }) {
    return api.get<{
      status_distribution: Array<{ status: string; count: number }>
      daily_trend: Array<{ day: string; created: number; completed: number }>
      by_assignee: Array<{ assigned_to: number; total: number; completed: number }>
      summary: { total: number; completed: number; completion_rate: number; overdue: number; overdue_rate: number }
    }>('/workorder/analytics/summary', { params })
  },

  /** P4.4: 导出工单数据 */
  analyticsExportUrl(params?: { date_from?: string; date_to?: string; format?: string }) {
    const base = '/workorder/analytics/export'
    const qs = new URLSearchParams()
    if (params?.date_from) qs.set('date_from', params.date_from)
    if (params?.date_to) qs.set('date_to', params.date_to)
    if (params?.format) qs.set('format', params.format)
    return `${base}?${qs.toString()}`
  },
}
