/**
 * 实验室人员管理工作台（共济·人员台）API 模块
 *
 * 对应后端：/api/v1/lab-personnel/
 * 覆盖：仪表盘、人员档案、证书管理、方法资质、排班管理、工时统计、工单派发、风险预警
 */
import { api } from '../client'

// ============================================================================
// 类型定义
// ============================================================================

/** 仪表盘 */
export interface PersonnelDashboard {
  staff: StaffStats
  certificates: CertificateExpiryOverview
  qualifications: QualificationOverview
  schedules: ScheduleOverview
  worktime: WorktimeOverview
  risks: RiskOverview
}

// ----- 人员档案 -----

export interface StaffStats {
  total: number
  active: number
  on_leave: number
  by_role: Record<string, number>
  by_level: Record<string, number>
}

export interface StaffItem {
  id: number
  staff_id: number
  staff_name: string
  employee_no: string
  position: string
  department: string
  phone: string
  email: string
  lab_role: string
  lab_role_display: string
  lab_role_secondary: string
  employment_type: string
  employment_type_display: string
  competency_level: string
  competency_level_display: string
  competency_level_updated_at: string | null
  available_weekdays: number[]
  max_daily_hours: number
  max_weekly_hours: number
  is_active: boolean
  gcp_status: string
  gcp_expiry: string | null
  notes: string
  create_time: string
}

export interface StaffDetail extends StaffItem {
  certificates: CertificateItem[]
  method_qualifications: MethodQualItem[]
  recent_schedules: SlotItem[]
  worktime_summary: WorkTimeSummaryItem | null
  risk_alerts: RiskItem[]
}

export interface StaffProfileCreateIn {
  lab_role?: string
  lab_role_secondary?: string
  employment_type?: string
  competency_level?: string
  available_weekdays?: number[]
  max_daily_hours?: number
  max_weekly_hours?: number
  notes?: string
}

export interface QualificationMatrix {
  staff: Array<{ id: number; name: string; level: string }>
  methods: Array<{ id: number; name: string; code: string }>
  matrix: Record<string, Record<string, string>>
  single_point_risks: Array<{ method_id: number; method_name: string; qualified_count: number }>
}

export interface GapAnalysis {
  protocol_id: number | null
  gaps: Array<{
    method_id: number
    method_name: string
    required_level: string
    qualified_staff: number
    gap_count: number
  }>
  recommendations: string[]
}

// ----- 证书管理 -----

export interface CertificateExpiryOverview {
  total: number
  valid: number
  expiring_soon: number
  expired: number
}

export interface CertificateItem {
  id: number
  staff_id: number
  staff_name: string
  cert_type: string
  cert_type_display: string
  cert_name: string
  cert_number: string
  issuing_authority: string
  issue_date: string | null
  expiry_date: string | null
  status: string
  status_display: string
  is_locked: boolean
  file_url: string
  create_time: string
}

export interface CertificateCreateIn {
  staff_id: number
  cert_type: string
  cert_name: string
  cert_number?: string
  issuing_authority?: string
  issue_date?: string
  expiry_date?: string
  file_url?: string
}

export interface CertificateUpdateIn {
  cert_name?: string
  cert_number?: string
  issuing_authority?: string
  issue_date?: string
  expiry_date?: string
  file_url?: string
  status?: string
}

export interface CertificateRenewIn {
  new_expiry_date: string
  new_cert_number?: string
}

export interface ExpiryAlert {
  id: number
  staff_name: string
  cert_name: string
  expiry_date: string
  days_remaining: number
  status: string
}

// ----- 方法资质 -----

export interface QualificationOverview {
  total_qualifications: number
  independent_or_above: number
  learning: number
  expiring_soon: number
}

export interface MethodQualItem {
  id: number
  staff_id: number
  staff_name: string
  method_id: number
  method_name: string
  method_code: string
  level: string
  level_display: string
  qualified_date: string | null
  expiry_date: string | null
  total_executions: number
  last_execution_date: string | null
  notes: string
  create_time: string
}

export interface MethodQualCreateIn {
  staff_id: number
  method_id: number
  level?: string
  qualified_date?: string
  expiry_date?: string
  notes?: string
}

export interface MethodQualUpdateIn {
  level?: string
  qualified_date?: string
  expiry_date?: string
  total_executions?: number
  last_execution_date?: string
  notes?: string
}

// ----- 排班管理 -----

export interface ScheduleOverview {
  current_week_slots: number
  confirmed: number
  pending: number
  conflicts: number
}

export interface ScheduleItem {
  id: number
  week_start_date: string
  week_end_date: string
  status: string
  status_display: string
  published_at: string | null
  notes: string
  slot_count: number
  create_time: string
}

export interface ScheduleDetail extends ScheduleItem {
  slots: SlotItem[]
}

export interface ScheduleCreateIn {
  week_start_date: string
  notes?: string
}

export interface SlotItem {
  id: number
  schedule_id: number
  staff_id: number
  staff_name: string
  shift_date: string
  start_time: string
  end_time: string
  planned_hours: number
  project_name: string
  protocol_id: number | null
  tasks_description: string
  confirm_status: string
  confirm_status_display: string
  reject_reason: string
  create_time: string
}

export interface SlotCreateIn {
  schedule_id: number
  staff_id: number
  shift_date: string
  start_time: string
  end_time: string
  planned_hours?: number
  project_name?: string
  protocol_id?: number
  tasks_description?: string
}

export interface SlotUpdateIn {
  start_time?: string
  end_time?: string
  planned_hours?: number
  project_name?: string
  protocol_id?: number
  tasks_description?: string
}

export interface SwapRequestCreateIn {
  original_slot_id: number
  target_staff_id: number
  reason: string
}

export interface ConflictResult {
  slot_id: number
  staff_name: string
  shift_date: string
  conflict_type: string
  description: string
}

// ----- 工时统计 -----

export interface WorktimeOverview {
  avg_utilization: number
  overloaded_count: number
  underloaded_count: number
  total_hours_this_week: number
}

export interface WorkTimeLogItem {
  id: number
  staff_id: number
  staff_name: string
  work_date: string
  start_time: string
  end_time: string | null
  actual_hours: number
  source: string
  source_display: string
  source_id: number | null
  description: string
  create_time: string
}

export interface WorkTimeSummaryItem {
  id: number
  staff_id: number
  staff_name: string
  week_start_date: string
  total_hours: number
  workorder_hours: number
  training_hours: number
  other_hours: number
  available_hours: number
  utilization_rate: number
}

export interface WorkTimeLogCreateIn {
  staff_id: number
  work_date: string
  start_time: string
  end_time?: string
  actual_hours: number
  source?: string
  source_id?: number
  description?: string
}

export interface UtilizationAnalysis {
  staff: Array<{
    staff_id: number
    staff_name: string
    utilization_rate: number
    total_hours: number
    available_hours: number
    status: 'overloaded' | 'normal' | 'underloaded'
  }>
  avg_utilization: number
}

export interface CapacityForecast {
  weeks: Array<{
    week_start: string
    available_hours: number
    projected_demand: number
    gap: number
    bottleneck_methods: string[]
  }>
}

// ----- 工单派发 -----

export interface DispatchCandidate {
  staff_id: number
  staff_name: string
  score: number
  checks: {
    gcp_valid: boolean
    method_qualified: boolean
    equipment_authorized: boolean
    no_schedule_conflict: boolean
    workload_ok: boolean
  }
  workload: number
  competency_level: string
}

export interface DispatchAssignIn {
  workorder_id: number
  staff_id: number
  force?: boolean
}

export interface DispatchMonitor {
  in_progress: number
  pending_assignment: number
  overdue: number
  completed_today: number
  assignments: Array<{
    workorder_id: number
    staff_name: string
    status: string
    started_at: string
    expected_end: string
  }>
}

// ----- 风险预警 -----

export interface RiskOverview {
  red: number
  yellow: number
  blue: number
  open_total: number
}

export interface RiskItem {
  id: number
  risk_type: string
  risk_type_display: string
  level: string
  level_display: string
  title: string
  description: string
  status: string
  status_display: string
  related_staff_id: number | null
  related_staff_name: string | null
  related_object_type: string
  related_object_id: number | null
  action_taken: string
  resolved_at: string | null
  create_time: string
}

export interface RiskStats {
  by_level: { red: number; yellow: number; blue: number }
  by_type: Record<string, number>
  open_count: number
  resolved_this_month: number
}

export interface RiskResolveIn {
  action_taken: string
}

export interface RiskScanResult {
  new_risks: number
  scanned_rules: number
  timestamp: string
}

// ============================================================================
// API 方法（40+ 端点）
// ============================================================================

const BASE = '/lab-personnel'

export const labPersonnelApi = {
  // ----- 仪表盘 -----
  getDashboard: () =>
    api.get<PersonnelDashboard>(`${BASE}/dashboard`),

  // ----- 人员档案 -----
  getStaffList: (params?: Record<string, string | number | boolean>) =>
    api.get<{ items: StaffItem[]; total: number }>(`${BASE}/staff/list`, { params }),

  getStaffDetail: (staffId: number) =>
    api.get<StaffDetail>(`${BASE}/staff/${staffId}`),

  upsertProfile: (staffId: number, data: StaffProfileCreateIn) =>
    api.post<StaffItem>(`${BASE}/staff/${staffId}/profile`, data),

  getQualificationMatrix: () =>
    api.get<QualificationMatrix>(`${BASE}/staff/qualification-matrix`),

  // ----- 证书管理 -----
  getCertificates: (params?: Record<string, string | number>) =>
    api.get<{ items: CertificateItem[]; total: number }>(`${BASE}/certificates/list`, { params }),

  createCertificate: (data: CertificateCreateIn) =>
    api.post<CertificateItem>(`${BASE}/certificates/create`, data),

  updateCertificate: (certId: number, data: CertificateUpdateIn) =>
    api.put<CertificateItem>(`${BASE}/certificates/${certId}`, data),

  renewCertificate: (certId: number, data: CertificateRenewIn) =>
    api.post<CertificateItem>(`${BASE}/certificates/${certId}/renew`, data),

  getCertExpiryAlerts: () =>
    api.get<ExpiryAlert[]>(`${BASE}/certificates/expiry-alerts`),

  // ----- 方法资质 -----
  getMethodQuals: (params?: Record<string, string | number>) =>
    api.get<{ items: MethodQualItem[]; total: number }>(`${BASE}/method-quals/list`, { params }),

  createMethodQual: (data: MethodQualCreateIn) =>
    api.post<MethodQualItem>(`${BASE}/method-quals/create`, data),

  updateMethodQual: (qualId: number, data: MethodQualUpdateIn) =>
    api.put<MethodQualItem>(`${BASE}/method-quals/${qualId}`, data),

  getGapAnalysis: (protocolId?: number) =>
    api.get<GapAnalysis>(`${BASE}/method-quals/gap-analysis`, { params: protocolId ? { protocol_id: protocolId } : {} }),

  // ----- 排班管理 -----
  getSchedules: (params?: Record<string, string | number>) =>
    api.get<{ items: ScheduleItem[]; total: number }>(`${BASE}/schedules/list`, { params }),

  createSchedule: (data: ScheduleCreateIn) =>
    api.post<ScheduleItem>(`${BASE}/schedules/create`, data),

  getScheduleDetail: (scheduleId: number) =>
    api.get<ScheduleDetail>(`${BASE}/schedules/${scheduleId}`),

  publishSchedule: (scheduleId: number) =>
    api.post<ScheduleItem>(`${BASE}/schedules/${scheduleId}/publish`),

  getSlots: (params?: Record<string, string | number>) =>
    api.get<{ items: SlotItem[]; total: number }>(`${BASE}/schedules/slots`, { params }),

  createSlot: (data: SlotCreateIn) =>
    api.post<SlotItem>(`${BASE}/schedules/slots/create`, data),

  updateSlot: (slotId: number, data: SlotUpdateIn) =>
    api.put<SlotItem>(`${BASE}/schedules/slots/${slotId}`, data),

  deleteSlot: (slotId: number) =>
    api.delete(`${BASE}/schedules/slots/${slotId}`),

  confirmSlot: (slotId: number) =>
    api.post<SlotItem>(`${BASE}/schedules/slots/${slotId}/confirm`),

  rejectSlot: (slotId: number, reason?: string) =>
    api.post<SlotItem>(`${BASE}/schedules/slots/${slotId}/reject`, { reason }),

  detectConflicts: (params?: Record<string, string | number>) =>
    api.get<ConflictResult[]>(`${BASE}/schedules/conflicts`, { params }),

  createSwapRequest: (data: SwapRequestCreateIn) =>
    api.post(`${BASE}/schedules/swap-requests/create`, data),

  approveSwapRequest: (swapId: number, approved: boolean) =>
    api.post(`${BASE}/schedules/swap-requests/${swapId}/approve`, { approved }),

  // ----- 工时统计 -----
  getWorktimeLogs: (params?: Record<string, string | number>) =>
    api.get<{ items: WorkTimeLogItem[]; total: number }>(`${BASE}/worktime/logs`, { params }),

  createWorktimeLog: (data: WorkTimeLogCreateIn) =>
    api.post<WorkTimeLogItem>(`${BASE}/worktime/logs/create`, data),

  getWorktimeSummary: (params?: Record<string, string | number>) =>
    api.get<{ items: WorkTimeSummaryItem[]; total: number }>(`${BASE}/worktime/summary`, { params }),

  getUtilization: (weekStartDate?: string) =>
    api.get<UtilizationAnalysis>(`${BASE}/worktime/utilization`, { params: weekStartDate ? { week_start_date: weekStartDate } : {} }),

  getCapacityForecast: (weeks?: number) =>
    api.get<CapacityForecast>(`${BASE}/worktime/capacity-forecast`, { params: weeks ? { weeks } : {} }),

  // ----- 工单派发 -----
  getDispatchCandidates: (workorderId: number) =>
    api.get<DispatchCandidate[]>(`${BASE}/dispatch/candidates`, { params: { workorder_id: workorderId } }),

  dispatchAssign: (data: DispatchAssignIn) =>
    api.post(`${BASE}/dispatch/assign`, data),

  getDispatchMonitor: () =>
    api.get<DispatchMonitor>(`${BASE}/dispatch/monitor`),

  // ----- 风险预警 -----
  getRisks: (params?: Record<string, string | number>) =>
    api.get<{ items: RiskItem[]; total: number }>(`${BASE}/risks/list`, { params }),

  getRiskStats: () =>
    api.get<RiskStats>(`${BASE}/risks/stats`),

  acknowledgeRisk: (riskId: number) =>
    api.post<RiskItem>(`${BASE}/risks/${riskId}/acknowledge`),

  resolveRisk: (riskId: number, data: RiskResolveIn) =>
    api.post<RiskItem>(`${BASE}/risks/${riskId}/resolve`, data),

  triggerRiskScan: () =>
    api.post<RiskScanResult>(`${BASE}/risks/scan`),
}
