/**
 * 前台接待 API 模块
 *
 * 对应后端：/api/v1/reception/
 */
import { api } from '../client'

export interface QueueItem {
  appointment_id: number | null
  subject_id: number
  subject_name: string
  subject_no: string
  /** 姓名拼音首字母缩写 */
  name_pinyin_initials?: string
  /** SC号：签到时按项目生成，同一项目+受试者跨访视不变 */
  sc_number?: string
  /** RD号，逻辑待定，暂空 */
  rd_number?: string
  gender?: string
  age?: number | null
  appointment_time: string
  purpose: string
  /** 手机号（预约列表展示用） */
  phone?: string
  /** 联络员 */
  liaison?: string
  /** 备注 */
  notes?: string
<<<<<<< HEAD
=======
  visit_point?: string
  project_name?: string
  project_code?: string
>>>>>>> origin/main
  task_type: 'pre_screening' | 'screening' | 'visit' | 'extra_visit' | 'walk_in'
  status: 'waiting' | 'checked_in' | 'in_progress' | 'checked_out' | 'no_show'
  checkin_id: number | null
  checkin_time: string | null
  checkout_time: string | null
  enrollment_id: number | null
  visit_point: string
  project_code: string
  project_name: string
}

export interface TodayQueue {
  items: QueueItem[]
  date: string
  total?: number
  page?: number
  page_size?: number
}

export interface AppointmentCalendarDay {
  date: string
  total: number
}

export interface AppointmentCalendar {
  month: string
  items: AppointmentCalendarDay[]
}

export interface TodayStats {
  date: string
  total_appointments: number
  checked_in: number
  in_progress: number
  checked_out: number
  no_show: number
  total_signed_in: number
  /** 已签到总人数（签出不减）= checked_in + in_progress + checked_out */
  signed_in_count: number
  /** 无预约临时到访人数 */
  walk_in_count: number
}

export interface CheckinResult {
  id: number
  subject_id: number
  subject_name: string
  subject_no: string
  checkin_date: string
  checkin_time: string | null
  checkout_time: string | null
  status: string
  location: string
  notes: string
  warnings?: string[]
}

export interface AlertItem {
  type: 'no_show' | 'overtime'
  level: 'warning' | 'info'
  subject_name: string
  subject_no: string
  message: string
  appointment_id?: number
  checkin_id?: number
}

export interface FlowcardStep {
  sequence: number
  workorder_id: number
  workorder_no: string
  title: string
  status: 'pending' | 'doing' | 'done'
  scheduled_date: string | null
  visit_node_id: number | null
  visit_activity_id: number | null
}

export interface FlowcardData {
  checkin_id: number
  subject_id: number
  subject_no: string
  subject_name: string
  checkin_time: string | null
  enrollment_id: number | null
  estimate_minutes: number
  message: string
  steps: FlowcardStep[]
}

export interface FlowcardProgress {
  checkin_id: number
  total_steps: number
  done_steps: number
  doing_steps: number
  pending_steps: number
  progress_percent: number
  current_step: FlowcardStep | null
  steps: FlowcardStep[]
}

export const receptionApi = {
  /** 今日受试者队列（支持分页、项目筛选） */
  todayQueue(
    dateOrParams?: string | { target_date?: string; page?: number; page_size?: number; project_code?: string },
  ) {
    const params = typeof dateOrParams === 'string' ? { target_date: dateOrParams } : dateOrParams
    const p: Record<string, string | number | undefined> = {}
    if (params?.target_date) p.target_date = params.target_date
    if (params?.page != null) p.page = params.page
    if (params?.page_size != null) p.page_size = params.page_size
    if (params?.project_code != null && params.project_code !== '') p.project_code = params.project_code
    return api.get<TodayQueue>('/reception/today-queue', { params: Object.keys(p).length ? p : undefined })
  },

  /** 今日队列导出数据（按日期/项目/状态筛选，不含手机号） */
  todayQueueExport(params?: { target_date?: string; project_code?: string; status?: string }) {
    const p: Record<string, string | undefined> = {}
    if (params?.target_date) p.target_date = params.target_date
    if (params?.project_code != null && params.project_code !== '') p.project_code = params.project_code
    if (params?.status != null && params.status !== '') p.status = params.status
    return api.get<{ items: QueueItem[]; date: string; total: number }>(
      '/reception/today-queue/export',
      { params: Object.keys(p).length ? p : undefined },
    )
  },

  /** 预约月历统计（按月返回每天预约数） */
  appointmentCalendar(targetMonth?: string) {
    return api.get<AppointmentCalendar>('/reception/appointment-calendar', {
      params: targetMonth ? { target_month: targetMonth } : undefined,
    })
  },

  /** 今日统计 */
  todayStats(date?: string, projectCode?: string) {
    const params: Record<string, string> = {}
    if (date) params.target_date = date
    if (projectCode) params.project_code = projectCode
    return api.get<TodayStats>('/reception/today-stats', { params: Object.keys(params).length ? params : undefined })
  },

  /** 快速签到 */
  quickCheckin(data: { subject_id: number; method?: string; location?: string }) {
    return api.post<CheckinResult>('/reception/quick-checkin', data)
  },

  /** 快速签出 */
  quickCheckout(checkinId: number) {
    return api.post<CheckinResult>('/reception/quick-checkout', { checkin_id: checkinId })
  },

  /** 待处理提醒 */
  pendingAlerts(date?: string) {
    return api.get<{ items: AlertItem[]; total: number }>(
      '/reception/pending-alerts', { params: date ? { target_date: date } : undefined },
    )
  },

  /** 生成流程卡 */
  printFlowcard(checkinId: number) {
    return api.post<FlowcardData>(`/reception/print-flowcard/${checkinId}`)
  },

  /** 流程卡进度 */
  flowcardProgress(checkinId: number) {
    return api.get<FlowcardProgress>(`/reception/flowcard/${checkinId}/progress`)
  },

  /** 叫号 */
  callNext(stationId: string = 'default') {
    return api.post<CallNextResult>('/reception/call-next', null, { params: { station_id: stationId } })
  },

  /** 查询排位 */
  queuePosition(subjectId: number) {
    return api.get<QueuePosition>(`/reception/queue-position/${subjectId}`)
  },

  /** 大屏展示数据 */
  displayBoard(date?: string) {
    return api.get<DisplayBoard>('/reception/display-board-data', { params: date ? { target_date: date } : undefined })
  },

  /** 扫码签到 */
  scanCheckin(qrData: string) {
    return api.post<CheckinResult>('/reception/scan-checkin', { qr_data: qrData })
  },

  /** 标记缺席 */
  markNoShow(appointmentId: number) {
    return api.post<{ appointment_id: number; subject_id: number; subject_name: string; status: string }>(
      '/reception/mark-no-show',
      { appointment_id: appointmentId },
    )
  },

  /** 无预约临时到访补登 */
  walkInRegister(data: {
    name: string
    phone: string
    gender?: string
    purpose?: string
    auto_checkin?: boolean
  }) {
    return api.post<WalkInResult>('/reception/walk-in-register', data)
  },

  /** 接待分析 */
  analytics(date?: string, days: number = 7) {
    return api.get<ReceptionAnalytics>('/reception/analytics', {
      params: { ...(date ? { target_date: date } : {}), days },
    })
  },

  /** 智能洞察 */
  insights(date?: string, days: number = 7) {
    return api.get<ReceptionInsights>('/reception/insights', {
      params: { ...(date ? { target_date: date } : {}), days },
    })
  },

  /** 跨工作台状态回写 */
  crossWorkstationSync(data: {
    enrollment_id: number
    reception_status: string
    recruitment_status?: string
    workorder_status?: string
    quality_event_id?: number
  }) {
    return api.post<{ enrollment_id: number; changes: Record<string, unknown> }>('/reception/cross-workstation-sync', data)
  },
}

export interface CallNextResult {
  called: boolean
  subject?: {
    subject_id: number
    subject_no: string
    name: string
    checkin_id: number
    checkin_time: string
  }
  station?: string
  message?: string
}

export interface QueuePosition {
  position: number
  ahead_count?: number
  wait_minutes: number
  status: string
  checkin_time?: string
}

export interface CheckinQrcode {
  content: string
  expires_date: string
}

export interface DisplayBoard {
  serving: DisplayEntry[]
  waiting: DisplayEntry[]
  waiting_total: number
  completed_count: number
  date: string
  /** 当日签到二维码（供大屏展示） */
  checkin_qrcode?: {
    content: string
    valid_date: string
    station_label: string
  }
}

export interface DisplayEntry {
  subject_no_tail: string
  name_masked: string
  checkin_time: string
  status: string
}

export interface WalkInResult {
  subject_id: number
  subject_no: string
  subject_name: string
  phone_masked: string
  appointment_id: number
  is_new_subject: boolean
  checkin: null | {
    id: number
    status: string
    checkin_time: string | null
  }
}

export interface ReceptionAnalytics {
  window: { from: string; to: string }
  metrics: {
    total_appointments: number
    sign_in_rate: number
    no_show_rate: number
    avg_wait_minutes: number
    process_completion_rate: number
    ticket_closure_rate: number
  }
  trend: Array<{
    date: string
    appointments: number
    checked_out: number
    no_show: number
    completion_rate: number
  }>
}

export interface ReceptionInsights {
  generated_at: string
  insights: string[]
  metrics: ReceptionAnalytics['metrics']
}
