/**
 * 技术评估人员 API 模块
 *
 * 对应后端：/api/v1/evaluator/
 */
import { api } from '../client'
import type { ApiResponse } from '../types'

// ============================================================================
// 类型定义
// ============================================================================
export interface EvaluatorDashboard {
  date: string
  role: string
  stats: {
    pending: number
    accepted: number
    preparing: number
    in_progress: number
    completed: number
    total: number
  }
  work_orders: Record<string, unknown>[]
  waiting_subjects: WaitingSubject[]
  environment: EnvironmentStatus
  instruments: InstrumentStatus[]
}

export interface WaitingSubject {
  id: number
  name: string
  checkin_time: string | null
  queue_number: string | null
}

export interface EnvironmentStatus {
  temperature: number | null
  humidity: number | null
  recorded_at: string | null
  is_compliant: boolean | null
}

export interface InstrumentStatus {
  id: number
  name: string
  calibration_status: string
  next_calibration_date: string | null
}

export interface EvaluatorWorkOrder {
  id: number
  title: string
  description: string
  status: string
  work_order_type: string
  scheduled_date: string | null
  due_date: string | null
  create_time: string
  enrollment__protocol__title?: string
}

export interface ExperimentStep {
  id: number
  step_number: number
  step_name: string
  step_description: string
  estimated_duration_minutes: number
  status: string
  started_at: string | null
  completed_at: string | null
  actual_duration_minutes: number | null
  execution_data: Record<string, unknown>
  result: string
  skip_reason: string
}

export interface InstrumentDetection {
  id: number
  detection_name: string
  detection_method: string
  status: string
  started_at: string | null
  completed_at: string | null
  raw_data: Record<string, unknown>
  result_values: Record<string, unknown>
  qc_passed: boolean | null
  qc_notes: string
}

export interface WorkOrderException {
  id: number
  exception_type: string
  severity: string
  description: string
  impact_analysis: string
  resolution_status: string
  resolution_action: string
  reported_by: number
  resolved_by: number | null
  resolved_at: string | null
  deviation_id: number | null
  create_time: string
}

export interface EvaluatorProfile {
  role: string
  performance: {
    month_completed: number
    month_approved: number
    approval_rate: number
    on_time_rate: number
  }
  monthly_trend: {
    month: string
    completed: number
    approved: number
    approval_rate: number
    on_time_rate: number
  }[]
  qualifications: {
    qualification_name: string
    qualification_code: string
    obtained_date: string
    expiry_date: string | null
    status: string
  }[]
  trainings: {
    training_name: string
    training_date: string
    status: string
    score: number | null
  }[]
}

export interface ScheduleNote {
  id: number
  title: string
  note: string
  /** 设备名称（图片识别） */
  equipment?: string
  /** 项目编号（图片识别） */
  project_no?: string
  /** 房间号（图片识别） */
  room_no?: string
}

export interface ScheduleAttachment {
  id: number
  file_name: string
  file_url: string
}

export interface WeeklySchedule {
  week_start: string
  week_end: string
  daily_schedule: Record<string, EvaluatorWorkOrder[]>
  daily_notes?: Record<string, ScheduleNote[]>
  daily_attachments?: Record<string, ScheduleAttachment[]>
  global_attachments?: ScheduleAttachment[]
  total_this_week: number
  next_week_count: number
}

export interface MyTodayProjectTask {
  task_key: string
  task_name: string
  status: string
  status_label: string
  judgment_mode?: string
  measure_link?: string
  probe?: string
  primary_param?: string
  probe_options?: Array<{
    probe: string
    primary_param: string
    measured: boolean
  }>
}

export interface MyTodayProjectCell {
  time_point: string
  terminated: boolean
  equipment_tasks: MyTodayProjectTask[]
  evaluation_tasks: MyTodayProjectTask[]
  auxiliary_tasks: MyTodayProjectTask[]
}

export interface MyTodayProjectSubject {
  subject_id: number | null
  subject_name: string
  subject_no: string
  sc_number: string
  queue_status: string
  enrollment_status: string
  overall_status: string
  time_point_cells: MyTodayProjectCell[]
}

export interface MyTodayProjectItem {
  project_code: string
  project_name: string
  execution_order_id?: number | null
  time_points: string[]
  recent_checkin_time: string | null
  stats: {
    signed_in_count: number
    completed_count: number
    pending_count: number
    completion_rate: number
  }
  subjects: MyTodayProjectSubject[]
}

export interface MyTodayProjectsData {
  date: string
  refreshed_at: string
  refresh_interval_seconds: number
  measurement_source_available: boolean
  stats: {
    project_count: number
    signed_in_count: number
    completed_count: number
    pending_count: number
    completion_rate: number
  }
  projects: MyTodayProjectItem[]
}

// ============================================================================
// API 方法
// ============================================================================
export const evaluatorApi = {
  // 工作面板
  dashboard() {
    return api.get<ApiResponse<EvaluatorDashboard>['data']>('/evaluator/my-dashboard')
  },

  myWorkorders(params?: {
    status?: string
    date_from?: string
    date_to?: string
    page?: number
    page_size?: number
  }) {
    return api.get<ApiResponse<{ items: EvaluatorWorkOrder[]; total: number }>['data']>(
      '/evaluator/my-workorders', { params }
    )
  },

  mySchedule(weekOffset = 0, monthOffset?: number) {
    const params = monthOffset !== undefined
      ? { month_offset: monthOffset }
      : { week_offset: weekOffset }
    return api.get<ApiResponse<WeeklySchedule>['data']>(
      '/evaluator/my-schedule', { params }
    )
  },

  myTodayProjects() {
    return api.get<ApiResponse<MyTodayProjectsData>['data']>('/evaluator/my-today-projects')
  },

  /** 按姓名查看排程（维周同步后可按人查看；后端未实现时回退为当前用户排程） */
  myScheduleByPerson(personName: string, weekOffset = 0, monthOffset = 0) {
    return api.get<ApiResponse<WeeklySchedule>['data']>(
      '/evaluator/schedule/by-person',
      { params: { person_name: personName, week_offset: weekOffset, month_offset: monthOffset } }
    )
  },

  importScheduleNotes(
    rows: Array<Record<string, unknown>>,
    personName?: string,
    replaceExisting = true
  ) {
    return api.post<ApiResponse<{ created: number; errors: string[] }>['data']>(
      '/evaluator/schedule/import-notes',
      { rows, person_name: personName, replace_existing: replaceExisting }
    )
  },

  uploadScheduleAttachment(file: File, scheduleDate?: string) {
    const formData = new FormData()
    formData.append('file', file)
    const url = scheduleDate
      ? `/evaluator/schedule/upload-attachment?schedule_date=${encodeURIComponent(scheduleDate)}`
      : '/evaluator/schedule/upload-attachment'
    return api.upload<ApiResponse<{ id: number; file_name: string; file_url: string }>['data']>(url, formData)
  },

  /** 删除排程备注（图片识别的参考项） */
  deleteScheduleNote(noteId: number) {
    return api.delete<ApiResponse<{ ok: boolean }>['data']>(`/evaluator/schedule/note/${noteId}`)
  },

  /** 清空所有图片识别记录，便于重新识别 */
  deleteAllScheduleNotes() {
    return api.delete<ApiResponse<{ ok: boolean; deleted: number }>['data']>('/evaluator/schedule/notes')
  },

  /** 预热 OCR 模型，首次加载约 30–60 秒。提交前调用可避免识别请求超时 */
  warmupScheduleOcr() {
    return api.get<ApiResponse<{ ready: boolean }>['data']>('/evaluator/schedule/warmup-ocr', { timeout: 120000 })
  },

  /** 识别排程图片：提取与指定人员相关的工作日期、设备、项目编号，并创建排程备注。OCR+LLM 耗时较长，超时 5 分钟 */
  analyzeScheduleImage(file: File, personName?: string) {
    const formData = new FormData()
    formData.append('file', file)
    const url = personName
      ? `/evaluator/schedule/analyze-image?person_name=${encodeURIComponent(personName)}`
      : '/evaluator/schedule/analyze-image'
    return api.upload<ApiResponse<{ created: number; items: Array<{ schedule_date: string; equipment: string; project_no: string; title: string }>; error?: string }>['data']>(
      url,
      formData,
      { timeout: 300000 }
    )
  },

  // 工单执行流
  acceptWorkOrder(workOrderId: number) {
    return api.post<ApiResponse<{ success: boolean }>['data']>(
      `/evaluator/workorders/${workOrderId}/accept`
    )
  },

  rejectWorkOrder(workOrderId: number, reason: string) {
    return api.post<ApiResponse<{ success: boolean }>['data']>(
      `/evaluator/workorders/${workOrderId}/reject`, { reason }
    )
  },

  prepareWorkOrder(workOrderId: number, checklistItems?: Record<string, unknown>[]) {
    return api.post<ApiResponse<{ success: boolean }>['data']>(
      `/evaluator/workorders/${workOrderId}/prepare`, { checklist_items: checklistItems }
    )
  },

  pauseWorkOrder(workOrderId: number, reason: string) {
    return api.post<ApiResponse<{ success: boolean }>['data']>(
      `/evaluator/workorders/${workOrderId}/pause`, { reason }
    )
  },

  resumeWorkOrder(workOrderId: number) {
    return api.post<ApiResponse<{ success: boolean }>['data']>(
      `/evaluator/workorders/${workOrderId}/resume`
    )
  },

  // 分步执行
  initSteps(workOrderId: number) {
    return api.post<ApiResponse<{ step_count: number; steps: ExperimentStep[] }>['data']>(
      `/evaluator/workorders/${workOrderId}/steps/init`
    )
  },

  getSteps(workOrderId: number) {
    return api.get<ApiResponse<{ items: ExperimentStep[]; total: number }>['data']>(
      `/evaluator/workorders/${workOrderId}/steps`
    )
  },

  startStep(stepId: number) {
    return api.post<ApiResponse<{ success: boolean }>['data']>(
      `/evaluator/steps/${stepId}/start`
    )
  },

  completeStep(stepId: number, data?: { execution_data?: Record<string, unknown>; result?: string }) {
    return api.post<ApiResponse<{ success: boolean }>['data']>(
      `/evaluator/steps/${stepId}/complete`, data
    )
  },

  skipStep(stepId: number, reason: string) {
    return api.post<ApiResponse<{ success: boolean }>['data']>(
      `/evaluator/steps/${stepId}/skip`, { reason }
    )
  },

  // 仪器检测
  createDetection(workOrderId: number, data: {
    equipment_id?: number
    detection_name: string
    detection_method?: string
  }) {
    return api.post<ApiResponse<{ detection_id: number }>['data']>(
      `/evaluator/workorders/${workOrderId}/detections`, data
    )
  },

  startDetection(detectionId: number) {
    return api.post<ApiResponse<{ success: boolean }>['data']>(
      `/evaluator/detections/${detectionId}/start`
    )
  },

  completeDetection(detectionId: number, data: {
    raw_data?: Record<string, unknown>
    processed_data?: Record<string, unknown>
    result_values?: Record<string, unknown>
    qc_passed?: boolean
    qc_notes?: string
  }) {
    return api.post<ApiResponse<{ success: boolean }>['data']>(
      `/evaluator/detections/${detectionId}/complete`, data
    )
  },

  // 异常上报
  reportException(workOrderId: number, data: {
    exception_type: string
    severity?: string
    description: string
    impact_analysis?: string
  }) {
    return api.post<ApiResponse<{ exception_id: number }>['data']>(
      `/evaluator/workorders/${workOrderId}/exceptions`, data
    )
  },

  getExceptions(workOrderId: number) {
    return api.get<ApiResponse<{ items: WorkOrderException[]; total: number }>['data']>(
      `/evaluator/workorders/${workOrderId}/exceptions`
    )
  },

  // 个人成长
  myProfile() {
    return api.get<ApiResponse<EvaluatorProfile>['data']>('/evaluator/my-profile')
  },

  // 电子签名
  createSignature(data: {
    resource_type: string
    resource_id: string
    resource_name?: string
    reason?: string
    password: string
  }) {
    return api.post<ApiResponse<{ id: number; signed_at: string }>['data']>(
      '/signature/sign', data
    )
  },
}
