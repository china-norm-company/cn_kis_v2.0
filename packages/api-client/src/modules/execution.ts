/**
 * 执行管理 API 模块（签到/依从/礼金/客服工单）
 *
 * 对应后端：/api/v1/execution/
 */
import { api } from '../client'
import type {
  SubjectCheckin,
  ComplianceRecord,
  SubjectPayment,
  SupportTicket,
  SubjectProfile,
  TimelineEvent,
} from '../types'

export const executionApi = {
  // ========== 签到签出 ==========

  /** 受试者签到 */
  checkin(subjectId: number, data?: {
    enrollment_id?: number
    work_order_id?: number
    location?: string
  }) {
    return api.post<{ id: number; checkin_date: string; status: string }>(
      `/execution/${subjectId}/checkin`, data,
    )
  },

  /** 受试者签出 */
  checkout(checkinId: number) {
    return api.post<{ id: number; status: string; checkout_time: string | null }>(
      `/execution/checkins/${checkinId}/checkout`,
    )
  },

  /** 签到记录列表 */
  listCheckins(subjectId: number) {
    return api.get<{ items: SubjectCheckin[] }>(`/execution/${subjectId}/checkins`)
  },

  /** 新建预约（含访视点、项目；拼音首字母由用户手动填写） */
  createAppointment(subjectId: number, data: {
    appointment_date: string
    appointment_time?: string
    purpose?: string
    visit_point?: string
    enrollment_id?: number
    project_code?: string
    project_name?: string
    name_pinyin_initials?: string
  }) {
    return api.post<{ id: number }>(`/execution/${subjectId}/appointments`, data)
  },

  /** 批量导入预约（Excel 中「首字母」列映射为 name_pinyin_initials，「联络员」列映射为 liaison） */
  importAppointments(items: Array<{
    subject_phone?: string
    subject_no?: string
    subject_id?: number
    subject_name?: string
    name_pinyin_initials?: string
    liaison?: string
    gender?: string
    age?: number
    appointment_date: string
    appointment_time?: string
    purpose?: string
    visit_point?: string
    project_code?: string
    project_name?: string
  }>) {
    return api.post<{ created: number; errors: Array<{ row: number; msg: string }> }>(
      '/execution/appointments/import',
      { items },
    )
  },

  // ========== 依从性 ==========

  /** 依从性记录列表 */
  listCompliance(subjectId: number) {
    return api.get<{ items: ComplianceRecord[] }>(`/execution/${subjectId}/compliance`)
  },

  /** 记录依从性评估 */
  assessCompliance(subjectId: number, data: {
    enrollment_id?: number
    visit_attendance_rate?: number
    questionnaire_completion_rate?: number
    time_window_deviation_days?: number
    notes?: string
  }) {
    return api.post<{ id: number; overall_score: string; level: string }>(
      `/execution/${subjectId}/compliance`, data,
    )
  },

  // ========== 礼金支付 ==========

  /** 创建礼金支付 */
  createPayment(subjectId: number, data: {
    payment_type: string
    amount: number | string
    enrollment_id?: number
    notes?: string
  }) {
    return api.post<{ id: number; payment_no: string; status: string }>(
      `/execution/${subjectId}/payment`, data,
    )
  },

  /** 发起支付 */
  initiatePayment(paymentId: number) {
    return api.post<{ id: number; status: string }>(`/execution/payments/${paymentId}/initiate`)
  },

  /** 确认支付完成 */
  confirmPayment(paymentId: number, data?: {
    transaction_id?: string
    payment_method?: string
    notes?: string
  }) {
    return api.post<{ id: number; status: string }>(`/execution/payments/${paymentId}/confirm`, data)
  },

  /** 礼金记录列表 */
  listPayments(subjectId: number) {
    return api.get<{ items: SubjectPayment[] }>(`/execution/${subjectId}/payments`)
  },

  // ========== 客服工单（B端） ==========

  /** 客服工单列表 */
  listSupportTickets(params?: { status?: string }) {
    return api.get<{ items: SupportTicket[] }>('/execution/support-tickets', { params })
  },

  /** 回复客服工单 */
  replySupportTicket(ticketId: number, reply: string) {
    return api.post<{ id: number; status: string }>(
      `/execution/support-tickets/${ticketId}/reply`, { reply },
    )
  },

  /** 指派客服工单 */
  assignSupportTicket(ticketId: number, assignedToId: number) {
    return api.post<{ id: number; status: string }>(
      `/execution/support-tickets/${ticketId}/assign`,
      { assigned_to_id: assignedToId },
    )
  },

  /** 关闭客服工单 */
  closeSupportTicket(ticketId: number) {
    return api.post<{ id: number; status: string }>(`/execution/support-tickets/${ticketId}/close`)
  },

  // ========== 受试者档案（扩展端点） ==========

  /** 获取受试者档案 */
  getSubjectProfile(subjectId: number) {
    return api.get<SubjectProfile>(`/subject/${subjectId}/profile`)
  },

  /** 更新受试者档案 */
  updateSubjectProfile(subjectId: number, data: Partial<SubjectProfile>) {
    return api.put<SubjectProfile>(`/subject/${subjectId}/profile`, data)
  },

  /** 获取受试者时间线 */
  getSubjectTimeline(subjectId: number, params?: {
    enrollment_id?: number
    start_date?: string
    end_date?: string
  }) {
    return api.get<{ items: TimelineEvent[] }>(`/subject/${subjectId}/timeline`, { params })
  },

  /** 获取受试者全链路轨迹 */
  getSubjectJourney(subjectId: number) {
    return api.get<{
      events: Array<{ stage: string; time: string; title: string; status: string }>
      stage_stats: Record<string, number>
    }>(`/subject/${subjectId}/journey`)
  },

  /** 获取旅程统计 */
  getJourneyStats() {
    return api.get<{
      window: { from: string; to: string }
      checkin_count: number
      checkout_count: number
      no_show_count: number
      support_open: number
      support_closed: number
      withdrawn_subjects: number
    }>('/subject/journey/stats')
  },

  /** 获取受试者领域档案 */
  getDomainProfile(subjectId: number, domain: string) {
    return api.get<Record<string, unknown>>(`/subject/${subjectId}/domain-profile/${domain}`)
  },

  /** 更新受试者领域档案 */
  updateDomainProfile(subjectId: number, domain: string, data: Record<string, unknown>) {
    return api.put<Record<string, unknown>>(`/subject/${subjectId}/domain-profile/${domain}`, data)
  },

  /** 获取医学史列表 */
  listMedicalHistory(subjectId: number) {
    return api.get<{ items: Record<string, unknown>[] }>(`/subject/${subjectId}/medical-history`)
  },

  /** 获取过敏记录 */
  listAllergies(subjectId: number) {
    return api.get<{ items: Record<string, unknown>[] }>(`/subject/${subjectId}/allergies`)
  },

  /** 获取用药记录 */
  listMedications(subjectId: number) {
    return api.get<{ items: Record<string, unknown>[] }>(`/subject/${subjectId}/medications`)
  },

  /** 批量创建支付 */
  batchCreatePayments(data: {
    subject_ids: number[]
    payment_type: string
    amount: string
    notes?: string
  }) {
    return api.post<{ created_count: number }>('/execution/payments/batch-create', data)
  },

  /** 支付汇总统计 */
  getPaymentSummary(params?: { plan_id?: number }) {
    return api.get<{
      total_amount: number; paid_amount: number; pending_amount: number
      total_count: number; paid_count: number; pending_count: number
    }>('/execution/payments/summary', { params })
  },

  // ========== 维周排程（与衡技「我的排程」同源，供接待台等调用） ==========

  /** 我的排程（按周或按月；可选按姓名查他人排程） */
  mySchedule(weekOffset = 0, monthOffset?: number, personName?: string) {
    const params = monthOffset !== undefined
      ? { month_offset: monthOffset, person_name: personName }
      : { week_offset: weekOffset, person_name: personName }
    return api.get<{
      week_start: string
      week_end: string
      daily_schedule: Record<string, Array<{
        id: number
        title: string
        status: string
        scheduled_date: string | null
        [key: string]: unknown
      }>>
      daily_notes?: Record<string, Array<{ id: number; title?: string; equipment?: string; project_no?: string; room_no?: string }>>
      daily_attachments?: Record<string, Array<{ id: number; file_name: string; file_url: string }>>
      global_attachments?: Array<{ id: number; file_name: string; file_url: string }>
      total_this_week: number
      next_week_count: number
      query_person_name?: string
      resolved_account_id?: number
      is_fallback_to_current_user?: boolean
    }>('/execution/my-schedule', { params })
  },
}
